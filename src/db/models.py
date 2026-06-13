"""Modelos SQLModel — star schema de 5 tablas.

Este módulo es inmutable tras Fase 6.
"""

from datetime import datetime
from typing import Optional

from sqlmodel import CheckConstraint, Field, Relationship, SQLModel, UniqueConstraint


class League(SQLModel, table=True):
    """Liga (3 filas: premier, laliga, bundesliga)."""

    __tablename__ = "leagues"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(max_length=20, unique=True, index=True)
    name: str = Field(max_length=60)

    seasons: list["Season"] = Relationship(back_populates="league")
    teams: list["Team"] = Relationship(back_populates="league")
    matches: list["Match"] = Relationship(back_populates="league")


class Season(SQLModel, table=True):
    """Temporada por liga (30 filas: 3 ligas × 10 temporadas)."""

    __tablename__ = "seasons"
    __table_args__ = (UniqueConstraint("league_id", "end_year"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    end_year: int = Field(index=True)
    label: str  # e.g. '2014/15'
    league_id: int = Field(foreign_key="leagues.id", index=True)

    league: Optional[League] = Relationship(back_populates="seasons")
    matches: list["Match"] = Relationship(back_populates="season")


class Team(SQLModel, table=True):
    """Equipo (93 filas, uno por liga)."""

    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("league_id", "name"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=80, index=True)
    league_id: int = Field(foreign_key="leagues.id", index=True)
    crest_url: Optional[str] = Field(default=None, max_length=200)
    display_name: Optional[str] = Field(default=None, max_length=120)

    league: Optional[League] = Relationship(back_populates="teams")
    home_matches: list["Match"] = Relationship(
        back_populates="home_team",
        sa_relationship_kwargs={"foreign_keys": "[Match.home_team_id]"},
    )
    away_matches: list["Match"] = Relationship(
        back_populates="away_team",
        sa_relationship_kwargs={"foreign_keys": "[Match.away_team_id]"},
    )


class Match(SQLModel, table=True):
    """Partido — tabla de hechos (10.660 filas)."""

    __tablename__ = "matches"
    __table_args__ = (
        CheckConstraint("ftr IN ('H', 'D', 'A')", name="ck_ftr"),
        CheckConstraint("htr IN ('H', 'D', 'A')", name="ck_htr"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(max_length=120, unique=True, index=True)
    date: datetime = Field(index=True)

    league_id: int = Field(foreign_key="leagues.id", index=True)
    season_id: int = Field(foreign_key="seasons.id", index=True)
    home_team_id: int = Field(foreign_key="teams.id", index=True)
    away_team_id: int = Field(foreign_key="teams.id", index=True)

    # Resultado final
    fthg: int
    ftag: int
    ftr: str = Field(max_length=1)
    hthg: int
    htag: int
    htr: str = Field(max_length=1)

    # Stats
    home_shots: int
    away_shots: int
    home_shots_on_target: int
    away_shots_on_target: int
    home_fouls: int
    away_fouls: int
    home_corners: int
    away_corners: int
    home_yellows: int
    away_yellows: int
    home_reds: int
    away_reds: int

    # Cuotas Bet365
    b365h: float
    b365d: float
    b365a: float

    # Cuotas Pinnacle apertura
    psh: float
    psd: float
    psa: float

    # Cuotas Pinnacle cierre (usadas en prob_diff_market)
    psch: float
    pscd: float
    psca: float

    # Expected Goals
    home_xg: float
    away_xg: float

    # Jornada (enriquecida desde football-data.org vía enrich_rounds.py)
    round_number: Optional[int] = Field(default=None)

    league: Optional[League] = Relationship(back_populates="matches")
    season: Optional[Season] = Relationship(back_populates="matches")
    home_team: Optional[Team] = Relationship(
        back_populates="home_matches",
        sa_relationship_kwargs={
            "primaryjoin": "Match.home_team_id == Team.id",
            "foreign_keys": "[Match.home_team_id]",
        },
    )
    away_team: Optional[Team] = Relationship(
        back_populates="away_matches",
        sa_relationship_kwargs={
            "primaryjoin": "Match.away_team_id == Team.id",
            "foreign_keys": "[Match.away_team_id]",
        },
    )
    features: Optional["MatchFeatures"] = Relationship(back_populates="match")


class MatchFeatures(SQLModel, table=True):
    """Features derivadas por partido (9.792 filas, 1-a-1 parcial con matches)."""

    __tablename__ = "match_features"

    id: Optional[int] = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="matches.id", unique=True, index=True)

    elo_diff_pre: float
    points_diff_global: float
    points_diff_venue: float
    goal_diff_last5_global: float
    xg_diff_last5_global: float
    xg_conceded_diff_last5_global: float
    sot_diff_last5_global: float
    goal_diff_last5_venue: float
    rest_days_diff: float
    prob_diff_market: float
    h2h_goal_diff_last5: float
    h2h_result_diff_last5: float

    match: Optional[Match] = Relationship(back_populates="features")
