/**
 * Diccionarios y constantes de presentación (DESIGN_PROMPT.md §8.1–8.2, API_SPEC.md §7).
 * Etiquetas de UI en español; claves técnicas tal cual las devuelve el backend.
 */
import type {
  Algorithm,
  LeagueCode,
  MatchResult,
  PretrainedModelName,
  Result,
} from '@/lib/api/types'

export const LEAGUE_LABEL: Record<LeagueCode, string> = {
  premier: 'Premier League',
  laliga: 'LaLiga',
  bundesliga: 'Bundesliga',
}

export const ALGORITHM_LABEL: Record<Algorithm, string> = {
  lr: 'Logistic Regression',
  dt: 'Decision Tree',
  rf: 'Random Forest',
  xgb: 'XGBoost',
}

export const ALGORITHM_SHORT: Record<Algorithm, string> = {
  lr: 'LR',
  dt: 'DT',
  rf: 'RF',
  xgb: 'XGB',
}

export const MODEL_LABEL: Record<PretrainedModelName, string> = {
  baseline: 'Baseline',
  extended: 'Extended',
  market: 'Market',
}

export const MODEL_DESCRIPTION: Record<PretrainedModelName, string> = {
  baseline: 'Forma y fuerza histórica (ELO, puntos, H2H).',
  extended: 'Baseline + señales de juego reciente (goles, xG, tiros).',
  market: 'Combina juego reciente con la probabilidad implícita del mercado.',
}

/** Resultado de partido → etiqueta corta de UI. */
export const RESULT_SHORT: Record<Result, string> = {
  H: 'Local',
  D: 'Empate',
  A: 'Visitante',
}

/** Notación 1·X·2 (cabecera de barras / leyendas). */
export const RESULT_CODE: Record<Result, string> = {
  H: '1',
  D: 'X',
  A: '2',
}

/** Resultado desde la perspectiva de un equipo (last5). */
export const MATCH_RESULT_LABEL: Record<MatchResult, string> = {
  W: 'Victoria',
  D: 'Empate',
  L: 'Derrota',
}

/**
 * Color semántico por outcome → nombre del token (sin '#').
 * Se usa para componer clases utilitarias (`bg-home`, `text-away`...) y
 * para pasar `var(--color-*)` a Recharts. NUNCA hardcodear el hex en componentes.
 */
export const OUTCOME_TOKEN: Record<Result, 'home' | 'draw' | 'away'> = {
  H: 'home',
  D: 'draw',
  A: 'away',
}

export const MATCH_RESULT_TOKEN: Record<MatchResult, 'home' | 'draw' | 'away'> = {
  W: 'home',
  D: 'draw',
  L: 'away',
}

/** Diccionario de features → etiqueta legible (fallback local de /features/available). */
export const FEATURE_LABEL: Record<string, string> = {
  elo_diff_pre: 'Diferencia de ELO histórico (pre-partido)',
  points_diff_global: 'Diferencia de puntos en la temporada (global)',
  points_diff_venue: 'Diferencia de puntos en la temporada (por localía)',
  goal_diff_last5_global: 'Diferencia de goles, últimos 5 (global)',
  goal_diff_last5_venue: 'Diferencia de goles, últimos 5 (por localía)',
  sot_diff_last5_global: 'Diferencia de tiros a puerta, últimos 5',
  xg_diff_last5_global: 'Diferencia de xG generado, últimos 5',
  xg_conceded_diff_last5_global: 'Diferencia de xG concedido, últimos 5',
  rest_days_diff: 'Diferencia en días de descanso',
  prob_diff_market: 'Diferencia de probabilidad implícita (cuotas Pinnacle cierre)',
  h2h_goal_diff_last5: 'Diferencia de goles en últimos 5 enfrentamientos directos',
  h2h_result_diff_last5: 'Diferencia de victorias en últimos 5 enfrentamientos directos',
}

/** Devuelve la etiqueta legible de una feature, con fallback al nombre técnico. */
export function featureLabel(name: string): string {
  return FEATURE_LABEL[name] ?? name
}

/** Feature de mercado: si un modelo la incluye, se piden cuotas Pinnacle de cierre. */
export const MARKET_FEATURE = 'prob_diff_market'

/** Baseline de clase mayoritaria sobre core_features (referencia honesta en métricas). */
export const MAJORITY_BASELINE_ACCURACY = 0.456

/** Límite de modelos custom por usuario (backend MAX_CUSTOM_MODELS). */
export const MAX_CUSTOM_MODELS = 5

export const ALGORITHM_OPTIONS: Algorithm[] = ['lr', 'dt', 'rf', 'xgb']
export const PRETRAINED_ORDER: PretrainedModelName[] = ['baseline', 'extended', 'market']
