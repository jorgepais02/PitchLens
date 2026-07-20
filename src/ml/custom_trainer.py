"""Entrenamiento de modelos custom de usuario.

Soporta LR, DT, RF y XGBoost. DT/RF/XGBoost se calibran con sigmoid
para que las probabilidades sean comparables con LR.
"""

from pathlib import Path

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegressionCV
from sklearn.metrics import accuracy_score, log_loss
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier

from src.ml._config import CV_Cs, DATA_PATH
from src.ml.predictor import compute_feature_importance
from src.ml.train_models import split

TARGET = "FTR"
VALID_ALGORITHMS = {"lr", "dt", "rf", "xgb"}


class _EncodedPipeline:
    """Envuelve un pipeline + LabelEncoder exponiendo la interfaz de sklearn.

    Necesario para DT/RF/XGB: CalibratedClassifierCV exige labels numéricos,
    pero el resto del sistema (predictor, /predict/custom) espera classes_ con
    los strings originales ('A','D','H') y predict_proba alineado con ellos.
    """

    def __init__(self, pipeline: Pipeline, le: LabelEncoder) -> None:
        self._pipeline = pipeline
        self._le = le

    @property
    def named_steps(self) -> dict:
        return self._pipeline.named_steps

    @property
    def classes_(self) -> "np.ndarray":  # type: ignore[name-defined]
        return self._le.classes_

    def predict_proba(self, X: pd.DataFrame) -> "np.ndarray":  # type: ignore[name-defined]
        return self._pipeline.predict_proba(X)

    def predict(self, X: pd.DataFrame) -> "np.ndarray":  # type: ignore[name-defined]
        return self._le.inverse_transform(self._pipeline.predict(X))


def _build_pipeline(algorithm: str) -> Pipeline:
    """Construye el pipeline sklearn para el algoritmo indicado."""
    if algorithm == "lr":
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

    if algorithm == "dt":
        clf = DecisionTreeClassifier(max_depth=5, min_samples_leaf=30, random_state=42)
        return Pipeline([("clf", CalibratedClassifierCV(clf, method="sigmoid", cv=5))])

    if algorithm == "rf":
        from sklearn.ensemble import RandomForestClassifier
        clf = RandomForestClassifier(
            n_estimators=200, min_samples_leaf=50, max_features=0.5,
            max_depth=5, random_state=42, n_jobs=-1,
        )
        return Pipeline([("clf", CalibratedClassifierCV(clf, method="sigmoid", cv=5))])

    if algorithm == "xgb":
        from xgboost import XGBClassifier
        clf = XGBClassifier(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8,
            eval_metric="mlogloss", random_state=42, n_jobs=-1,
        )
        return Pipeline([("clf", CalibratedClassifierCV(clf, method="sigmoid", cv=5))])

    raise ValueError(f"Algoritmo desconocido: '{algorithm}'. Opciones: {sorted(VALID_ALGORITHMS)}")


def train_custom(
    features: list[str],
    algorithm: str,
    artifact_path: str,
) -> dict:
    """Entrena un modelo custom y lo persiste.

    Args:
        features: Lista de features a usar (subconjunto de las 12 disponibles).
        algorithm: 'lr', 'dt', 'rf' o 'xgb'.
        artifact_path: Ruta donde guardar el .pkl.

    Returns:
        Diccionario de métricas {val: {accuracy, log_loss}, test: {accuracy, log_loss},
        feature_importance: [...]}
    """
    if algorithm not in VALID_ALGORITHMS:
        raise ValueError(f"Algoritmo inválido: '{algorithm}'. Opciones: {sorted(VALID_ALGORITHMS)}")

    df = pd.read_parquet(DATA_PATH)
    train, val, test = split(df)

    X_train, y_train = train[features], train[TARGET]
    X_val, y_val = val[features], val[TARGET]
    X_test, y_test = test[features], test[TARGET]

    pipeline = _build_pipeline(algorithm)

    if algorithm != "lr":
        le = LabelEncoder()
        y_train_fit = le.fit_transform(y_train)
        pipeline.fit(X_train, y_train_fit)
        artifact = _EncodedPipeline(pipeline, le)
    else:
        pipeline.fit(X_train, y_train)
        artifact = pipeline  # type: ignore[assignment]

    def _metrics(X: pd.DataFrame, y_true: pd.Series) -> dict:
        y_pred = artifact.predict(X)
        y_proba = artifact.predict_proba(X)
        return {
            "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
            "log_loss": round(float(log_loss(y_true, y_proba, labels=artifact.classes_)), 4),
        }

    path = Path(artifact_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, path)

    return {
        "val": _metrics(X_val, y_val),
        "test": _metrics(X_test, y_test),
        "feature_importance": compute_feature_importance(artifact, features),
    }
