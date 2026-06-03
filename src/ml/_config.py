"""Constantes de configuración de modelos — sin dependencias pesadas.

Separado de train_models.py para que la API pueda importar MODELS_CONFIG
sin cargar sklearn, pandas ni joblib en tiempo de importación.
"""

from pathlib import Path

MODELS_DIR = Path("models")
CUSTOM_MODELS_DIR = Path("models/custom")

# Dataset de features (output Fase 4) — fuente única para train_models y custom_trainer
DATA_PATH = Path("data/processed/features/core_features.parquet")

# Candidatos de regularización para LogisticRegressionCV
CV_Cs: list[float] = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0]

FEATURES_BASELINE: list[str] = [
    "elo_diff_pre",
    "points_diff_global",
    "points_diff_venue",
    "h2h_result_diff_last5",
    "h2h_goal_diff_last5",
]

FEATURES_EXTENDED: list[str] = FEATURES_BASELINE + [
    "goal_diff_last5_global",
    "xg_diff_last5_global",
    "goal_diff_last5_venue",
    "xg_conceded_diff_last5_global",
    "sot_diff_last5_global",
    "rest_days_diff",
]

FEATURES_MARKET: list[str] = [
    "points_diff_global",
    "goal_diff_last5_global",
    "xg_diff_last5_global",
    "xg_conceded_diff_last5_global",
    "h2h_goal_diff_last5",
    "prob_diff_market",
]

MODELS_CONFIG: dict[str, list[str]] = {
    "baseline": FEATURES_BASELINE,
    "extended": FEATURES_EXTENDED,
    "market": FEATURES_MARKET,
}
