"""Test de la rama no-LR de compute_feature_importance.

Para DT/RF/XGB la importancia se extrae de
`CalibratedClassifierCV.calibrated_classifiers_[i].estimator.feature_importances_`
(no de coeficientes). Esta rama solo se ejercitaba en integración.
"""

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeClassifier

from src.ml.predictor import compute_feature_importance


def _toy_calibrated_dt() -> tuple[Pipeline, list[str]]:
    """DT calibrado entrenado sobre datos donde f1 manda y f2 es ruido."""
    rng = np.random.default_rng(0)
    n = 150
    f1 = rng.normal(size=n)
    f2 = rng.normal(size=n)
    X = pd.DataFrame({"f1": f1, "f2": f2})
    y = np.where(f1 > 0.5, "H", np.where(f1 < -0.5, "A", "D"))

    clf = DecisionTreeClassifier(max_depth=3, min_samples_leaf=5, random_state=0)
    pipe = Pipeline([("clf", CalibratedClassifierCV(clf, method="sigmoid", cv=5))])
    pipe.fit(X, y)
    return pipe, ["f1", "f2"]


def test_importancia_no_lr_usa_estimator_y_orden_desc() -> None:
    pipe, features = _toy_calibrated_dt()
    imp = compute_feature_importance(pipe, features)

    assert {d["feature"] for d in imp} == {"f1", "f2"}
    valores = [d["importance"] for d in imp]
    assert valores == sorted(valores, reverse=True)
    assert imp[0]["feature"] == "f1"
    assert imp[0]["importance"] == 1.0
    assert all(0.0 <= d["importance"] <= 1.0 for d in imp)
