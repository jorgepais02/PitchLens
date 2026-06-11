const BASE = 'http://localhost:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(body.detail)
      ? body.detail.map((d: { msg: string }) => d.msg).join(', ')
      : body.detail ?? 'Error desconocido'
    throw new Error(msg)
  }
  return res.json()
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
  algorithm: string
  features: string[]
  val_accuracy: number | null
  test_accuracy: number | null
  test_log_loss: number | null
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

export const api = {
  leagues: (): Promise<League[]> => request('/leagues'),
  teams: (league_code: string): Promise<Team[]> =>
    request(`/teams?league_code=${league_code}`),
  allTeams: (): Promise<Team[]> => request('/teams'),
  models: (token?: string): Promise<ModelsResponse> =>
    request('/models', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined),
  predict: (body: PredictRequest): Promise<PredictResponse> =>
    request('/predict', { method: 'POST', body: JSON.stringify(body) }),
  h2h: (homeId: number, awayId: number, limit = 10): Promise<H2HMatch[]> =>
    request(`/matches/h2h?home_team_id=${homeId}&away_team_id=${awayId}&limit=${limit}`),
  teamStats: (teamId: number): Promise<TeamStats> =>
    request(`/teams/${teamId}/stats`),
}
