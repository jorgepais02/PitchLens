const BASE = 'http://localhost:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: optHeaders, ...restOptions } = options ?? {}
  const res = await fetch(`${BASE}${path}`, {
    ...restOptions,
    headers: { 'Content-Type': 'application/json', ...optHeaders },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(body.detail)
      ? body.detail.map((d: { msg: string }) => d.msg).join(', ')
      : body.detail ?? 'Error desconocido'
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export interface League {
  id: number
  code: string
  name: string
  display_name: string | null
}

export interface Team {
  id: number
  name: string
  display_name: string | null
  league_id: number
  crest_url: string | null
}

export interface PretrainedModel {
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
  description: string
  algorithm: string
  features: string[]
  val_accuracy: number | null
  val_log_loss: number | null
  test_accuracy: number | null
  test_log_loss: number | null
  feature_importance: FeatureImportance[]
  created_at: string
}

export interface ModelsResponse {
  pretrained: PretrainedModel[]
  custom: CustomModel[]
}

export interface PredictRequest {
  home_team_id: number
  away_team_id: number
  model: 'baseline' | 'extended' | 'market'
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

export interface FeatureImportance {
  feature: string
  importance: number
}

export interface PredictResponse {
  prob_h: number
  prob_d: number
  prob_a: number
  feature_importance: FeatureImportance[]
  feature_values: Record<string, number>
  feature_values_split: Record<string, { home: number; away: number }> | null
  cold_start_warning: boolean
  h2h_cold_start: boolean
}

export interface H2HMatch {
  date: string
  home_team_id: number
  away_team_id: number
  home_team_name: string
  away_team_name: string
  fthg: number
  ftag: number
  ftr: string
}

export interface TeamBriefMatch {
  slug: string
  date: string
  opponent_id: number
  opponent_name: string
  opponent_crest_url: string | null
  venue: string
  goals_for: number
  goals_against: number
  result: string
}

export interface TeamStats {
  team_id: number
  last5: TeamBriefMatch[]
}

export interface Season {
  id: number
  end_year: number
  label: string
  league_id: number
}

export interface MatchListItem {
  id: number
  slug: string
  date: string
  league_id: number
  season_id: number
  home_team_id: number
  away_team_id: number
  fthg: number
  ftag: number
  ftr: string
  round_number: number | null
}

export interface MatchDetail extends MatchListItem {
  hthg: number
  htag: number
  htr: string
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
}

export interface StandingRow {
  team_id: number
  team_name: string
  crest_url: string | null
  played: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  goal_diff: number
  points: number
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export type Algorithm = 'lr' | 'dt' | 'rf' | 'xgb'

export interface TrainRequest {
  features: string[]
  algorithm: Algorithm
  name: string
  description?: string
}

export interface TrainJobAccepted {
  job_id: string
  status: string
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

export interface TrainJobStatus {
  job_id: string
  status: 'pending' | 'running' | 'done' | 'error'
  result: TrainResult | null
  error: string | null
}

export interface MatchFilters {
  league_code: string
  season: number
  team_id?: number | null
  round_number?: number | null
  limit?: number
  offset?: number
}

export const api = {
  leagues: (): Promise<League[]> => request('/leagues'),
  seasons: (league_code: string): Promise<Season[]> =>
    request(`/seasons?league_code=${league_code}`),
  teams: (league_code: string): Promise<Team[]> =>
    request(`/teams?league_code=${league_code}`),
  allTeams: (): Promise<Team[]> => request('/teams'),
  models: (token?: string): Promise<ModelsResponse> =>
    request('/models', token ? { headers: bearer(token) } : undefined),
  predict: (body: PredictRequest): Promise<PredictResponse> =>
    request('/predict', { method: 'POST', body: JSON.stringify(body) }),
  predictCustom: (body: PredictCustomRequest, token: string): Promise<PredictResponse> =>
    request('/predict/custom', { method: 'POST', body: JSON.stringify(body), headers: bearer(token) }),
  h2h: (homeId: number, awayId: number, limit = 10): Promise<H2HMatch[]> =>
    request(`/matches/h2h?home_team_id=${homeId}&away_team_id=${awayId}&limit=${limit}`),
  teamStats: (teamId: number): Promise<TeamStats> =>
    request(`/teams/${teamId}/stats`),
  matches: ({ league_code, season, team_id, round_number, limit = 50, offset = 0 }: MatchFilters): Promise<MatchListItem[]> => {
    const params = new URLSearchParams({
      league_code,
      season: String(season),
      limit: String(limit),
      offset: String(offset),
    })
    if (team_id != null) params.set('team_id', String(team_id))
    if (round_number != null) params.set('round_number', String(round_number))
    return request(`/matches?${params}`)
  },
  matchDetail: (slug: string): Promise<MatchDetail> =>
    request(`/matches/${slug}`),
  standings: (league_code: string, season: number): Promise<StandingRow[]> =>
    request(`/standings?league_code=${league_code}&season=${season}`),
  register: (email: string, password: string): Promise<TokenResponse> =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string): Promise<TokenResponse> =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  train: (body: TrainRequest, token: string): Promise<TrainJobAccepted> =>
    request('/train', { method: 'POST', body: JSON.stringify(body), headers: bearer(token) }),
  trainJob: (jobId: string, token: string): Promise<TrainJobStatus> =>
    request(`/train/jobs/${jobId}`, { headers: bearer(token) }),
  deleteCustomModel: (id: number, token: string): Promise<void> =>
    request(`/models/custom/${id}`, { method: 'DELETE', headers: bearer(token) }),
  deleteAccount: (token: string): Promise<void> =>
    request('/auth/me', { method: 'DELETE', headers: bearer(token) }),
}
