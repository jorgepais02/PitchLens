"""Engine de base de datos, sesión y dependencia get_db() para FastAPI.

Este módulo es inmutable tras Fase 6.
"""

from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from src.core.config import settings

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
        return False
