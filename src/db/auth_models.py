"""Tablas de usuarios y modelos custom — Fase 8.

Separadas de models.py para no violar el contrato de inmutabilidad
del star schema (§9.2 del PLAN).
"""

from datetime import datetime, timezone

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(SQLModel, table=True):
    """Usuario registrado."""

    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(max_length=254, unique=True, index=True)
    password_hash: str
    created_at: datetime = Field(default_factory=_now_utc)


class CustomModel(SQLModel, table=True):
    """Modelo ML entrenado por un usuario."""

    __tablename__ = "custom_models"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    name: str = Field(max_length=100)
    description: str = Field(default="", max_length=280)
    algorithm: str = Field(max_length=10)
    features: list = Field(default_factory=list, sa_column=Column(JSON))
    metrics: dict = Field(default_factory=dict, sa_column=Column(JSON))
    artifact_path: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=_now_utc)
