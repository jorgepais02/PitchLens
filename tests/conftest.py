"""Fixtures compartidos para tests del pipeline de datos."""

import json
from pathlib import Path

import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "processed"

# --- Paths ---
VALIDATED_PARQUET = DATA_DIR / "core_multi_league_validated.parquet"
VALIDATED_SCHEMA = DATA_DIR / "core_multi_league_schema.json"
CLEAN_PARQUET = DATA_DIR / "core_multi_league_clean.parquet"
CLEAN_SCHEMA = DATA_DIR / "core_multi_league_clean_schema.json"


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
