"""Verifica que el seed puebla crest_url y display_name al insertar equipos.

Antes esto dependía de correr dos scripts a mano contra la BD; si se olvidaban,
la app servía equipos sin escudo. El test fija que el seed los deja rellenos.
"""

import pandas as pd
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.db import etl
from src.db.models import League, Team


@pytest.fixture
def session() -> Session:
    """Sesión sobre SQLite en memoria con el esquema completo y una liga."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(League(id=1, code="laliga", name="LaLiga"))
        s.commit()
        yield s


def _df(nombres: list[str]) -> pd.DataFrame:
    """DataFrame mínimo con los equipos dados enfrentados en círculo."""
    return pd.DataFrame(
        {
            "League": ["laliga"] * len(nombres),
            "HomeTeam": nombres,
            "AwayTeam": nombres[1:] + nombres[:1],
        }
    )


def test_seed_equipos_puebla_escudo_y_nombre(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Tras el seed, los equipos salen con crest_url y display_name resueltos."""
    nombres = ["Ath Bilbao", "Barcelona", "Cadiz"]
    monkeypatch.setattr(etl, "_EXPECTED_TEAMS", len(nombres))

    etl.seed_equipos(session, _df(nombres), {"laliga": 1})

    equipos = {t.name: t for t in session.exec(select(Team)).all()}
    assert set(equipos) == set(nombres)

    assert equipos["Ath Bilbao"].crest_url == "/crests/ath-bilbao.png"
    assert equipos["Barcelona"].crest_url == "/crests/barcelona.png"
    assert equipos["Cadiz"].crest_url == "/crests/cadiz.png"

    assert equipos["Ath Bilbao"].display_name == "Athletic Club"
    assert equipos["Barcelona"].display_name == "FC Barcelona"
    assert equipos["Cadiz"].display_name == "Cádiz CF"


def test_seed_no_deja_ningun_campo_nulo(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ni crest_url ni display_name pueden quedar en NULL — era el bug original."""
    nombres = ["Real Madrid", "Sevilla"]
    monkeypatch.setattr(etl, "_EXPECTED_TEAMS", len(nombres))

    etl.seed_equipos(session, _df(nombres), {"laliga": 1})

    equipos = session.exec(select(Team)).all()
    assert len(equipos) == len(nombres)
    assert all(t.crest_url for t in equipos)
    assert all(t.display_name for t in equipos)


def test_seed_devuelve_el_mapeo_de_ids(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """El contrato de la función no cambia: sigue devolviendo {(league_id, name): id}."""
    nombres = ["Betis", "Getafe"]
    monkeypatch.setattr(etl, "_EXPECTED_TEAMS", len(nombres))

    mapping = etl.seed_equipos(session, _df(nombres), {"laliga": 1})

    assert set(mapping) == {(1, "Betis"), (1, "Getafe")}
    assert all(isinstance(v, int) for v in mapping.values())
