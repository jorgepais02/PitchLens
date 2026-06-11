"""Aplicación FastAPI — punto de entrada principal."""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers import auth, health, leagues, matches, models, predict, seasons, teams, train
from src.core.config import settings
from src.db.database import create_db_and_tables

log = logging.getLogger("api")


def _warmup_predictor() -> None:
    """Pre-carga sklearn y los 3 modelos en caché.

    Resiliente a artefactos ausentes: los .pkl están en .gitignore, así que un
    clon limpio no los tiene. En ese caso se loguea y se degrada a carga lazy
    (cada modelo se carga en su primera predicción) en lugar de impedir el
    arranque de la API.
    """
    from src.ml._config import MODELS_CONFIG  # noqa: PLC0415
    from src.ml.predictor import _load  # noqa: PLC0415
    for name in MODELS_CONFIG:
        try:
            _load(name)
        except FileNotFoundError:
            log.warning(
                "Modelo '%s' no encontrado en warmup — se cargará de forma lazy. "
                "Ejecuta 'python -m src.ml.train_models' para generar los artefactos.",
                name,
            )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Crea las tablas (star schema + auth) y pre-carga los modelos."""
    create_db_and_tables()
    _create_auth_tables()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _warmup_predictor)
    yield


def _create_auth_tables() -> None:
    """Crea las tablas de usuarios y modelos custom si no existen."""
    from src.db.auth_models import CustomModel, User  # noqa: F401 — importar para registrar metadata
    from src.db.database import engine
    from sqlmodel import SQLModel
    SQLModel.metadata.create_all(engine)


def create_app() -> FastAPI:
    """Construye y configura la aplicación FastAPI."""
    app = FastAPI(
        title="Football Analytics API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(leagues.router)
    app.include_router(seasons.router)
    app.include_router(teams.router)
    app.include_router(matches.router)
    app.include_router(models.router)
    app.include_router(predict.router)
    app.include_router(auth.router)
    app.include_router(train.router)

    return app


app = create_app()
