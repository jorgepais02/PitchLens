"""Router de partidos — GET /matches, GET /matches/{slug}."""

from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import or_, select

from src.api.deps import PaginationDep, SessionDep
from src.api.schemas import MatchDetailRead, MatchListRead
from src.db.models import League, Match, Season

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
        # Recuperar los IDs de las temporadas con ese end_year
        # (puede haber una por liga, máximo 3)
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
