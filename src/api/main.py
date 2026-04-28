"""Aplicación FastAPI — punto de entrada principal."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers import health, leagues, matches, seasons, teams
from src.core.config import settings
from src.db.database import create_db_and_tables


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Crea las tablas al arrancar si no existen."""
    create_db_and_tables()
    yield


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
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(leagues.router)
    app.include_router(seasons.router)
    app.include_router(teams.router)
    app.include_router(matches.router)

    return app


app = create_app()
