"""Tests de los modelos preentrenados."""

import json
from pathlib import Path

import numpy as np
import pytest

import src.ml.predictor as predictor_module
from src.ml.predictor import feature_importance, predict
from src.ml.train_models import MODELS_CONFIG, DATA_PATH, split

MODELS_DIR = Path("models")


@pytest.fixture(autouse=True)
def limpiar_cache():
    """Limpia el caché de modelos entre tests para garantizar aislamiento."""
    predictor_module._cache.clear()
    yield
    predictor_module._cache.clear()


@pytest.mark.parametrize("name", ["baseline", "extended", "market"])
def test_modelo_existe(name: str) -> None:
    """El archivo .pkl de cada modelo preentrenado debe existir."""
    assert (MODELS_DIR / f"{name}.pkl").exists(), f"Falta models/{name}.pkl"


def test_metrics_file_existe() -> None:
    """El archivo metrics.json debe existir y tener la estructura esperada."""
    path = MODELS_DIR / "metrics.json"
    assert path.exists(), "Falta models/metrics.json"
    metrics = json.loads(path.read_text())
    for name in ["baseline", "extended", "market"]:
        assert name in metrics
        for partition in ["val", "test"]:
            assert "accuracy" in metrics[name][partition]
            assert "log_loss" in metrics[name][partition]
            assert "confusion_matrix" in metrics[name][partition]


@pytest.mark.parametrize("name", ["baseline", "extended", "market"])
def test_predict_probabilidades_validas(name: str) -> None:
    """Las probabilidades deben ser ≥ 0, sumar 1 y no contener NaN."""
    features = {f: 0.0 for f in MODELS_CONFIG[name]}
    result = predict(name, features)
    probs = [result["prob_h"], result["prob_d"], result["prob_a"]]
    assert all(p >= 0 for p in probs), "Probabilidad negativa"
    assert abs(sum(probs) - 1.0) < 1e-4, f"Probabilidades no suman 1: {sum(probs)}"
    assert not any(np.isnan(p) for p in probs), "NaN en probabilidades"


@pytest.mark.parametrize("name", ["baseline", "extended", "market"])
def test_feature_importance_estructura(name: str) -> None:
    """feature_importance debe devolver una entrada por feature, en [0, 1]."""
    importances = feature_importance(name)
    assert len(importances) == len(MODELS_CONFIG[name])
    for d in importances:
        assert "feature" in d and "importance" in d
        assert 0.0 <= d["importance"] <= 1.0


@pytest.mark.parametrize("name", ["baseline", "extended", "market"])
def test_predict_falla_con_features_faltantes(name: str) -> None:
    """predict() debe lanzar ValueError si falta alguna feature."""
    with pytest.raises(ValueError, match="Features faltantes"):
        predict(name, {})


@pytest.mark.parametrize("name", ["baseline", "extended", "market"])
def test_feature_importance_orden_descendente(name: str) -> None:
    """feature_importance debe devolver la lista ordenada de mayor a menor."""
    importances = feature_importance(name)
    values = [d["importance"] for d in importances]
    assert values == sorted(values, reverse=True), "Importancias no están en orden descendente"


@pytest.mark.parametrize("name", ["baseline", "extended", "market"])
def test_predict_sanity_equipo_local_dominante(name: str) -> None:
    """Con ventaja extrema del local, prob_h debe superar a prob_a."""
    base_features = {f: 0.0 for f in MODELS_CONFIG[name]}
    if "elo_diff_pre" in base_features:
        base_features["elo_diff_pre"] = 500.0
    if "prob_diff_market" in base_features:
        base_features["prob_diff_market"] = 1.0
    base_features["points_diff_global"] = 30.0
    base_features["goal_diff_last5_global"] = 10.0
    result = predict(name, base_features)
    assert result["prob_h"] > result["prob_a"], (
        f"{name}: local dominante no produce prob_h > prob_a"
    )


@pytest.mark.parametrize("name", ["baseline", "extended", "market"])
def test_predict_sanity_equipo_visitante_dominante(name: str) -> None:
    """Con ventaja extrema del visitante, prob_a debe superar a prob_h."""
    base_features = {f: 0.0 for f in MODELS_CONFIG[name]}
    if "elo_diff_pre" in base_features:
        base_features["elo_diff_pre"] = -500.0
    if "prob_diff_market" in base_features:
        base_features["prob_diff_market"] = -1.0
    base_features["points_diff_global"] = -30.0
    base_features["goal_diff_last5_global"] = -10.0
    result = predict(name, base_features)
    assert result["prob_a"] > result["prob_h"], (
        f"{name}: visitante dominante no produce prob_a > prob_h"
    )


@pytest.mark.parametrize("name", ["baseline", "extended", "market"])
def test_feature_importance_nombres_correctos(name: str) -> None:
    """Los nombres de features en feature_importance deben coincidir con MODELS_CONFIG."""
    importances = feature_importance(name)
    returned_names = {d["feature"] for d in importances}
    assert returned_names == set(MODELS_CONFIG[name]), (
        f"{name}: nombres incorrectos — got {returned_names}, "
        f"expected {set(MODELS_CONFIG[name])}"
    )


def test_split_temporal_correcto() -> None:
    """El split no debe filtrar partidos de val/test en train ni mezclar temporadas."""
    import pandas as pd
    df = pd.read_parquet(DATA_PATH)
    train, val, test = split(df)
    assert train["Season"].astype(int).max() <= 2022, "train contiene partidos de 2023/2024"
    assert (val["Season"].astype(int) == 2023).all(), "val contiene temporadas distintas a 2023"
    assert (test["Season"].astype(int) == 2024).all(), "test contiene temporadas distintas a 2024"
    assert len(train) + len(val) + len(test) == len(df), "split pierde o duplica partidos"


def test_predict_modelo_inexistente_lanza_error() -> None:
    """predict() con un nombre de modelo no existente debe lanzar FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        predict("inexistente", {})  # type: ignore[arg-type]


def test_feature_importance_coeficientes_cero(monkeypatch: pytest.MonkeyPatch) -> None:
    """feature_importance no debe fallar ni dividir por cero cuando coef_ son todos cero."""
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    n_features = len(MODELS_CONFIG["baseline"])
    lr = LogisticRegression()
    lr.coef_ = np.zeros((3, n_features))
    lr.classes_ = np.array(["A", "D", "H"])
    pipeline = Pipeline([("scaler", StandardScaler()), ("lr", lr)])
    monkeypatch.setitem(predictor_module._cache, "baseline", pipeline)

    importances = feature_importance("baseline")
    assert all(d["importance"] == 0.0 for d in importances)


def test_market_no_incluye_elo_y_si_prob_market() -> None:
    """El modelo market no debe contener elo_diff_pre (reemplazado por prob_diff_market)."""
    assert "elo_diff_pre" not in MODELS_CONFIG["market"]
    assert "prob_diff_market" in MODELS_CONFIG["market"]


def test_preentrenados_no_predicen_empates() -> None:
    """LR sin class_weight no tiene señal discriminativa para D.

    Si este test falla, algún modelo empezó a predecir empates — revisar si
    el cambio (class_weight, algoritmo, features) es intencionado.
    """
    metrics = json.loads((MODELS_DIR / "metrics.json").read_text())
    for name in ["baseline", "extended", "market"]:
        cm = metrics[name]["test"]["confusion_matrix"]
        d_pred = cm[0][1] + cm[1][1] + cm[2][1]
        assert d_pred == 0, (
            f"{name}: {d_pred} empates predichos — comportamiento cambiado"
        )


@pytest.mark.parametrize("name,min_acc,max_ll", [
    ("baseline", 0.535, 0.960),
    ("extended", 0.538, 0.958),
    ("market",   0.560, 0.940),
])
def test_metricas_en_rango(name: str, min_acc: float, max_ll: float) -> None:
    """Las métricas en test deben estar en el rango de los modelos actuales.

    Umbrales calibrados por modelo para detectar regresiones reales sin ser
    tan estrictos que fallen por variación numérica en re-entrenamiento.
    """
    metrics = json.loads((MODELS_DIR / "metrics.json").read_text())
    test = metrics[name]["test"]
    assert test["accuracy"] > min_acc, (
        f"{name}: accuracy {test['accuracy']:.4f} por debajo del umbral {min_acc}"
    )
    assert test["log_loss"] < max_ll, (
        f"{name}: log_loss {test['log_loss']:.4f} por encima del umbral {max_ll}"
    )
