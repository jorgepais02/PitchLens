"""Router de ligas — GET /leagues."""

from fastapi import APIRouter
from sqlmodel import select

from src.api.deps import SessionDep
from src.api.schemas import LeagueRead
from src.db.models import League

router = APIRouter(prefix="/leagues", tags=["leagues"])


@router.get("", response_model=list[LeagueRead])
def get_leagues(session: SessionDep) -> list[League]:
    """Devuelve las 3 ligas disponibles."""
    return list(session.exec(select(League)).all())
