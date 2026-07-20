"""Tests sobre el dataset limpio (salida de 03_clean)."""

import pytest

from conftest import (
    B365_COLS,
    PS_COLS,
    EXPECTED_LEAGUES,
    EXPECTED_SEASONS,
)

DROPPED_COLS = [
    "IWH",
    "IWD",
    "IWA",
    "BWH",
    "BWD",
    "BWA",
    "VCH",
    "VCD",
    "VCA",
    "WHH",
    "WHD",
    "WHA",
]




class TestCleanStructure:
    """Validaciones específicas de esquema del dataset limpio."""

    def test_leagues_match_schema(self, df_clean, schema_clean):
        assert sorted(df_clean["League"].unique().tolist()) == sorted(
            schema_clean["leagues"]
        )

    def test_matches_per_league(self, df_clean, schema_clean):
        for league, expected in schema_clean["matches_per_league"].items():
            actual = int((df_clean["League"] == league).sum())
            assert actual == expected




class TestCleanTransformations:
    """Validaciones de transformaciones aplicadas en 03_clean."""

    def test_div_removed(self, df_clean):
        assert "Div" not in df_clean.columns

    def test_league_exists(self, df_clean):
        assert "League" in df_clean.columns
        assert set(df_clean["League"].unique()) == EXPECTED_LEAGUES

    def test_match_id_exists_and_unique(self, df_clean):
        assert "match_id" in df_clean.columns
        assert df_clean["match_id"].is_unique

    def test_season_exists(self, df_clean):
        assert "Season" in df_clean.columns
        assert df_clean["Season"].nunique() == EXPECTED_SEASONS

    def test_season_per_league(self, df_clean):
        for league in EXPECTED_LEAGUES:
            n_seasons = df_clean[df_clean["League"] == league]["Season"].nunique()
            assert (
                n_seasons == EXPECTED_SEASONS
            ), f"{league}: {n_seasons} temporadas (esperadas: {EXPECTED_SEASONS})"

    def test_dropped_bookmakers(self, df_clean):
        for col in DROPPED_COLS:
            assert col not in df_clean.columns, f"{col} no debería estar en el dataset"

    def test_kept_bookmakers(self, df_clean):
        for col in B365_COLS + PS_COLS:
            assert col in df_clean.columns, f"{col} debería estar en el dataset"




class TestCleanIntegrity:
    """Validaciones específicas de integridad del dataset limpio."""

    def test_no_nulls_b365(self, df_clean):
        assert df_clean[B365_COLS].isnull().sum().sum() == 0

    def test_no_nulls_pinnacle(self, df_clean):
        assert df_clean[PS_COLS].isnull().sum().sum() == 0
