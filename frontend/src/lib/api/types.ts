/**
 * Tipos del contrato de API (API_SPEC.md §6 + DESIGN_PROMPT.md §8).
 * snake_case en los shapes porque reflejan EXACTAMENTE el JSON del backend FastAPI.
 */

// ── Catálogo ────────────────────────────────────────────────────────────
export type LeagueCode = 'premier' | 'laliga' | 'bundesliga'

export interface League {
  id: number
  code: LeagueCode
  name: string
}

export interface Season {
  id: number
  end_year: number
  label: string
  league_id: number
}

export interface Team {
  id: number
  name: string
  league_id: number
}

export interface TeamDetail {
  id: number
  name: string
  league: League
}

// ── Partidos ────────────────────────────────────────────────────────────
export type Result = 'H' | 'D' | 'A'
export type MatchResult = 'W' | 'D' | 'L'
export type Venue = 'home' | 'away'

export interface MatchList {
  id: number
  slug: string
  date: string
  league_id: number
  season_id: number
  home_team_id: number
  away_team_id: number
  fthg: number
  ftag: number
  ftr: Result
}

export interface MatchFeatures {
  elo_diff_pre: number
  points_diff_global: number
  points_diff_venue: number
  goal_diff_last5_global: number
  xg_diff_last5_global: number
  xg_conceded_diff_last5_global: number
  sot_diff_last5_global: number
  goal_diff_last5_venue: number
  rest_days_diff: number
  prob_diff_market: number
  h2h_goal_diff_last5: number
  h2h_result_diff_last5: number
}

export interface MatchDetail extends MatchList {
  hthg: number
  htag: number
  htr: Result
  home_shots: number
  away_shots: number
  home_shots_on_target: number
  away_shots_on_target: number
  home_fouls: number
  away_fouls: number
  home_corners: number
  away_corners: number
  home_yellows: number
  away_yellows: number
  home_reds: number
  away_reds: number
  b365h: number
  b365d: number
  b365a: number
  psh: number
  psd: number
  psa: number
  psch: number
  pscd: number
  psca: number
  home_xg: number
  away_xg: number
  features: MatchFeatures | null // null en cold start
}

// ── Equipo / stats ──────────────────────────────────────────────────────
export interface MatchBrief {
  slug: string
  date: string
  opponent_id: number
  venue: Venue
  goals_for: number
  goals_against: number
  result: MatchResult
}

export interface TeamStats {
  team_id: number
  matches_played: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  xg_for: number
  xg_against: number
  matches_with_features_pct: number // 0..100
  last5: MatchBrief[]
}

// ── Modelos ─────────────────────────────────────────────────────────────
export type Algorithm = 'lr' | 'dt' | 'rf' | 'xgb'
export type PretrainedModelName = 'baseline' | 'extended' | 'market'

export interface ModelInfo {
  name: string
  features: string[]
  n_features: number
  val_accuracy: number | null
  test_accuracy: number | null
  test_log_loss: number | null
}

export interface CustomModel {
  id: number
  name: string
  algorithm: Algorithm
  features: string[]
  val_accuracy: number | null
  test_accuracy: number | null
  test_log_loss: number | null
  created_at: string
}

export interface ModelsResponse {
  pretrained: ModelInfo[]
  custom: CustomModel[]
}

export interface FeatureInfo {
  name: string
  description: string
  used_in_models: string[]
}

// ── Predicción ──────────────────────────────────────────────────────────
export interface FeatureImportance {
  feature: string
  importance: number // 0..1, desc
}

export interface PredictResponse {
  prob_h: number
  prob_d: number
  prob_a: number
  feature_importance: FeatureImportance[]
  feature_values: Record<string, number>
  cold_start_warning: boolean
}

export interface PredictRequest {
  home_team_id: number
  away_team_id: number
  model: PretrainedModelName
  psch?: number
  pscd?: number
  psca?: number
}

export interface PredictCustomRequest {
  home_team_id: number
  away_team_id: number
  model_id: number
  psch?: number
  pscd?: number
  psca?: number
}

// ── Entrenamiento ───────────────────────────────────────────────────────
export interface TrainRequest {
  features: string[]
  algorithm: Algorithm
  name?: string
}

export interface TrainResult {
  model_id: number
  name: string
  algorithm: string
  features: string[]
  val_accuracy: number
  val_log_loss: number
  test_accuracy: number
  test_log_loss: number
  feature_importance: FeatureImportance[]
}

export type TrainJobState = 'pending' | 'running' | 'done' | 'error'

export interface TrainJobAccepted {
  job_id: string
  status: TrainJobState
}

export interface TrainJobStatus {
  job_id: string
  status: TrainJobState
  result: TrainResult | null
  error: string | null
}

// ── Auth ────────────────────────────────────────────────────────────────
export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
}

export interface Credentials {
  email: string
  password: string
}

// ── Health ──────────────────────────────────────────────────────────────
export interface HealthResponse {
  status: string
  db: string
}
