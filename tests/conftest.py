"""Fixtures compartidos para tests del pipeline de datos y de la API."""

import json
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from src.api.main import app
from src.db.database import get_db
from src.db.models import League, Season, Team

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "processed"
XG_DIR = DATA_DIR / "xg"
CONFIG_DIR = PROJECT_ROOT / "config"

VALIDATED_PARQUET = DATA_DIR / "multi_league" / "core_multi_league_validated.parquet"
VALIDATED_SCHEMA = DATA_DIR / "multi_league" / "core_multi_league_validated_schema.json"
CLEAN_PARQUET = DATA_DIR / "multi_league" / "core_multi_league_clean.parquet"
CLEAN_SCHEMA = DATA_DIR / "multi_league" / "core_multi_league_clean_schema.json"
ENRICHED_PARQUET = DATA_DIR / "enriched" / "core_enriched.parquet"
ENRICHED_SCHEMA = DATA_DIR / "enriched" / "core_enriched_schema.json"
XG_RAW_PARQUET = XG_DIR / "xg_validated.parquet"
XG_RAW_SCHEMA = XG_DIR / "xg_validated_schema.json"
LEAGUE_MAPPING = CONFIG_DIR / "league_mapping.json"
TEAM_MAPPING = CONFIG_DIR / "team_mapping_xg.json"


CORE_COLS = ["League", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]
CORE_COLS_RAW = ["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]

HALFTIME_COLS = ["HTHG", "HTAG", "HTR"]
STATS_COLS = ["HS", "AS", "HST", "AST", "HF", "AF", "HC", "AC", "HY", "AY", "HR", "AR"]
B365_COLS = ["B365H", "B365D", "B365A"]
PS_COLS = ["PSH", "PSD", "PSA", "PSCH", "PSCD", "PSCA"]
XG_COLS = ["home_xg", "away_xg"]

EXPECTED_LEAGUES = {"bundesliga", "laliga", "premier"}
EXPECTED_DIVS = {"SP1", "E0", "D1"}
DIV_TO_LEAGUE = {"SP1": "laliga", "E0": "premier", "D1": "bundesliga"}
EXPECTED_SEASONS = 10




@pytest.fixture(scope="session")
def df_validated():
    """Dataset validado (salida de 02_validate)."""
    return pd.read_parquet(VALIDATED_PARQUET)


@pytest.fixture(scope="session")
def schema_validated():
    """Esquema del dataset validado."""
    with open(VALIDATED_SCHEMA) as f:
        return json.load(f)




@pytest.fixture(scope="session")
def df_clean():
    """Dataset limpio (salida de 03_clean)."""
    return pd.read_parquet(CLEAN_PARQUET)


@pytest.fixture(scope="session")
def schema_clean():
    """Esquema del dataset limpio."""
    with open(CLEAN_SCHEMA) as f:
        return json.load(f)




@pytest.fixture(scope="session")
def df_enriched():
    """Dataset enriquecido con xG (salida de 04b_merge)."""
    return pd.read_parquet(ENRICHED_PARQUET)


@pytest.fixture(scope="session")
def schema_enriched():
    """Esquema del dataset enriquecido."""
    with open(ENRICHED_SCHEMA) as f:
        return json.load(f)




@pytest.fixture(scope="session")
def df_xg():
    """Dataset xG raw validado (salida de 04_eda_xg)."""
    return pd.read_parquet(XG_RAW_PARQUET)


@pytest.fixture(scope="session")
def schema_xg():
    """Esquema del dataset xG raw."""
    with open(XG_RAW_SCHEMA) as f:
        return json.load(f)




@pytest.fixture(params=["validated", "clean", "enriched"])
def any_df(request, df_validated, df_clean, df_enriched):
    """Fixture parametrizado: itera sobre los tres datasets del pipeline."""
    return {"validated": df_validated, "clean": df_clean, "enriched": df_enriched}[request.param]


@pytest.fixture(params=["validated", "clean", "enriched"])
def any_df_schema(request, df_validated, schema_validated, df_clean, schema_clean, df_enriched, schema_enriched):
    """Fixture parametrizado: devuelve (df, schema) para cada etapa."""
    return {
        "validated": (df_validated, schema_validated),
        "clean": (df_clean, schema_clean),
        "enriched": (df_enriched, schema_enriched),
    }[request.param]


@pytest.fixture(params=["clean", "enriched"])
def any_df_post_clean(request, df_clean, df_enriched):
    """Fixture parametrizado: itera sobre datasets post-limpieza (con League, cuotas, datetime)."""
    return {"clean": df_clean, "enriched": df_enriched}[request.param]




@pytest.fixture(scope="session")
def league_mapping():
    """Mapping de ligas Understat → football-data."""
    with open(LEAGUE_MAPPING) as f:
        return json.load(f)


@pytest.fixture(scope="session")
def team_mapping():
    """Mapping de equipos Understat → football-data."""
    with open(TEAM_MAPPING) as f:
        return json.load(f)




@pytest.fixture(autouse=True)
def _clear_feature_cache():
    """Vacía la caché del historial por liga entre tests (es estado de módulo)."""
    from src.services.feature_builder import clear_history_cache

    clear_history_cache()
    yield


@pytest.fixture(name="session")
def session_fixture():
    """Sesión SQLite en memoria — creada y destruida por cada test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(name="client")
def client_fixture(session: Session):
    """TestClient con get_db sobreescrito — no necesita servidor real."""
    app.dependency_overrides[get_db] = lambda: session
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture(name="client_with_teams")
def client_with_teams_fixture(session: Session):
    """TestClient con dos ligas y equipos insertados en SQLite."""
    premier = League(id=1, code="premier", name="Premier League")
    laliga = League(id=2, code="laliga", name="LaLiga")
    session.add_all([premier, laliga])
    session.commit()

    season = Season(id=1, end_year=2024, label="2023/24", league_id=1)
    session.add(season)
    session.commit()

    arsenal = Team(id=10, name="Arsenal", league_id=1)
    chelsea = Team(id=11, name="Chelsea", league_id=1)
    real_madrid = Team(id=20, name="Real Madrid", league_id=2)
    session.add_all([arsenal, chelsea, real_madrid])
    session.commit()

    app.dependency_overrides[get_db] = lambda: session
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()
