"""Router de predicción — POST /predict, POST /predict/custom."""

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Literal

import joblib
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.api.deps import CurrentUserDep, SessionDep
from src.services.feature_builder import compute_prediction_features
from src.api.schemas import PredictResponse
from src.db.models import Team
from src.ml._config import MODELS_CONFIG
from src.ml.predictor import compute_feature_importance, normalize_probabilities

if TYPE_CHECKING:
    from src.db.auth_models import User

log = logging.getLogger("api.predict")

router = APIRouter(tags=["predict"])



def _resolve_features(
    session: SessionDep,
    home_team_id: int,
    away_team_id: int,
    *,
    requires_market: bool,
    psch: float | None,
    pscd: float | None,
    psca: float | None,
) -> tuple[dict[str, float], bool, bool, dict[str, dict[str, float]]]:
    """Valida equipos/liga/cuotas y construye las features del partido hipotético.

    Compartido por /predict y /predict/custom. Lanza HTTPException con el código
    adecuado (422/404/500) y nunca filtra detalle interno al cliente en el 500.

    Returns:
        Tupla (features, cold_start, h2h_cold_start, split).
    """
    if home_team_id == away_team_id:
        raise HTTPException(status_code=422, detail="Los equipos local y visitante deben ser distintos")

    home_team = session.get(Team, home_team_id)
    away_team = session.get(Team, away_team_id)
    if home_team is None or away_team is None:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    if home_team.league_id != away_team.league_id:
        raise HTTPException(
            status_code=422,
            detail="Los equipos deben pertenecer a la misma liga — las features no son comparables entre ligas distintas",
        )

    if requires_market and any(v is None for v in (psch, pscd, psca)):
        raise HTTPException(
            status_code=422,
            detail="El modelo seleccionado requiere psch, pscd y psca (cuotas Pinnacle de cierre)",
        )

    try:
        features, cold_start, h2h_cold_start, split = compute_prediction_features(
            session=session,
            home_team_id=home_team_id,
            away_team_id=away_team_id,
            psch=psch,
            pscd=pscd,
            psca=psca,
        )
        return features, cold_start, h2h_cold_start, split
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        log.exception("Error calculando features para partido %s-%s", home_team_id, away_team_id)
        raise HTTPException(status_code=500, detail="Error interno calculando las features del partido")


class PredictRequest(BaseModel):
    """Cuerpo de la petición de predicción."""

    home_team_id: int
    away_team_id: int
    model: Literal["baseline", "extended", "market"]
    # Cuotas Pinnacle de cierre — requeridas para modelo market, ignoradas en los demás
    psch: float | None = Field(default=None, gt=1.0, description="Cuota Pinnacle cierre local")
    pscd: float | None = Field(default=None, gt=1.0, description="Cuota Pinnacle cierre empate")
    psca: float | None = Field(default=None, gt=1.0, description="Cuota Pinnacle cierre visitante")


@router.post("/predict", response_model=PredictResponse)
def post_predict(body: PredictRequest, session: SessionDep) -> PredictResponse:
    """Calcula la predicción H/D/A para un partido hipotético.

    Reconstruye las features desde el historial de la BD y devuelve
    probabilidades, importancia de features y un aviso de cold start si
    alguno de los equipos tiene historial insuficiente.

    El modelo 'market' usa prob_diff_market (cuotas Pinnacle de cierre), que no
    se pueden derivar de un partido futuro: por eso psch/pscd/psca son
    obligatorias para 'market' (422 si faltan) e ignoradas para baseline/extended.
    """
    requires_market = body.model == "market"
    features, _cold_start, h2h_cold_start, split = _resolve_features(
        session,
        body.home_team_id,
        body.away_team_id,
        requires_market=requires_market,
        psch=body.psch,
        pscd=body.pscd,
        psca=body.psca,
    )

    model_features = MODELS_CONFIG[body.model]
    missing = [f for f in model_features if f not in features]
    if missing:
        log.error("Features no disponibles para el modelo '%s': %s", body.model, missing)
        raise HTTPException(
            status_code=500,
            detail=f"Features no disponibles para el modelo '{body.model}'",
        )

    from src.ml.predictor import feature_importance, predict  # noqa: PLC0415

    probabilities = predict(body.model, features)
    importance = feature_importance(body.model)

    return PredictResponse(
        prob_h=probabilities["prob_h"],
        prob_d=probabilities["prob_d"],
        prob_a=probabilities["prob_a"],
        feature_importance=importance,
        feature_values={k: round(v, 4) for k, v in features.items() if k in model_features},
        feature_values_split=split,
        h2h_cold_start=h2h_cold_start,
    )


class PredictCustomRequest(BaseModel):
    """Cuerpo de la petición de predicción con modelo custom."""

    home_team_id: int
    away_team_id: int
    model_id: int
    psch: float | None = Field(default=None, gt=1.0)
    pscd: float | None = Field(default=None, gt=1.0)
    psca: float | None = Field(default=None, gt=1.0)


@router.post("/predict/custom", response_model=PredictResponse)
def post_predict_custom(
    body: PredictCustomRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> PredictResponse:
    """Predicción H/D/A usando un modelo custom del usuario autenticado.

    Requiere JWT. Devuelve 404 si el model_id no pertenece al usuario.
    """
    from src.db.auth_models import CustomModel
    user: "User" = current_user  # type: ignore[assignment]

    modelo = session.get(CustomModel, body.model_id)
    if modelo is None or modelo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Modelo no encontrado")

    model_features: list[str] = modelo.features
    requires_market = "prob_diff_market" in model_features

    features, _cold_start, h2h_cold_start, split = _resolve_features(
        session,
        body.home_team_id,
        body.away_team_id,
        requires_market=requires_market,
        psch=body.psch,
        pscd=body.pscd,
        psca=body.psca,
    )

    artifact = Path(modelo.artifact_path)
    if not artifact.exists():
        raise HTTPException(status_code=503, detail="Artefacto del modelo no disponible")

    pipeline = joblib.load(artifact)
    X = pd.DataFrame([features])[model_features]
    proba = pipeline.predict_proba(X)[0]
    probabilities = normalize_probabilities(pipeline.classes_, proba)
    importance = compute_feature_importance(pipeline, model_features)

    return PredictResponse(
        prob_h=probabilities["prob_h"],
        prob_d=probabilities["prob_d"],
        prob_a=probabilities["prob_a"],
        feature_importance=importance,
        feature_values={k: round(v, 4) for k, v in features.items() if k in model_features},
        feature_values_split=split,
        h2h_cold_start=h2h_cold_start,
    )
