"""Router de partidos — GET /matches, GET /matches/{slug}, GET /matches/h2h."""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.orm import selectinload
from sqlmodel import and_, or_, select

from src.api.deps import PaginationDep, SessionDep
from src.api.schemas import H2HMatchRead, MatchDetailRead, MatchListRead
from src.db.models import League, Match, Season, Team

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("", response_model=list[MatchListRead])
def get_matches(
    session: SessionDep,
    pagination: PaginationDep,
    league_code: str | None = None,
    season: int | None = None,
    team_id: int | None = None,
) -> list[Match]:
    """Devuelve partidos paginados con filtros opcionales, orden fecha descendente.

    Args:
        league_code: Código de liga (premier, laliga, bundesliga).
        season: Año de fin de temporada (ej. 2015 = temporada 2014/15).
        team_id: ID de equipo — devuelve partidos como local o visitante.
    """
    query = select(Match)

    if league_code is not None:
        league = session.exec(
            select(League).where(League.code == league_code)
        ).first()
        if league is None:
            raise HTTPException(status_code=404, detail=f"Liga '{league_code}' no encontrada")
        query = query.where(Match.league_id == league.id)

    if season is not None:
        # end_year puede aparecer en hasta 3 ligas simultáneamente
        season_ids = [
            s.id for s in session.exec(
                select(Season).where(Season.end_year == season)
            ).all()
        ]
        if not season_ids:
            raise HTTPException(status_code=404, detail=f"Temporada '{season}' no encontrada")
        query = query.where(Match.season_id.in_(season_ids))

    if team_id is not None:
        # Partidos donde el equipo jugó como local O visitante
        query = query.where(
            or_(Match.home_team_id == team_id, Match.away_team_id == team_id)
        )

    query = query.order_by(Match.date.desc()).offset(pagination.offset).limit(pagination.limit)
    return list(session.exec(query).all())


@router.get("/h2h", response_model=list[H2HMatchRead])
def get_h2h(
    home_team_id: int,
    away_team_id: int,
    session: SessionDep,
    limit: int = Query(default=10, le=50),
) -> list[H2HMatchRead]:
    """Devuelve los últimos enfrentamientos directos entre dos equipos, orden descendente."""
    if home_team_id == away_team_id:
        raise HTTPException(status_code=422, detail="Los equipos deben ser distintos")

    matches = list(session.exec(
        select(Match)
        .where(
            or_(
                and_(Match.home_team_id == home_team_id, Match.away_team_id == away_team_id),
                and_(Match.home_team_id == away_team_id, Match.away_team_id == home_team_id),
            )
        )
        .order_by(Match.date.desc())
        .limit(limit)
    ).all())

    if not matches:
        return []

    all_team_ids = {home_team_id, away_team_id}
    teams_map: dict[int, str] = {
        t.id: t.display_name or t.name
        for t in session.exec(select(Team).where(Team.id.in_(list(all_team_ids)))).all()
    }

    return [
        H2HMatchRead(
            date=m.date,
            home_team_id=m.home_team_id,
            away_team_id=m.away_team_id,
            home_team_name=teams_map[m.home_team_id],
            away_team_name=teams_map[m.away_team_id],
            fthg=m.fthg,
            ftag=m.ftag,
            ftr=m.ftr,
        )
        for m in matches
    ]


@router.get("/{slug}", response_model=MatchDetailRead)
def get_match(slug: str, session: SessionDep) -> MatchDetailRead:
    """Devuelve un partido completo por slug, con features embebidas (null en cold start)."""
    match = session.exec(
        select(Match)
        .where(Match.slug == slug)
        .options(selectinload(Match.features))
    ).first()

    if match is None:
        raise HTTPException(status_code=404, detail="Partido no encontrado")

    return MatchDetailRead.model_validate(match)
