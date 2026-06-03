"""Engine de base de datos, sesión y dependencia get_db() para FastAPI.

Este módulo es inmutable tras Fase 6.
"""

import logging
from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from src.core.config import settings

log = logging.getLogger("db")

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.ENV == "development",
)


def create_db_and_tables() -> None:
    """Crea todas las tablas registradas en SQLModel.metadata."""
    SQLModel.metadata.create_all(engine)


def get_db() -> Generator[Session, None, None]:
    """Dependencia FastAPI: abre y cierra sesión por request."""
    with Session(engine) as session:
        yield session


def check_connection() -> bool:
    """Verifica la conexión ejecutando SELECT 1. Devuelve True si responde."""
    try:
        with Session(engine) as session:
            session.exec(text("SELECT 1"))
        return True
    except Exception:
        log.exception("check_connection: la BD no responde a SELECT 1")
        return False
