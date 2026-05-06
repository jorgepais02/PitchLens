"""Entrenamiento y persistencia de los 3 modelos preentrenados (LR).

Uso:
    python -m src.ml.train_models
"""

import json
import logging
import time
from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegressionCV
from sklearn.metrics import accuracy_score, confusion_matrix, log_loss
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

log = logging.getLogger("train")
logging.basicConfig(level=logging.INFO, format="[TRAIN] %(levelname)s %(message)s")

# ── Constantes ──────────────────────────────────────────────────────────────

FEATURES_BASELINE: list[str] = [
    "elo_diff_pre",
    "points_diff_global",
    "goal_diff_last5_global",
]

# extended añade xG ofensivo (mayor η²), calidad defensiva y forma por localía.
# Incluidos:
#   - xg_diff_last5_global: η²=0.102, mayor que sot_diff (0.096); r=0.79 con goal_diff (bajo
#     el umbral de 0.80, borderline). Se acepta porque xG mide calidad del tiro (Understat),
#     mientras goal_diff captura resultado — dimensiones conceptualmente distintas.
#   - xg_conceded_diff_last5_global: η²=0.049 (bajo), pero única proxy de calidad defensiva
#     disponible sin colinealidad alta — sin ella extended no cubriría la dimensión defensiva
#   - goal_diff_last5_venue: η²=0.082, aporta localía que goal_diff_last5_global no captura
# Excluidos por el EDA:
#   - sot_diff (r=0.83 con xg_diff, redundante)
#   - points_diff_venue (r=0.84 con points_diff_global, redundante)
#   - rest_days_diff (η²≈0, 39.5 % ceros, outliers COVID kurtosis=802)
#   - h2h_* (49-54 % ceros por fillna(0) → LR no distingue sin historial de equilibrio real)
FEATURES_EXTENDED: list[str] = FEATURES_BASELINE + [
    "xg_diff_last5_global",
    "xg_conceded_diff_last5_global",
    "goal_diff_last5_venue",
]

# market: prob_diff_market reemplaza a elo_diff_pre.
# prob_diff_market r=0.90 con elo → el mercado ya lo codifica y más.
# Reemplazar elimina la colinealidad más severa y la CV confirma mejor resultado.
FEATURES_MARKET: list[str] = [
    f for f in FEATURES_EXTENDED if f != "elo_diff_pre"
] + ["prob_diff_market"]

MODELS_CONFIG: dict[str, list[str]] = {
    "baseline": FEATURES_BASELINE,
    "extended": FEATURES_EXTENDED,
    "market": FEATURES_MARKET,
}

# C candidatos para selección por CV — rango amplio con resolución suficiente
_CV_Cs = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0]

TARGET = "FTR"
DATA_PATH = Path("data/processed/features/core_features.parquet")
MODELS_DIR = Path("models")


# ── Función pública de soporte ──────────────────────────────────────────────

def split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Divide en train (Season ≤ 2022), val (2023) y test (2024). Nunca aleatorio."""
    season = df["Season"].astype(int)
    # train ordenado por fecha: necesario para que TimeSeriesSplit respete el orden temporal
    train = df[season <= 2022].sort_values("Date").copy()
    val = df[season == 2023].copy()
    test = df[season == 2024].copy()
    return train, val, test


# ── Helpers privados ─────────────────────────────────────────────────────────

def _build_pipeline() -> Pipeline:
    """Pipeline escalado + LR con C seleccionado por CV temporal (scoring=neg_log_loss)."""
    return Pipeline([
        ("scaler", StandardScaler()),
        ("lr", LogisticRegressionCV(
            Cs=_CV_Cs,
            cv=TimeSeriesSplit(n_splits=5),
            scoring="neg_log_loss",
            max_iter=1000,
            # evita FutureWarning de sklearn 1.10 sobre atributos legacy de C_
            use_legacy_attributes=True,
        )),
    ])


def _compute_metrics(pipeline: Pipeline, X: pd.DataFrame, y: pd.Series) -> dict:
    """Calcula accuracy, log-loss y matriz de confusión."""
    y_pred = pipeline.predict(X)
    y_proba = pipeline.predict_proba(X)
    return {
        "accuracy": round(float(accuracy_score(y, y_pred)), 4),
        "log_loss": round(float(log_loss(y, y_proba)), 4),
        "confusion_matrix": confusion_matrix(y, y_pred, labels=["H", "D", "A"]).tolist(),
    }


# ── Función pública ─────────────────────────────────────────────────────────

def train_models() -> dict:
    """Entrena los 3 modelos preentrenados y los persiste en models/.

    Devuelve el diccionario de métricas completo.
    """
    start = time.time()
    MODELS_DIR.mkdir(exist_ok=True)

    log.info("cargando %s", DATA_PATH)
    df = pd.read_parquet(DATA_PATH)
    log.info("dataset: %d filas × %d columnas", *df.shape)

    train, val, test = split(df)
    log.info(
        "split — train=%d val=%d test=%d",
        len(train), len(val), len(test),
    )

    global_metrics: dict[str, dict] = {}

    for name, features in MODELS_CONFIG.items():
        log.info("entrenando modelo '%s' (%d features)", name, len(features))

        X_train = train[features]
        y_train = train[TARGET]
        X_val = val[features]
        y_val = val[TARGET]
        X_test = test[features]
        y_test = test[TARGET]

        pipeline = _build_pipeline()
        pipeline.fit(X_train, y_train)

        # C_.mean() es informativo: multinomial → (1,) = valor exacto; OvR → (n_classes,) = promedio
        C_opt = float(pipeline.named_steps["lr"].C_.mean())
        val_metrics = _compute_metrics(pipeline, X_val, y_val)
        test_metrics = _compute_metrics(pipeline, X_test, y_test)

        log.info("  C óptimo=%.4f", C_opt)
        log.info(
            "  val  → accuracy=%.4f log_loss=%.4f",
            val_metrics["accuracy"], val_metrics["log_loss"],
        )
        log.info(
            "  test → accuracy=%.4f log_loss=%.4f",
            test_metrics["accuracy"], test_metrics["log_loss"],
        )

        path = MODELS_DIR / f"{name}.pkl"
        joblib.dump(pipeline, path)
        log.info("  guardado en %s", path)

        global_metrics[name] = {
            "val": val_metrics,
            "test": test_metrics,
            "C": round(float(C_opt), 4),
        }

    metrics_path = MODELS_DIR / "metrics.json"
    metrics_path.write_text(json.dumps(global_metrics, indent=2))
    log.info("métricas guardadas en %s", metrics_path)

    elapsed = time.time() - start
    log.info(
        "done in %.1fs — modelos: %s",
        elapsed, ", ".join(MODELS_CONFIG),
    )

    return global_metrics


if __name__ == "__main__":
    train_models()
