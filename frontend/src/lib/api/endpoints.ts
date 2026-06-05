/**
 * Funciones tipadas, una por endpoint del contrato (API_SPEC.md §6).
 * Nombres reales de query params: league_code, team_id, season (no league/team).
 */
import { qs, request } from '@/lib/api/client'
import type {
  Credentials,
  FeatureInfo,
  HealthResponse,
  League,
  MatchDetail,
  MatchList,
  ModelsResponse,
  PredictCustomRequest,
  PredictRequest,
  PredictResponse,
  Season,
  Team,
  TeamDetail,
  TeamStats,
  TokenResponse,
  TrainJobAccepted,
  TrainJobStatus,
  TrainRequest,
} from '@/lib/api/types'

// ── Health ──────────────────────────────────────────────────────────────
export function getHealth(signal?: AbortSignal) {
  return request<HealthResponse>('/health', { signal })
}

// ── Auth ────────────────────────────────────────────────────────────────
export function register(body: Credentials) {
  return request<TokenResponse>('/auth/register', { method: 'POST', body })
}

export function login(body: Credentials) {
  return request<TokenResponse>('/auth/login', { method: 'POST', body })
}

// ── Catálogo ────────────────────────────────────────────────────────────
export function getLeagues(signal?: AbortSignal) {
  return request<League[]>('/leagues', { signal })
}

export function getSeasons(leagueCode?: string, signal?: AbortSignal) {
  return request<Season[]>(`/seasons${qs({ league_code: leagueCode })}`, { signal })
}

export function getTeams(leagueCode?: string, signal?: AbortSignal) {
  return request<Team[]>(`/teams${qs({ league_code: leagueCode })}`, { signal })
}

export function getTeam(teamId: number, signal?: AbortSignal) {
  return request<TeamDetail>(`/teams/${teamId}`, { signal })
}

export function getTeamStats(teamId: number, season?: number, signal?: AbortSignal) {
  return request<TeamStats>(`/teams/${teamId}/stats${qs({ season })}`, { signal })
}

// ── Partidos ────────────────────────────────────────────────────────────
export interface MatchesQuery {
  league_code?: string
  season?: number
  team_id?: number
  limit?: number
  offset?: number
}

export function getMatches(params: MatchesQuery, signal?: AbortSignal) {
  return request<MatchList[]>(`/matches${qs({ ...params })}`, { signal })
}

export function getMatch(slug: string, signal?: AbortSignal) {
  return request<MatchDetail>(`/matches/${slug}`, { signal })
}

// ── Modelos y features ──────────────────────────────────────────────────
/** Auth opcional: con token añade los modelos custom del usuario. */
export function getModels(signal?: AbortSignal) {
  return request<ModelsResponse>('/models', { auth: true, signal })
}

export function getFeatures(signal?: AbortSignal) {
  return request<FeatureInfo[]>('/features/available', { signal })
}

// ── Predicción ──────────────────────────────────────────────────────────
export function predict(body: PredictRequest) {
  return request<PredictResponse>('/predict', { method: 'POST', body })
}

export function predictCustom(body: PredictCustomRequest) {
  return request<PredictResponse>('/predict/custom', { method: 'POST', body, auth: true })
}

// ── Entrenamiento ───────────────────────────────────────────────────────
export function startTraining(body: TrainRequest) {
  return request<TrainJobAccepted>('/train', { method: 'POST', body, auth: true })
}

export function getTrainJob(jobId: string, signal?: AbortSignal) {
  return request<TrainJobStatus>(`/train/jobs/${jobId}`, { auth: true, signal })
}
