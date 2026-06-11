"""Carga de modelos y cálculo de predicciones y feature importance."""

from typing import Literal, Sequence

import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline

from src.ml._config import CONTRIBUTION_GROUPS, MODELS_CONFIG, MODELS_DIR

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


def _shap_contributions(
    pipeline: Pipeline,
    X: "pd.DataFrame",
    classes: list[str],
) -> "np.ndarray":
    """SHAP values promediados sobre los folds de CalibratedClassifierCV.

    Devuelve array de shape (n_features, n_classes) con los SHAP values
    para la muestra X (una sola fila).
    """
    import shap  # import lazy — solo en predicciones con modelos árbol

    ccv = pipeline.named_steps["clf"]
    n_classes = len(classes)
    shap_sum = np.zeros((X.shape[1], n_classes))

    for cal_clf in ccv.calibrated_classifiers_:
        explainer = shap.TreeExplainer(cal_clf.estimator)
        sv = explainer.shap_values(X)
        # sv puede ser lista (una array por clase) o array 3D (n_samples, n_feat, n_classes)
        if isinstance(sv, list):
            # orden de clases del estimador base — puede diferir del pipeline
            est_classes = list(cal_clf.estimator.classes_) if hasattr(cal_clf.estimator, "classes_") else classes
            for cls_local_idx, cls in enumerate(est_classes):
                if cls in classes:
                    cls_global_idx = classes.index(cls)
                    shap_sum[:, cls_global_idx] += sv[cls_local_idx][0]
        else:
            shap_sum += sv[0]  # shape (n_feat, n_classes)

    return shap_sum / len(ccv.calibrated_classifiers_)


def compute_local_contributions(
    pipeline: Pipeline,
    features: dict[str, float],
    model_features: list[str],
    groups: dict[str, list[str]] | None = None,
) -> dict[str, dict[str, float]] | None:
    """Contribuciones locales por grupo (exactas para LR y modelos árbol).

    LR: coef_ * x_scaled — analítico, sin aproximación.
    DT/RF/XGBoost: SHAP TreeExplainer promediado sobre folds de CalibratedClassifierCV.

    El grupo 'market' se omite si prob_diff_market == 0.0 (sin cuotas reales).
    Features internas (points_diff_*, rest_days_diff) no se mapean a ningún grupo.

    Args:
        pipeline: Pipeline sklearn entrenado.
        features: Diccionario completo {nombre_feature: valor} del partido.
        model_features: Features usadas por este modelo, en orden de columnas.
        groups: Agrupación {nombre_grupo: [features]}. Por defecto CONTRIBUTION_GROUPS.

    Returns:
        {grupo: {'H': float, 'D': float, 'A': float}} o None si no aplica.
    """
    if groups is None:
        groups = CONTRIBUTION_GROUPS

    X = pd.DataFrame([features])[model_features]

    if "lr" in pipeline.named_steps:
        lr = pipeline.named_steps["lr"]
        classes: list[str] = list(lr.classes_)
        X_scaled = pipeline[:-1].transform(X)
        coef = lr.coef_  # shape (n_classes, n_features)
        # contrib[feat_idx, cls_idx] = coef[cls_idx, feat_idx] * x_scaled[feat_idx]
        contrib_matrix = (coef * X_scaled).T  # shape (n_features, n_classes)
    elif "clf" in pipeline.named_steps:
        classes = list(pipeline.named_steps["clf"].classes_)
        contrib_matrix = _shap_contributions(pipeline, X, classes)
    else:
        return None

    result: dict[str, dict[str, float]] = {}
    for group_name, group_feats in groups.items():
        if group_name == "market" and features.get("prob_diff_market", 0.0) == 0.0:
            continue

        active = [f for f in group_feats if f in model_features]
        if not active:
            continue

        group_contrib = np.zeros(len(classes))
        for feat in active:
            idx = model_features.index(feat)
            group_contrib += contrib_matrix[idx]

        result[group_name] = {
            classes[i]: round(float(group_contrib[i]), 4) for i in range(len(classes))
        }

    return result or None


def feature_importance(model_name: ModelName) -> list[dict]:
    """Devuelve la importancia de cada feature del modelo preentrenado.

    Args:
        model_name: 'baseline', 'extended' o 'market'.

    Returns:
        Lista de {'feature': str, 'importance': float} ordenada de mayor a menor.
    """
    pipeline = _load(model_name)
    return compute_feature_importance(pipeline, MODELS_CONFIG[model_name])
