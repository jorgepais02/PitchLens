"""DTOs de respuesta de la API. Separados de los modelos ORM."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LeagueRead(BaseModel):
    """Respuesta de una liga."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str


class SeasonRead(BaseModel):
    """Respuesta de una temporada."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    end_year: int
    label: str
    league_id: int


class TeamRead(BaseModel):
    """Respuesta de un equipo (listado)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    league_id: int


class TeamDetailRead(BaseModel):
    """Respuesta de un equipo con liga embebida."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    league: LeagueRead


class MatchFeaturesRead(BaseModel):
    """Features derivadas de un partido."""

    model_config = ConfigDict(from_attributes=True)

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


class MatchListRead(BaseModel):
    """Respuesta de un partido en listado (sin features ni stats completas)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    date: datetime
    league_id: int
    season_id: int
    home_team_id: int
    away_team_id: int
    fthg: int
    ftag: int
    ftr: str


class MatchDetailRead(BaseModel):
    """Respuesta de un partido completo con stats, cuotas, xG y features."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    date: datetime
    league_id: int
    season_id: int
    home_team_id: int
    away_team_id: int
    # Resultado
    fthg: int
    ftag: int
    ftr: str
    hthg: int
    htag: int
    htr: str
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
    # Cuotas Pinnacle cierre
    psch: float
    pscd: float
    psca: float
    # xG
    home_xg: float
    away_xg: float
    # Features opcionales (null en cold start)
    features: MatchFeaturesRead | None = None


class MatchBriefRead(BaseModel):
    """Resumen de un partido para el historial reciente de un equipo."""

    model_config = ConfigDict(from_attributes=True)

    slug: str
    date: datetime
    opponent_id: int
    venue: str
    goals_for: int
    goals_against: int
    result: str


class TeamStatsRead(BaseModel):
    """Estadísticas agregadas de un equipo, opcionalmente por temporada."""

    team_id: int
    matches_played: int
    wins: int
    draws: int
    losses: int
    goals_for: int
    goals_against: int
    xg_for: float = Field(ge=0)
    xg_against: float = Field(ge=0)
    matches_with_features_pct: float = Field(ge=0, le=100)
    last5: list[MatchBriefRead]
