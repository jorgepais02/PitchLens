"""Router de clasificación — GET /standings."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import case, func
from sqlmodel import select

from src.api.deps import SessionDep
from src.api.schemas import StandingRow
from src.db.models import League, Match, Season, Team

router = APIRouter(prefix="/standings", tags=["standings"])


def _aggregate_side(session, season_id: int, side: str) -> dict[int, dict[str, int]]:
    """Agrega los partidos de una temporada con GROUP BY desde una perspectiva.

    Args:
        side: "home" o "away" — perspectiva del equipo a agregar.

    Devuelve {team_id: {played, wins, draws, losses, goals_for, goals_against}}.
    """
    if side == "home":
        team_col, win_ftr, loss_ftr = Match.home_team_id, "H", "A"
        gf_col, ga_col = Match.fthg, Match.ftag
    else:
        team_col, win_ftr, loss_ftr = Match.away_team_id, "A", "H"
        gf_col, ga_col = Match.ftag, Match.fthg

    rows = session.exec(
        select(
            team_col.label("team_id"),
            func.count().label("played"),
            func.sum(case((Match.ftr == win_ftr, 1), else_=0)).label("wins"),
            func.sum(case((Match.ftr == "D", 1), else_=0)).label("draws"),
            func.sum(case((Match.ftr == loss_ftr, 1), else_=0)).label("losses"),
            func.sum(gf_col).label("goals_for"),
            func.sum(ga_col).label("goals_against"),
        )
        .where(Match.season_id == season_id)
        .group_by(team_col)
    ).all()

    return {
        r.team_id: {
            "played": r.played,
            "wins": r.wins,
            "draws": r.draws,
            "losses": r.losses,
            "goals_for": r.goals_for,
            "goals_against": r.goals_against,
        }
        for r in rows
    }


@router.get("", response_model=list[StandingRow])
def get_standings(
    session: SessionDep,
    league_code: str,
    season: int,
) -> list[StandingRow]:
    """Devuelve la clasificación de una liga y temporada, calculada sobre matches.

    Ordenada por puntos desc, diferencia de goles desc, goles a favor desc.

    Args:
        league_code: Código de liga (premier, laliga, bundesliga).
        season: Año de fin de temporada (ej. 2024 = temporada 2023/24).
    """
    league = session.exec(
        select(League).where(League.code == league_code)
    ).first()
    if league is None:
        raise HTTPException(status_code=404, detail=f"Liga '{league_code}' no encontrada")

    season_row = session.exec(
        select(Season).where(Season.league_id == league.id, Season.end_year == season)
    ).first()
    if season_row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Temporada '{season}' no encontrada en la liga '{league_code}'",
        )

    home = _aggregate_side(session, season_row.id, "home")
    away = _aggregate_side(session, season_row.id, "away")

    team_ids = set(home) | set(away)
    teams_map: dict[int, Team] = {
        t.id: t
        for t in session.exec(select(Team).where(Team.id.in_(list(team_ids)))).all()
    }

    standings: list[StandingRow] = []
    empty = {"played": 0, "wins": 0, "draws": 0, "losses": 0, "goals_for": 0, "goals_against": 0}
    for team_id in team_ids:
        h = home.get(team_id, empty)
        a = away.get(team_id, empty)
        team = teams_map.get(team_id)
        wins = h["wins"] + a["wins"]
        draws = h["draws"] + a["draws"]
        goals_for = h["goals_for"] + a["goals_for"]
        goals_against = h["goals_against"] + a["goals_against"]
        standings.append(
            StandingRow(
                team_id=team_id,
                team_name=(team.display_name or team.name) if team else str(team_id),
                crest_url=team.crest_url if team else None,
                played=h["played"] + a["played"],
                wins=wins,
                draws=draws,
                losses=h["losses"] + a["losses"],
                goals_for=goals_for,
                goals_against=goals_against,
                goal_diff=goals_for - goals_against,
                points=wins * 3 + draws,
            )
        )

    standings.sort(key=lambda s: (-s.points, -s.goal_diff, -s.goals_for, s.team_name))
    return standings
