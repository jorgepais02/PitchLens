"""Tests Fase 4 — Feature Engineering: build_features y core_features."""

import json
from pathlib import Path

import pandas as pd
import pytest

from src.features import build_features
from src.features.build_features import (
    FEATURES,
    FEATURES_ROLLING,
    ELO_K,
    ELO_BASE,
    compute_elo,
    compute_table_features,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
core_features_PATH = PROJECT_ROOT / "data" / "processed" / "core_features.parquet"
ML_SCHEMA_PATH = PROJECT_ROOT / "data" / "processed" / "core_features_schema.json"


# ─── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def df_subset(df_enriched) -> pd.DataFrame:
    """Premier League 2015–2016 — subset manejable para tests unitarios."""
    return (
        df_enriched[
            (df_enriched["League"] == "premier")
            & (df_enriched["Season"].isin(["2015", "2016"]))
        ]
        .sort_values("Date")
        .reset_index(drop=True)
    )


@pytest.fixture(scope="session")
def ml_subset(df_subset) -> pd.DataFrame:
    """core_features generado desde el subset. Cacheado a nivel de sesión."""
    return build_features(df_subset)


# ─── build_features — output schema ─────────────────────────────────────────


class TestBuildFeaturesSchema:
    def test_returns_dataframe(self, ml_subset):
        assert isinstance(ml_subset, pd.DataFrame)

    def test_has_all_features(self, ml_subset):
        for feat in FEATURES:
            assert feat in ml_subset.columns, f"Feature faltante: {feat}"

    def test_has_metadata_columns(self, ml_subset):
        for col in [
            "match_id",
            "League",
            "Season",
            "Date",
            "HomeTeam",
            "AwayTeam",
            "FTR",
        ]:
            assert col in ml_subset.columns, f"Columna de metadatos faltante: {col}"

    def test_match_id_is_unique(self, ml_subset):
        assert ml_subset["match_id"].nunique() == len(ml_subset)

    def test_no_nulls_in_rolling_features(self, ml_subset):
        nulls = ml_subset[FEATURES_ROLLING].isnull().sum()
        assert (
            nulls.sum() == 0
        ), f"NaN en features rolling: {nulls[nulls > 0].to_dict()}"

    def test_no_nulls_in_prob_diff_market(self, ml_subset):
        assert ml_subset["prob_diff_market"].isnull().sum() == 0

    def test_target_valid_categories(self, ml_subset):
        assert set(ml_subset["FTR"].unique()) == {"H", "D", "A"}

    def test_cold_start_rows_removed(self, df_subset, ml_subset):
        """core_features tiene menos filas que el input por el cold start."""
        assert len(ml_subset) < len(df_subset)

    def test_output_sorted_by_date(self, ml_subset):
        assert ml_subset["Date"].is_monotonic_increasing


# ─── build_features — anti-leakage ──────────────────────────────────────────


class TestAntiLeakage:
    def test_correlation_all_features_below_threshold(self, ml_subset):
        """Ninguna feature puede tener correlación ≥ 0.99 con el target."""
        ftr_enc = ml_subset["FTR"].map({"H": 1, "D": 0, "A": -1})
        corrs = ml_subset[FEATURES_ROLLING].corrwith(ftr_enc).abs()
        assert corrs.max() < 0.99, f"Posible leakage: {corrs[corrs >= 0.99].to_dict()}"

    def test_elo_diff_first_match_is_zero(self, df_subset):
        """El primer partido del dataset arranca con elo_diff_pre = 0 (ambos equipos en base)."""
        df_elo = compute_elo(df_subset.sort_values("Date"), ELO_K, ELO_BASE)
        first_mid = df_subset.sort_values("Date").iloc[0]["match_id"]
        assert df_elo.loc[first_mid, "elo_diff_pre"] == 0.0

    def test_points_diff_first_season_match_is_zero(self, df_subset):
        """El primer partido de cada temporada tiene points_diff_global = 0."""
        df_table = compute_table_features(df_subset)
        first_per_season = (
            df_subset.sort_values("Date").groupby("Season", group_keys=False).head(1)
        )
        for _, row in first_per_season.iterrows():
            val = df_table.loc[row["match_id"], "points_diff_global"]
            assert val == 0.0, f"Season {row['Season']}: points_diff_global={val} (esperado 0)"


# ─── ELO properties ──────────────────────────────────────────────────────────


class TestELOProperties:
    def test_elo_no_nan(self, ml_subset):
        assert ml_subset["elo_diff_pre"].isnull().sum() == 0

    def test_elo_diff_plausible_range(self, ml_subset):
        assert (ml_subset["elo_diff_pre"].abs() < 5000).all()


# ─── Market feature ──────────────────────────────────────────────────────────


class TestMarketFeature:
    def test_prob_diff_market_range(self, ml_subset):
        """prob_diff_market está en [-1, 1]."""
        assert (ml_subset["prob_diff_market"] >= -1).all()
        assert (ml_subset["prob_diff_market"] <= 1).all()

    def test_overround_pinnacle_above_one(self, df_subset):
        """El overround de Pinnacle siempre es > 1."""
        overround = 1 / df_subset["PSH"] + 1 / df_subset["PSD"] + 1 / df_subset["PSA"]
        assert (overround > 1.0).all()

    def test_overround_pinnacle_below_bet365(self, df_subset):
        """Pinnacle tiene menor overround que Bet365."""
        overround_ps = (
            1 / df_subset["PSH"] + 1 / df_subset["PSD"] + 1 / df_subset["PSA"]
        ).mean()
        overround_b365 = (
            1 / df_subset["B365H"] + 1 / df_subset["B365D"] + 1 / df_subset["B365A"]
        ).mean()
        assert overround_ps < overround_b365


# ─── core_features.parquet (si ya existe en disco) ──────────────────────────────


@pytest.mark.skipif(
    not core_features_PATH.exists(),
    reason="core_features.parquet aún no generado — ejecutar build_features primero",
)
class TestMLDatasetParquet:
    @pytest.fixture(scope="class")
    def df_ml(self):
        return pd.read_parquet(core_features_PATH)

    @pytest.fixture(scope="class")
    def schema(self):
        with open(ML_SCHEMA_PATH) as f:
            return json.load(f)

    def test_shape_matches_schema(self, df_ml, schema):
        assert len(df_ml) == schema["num_rows"]
        assert len(df_ml.columns) == schema["num_columns"]

    def test_no_nulls_in_rolling_features(self, df_ml):
        nulls = df_ml[FEATURES_ROLLING].isnull().sum()
        assert nulls.sum() == 0

    def test_no_duplicate_match_ids(self, df_ml):
        assert df_ml["match_id"].nunique() == len(df_ml)

    def test_target_valid_categories(self, df_ml):
        assert set(df_ml["FTR"].unique()) == {"H", "D", "A"}

    def test_all_leagues_present(self, df_ml, schema):
        assert set(df_ml["League"].unique()) == set(schema["leagues"])

    def test_no_leakage(self, df_ml):
        ftr_enc = df_ml["FTR"].map({"H": 1, "D": 0, "A": -1})
        corrs = df_ml[FEATURES_ROLLING].corrwith(ftr_enc).abs()
        assert (
            corrs.max() < 0.99
        ), f"Leakage detectado: {corrs[corrs >= 0.99].to_dict()}"

    def test_sorted_by_date(self, df_ml):
        assert df_ml["Date"].is_monotonic_increasing
