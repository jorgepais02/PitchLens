"""Tests sobre el dataset validado (salida de 02_eda)."""

import pytest

from conftest import (
    CORE_COLS_RAW,
    EXPECTED_DIVS,
    DIV_TO_LEAGUE,
)




class TestValidatedStructure:
    """Validaciones específicas de esquema del dataset validado."""

    def test_leagues_match_schema(self, df_validated, schema_validated):
        actual = sorted(df_validated["Div"].map(DIV_TO_LEAGUE).unique().tolist())
        assert actual == sorted(schema_validated["leagues"])

    def test_matches_per_league(self, df_validated, schema_validated):
        for div, league in DIV_TO_LEAGUE.items():
            actual = int((df_validated["Div"] == div).sum())
            assert actual == schema_validated["matches_per_league"][league]




class TestValidatedIntegrity:
    """Validaciones específicas del dataset validado (pre-clean)."""

    def test_no_nulls_core(self, df_validated):
        assert df_validated[CORE_COLS_RAW].isnull().sum().sum() == 0

    def test_valid_divisions(self, df_validated):
        assert set(df_validated["Div"].unique()) == EXPECTED_DIVS

    def test_no_duplicate_matches(self, df_validated):
        dups = df_validated.duplicated(
            subset=["Date", "HomeTeam", "AwayTeam"], keep=False
        )
        assert dups.sum() == 0
