"""Tests del seed (etl): ruta de fallo por parquet ausente e idempotencia.

Se inyecta un engine SQLite en memoria vía monkeypatch para no necesitar Postgres.
"""

from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.db import etl
from src.db.models import League


@pytest.fixture(name="sqlite_engine")
def sqlite_engine_fixture():
    """Engine SQLite en memoria que se cierra al terminar (sin ResourceWarning)."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield engine
    engine.dispose()


def test_run_seed_parquet_ausente_lanza(monkeypatch, sqlite_engine) -> None:
    """Con --wipe y el parquet inexistente, run_seed propaga el fallo de lectura."""
    monkeypatch.setattr(etl, "engine", sqlite_engine)
    monkeypatch.setattr(etl, "_ENRICHED", Path("no/existe/core_enriched.parquet"))

    with pytest.raises((FileNotFoundError, OSError)):
        etl.run_seed(wipe=True)


def test_run_seed_idempotente_skip_si_poblada(monkeypatch, sqlite_engine) -> None:
    """Sin --wipe sobre BD ya poblada: no inserta, no lee parquet y no lanza."""
    engine = sqlite_engine
    monkeypatch.setattr(etl, "engine", engine)
    monkeypatch.setattr(etl, "_ENRICHED", Path("no/existe/core_enriched.parquet"))

    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(League(code="premier", name="Premier League"))
        s.commit()

    etl.run_seed(wipe=False)

    with Session(engine) as s:
        assert len(s.exec(select(League)).all()) == 1
