"""DTOs de respuesta de la API. Separados de los modelos ORM."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

_LEAGUE_DISPLAY: dict[str, str] = {
    "premier":    "Premier League",
    "laliga":     "La Liga",
    "bundesliga": "Bundesliga",
}


class LeagueRead(BaseModel):
    """Respuesta de una liga."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    display_name: str | None = None

    @model_validator(mode="after")
    def _set_display_name(self) -> "LeagueRead":
        if self.display_name is None:
            self.display_name = _LEAGUE_DISPLAY.get(self.code, self.name)
        return self


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
    crest_url: str | None = None
    display_name: str | None = None


class TeamDetailRead(BaseModel):
    """Respuesta de un equipo con liga embebida."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    league: LeagueRead
    crest_url: str | None = None
    display_name: str | None = None


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
    round_number: int | None = None


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
    fthg: int
    ftag: int
    ftr: str
    hthg: int
    htag: int
    htr: str
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
    b365h: float
    b365d: float
    b365a: float
    psh: float
    psd: float
    psa: float
    psch: float
    pscd: float
    psca: float
    home_xg: float
    away_xg: float
    features: MatchFeaturesRead | None = None


class MatchBriefRead(BaseModel):
    """Resumen de un partido para el historial reciente de un equipo."""

    slug: str
    date: datetime
    opponent_id: int
    opponent_name: str
    opponent_crest_url: str | None
    venue: str
    goals_for: int
    goals_against: int
    result: str


class H2HMatchRead(BaseModel):
    """Un enfrentamiento directo entre dos equipos."""

    date: datetime
    home_team_id: int
    away_team_id: int
    home_team_name: str
    away_team_name: str
    fthg: int
    ftag: int
    ftr: str


class PredictResponse(BaseModel):
    """Respuesta de una predicción."""

    prob_h: float
    prob_d: float
    prob_a: float
    feature_importance: list[dict]
    feature_values: dict[str, float]
    feature_values_split: dict[str, dict[str, float]] | None = None
    h2h_cold_start: bool = False


class ModelInfo(BaseModel):
    """Información de un modelo preentrenado."""

    name: str
    features: list[str]
    n_features: int
    val_accuracy: float | None = None
    test_accuracy: float | None = None
    test_log_loss: float | None = None


class FeatureInfo(BaseModel):
    """Información de una feature disponible para modelado."""

    name: str
    description: str
    used_in_models: list[str]


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


class StandingRow(BaseModel):
    """Una fila de la clasificación de una liga y temporada."""

    team_id: int
    team_name: str
    crest_url: str | None = None
    played: int
    wins: int
    draws: int
    losses: int
    goals_for: int
    goals_against: int
    goal_diff: int
    points: int


class CustomModelRead(BaseModel):
    """Información de un modelo custom de usuario."""

    id: int
    name: str
    description: str = ""
    algorithm: str
    features: list[str]
    val_accuracy: float | None = None
    val_log_loss: float | None = None
    test_accuracy: float | None = None
    test_log_loss: float | None = None
    feature_importance: list[dict] = []
    created_at: datetime


class ModelsResponse(BaseModel):
    """Respuesta de GET /models: preentrenados + custom del usuario (si autenticado)."""

    pretrained: list[ModelInfo]
    custom: list[CustomModelRead] = []
