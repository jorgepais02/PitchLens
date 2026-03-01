"""Tests sobre el dataset limpio (salida de 03_clean)."""

import pytest

# ── Columnas por grupo ──────────────────────────────────────────────

CORE_COLS = ["League", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]
HALFTIME_COLS = ["HTHG", "HTAG", "HTR"]
STATS_COLS = ["HS", "AS", "HST", "AST", "HF", "AF", "HC", "AC", "HY", "AY", "HR", "AR"]
B365_COLS = ["B365H", "B365D", "B365A"]
PS_COLS = ["PSH", "PSD", "PSA", "PSCH", "PSCD", "PSCA"]
DROPPED_COLS = ["IWH", "IWD", "IWA", "BWH", "BWD", "BWA", "VCH", "VCD", "VCA", "WHH", "WHD", "WHA"]
EXPECTED_LEAGUES = {"bundesliga", "laliga", "premier"}


# ── Estructura y esquema ────────────────────────────────────────────

class TestCleanStructure:
    """Validaciones de dimensiones y esquema."""

    def test_shape_matches_schema(self, df_clean, schema_clean):
        assert len(df_clean) == schema_clean["num_rows"]
        assert len(df_clean.columns) == schema_clean["num_columns"]

    def test_columns_match_schema(self, df_clean, schema_clean):
        assert sorted(df_clean.columns.tolist()) == schema_clean["columns"]

    def test_leagues_match_schema(self, df_clean, schema_clean):
        assert sorted(df_clean["League"].unique().tolist()) == sorted(schema_clean["leagues"])

    def test_matches_per_league(self, df_clean, schema_clean):
        for league, expected in schema_clean["matches_per_league"].items():
            actual = int((df_clean["League"] == league).sum())
            assert actual == expected


# ── Transformaciones ────────────────────────────────────────────────

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
        assert df_clean["Season"].nunique() == 10

    def test_season_per_league(self, df_clean):
        for league in EXPECTED_LEAGUES:
            n_seasons = df_clean[df_clean["League"] == league]["Season"].nunique()
            assert n_seasons == 10, f"{league}: {n_seasons} temporadas (esperadas: 10)"

    def test_dropped_bookmakers(self, df_clean):
        for col in DROPPED_COLS:
            assert col not in df_clean.columns, f"{col} no debería estar en el dataset"

    def test_kept_bookmakers(self, df_clean):
        for col in B365_COLS + PS_COLS:
            assert col in df_clean.columns, f"{col} debería estar en el dataset"


# ── Integridad de datos ─────────────────────────────────────────────

class TestCleanIntegrity:
    """Validaciones de integridad sobre el dataset limpio."""

    def test_no_nulls_core(self, df_clean):
        assert df_clean[CORE_COLS].isnull().sum().sum() == 0

    def test_no_nulls_halftime(self, df_clean):
        assert df_clean[HALFTIME_COLS].isnull().sum().sum() == 0

    def test_no_nulls_stats(self, df_clean):
        assert df_clean[STATS_COLS].isnull().sum().sum() == 0

    def test_no_nulls_b365(self, df_clean):
        assert df_clean[B365_COLS].isnull().sum().sum() == 0

    def test_no_nulls_pinnacle(self, df_clean):
        assert df_clean[PS_COLS].isnull().sum().sum() == 0

    def test_no_negative_stats(self, df_clean):
        assert df_clean[STATS_COLS].lt(0).sum().sum() == 0

    def test_ftr_categories(self, df_clean):
        assert set(df_clean["FTR"].unique()) == {"H", "D", "A"}

    def test_htr_categories(self, df_clean):
        assert set(df_clean["HTR"].unique()) == {"H", "D", "A"}

    def test_ftr_consistent_with_goals(self, df_clean):
        df = df_clean
        inconsistent = df[
            ((df["FTR"] == "H") & (df["FTHG"] <= df["FTAG"])) |
            ((df["FTR"] == "A") & (df["FTAG"] <= df["FTHG"])) |
            ((df["FTR"] == "D") & (df["FTHG"] != df["FTAG"]))
        ]
        assert len(inconsistent) == 0

    def test_odds_positive(self, df_clean):
        odds_cols = B365_COLS + PS_COLS
        assert df_clean[odds_cols].le(0).sum().sum() == 0, "Cuotas deben ser > 0"

    def test_date_is_datetime(self, df_clean):
        assert str(df_clean["Date"].dtype).startswith("datetime64")
