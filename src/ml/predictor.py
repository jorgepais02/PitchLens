"""Carga de modelos y cálculo de predicciones y feature importance."""

from pathlib import Path
from typing import Literal

import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline

from src.ml.train_models import MODELS_CONFIG

MODELS_DIR = Path("models")
ModelName = Literal["baseline", "extended", "market"]

# Caché en memoria — se carga cada modelo solo una vez por proceso
_cache: dict[str, Pipeline] = {}


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
    classes = pipeline.classes_
    prob_map = dict(zip(classes, proba))
    return {
        "prob_h": round(float(prob_map["H"]), 4),
        "prob_d": round(float(prob_map["D"]), 4),
        "prob_a": round(float(prob_map["A"]), 4),
    }


def feature_importance(model_name: ModelName) -> list[dict]:
    """Devuelve la importancia de cada feature del modelo preentrenado.

    LR: media de |coeficientes| entre clases, normalizada a [0, 1].
    RF: media de feature_importances_ entre los folds de CalibratedClassifierCV,
    normalizada a [0, 1].
    Orden descendente por importancia.

    Args:
        model_name: 'baseline', 'extended' o 'market'.

    Returns:
        Lista de {'feature': str, 'importance': float} ordenada de mayor a menor.
    """
    pipeline = _load(model_name)
    cols = MODELS_CONFIG[model_name]

    if "lr" in pipeline.named_steps:
        # coef_ shape: (n_classes, n_features)
        importance = np.mean(np.abs(pipeline.named_steps["lr"].coef_), axis=0)
    else:
        # RF / XGBoost: CalibratedClassifierCV genera un estimador por fold
        ccv = pipeline.named_steps["clf"]
        importance = np.mean(
            [cal_clf.estimator.feature_importances_ for cal_clf in ccv.calibrated_classifiers_],
            axis=0,
        )

    if importance.max() > 0:
        importance = importance / importance.max()

    return sorted(
        [
            {"feature": feat, "importance": round(float(imp), 4)}
            for feat, imp in zip(cols, importance)
        ],
        key=lambda d: d["importance"],
        reverse=True,
    )
