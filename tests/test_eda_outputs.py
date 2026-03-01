"""Tests sobre el dataset validado (salida de 02_eda)."""

import pytest

# ── Columnas por grupo ──────────────────────────────────────────────

CORE_COLS = ["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]
HALFTIME_COLS = ["HTHG", "HTAG", "HTR"]
STATS_COLS = ["HS", "AS", "HST", "AST", "HF", "AF", "HC", "AC", "HY", "AY", "HR", "AR"]
EXPECTED_DIVS = {"SP1", "E0", "D1"}


# ── Estructura y esquema ────────────────────────────────────────────

class TestValidatedStructure:
    """Validaciones de dimensiones y esquema."""

    def test_shape_matches_schema(self, df_validated, schema_validated):
        assert len(df_validated) == schema_validated["num_rows"]
        assert len(df_validated.columns) == schema_validated["num_columns"]

    def test_columns_match_schema(self, df_validated, schema_validated):
        assert sorted(df_validated.columns.tolist()) == schema_validated["columns"]

    def test_leagues_match_schema(self, df_validated, schema_validated):
        actual = sorted(df_validated["Div"].map(
            {"SP1": "laliga", "E0": "premier", "D1": "bundesliga"}
        ).unique().tolist())
        assert actual == sorted(schema_validated["leagues"])

    def test_matches_per_league(self, df_validated, schema_validated):
        div_to_league = {"SP1": "laliga", "E0": "premier", "D1": "bundesliga"}
        for div, league in div_to_league.items():
            actual = int((df_validated["Div"] == div).sum())
            assert actual == schema_validated["matches_per_league"][league]


# ── Integridad de datos ─────────────────────────────────────────────

class TestValidatedIntegrity:
    """Validaciones de integridad sobre columnas core."""

    def test_no_nulls_core(self, df_validated):
        assert df_validated[CORE_COLS].isnull().sum().sum() == 0

    def test_no_nulls_halftime(self, df_validated):
        assert df_validated[HALFTIME_COLS].isnull().sum().sum() == 0

    def test_no_nulls_stats(self, df_validated):
        assert df_validated[STATS_COLS].isnull().sum().sum() == 0

    def test_no_negative_stats(self, df_validated):
        assert df_validated[STATS_COLS].lt(0).sum().sum() == 0

    def test_ftr_categories(self, df_validated):
        assert set(df_validated["FTR"].unique()) == {"H", "D", "A"}

    def test_htr_categories(self, df_validated):
        assert set(df_validated["HTR"].unique()) == {"H", "D", "A"}

    def test_ftr_consistent_with_goals(self, df_validated):
        df = df_validated
        inconsistent = df[
            ((df["FTR"] == "H") & (df["FTHG"] <= df["FTAG"])) |
            ((df["FTR"] == "A") & (df["FTAG"] <= df["FTHG"])) |
            ((df["FTR"] == "D") & (df["FTHG"] != df["FTAG"]))
        ]
        assert len(inconsistent) == 0

    def test_valid_divisions(self, df_validated):
        assert set(df_validated["Div"].unique()) == EXPECTED_DIVS

    def test_no_duplicate_matches(self, df_validated):
        dups = df_validated.duplicated(
            subset=["Date", "HomeTeam", "AwayTeam"], keep=False
        )
        assert dups.sum() == 0
