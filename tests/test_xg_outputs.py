"""Tests sobre el dataset xG raw validado (salida de 04_eda_xg)."""

import pytest

from conftest import XG_COLS, EXPECTED_SEASONS

GOAL_COLS = ["home_goals", "away_goals"]
XG_LEAGUES = {"ENG-Premier League", "ESP-La Liga", "GER-Bundesliga"}
MATCHES_PER_LEAGUE = {
    "ENG-Premier League": 3800,
    "ESP-La Liga": 3800,
    "GER-Bundesliga": 3060,
}


# ── Estructura y esquema ────────────────────────────────────────────


class TestXgStructure:
    """Validaciones de dimensiones y esquema."""

    def test_shape_matches_schema(self, df_xg, schema_xg):
        assert len(df_xg) == schema_xg["num_rows"]
        assert len(df_xg.columns) == schema_xg["num_columns"]

    def test_columns_match_schema(self, df_xg, schema_xg):
        assert sorted(df_xg.columns.tolist()) == sorted(schema_xg["columns"].keys())

    def test_seasons_match_schema(self, df_xg, schema_xg):
        assert sorted(df_xg["season"].unique().tolist()) == sorted(schema_xg["seasons"])

    def test_leagues_present(self, df_xg):
        assert set(df_xg["league"].unique()) == XG_LEAGUES

    def test_season_count(self, df_xg):
        assert df_xg["season"].nunique() == EXPECTED_SEASONS


# ── Cobertura ───────────────────────────────────────────────────────


class TestXgCoverage:
    """Validaciones de cobertura por liga y temporada."""

    def test_matches_per_league(self, df_xg):
        for league, expected in MATCHES_PER_LEAGUE.items():
            actual = int((df_xg["league"] == league).sum())
            assert actual == expected, f"{league}: {actual} (esperados {expected})"

    def test_matches_per_league_schema(self, df_xg, schema_xg):
        for league, expected in schema_xg["matches_per_league"].items():
            actual = int((df_xg["league"] == league).sum())
            assert actual == expected

    def test_no_gaps_per_season(self, df_xg):
        """Cada liga tiene partidos en todas las temporadas."""
        for league in XG_LEAGUES:
            lg = df_xg[df_xg["league"] == league]
            assert (
                lg["season"].nunique() == EXPECTED_SEASONS
            ), f"{league}: temporadas incompletas"

    @pytest.mark.parametrize(
        "league, expected",
        [
            ("ENG-Premier League", 380),
            ("ESP-La Liga", 380),
            ("GER-Bundesliga", 306),
        ],
    )
    def test_matches_per_season(self, df_xg, league, expected):
        lg = df_xg[df_xg["league"] == league]
        per_season = lg.groupby("season").size()
        assert (
            per_season == expected
        ).all(), f"{league}: partidos por temporada inconsistentes"


# ── Integridad ──────────────────────────────────────────────────────


class TestXgIntegrity:
    """Validaciones de integridad del dataset xG."""

    def test_no_duplicates(self, df_xg):
        dups = df_xg.duplicated(
            subset=["league", "season", "home_team", "away_team"], keep=False
        )
        assert dups.sum() == 0

    def test_no_nulls_xg(self, df_xg):
        assert df_xg[XG_COLS].isnull().sum().sum() == 0

    def test_no_nulls_goals(self, df_xg):
        assert df_xg[GOAL_COLS].isnull().sum().sum() == 0

    def test_no_negative_xg(self, df_xg):
        assert df_xg[XG_COLS].lt(0).sum().sum() == 0

    def test_no_negative_goals(self, df_xg):
        assert df_xg[GOAL_COLS].lt(0).sum().sum() == 0

    def test_xg_in_range(self, df_xg):
        """xG no debería superar 10 en un solo partido."""
        assert df_xg["home_xg"].max() <= 10
        assert df_xg["away_xg"].max() <= 10

    def test_all_results_true(self, df_xg):
        assert df_xg["is_result"].all(), "Existen partidos sin resultado"

    def test_date_is_datetime(self, df_xg):
        assert str(df_xg["date"].dtype).startswith("datetime64")


# ── Compatibilidad con el core ──────────────────────────────────────


class TestXgCompatibility:
    """Validaciones de compatibilidad con el core clean."""

    def test_league_mapping_covers_all(self, df_xg, league_mapping):
        xg_leagues = set(df_xg["league"].unique())
        mapped_leagues = set(league_mapping.keys())
        assert (
            xg_leagues == mapped_leagues
        ), f"Sin mapping: {xg_leagues - mapped_leagues}"

    def test_team_mapping_covers_all(
        self, df_xg, df_clean, league_mapping, team_mapping
    ):
        """Todos los equipos del xG tienen correspondencia en el core tras mapping."""
        xg_teams = set(df_xg["home_team"].unique()) | set(df_xg["away_team"].unique())
        mapped = {team_mapping.get(t, t) for t in xg_teams}
        core_teams = set(df_clean["HomeTeam"].unique()) | set(
            df_clean["AwayTeam"].unique()
        )
        unmatched = mapped - core_teams
        assert len(unmatched) == 0, f"Equipos sin correspondencia: {unmatched}"
