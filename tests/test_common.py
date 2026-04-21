"""Tests de integridad comunes a todos los datasets del pipeline."""

import pytest

from conftest import CORE_COLS, HALFTIME_COLS, STATS_COLS, B365_COLS, PS_COLS


class TestCommonStructure:
    """Dimensiones y esquema — aplica a validated, clean y enriched."""

    def test_shape_matches_schema(self, any_df_schema):
        df, schema = any_df_schema
        assert len(df) == schema["num_rows"]
        assert len(df.columns) == schema["num_columns"]

    def test_columns_match_schema(self, any_df_schema):
        df, schema = any_df_schema
        assert sorted(df.columns.tolist()) == schema["columns"]


class TestCommonIntegrity:
    """Integridad de columnas core — aplica a validated, clean y enriched."""

    def test_no_nulls_halftime(self, any_df):
        assert any_df[HALFTIME_COLS].isnull().sum().sum() == 0

    def test_no_nulls_stats(self, any_df):
        assert any_df[STATS_COLS].isnull().sum().sum() == 0

    def test_no_negative_stats(self, any_df):
        assert any_df[STATS_COLS].lt(0).sum().sum() == 0

    def test_ftr_categories(self, any_df):
        assert set(any_df["FTR"].unique()) == {"H", "D", "A"}

    def test_htr_categories(self, any_df):
        assert set(any_df["HTR"].unique()) == {"H", "D", "A"}

    def test_ftr_consistent_with_goals(self, any_df):
        df = any_df
        inconsistent = df[
            ((df["FTR"] == "H") & (df["FTHG"] <= df["FTAG"]))
            | ((df["FTR"] == "A") & (df["FTAG"] <= df["FTHG"]))
            | ((df["FTR"] == "D") & (df["FTHG"] != df["FTAG"]))
        ]
        assert len(inconsistent) == 0


class TestPostCleanIntegrity:
    """Integridad post-limpieza — aplica a clean y enriched."""

    def test_no_nulls_core(self, any_df_post_clean):
        assert any_df_post_clean[CORE_COLS].isnull().sum().sum() == 0

    def test_odds_positive(self, any_df_post_clean):
        odds_cols = B365_COLS + PS_COLS
        assert any_df_post_clean[odds_cols].le(0).sum().sum() == 0

    def test_date_is_datetime(self, any_df_post_clean):
        assert str(any_df_post_clean["Date"].dtype).startswith("datetime64")
