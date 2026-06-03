"""Router de modelos — GET /models, GET /features/available."""

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import select

from src.api.deps import SessionDep
from src.api.schemas import CustomModelRead, FeatureInfo, ModelInfo, ModelsResponse
from src.features._constants import FEATURES
from src.ml._config import MODELS_CONFIG

router = APIRouter(tags=["models"])

_METRICS_PATH = Path("models/metrics.json")

# Bearer opcional: auto_error=False devuelve None si no hay header, sin lanzar 401
_optional_bearer = HTTPBearer(auto_error=False)

# Descripciones legibles por feature para el frontend
_FEATURE_DESCRIPTIONS: dict[str, str] = {
    "elo_diff_pre": "Diferencia de ELO histórico (home − away) pre-partido",
    "points_diff_global": "Diferencia de puntos acumulados en la temporada (global)",
    "points_diff_venue": "Diferencia de puntos acumulados en la temporada (por localía)",
    "goal_diff_last5_global": "Diferencia de goles en los últimos 5 partidos (global)",
    "goal_diff_last5_venue": "Diferencia de goles en los últimos 5 partidos (por localía)",
    "sot_diff_last5_global": "Diferencia de tiros a puerta en los últimos 5 partidos",
    "xg_diff_last5_global": "Diferencia de xG generado en los últimos 5 partidos",
    "xg_conceded_diff_last5_global": "Diferencia de xG concedido en los últimos 5 partidos",
    "rest_days_diff": "Diferencia en días de descanso desde el último partido",
    "prob_diff_market": "Diferencia de probabilidad implícita en cuotas Pinnacle de cierre",
    "h2h_goal_diff_last5": "Diferencia de goles en los últimos 5 H2H entre estos equipos",
    "h2h_result_diff_last5": "Diferencia de victorias en los últimos 5 H2H entre estos equipos",
}


def _load_metrics() -> dict:
    """Carga metrics.json desde disco. Falla explícitamente si no existe."""
    if not _METRICS_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="Métricas no disponibles. Ejecuta primero: python -m src.ml.train_models",
        )
    return json.loads(_METRICS_PATH.read_text())


def _pretrained_list(metrics: dict) -> list[ModelInfo]:
    """Construye la lista de modelos preentrenados a partir de metrics.json."""
    result = []
    for name, features in MODELS_CONFIG.items():
        m = metrics.get(name, {})
        result.append(
            ModelInfo(
                name=name,
                features=features,
                n_features=len(features),
                val_accuracy=m.get("val", {}).get("accuracy"),
                test_accuracy=m.get("test", {}).get("accuracy"),
                test_log_loss=m.get("test", {}).get("log_loss"),
            )
        )
    return result


@router.get("/models", response_model=ModelsResponse)
def get_models(
    session: SessionDep,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
) -> ModelsResponse:
    """Devuelve los 3 modelos preentrenados y, si hay JWT válido, los modelos custom del usuario."""
    metrics = _load_metrics()
    pretrained = _pretrained_list(metrics)

    custom: list[CustomModelRead] = []
    if credentials is not None:
        from src.api.auth import decode_access_token
        from src.db.auth_models import CustomModel
        from jose import JWTError

        try:
            user_id = decode_access_token(credentials.credentials)
        except (ValueError, JWTError):
            # Token inválido o expirado — se devuelven solo los preentrenados
            return ModelsResponse(pretrained=pretrained, custom=custom)

        modelos = session.exec(
            select(CustomModel)
            .where(CustomModel.user_id == user_id)
            .order_by(CustomModel.created_at.desc())
        ).all()
        custom = [
            CustomModelRead(
                id=m.id,
                name=m.name,
                algorithm=m.algorithm,
                features=m.features,
                val_accuracy=m.metrics.get("val", {}).get("accuracy"),
                test_accuracy=m.metrics.get("test", {}).get("accuracy"),
                test_log_loss=m.metrics.get("test", {}).get("log_loss"),
                created_at=m.created_at,
            )
            for m in modelos
        ]

    return ModelsResponse(pretrained=pretrained, custom=custom)


@router.get("/features/available", response_model=list[FeatureInfo])
def get_features_available() -> list[FeatureInfo]:
    """Devuelve las 12 features disponibles con su descripción y en qué modelos aparece.

    La lista de features parte de `features._constants.FEATURES` (fuente de verdad,
    igual que la validación de /train); MODELS_CONFIG solo dice en qué modelos
    preentrenados aparece cada una.
    """
    feature_models: dict[str, list[str]] = {}
    for model_name, feats in MODELS_CONFIG.items():
        for feat in feats:
            feature_models.setdefault(feat, []).append(model_name)

    return [
        FeatureInfo(
            name=feat,
            description=_FEATURE_DESCRIPTIONS.get(feat, feat),
            used_in_models=feature_models.get(feat, []),
        )
        for feat in FEATURES
    ]
