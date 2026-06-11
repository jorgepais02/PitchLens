"""Router de equipos — GET /teams, GET /teams/{id}, GET /teams/{id}/stats."""

from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import or_, select

from src.api.deps import SessionDep
from src.api.schemas import MatchBriefRead, TeamDetailRead, TeamRead, TeamStatsRead
from src.db.models import League, Match, Season, Team

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[TeamRead])
def get_teams(session: SessionDep, league_code: str | None = None) -> list[Team]:
    """Devuelve los equipos en orden alfabético, opcionalmente filtrados por liga."""
    query = select(Team)

    if league_code is not None:
        league = session.exec(
            select(League).where(League.code == league_code)
        ).first()
        if league is None:
            raise HTTPException(status_code=404, detail=f"Liga '{league_code}' no encontrada")
        query = query.where(Team.league_id == league.id)

    return list(session.exec(query.order_by(Team.name)).all())


@router.get("/{team_id}", response_model=TeamDetailRead)
def get_team(team_id: int, session: SessionDep) -> TeamDetailRead:
    """Devuelve un equipo con su liga embebida."""
    # selectinload carga la relación league en una segunda query,
    # evitando el problema N+1 si en el futuro se llama en bucle
    team = session.exec(
        select(Team)
        .where(Team.id == team_id)
        .options(selectinload(Team.league))
    ).first()

    if team is None:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    return TeamDetailRead.model_validate(team)


def _match_brief(match: Match, team_id: int) -> MatchBriefRead:
    """Construye el resumen de un partido desde la perspectiva del equipo dado."""
    is_home = match.home_team_id == team_id
    if is_home:
        gf, ga = match.fthg, match.ftag
        opponent_id = match.away_team_id
        opponent = match.away_team
        venue = "home"
        result = "W" if match.ftr == "H" else ("L" if match.ftr == "A" else "D")
    else:
        gf, ga = match.ftag, match.fthg
        opponent_id = match.home_team_id
        opponent = match.home_team
        venue = "away"
        result = "W" if match.ftr == "A" else ("L" if match.ftr == "H" else "D")

    return MatchBriefRead(
        slug=match.slug,
        date=match.date,
        opponent_id=opponent_id,
        opponent_name=opponent.display_name or opponent.name if opponent else str(opponent_id),
        opponent_crest_url=opponent.crest_url if opponent else None,
        venue=venue,
        goals_for=gf,
        goals_against=ga,
        result=result,
    )


@router.get("/{team_id}/stats", response_model=TeamStatsRead)
def get_team_stats(
    team_id: int,
    session: SessionDep,
    season: int | None = None,
) -> TeamStatsRead:
    """Devuelve estadísticas agregadas del equipo: wins/draws/losses, goles, xG, últimos 5 y % con features.

    Args:
        season: Año de fin de temporada (ej. 2024). Sin filtro devuelve toda la historia.
    """
    team = session.exec(select(Team).where(Team.id == team_id)).first()
    if team is None:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    query = (
        select(Match)
        .where(or_(Match.home_team_id == team_id, Match.away_team_id == team_id))
        .options(
            selectinload(Match.features),
            selectinload(Match.home_team),
            selectinload(Match.away_team),
        )
    )

    if season is not None:
        season_ids = [
            s.id for s in session.exec(
                select(Season).where(Season.end_year == season)
            ).all()
        ]
        if not season_ids:
            raise HTTPException(status_code=404, detail=f"Temporada '{season}' no encontrada")
        query = query.where(Match.season_id.in_(season_ids))

    matches = list(session.exec(query.order_by(Match.date.desc())).all())

    wins = draws = losses = 0
    goals_for = goals_against = 0
    xg_for = xg_against = 0.0
    matches_with_features = 0

    for match in matches:
        is_home = match.home_team_id == team_id
        gf = match.fthg if is_home else match.ftag
        ga = match.ftag if is_home else match.fthg
        xgf = match.home_xg if is_home else match.away_xg
        xga = match.away_xg if is_home else match.home_xg

        if (is_home and match.ftr == "H") or (not is_home and match.ftr == "A"):
            wins += 1
        elif match.ftr == "D":
            draws += 1
        else:
            losses += 1

        goals_for += gf
        goals_against += ga
        xg_for += xgf
        xg_against += xga

        if match.features is not None:
            matches_with_features += 1

    total = len(matches)
    features_pct = round(matches_with_features / total * 100, 1) if total > 0 else 0.0

    return TeamStatsRead(
        team_id=team_id,
        matches_played=total,
        wins=wins,
        draws=draws,
        losses=losses,
        goals_for=goals_for,
        goals_against=goals_against,
        xg_for=round(xg_for, 3),
        xg_against=round(xg_against, 3),
        matches_with_features_pct=features_pct,
        last5=[_match_brief(m, team_id) for m in matches[:5]],
    )
