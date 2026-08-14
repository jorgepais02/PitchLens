/**
 * Formato y etiquetas de presentación.
 *
 * Estaban en `components/shared.tsx`, pero un módulo que exporta componentes y
 * valores a la vez rompe la recarga en caliente (ver `context/prediction.ts`).
 * Además aquí encajan mejor: no pintan nada, solo traducen datos a texto.
 */

/** Fecha larga en español: "Dom, 7 may 2023". */
export function fmtDate(iso: string): string {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace(/\.$/, '')
  const rest = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '')
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${rest}`
}

/** Nombre legible de cada feature del modelo, para la interfaz. */
export const FEATURE_LABELS: Record<string, string> = {
  elo_diff_pre:                  'ELO histórico',
  points_diff_global:            'Puntos en temporada',
  points_diff_venue:             'Puntos por localía',
  goal_diff_last5_global:        'Goles',
  goal_diff_last5_venue:         'Goles por localía',
  sot_diff_last5_global:         'Tiros a puerta',
  xg_diff_last5_global:          'xG',
  xg_conceded_diff_last5_global: 'xG encajado',
  rest_days_diff:                'Días de descanso',
  prob_diff_market:              'Probabilidad de mercado',
  h2h_goal_diff_last5:           'Saldo de goles',
  h2h_result_diff_last5:         'Balance de victorias',
}
