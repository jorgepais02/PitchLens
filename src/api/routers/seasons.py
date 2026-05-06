"""Router de temporadas — GET /seasons."""

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from src.api.deps import SessionDep
from src.api.schemas import SeasonRead
from src.db.models import League, Season

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[SeasonRead])
def get_seasons(session: SessionDep, league_code: str | None = None) -> list[Season]:
    """Devuelve las temporadas, opcionalmente filtradas por liga."""
    query = select(Season)

    if league_code is not None:
        league = session.exec(
            select(League).where(League.code == league_code)
        ).first()
        if league is None:
            raise HTTPException(status_code=404, detail=f"Liga '{league_code}' no encontrada")
        query = query.where(Season.league_id == league.id)

    return list(session.exec(query.order_by(Season.end_year)).all())
