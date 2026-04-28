"""Dependencias compartidas de FastAPI: sesión de BD y paginación."""

from typing import Annotated

from fastapi import Depends, Query
from sqlmodel import Session

from src.db.database import get_db


SessionDep = Annotated[Session, Depends(get_db)]


class Pagination:
    """Parámetros de paginación comunes (limit / offset)."""

    def __init__(
        self,
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
    ) -> None:
        self.limit = limit
        self.offset = offset


PaginationDep = Annotated[Pagination, Depends(Pagination)]
