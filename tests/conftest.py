"""Fixtures compartidos para tests del pipeline de datos."""

import json
from pathlib import Path

import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "processed"
XG_DIR = DATA_DIR / "xg"
CONFIG_DIR = PROJECT_ROOT / "config"

# --- Paths ---
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

# --- Constantes compartidas ─────────────────────────────────────────

# Columnas core (post-clean, con League)
CORE_COLS = ["League", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]
# Columnas core pre-clean (con Div)
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


# --- Fixtures: Validated (EDA output) ---


@pytest.fixture(scope="session")
def df_validated():
    """Dataset validado (salida de 02_validate)."""
    return pd.read_parquet(VALIDATED_PARQUET)


@pytest.fixture(scope="session")
def schema_validated():
    """Esquema del dataset validado."""
    with open(VALIDATED_SCHEMA) as f:
        return json.load(f)


# --- Fixtures: Clean (03_clean output) ---


@pytest.fixture(scope="session")
def df_clean():
    """Dataset limpio (salida de 03_clean)."""
    return pd.read_parquet(CLEAN_PARQUET)


@pytest.fixture(scope="session")
def schema_clean():
    """Esquema del dataset limpio."""
    with open(CLEAN_SCHEMA) as f:
        return json.load(f)


# --- Fixtures: Enriched (04b_merge output) ---


@pytest.fixture(scope="session")
def df_enriched():
    """Dataset enriquecido con xG (salida de 04b_merge)."""
    return pd.read_parquet(ENRICHED_PARQUET)


@pytest.fixture(scope="session")
def schema_enriched():
    """Esquema del dataset enriquecido."""
    with open(ENRICHED_SCHEMA) as f:
        return json.load(f)


# --- Fixtures: xG raw (04_eda_xg output) ---


@pytest.fixture(scope="session")
def df_xg():
    """Dataset xG raw validado (salida de 04_eda_xg)."""
    return pd.read_parquet(XG_RAW_PARQUET)


@pytest.fixture(scope="session")
def schema_xg():
    """Esquema del dataset xG raw."""
    with open(XG_RAW_SCHEMA) as f:
        return json.load(f)


# --- Fixtures: Mappings ---


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
