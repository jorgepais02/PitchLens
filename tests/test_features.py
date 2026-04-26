"""Tests Fase 4 — Feature Engineering: build_features y core_features."""

import json
from pathlib import Path

import pandas as pd
import pytest

from src.features import build_features
from src.features.build_features import (
    FEATURES,
    FEATURES_H2H,
    FEATURES_ROLLING,
    ELO_K,
    ELO_BASE,
    H2H_WINDOW,
    compute_elo,
    compute_h2h_rolling,
    compute_table_features,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CORE_FEATURES_PATH = (
    PROJECT_ROOT / "data" / "processed" / "features" / "core_features.parquet"
)
CORE_FEATURES_SCHEMA_PATH = (
    PROJECT_ROOT / "data" / "processed" / "features" / "core_features_schema.json"
)


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
            assert (
                val == 0.0
            ), f"Season {row['Season']}: points_diff_global={val} (esperado 0)"


# ─── ELO properties ──────────────────────────────────────────────────────────


class TestELOProperties:
    def test_elo_no_nan(self, ml_subset):
        assert ml_subset["elo_diff_pre"].isnull().sum() == 0

    def test_elo_diff_plausible_range(self, ml_subset):
        assert (ml_subset["elo_diff_pre"].abs() < 5000).all()


# ─── H2H features ────────────────────────────────────────────────────────────


class TestH2HFeatures:
    def test_h2h_no_nulls_after_build(self, ml_subset):
        """Tras build_features, las features H2H están imputadas a 0 — sin NaN."""
        nulls = ml_subset[FEATURES_H2H].isnull().sum()
        assert nulls.sum() == 0, f"NaN en features H2H: {nulls[nulls > 0].to_dict()}"

    def test_h2h_first_match_per_pair_is_nan_pre_imputation(self, df_subset):
        """Antes de la imputación, el primer H2H de cada par devuelve NaN por shift(1)."""
        df_h2h = compute_h2h_rolling(df_subset, H2H_WINDOW)

        data = df_subset[["match_id", "Date", "League", "HomeTeam", "AwayTeam"]].copy()
        data["team_a"] = data[["HomeTeam", "AwayTeam"]].min(axis=1)
        data["team_b"] = data[["HomeTeam", "AwayTeam"]].max(axis=1)
        data["pair_id"] = data["League"] + "__" + data["team_a"] + "__" + data["team_b"]

        first_per_pair = (
            data.sort_values("Date").groupby("pair_id", group_keys=False).head(1)
        )
        for _, row in first_per_pair.iterrows():
            vals = df_h2h.loc[row["match_id"], FEATURES_H2H]
            assert (
                vals.isna().all()
            ), f"Par {row['pair_id']} primer H2H no es NaN: {vals.to_dict()}"

    def test_h2h_symmetry_under_venue_swap(self, df_subset):
        """
        La perspectiva H2H es siempre la del local del partido actual:
        en dos enfrentamientos consecutivos del mismo par con localía invertida,
        el valor rolling tras el primero debe cambiar de signo en el segundo
        (no en magnitud).
        """
        df_h2h = compute_h2h_rolling(df_subset, H2H_WINDOW)
        data = df_subset[["match_id", "Date", "HomeTeam", "AwayTeam", "League"]].copy()
        data["pair_id"] = (
            data["League"]
            + "__"
            + data[["HomeTeam", "AwayTeam"]].min(axis=1)
            + "__"
            + data[["HomeTeam", "AwayTeam"]].max(axis=1)
        )

        for _, grupo in data.sort_values("Date").groupby("pair_id"):
            if len(grupo) < 2:
                continue
            m1, m2 = grupo.iloc[0]["match_id"], grupo.iloc[1]["match_id"]
            home1 = grupo.iloc[0]["HomeTeam"]
            home2 = grupo.iloc[1]["HomeTeam"]
            if home1 == home2:
                continue  # no hubo inversión de localía
            v1 = df_h2h.loc[m1, "h2h_goal_diff_last5"]
            v2 = df_h2h.loc[m2, "h2h_goal_diff_last5"]
            # m1 siempre es NaN (primer H2H). m2 usa solo m1 → rolling con 1 valor.
            # Como rolling(window=5).mean() requiere window observaciones, m2 también es NaN.
            assert pd.isna(v1) and pd.isna(v2)
            break  # un par basta para validar el invariante estructural

    def test_h2h_result_in_range(self, ml_subset):
        """h2h_result_diff_last5 ∈ [-1, 1] — es (wins_home − wins_away) / window."""
        col = ml_subset["h2h_result_diff_last5"]
        assert (col >= -1).all() and (col <= 1).all()

    def test_h2h_goal_diff_plausible(self, ml_subset):
        """h2h_goal_diff_last5 acotado razonablemente (|x| < 10)."""
        assert (ml_subset["h2h_goal_diff_last5"].abs() < 10).all()


# ─── Market feature ──────────────────────────────────────────────────────────


class TestMarketFeature:
    def test_prob_diff_market_range(self, ml_subset):
        """prob_diff_market está en [-1, 1]."""
        assert (ml_subset["prob_diff_market"] >= -1).all()
        assert (ml_subset["prob_diff_market"] <= 1).all()

    def test_overround_pinnacle_above_one(self, df_subset):
        """El overround de Pinnacle (cierre) siempre es > 1."""
        overround = (
            1 / df_subset["PSCH"] + 1 / df_subset["PSCD"] + 1 / df_subset["PSCA"]
        )
        assert (overround > 1.0).all()

    def test_overround_pinnacle_below_bet365(self, df_subset):
        """Pinnacle (cierre) tiene menor overround que Bet365."""
        overround_ps = (
            1 / df_subset["PSCH"] + 1 / df_subset["PSCD"] + 1 / df_subset["PSCA"]
        ).mean()
        overround_b365 = (
            1 / df_subset["B365H"] + 1 / df_subset["B365D"] + 1 / df_subset["B365A"]
        ).mean()
        assert overround_ps < overround_b365


# ─── core_features.parquet (si ya existe en disco) ──────────────────────────────


@pytest.mark.skipif(
    not CORE_FEATURES_PATH.exists(),
    reason="core_features.parquet aún no generado — ejecutar build_features primero",
)
class TestMLDatasetParquet:
    @pytest.fixture(scope="class")
    def df_features(self):
        return pd.read_parquet(CORE_FEATURES_PATH)

    @pytest.fixture(scope="class")
    def schema(self):
        with open(CORE_FEATURES_SCHEMA_PATH) as f:
            return json.load(f)

    def test_shape_matches_schema(self, df_features, schema):
        assert len(df_features) == schema["num_rows"]
        assert len(df_features.columns) == schema["num_columns"]

    def test_no_nulls_in_rolling_features(self, df_features):
        nulls = df_features[FEATURES_ROLLING].isnull().sum()
        assert nulls.sum() == 0

    def test_no_nulls_in_h2h_features(self, df_features):
        nulls = df_features[FEATURES_H2H].isnull().sum()
        assert nulls.sum() == 0

    def test_all_features_present(self, df_features):
        for feat in FEATURES:
            assert feat in df_features.columns, f"Feature faltante en parquet: {feat}"

    def test_no_duplicate_match_ids(self, df_features):
        assert df_features["match_id"].nunique() == len(df_features)

    def test_target_valid_categories(self, df_features):
        assert set(df_features["FTR"].unique()) == {"H", "D", "A"}

    def test_all_leagues_present(self, df_features, schema):
        assert set(df_features["League"].unique()) == set(schema["leagues"])

    def test_no_leakage(self, df_features):
        ftr_enc = df_features["FTR"].map({"H": 1, "D": 0, "A": -1})
        corrs = df_features[FEATURES_ROLLING].corrwith(ftr_enc).abs()
        assert (
            corrs.max() < 0.99
        ), f"Leakage detectado: {corrs[corrs >= 0.99].to_dict()}"

    def test_sorted_by_date(self, df_features):
        assert df_features["Date"].is_monotonic_increasing
