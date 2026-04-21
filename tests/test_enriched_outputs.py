"""Tests sobre el dataset enriquecido (salida de 05_merge_xg)."""

import pytest

from conftest import (
    XG_COLS,
    B365_COLS,
    PS_COLS,
    EXPECTED_LEAGUES,
    EXPECTED_SEASONS,
)

EXPECTED_COLS = 35


# ── Estructura y esquema ────────────────────────────────────────────


class TestEnrichedStructure:
    """Validaciones específicas de esquema del dataset enriquecido."""

    def test_expected_column_count(self, df_enriched):
        assert len(df_enriched.columns) == EXPECTED_COLS

    def test_leagues_match_schema(self, df_enriched, schema_enriched):
        assert sorted(df_enriched["League"].unique().tolist()) == sorted(
            schema_enriched["leagues"]
        )

    def test_matches_per_league(self, df_enriched, schema_enriched):
        for league, expected in schema_enriched["matches_per_league"].items():
            actual = int((df_enriched["League"] == league).sum())
            assert actual == expected

    def test_has_xg_columns(self, df_enriched):
        for col in XG_COLS:
            assert col in df_enriched.columns

    def test_season_count(self, df_enriched):
        assert df_enriched["Season"].nunique() == EXPECTED_SEASONS

    def test_season_per_league(self, df_enriched):
        for league in EXPECTED_LEAGUES:
            n = df_enriched[df_enriched["League"] == league]["Season"].nunique()
            assert n == EXPECTED_SEASONS, f"{league}: {n} temporadas"


# ── xG ──────────────────────────────────────────────────────────────


class TestEnrichedXg:
    """Validaciones de las columnas xG incorporadas."""

    def test_no_nulls_xg(self, df_enriched):
        assert df_enriched[XG_COLS].isnull().sum().sum() == 0

    def test_no_negative_xg(self, df_enriched):
        assert df_enriched[XG_COLS].lt(0).sum().sum() == 0

    def test_xg_in_range(self, df_enriched):
        assert df_enriched["home_xg"].max() <= 10
        assert df_enriched["away_xg"].max() <= 10

    def test_xg_is_float(self, df_enriched):
        assert str(df_enriched["home_xg"].dtype).startswith("float")
        assert str(df_enriched["away_xg"].dtype).startswith("float")


# ── Integridad del merge ────────────────────────────────────────────


class TestEnrichedMerge:
    """Validaciones de que el merge no alteró el core."""

    def test_match_id_unique(self, df_enriched):
        assert df_enriched["match_id"].is_unique

    def test_same_rows_as_core(self, df_enriched, df_clean):
        assert len(df_enriched) == len(df_clean)

    def test_core_columns_preserved(self, df_enriched, df_clean):
        for col in df_clean.columns:
            assert col in df_enriched.columns, f"Columna del core perdida: {col}"

    def test_goals_unchanged(self, df_enriched, df_clean):
        """El merge no debe alterar los goles del core."""
        merged = df_enriched.set_index("match_id")[["FTHG", "FTAG"]]
        original = df_clean.set_index("match_id")[["FTHG", "FTAG"]]
        common = merged.index.intersection(original.index)
        assert (merged.loc[common] == original.loc[common]).all().all()


# ── Integridad de datos ─────────────────────────────────────────────


class TestEnrichedIntegrity:
    """Validaciones específicas de integridad del dataset enriquecido."""

    def test_leagues(self, df_enriched):
        assert set(df_enriched["League"].unique()) == EXPECTED_LEAGUES
