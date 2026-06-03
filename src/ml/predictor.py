"""Carga de modelos y cálculo de predicciones y feature importance."""

from typing import Literal, Sequence

import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline

from src.ml._config import MODELS_CONFIG, MODELS_DIR

ModelName = Literal["baseline", "extended", "market"]

# Caché en memoria — se carga cada modelo solo una vez por proceso
_cache: dict[str, Pipeline] = {}


def normalize_probabilities(classes: Sequence, proba: Sequence[float]) -> dict[str, float]:
    """Convierte (clases, probabilidades) en {prob_h, prob_d, prob_a} validado.

    Endurece la salida del modelo: rechaza NaN/inf y renormaliza por la suma
    para que las tres probabilidades sumen 1.0 antes de redondear (tres
    round() independientes pueden alejar la suma mostrada de 1.0).

    Args:
        classes: Etiquetas de clase del pipeline (orden de `predict_proba`).
        proba: Probabilidades en el mismo orden que `classes`.

    Returns:
        Diccionario con claves prob_h, prob_d, prob_a (suman ≈1.0, 4 decimales).

    Raises:
        ValueError: si alguna probabilidad es NaN/inf o la suma no es positiva.
    """
    arr = np.asarray(proba, dtype=float)
    if not np.isfinite(arr).all():
        raise ValueError("El modelo devolvió probabilidades no finitas (NaN/inf)")

    total = arr.sum()
    if total <= 0:
        raise ValueError(f"Suma de probabilidades inválida: {total}")
    arr = arr / total

    prob_map = dict(zip(classes, arr))
    return {
        "prob_h": round(float(prob_map.get("H", 0.0)), 4),
        "prob_d": round(float(prob_map.get("D", 0.0)), 4),
        "prob_a": round(float(prob_map.get("A", 0.0)), 4),
    }


def _load(name: str) -> Pipeline:
    """Carga un modelo desde disco si no está ya en caché."""
    if name not in _cache:
        path = MODELS_DIR / f"{name}.pkl"
        if not path.exists():
            raise FileNotFoundError(
                f"Modelo '{name}' no encontrado en {path}. "
                "Ejecuta primero: python -m src.ml.train_models"
            )
        _cache[name] = joblib.load(path)
    return _cache[name]


def predict(model_name: ModelName, features: dict[str, float]) -> dict[str, float]:
    """Devuelve probabilidades H/D/A para el modelo y vector de features dado.

    Args:
        model_name: 'baseline', 'extended' o 'market'.
        features: Diccionario {nombre_feature: valor}.

    Returns:
        Diccionario con claves prob_h, prob_d, prob_a (suman 1.0).
    """
    pipeline = _load(model_name)
    cols = MODELS_CONFIG[model_name]
    missing = [c for c in cols if c not in features]
    if missing:
        raise ValueError(f"Features faltantes para '{model_name}': {missing}")
    X = pd.DataFrame([features])[cols]
    proba = pipeline.predict_proba(X)[0]
    return normalize_probabilities(pipeline.classes_, proba)


def compute_feature_importance(pipeline: Pipeline, features: list[str]) -> list[dict]:
    """Extrae importancia normalizada de features según el tipo de estimador.

    LR: media de |coeficientes| entre clases, normalizada a [0, 1].
    DT/RF/XGBoost: media de feature_importances_ entre folds de CalibratedClassifierCV.
    Orden descendente por importancia.

    Args:
        pipeline: Pipeline sklearn ya entrenado.
        features: Lista de nombres de features en el mismo orden que el pipeline.

    Returns:
        Lista de {'feature': str, 'importance': float} ordenada de mayor a menor.
    """
    if "lr" in pipeline.named_steps:
        importance = np.mean(np.abs(pipeline.named_steps["lr"].coef_), axis=0)
    else:
        ccv = pipeline.named_steps["clf"]
        importance = np.mean(
            [cal_clf.estimator.feature_importances_ for cal_clf in ccv.calibrated_classifiers_],
            axis=0,
        )

    if importance.max() > 0:
        importance = importance / importance.max()

    return sorted(
        [{"feature": f, "importance": round(float(i), 4)} for f, i in zip(features, importance)],
        key=lambda d: d["importance"],
        reverse=True,
    )


def feature_importance(model_name: ModelName) -> list[dict]:
    """Devuelve la importancia de cada feature del modelo preentrenado.

    Args:
        model_name: 'baseline', 'extended' o 'market'.

    Returns:
        Lista de {'feature': str, 'importance': float} ordenada de mayor a menor.
    """
    pipeline = _load(model_name)
    return compute_feature_importance(pipeline, MODELS_CONFIG[model_name])
