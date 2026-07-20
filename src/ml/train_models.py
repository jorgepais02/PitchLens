"""Entrenamiento y persistencia de los 3 modelos preentrenados.

Uso:
    python -m src.ml.train_models           # entrena con LR (por defecto)
    python -m src.ml.train_models --algo rf # entrena con Random Forest
"""

import json
import logging
import time

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegressionCV
from sklearn.metrics import accuracy_score, confusion_matrix, log_loss
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from src.ml._config import CV_Cs, DATA_PATH, MODELS_CONFIG, MODELS_DIR

log = logging.getLogger("train")

TARGET = "FTR"

_RF_BEST_PARAMS: dict = {
    "n_estimators": 200,
    "min_samples_leaf": 50,
    "max_features": 0.5,
    "max_depth": 5,
    "class_weight": None,
}



def split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Divide en train (Season ≤ 2022), val (2023) y test (2024). Nunca aleatorio."""
    season = df["Season"].astype(int)
    train = df[season <= 2022].sort_values("Date").copy()
    val = df[season == 2023].copy()
    test = df[season == 2024].copy()
    return train, val, test



def _build_lr_pipeline() -> Pipeline:
    """Pipeline escalado + LR con C seleccionado por CV temporal (scoring=neg_log_loss)."""
    return Pipeline([
        ("scaler", StandardScaler()),
        ("lr", LogisticRegressionCV(
            Cs=CV_Cs,
            cv=TimeSeriesSplit(n_splits=5),
            scoring="neg_log_loss",
            max_iter=1000,
            use_legacy_attributes=True,
        )),
    ])


def _build_rf_pipeline(params: dict | None = None) -> Pipeline:
    """RF calibrado (sigmoid). params sobreescribe los defaults si se provee."""
    defaults = dict(random_state=42, n_jobs=-1)
    if params:
        defaults.update(params)
    return Pipeline([
        ("clf", CalibratedClassifierCV(
            RandomForestClassifier(**defaults),
            method="sigmoid",
            cv=5,
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



def train_models(algorithm: str = "lr") -> dict:
    """Entrena los 3 modelos preentrenados con el algoritmo indicado y los persiste en models/.

    Args:
        algorithm: 'lr' (por defecto) o 'rf' (con _RF_BEST_PARAMS).

    Devuelve el diccionario de métricas completo.
    """
    valid = {"lr", "rf"}
    if algorithm not in valid:
        raise ValueError(f"Algoritmo desconocido '{algorithm}'. Opciones: {valid}")

    start = time.time()
    MODELS_DIR.mkdir(exist_ok=True)

    log.info("algoritmo: %s", algorithm.upper())
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

        if algorithm == "rf":
            pipeline = _build_rf_pipeline(_RF_BEST_PARAMS)
        else:
            pipeline = _build_lr_pipeline()

        pipeline.fit(X_train, y_train)

        val_metrics = _compute_metrics(pipeline, X_val, y_val)
        test_metrics = _compute_metrics(pipeline, X_test, y_test)

        if algorithm == "lr":
            C_opt = float(pipeline.named_steps["lr"].C_.mean())
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

        extra = {"C": round(C_opt, 4)} if algorithm == "lr" else {"algorithm": algorithm}
        global_metrics[name] = {"val": val_metrics, "test": test_metrics, **extra}

    metrics_path = MODELS_DIR / "metrics.json"
    metrics_path.write_text(json.dumps(global_metrics, indent=2))
    log.info("métricas guardadas en %s", metrics_path)

    elapsed = time.time() - start
    log.info(
        "done in %.1fs — algoritmo=%s modelos: %s",
        elapsed, algorithm.upper(), ", ".join(MODELS_CONFIG),
    )

    return global_metrics


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="[TRAIN] %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Entrenamiento de modelos preentrenados")
    parser.add_argument(
        "--algo",
        default="lr",
        choices=["lr", "rf"],
        help="Algoritmo a usar (default: lr)",
    )
    args = parser.parse_args()
    train_models(algorithm=args.algo)
