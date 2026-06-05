"""Router de entrenamiento — POST /train (asíncrono) + GET /train/jobs/{job_id}.

El entrenamiento (RF/XGB con CalibratedClassifierCV + TimeSeriesSplit) puede
tardar 10-30s. Para no ocupar un worker toda la petición, /train delega en una
tarea en background y devuelve 202 + job_id; el frontend consulta el estado en
/train/jobs/{job_id} (encaja con la UX de /studio).

El registro de jobs es en memoria del proceso: suficiente para el TFG (un solo
worker), pero no sobrevive a reinicios ni se comparte entre workers.
"""

import logging
import os
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Generator, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from src.api.deps import CurrentUserDep
from src.core.config import settings
from src.db.auth_models import CustomModel
from src.db.database import engine
from src.features._constants import FEATURES
from src.ml._config import CUSTOM_MODELS_DIR

if TYPE_CHECKING:
    from src.db.auth_models import User

log = logging.getLogger("api.train")

router = APIRouter(tags=["train"])

_ALGORITHM_LABELS: dict[str, str] = {
    "lr": "Logistic Regression",
    "dt": "Decision Tree",
    "rf": "Random Forest",
    "xgb": "XGBoost",
}

# ── Registro de jobs en memoria ───────────────────────────────────────────────

_JOBS: dict[str, dict] = {}
_JOBS_LOCK = threading.Lock()


def _set_job(job_id: str, **fields) -> None:
    """Actualiza (merge) los campos de un job de forma thread-safe."""
    with _JOBS_LOCK:
        _JOBS.setdefault(job_id, {}).update(fields)


def _get_job(job_id: str) -> dict | None:
    """Devuelve una copia del job o None si no existe."""
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job is not None else None


@contextmanager
def _session_scope() -> Generator[Session, None, None]:
    """Sesión de BD propia para la tarea en background (seam testeable).

    La sesión de la petición se cierra al devolver el 202, así que el job necesita
    su propia sesión. Los tests sobreescriben esta función para inyectar SQLite.
    """
    with Session(engine) as session:
        yield session


# ── DTOs ───────────────────────────────────────────────────────────────────


class TrainRequest(BaseModel):
    """Cuerpo de la petición de entrenamiento."""

    features: list[str]
    algorithm: Literal["lr", "dt", "rf", "xgb"]
    name: str = ""

    @field_validator("features")
    @classmethod
    def _validate_features(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("Debes seleccionar al menos una feature")
        invalid = [f for f in v if f not in FEATURES]
        if invalid:
            raise ValueError(f"Features no reconocidas: {invalid}. Disponibles: {FEATURES}")
        return list(dict.fromkeys(v))  # elimina duplicados manteniendo orden


class TrainResult(BaseModel):
    """Resultado de un entrenamiento completado."""

    model_id: int
    name: str
    algorithm: str
    features: list[str]
    val_accuracy: float
    val_log_loss: float
    test_accuracy: float
    test_log_loss: float
    feature_importance: list[dict]


class TrainJobAccepted(BaseModel):
    """Respuesta 202 al aceptar un entrenamiento."""

    job_id: str
    status: str


class TrainJobStatus(BaseModel):
    """Estado de un job de entrenamiento."""

    job_id: str
    status: Literal["pending", "running", "done", "error"]
    result: TrainResult | None = None
    error: str | None = None


# ── Tarea en background ──────────────────────────────────────────────────────


def _run_training_job(
    job_id: str,
    user_id: int,
    features: list[str],
    algorithm: str,
    name: str,
) -> None:
    """Entrena, aplica el límite por usuario y persiste. Nunca lanza: registra el error."""
    _set_job(job_id, status="running")
    artifact_path = str(CUSTOM_MODELS_DIR / f"{user_id}_{uuid.uuid4().hex[:8]}.pkl")

    try:
        from src.ml.custom_trainer import train_custom  # noqa: PLC0415

        metrics = train_custom(
            features=features,
            algorithm=algorithm,
            artifact_path=artifact_path,
        )

        with _session_scope() as session:
            # Límite de modelos por usuario — borra el más antiguo si se supera.
            # Se hace tras escribir el artefacto y se confirma en la misma transacción;
            # si el commit falla, el artefacto recién escrito se limpia abajo.
            modelos_usuario = session.exec(
                select(CustomModel)
                .where(CustomModel.user_id == user_id)
                .order_by(CustomModel.created_at)
            ).all()

            if len(modelos_usuario) >= settings.MAX_CUSTOM_MODELS:
                mas_antiguo = modelos_usuario[0]
                _remove_artifact(mas_antiguo.artifact_path)
                session.delete(mas_antiguo)
                session.flush()

            modelo = CustomModel(
                user_id=user_id,
                name=name,
                algorithm=algorithm,
                features=features,
                metrics={"val": metrics["val"], "test": metrics["test"]},
                artifact_path=artifact_path,
            )
            session.add(modelo)
            session.commit()
            session.refresh(modelo)

            result = TrainResult(
                model_id=modelo.id,
                name=modelo.name,
                algorithm=modelo.algorithm,
                features=modelo.features,
                val_accuracy=metrics["val"]["accuracy"],
                val_log_loss=metrics["val"]["log_loss"],
                test_accuracy=metrics["test"]["accuracy"],
                test_log_loss=metrics["test"]["log_loss"],
                feature_importance=metrics["feature_importance"],
            )

        _set_job(job_id, status="done", result=result.model_dump())

    except Exception:
        # El artefacto pudo escribirse antes del fallo en BD — limpiarlo evita huérfanos
        _remove_artifact(artifact_path)
        log.exception("Fallo entrenando job %s (user %s)", job_id, user_id)
        _set_job(job_id, status="error", error="Error entrenando el modelo")


def _remove_artifact(path: str) -> None:
    """Borra un artefacto del disco si existe, ignorando si ya no está."""
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/train", response_model=TrainJobAccepted, status_code=status.HTTP_202_ACCEPTED)
def post_train(
    body: TrainRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserDep,
) -> TrainJobAccepted:
    """Encola el entrenamiento de un modelo custom y devuelve 202 + job_id.

    Requiere JWT. El frontend consulta el progreso en GET /train/jobs/{job_id}.
    Límite de settings.MAX_CUSTOM_MODELS modelos activos por usuario: si se supera,
    se borra el más antiguo al persistir el nuevo.
    """
    user: "User" = current_user  # type: ignore[assignment]

    nombre = body.name.strip() or f"{_ALGORITHM_LABELS[body.algorithm]} ({len(body.features)} features)"
    job_id = uuid.uuid4().hex

    _set_job(
        job_id,
        status="pending",
        user_id=user.id,
        result=None,
        error=None,
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    background_tasks.add_task(
        _run_training_job,
        job_id=job_id,
        user_id=user.id,
        features=body.features,
        algorithm=body.algorithm,
        name=nombre,
    )

    return TrainJobAccepted(job_id=job_id, status="pending")


@router.get("/train/jobs/{job_id}", response_model=TrainJobStatus)
def get_train_job(job_id: str, current_user: CurrentUserDep) -> TrainJobStatus:
    """Devuelve el estado de un job de entrenamiento del usuario autenticado.

    Requiere JWT. Devuelve 404 si el job no existe o pertenece a otro usuario.
    """
    user: "User" = current_user  # type: ignore[assignment]

    job = _get_job(job_id)
    if job is None or job.get("user_id") != user.id:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    return TrainJobStatus(
        job_id=job_id,
        status=job["status"],
        result=job.get("result"),
        error=job.get("error"),
    )
