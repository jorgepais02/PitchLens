/**
 * Piezas visuales compartidas por las páginas nuevas (/explore, /studio).
 * Replican el lenguaje de PredictionHero / ContextSection sin modificarlos.
 */
import { useState } from 'react'

// Paleta de gráficos partido (idéntica a PredictionHero / WhySection / ContextSection)
export const HOME_C = '#4D93F8'
export const AWAY_C = '#F35A5A'
export const SEP    = 'rgba(255,255,255,0.11)'

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 animate-spin"
      style={{ width: size, height: size, borderColor: '#2a2a2a #2a2a2a #2a2a2a #6366f1', flexShrink: 0 }}
      aria-hidden="true"
    />
  )
}

export function Crest({ url, name, size = 22 }: { url: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()
  if (url && !failed) {
    return (
      <img src={url} alt={name} onError={() => setFailed(true)}
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, flexShrink: 0,
      background: 'rgba(255,255,255,0.08)', borderRadius: 4,
      fontSize: size * 0.32, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
      fontFamily: 'var(--font-sans)',
    }}>{initials}</span>
  )
}

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace(/\.$/, '')
  const rest = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '')
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${rest}`
}

// Etiquetas legibles de las 12 features del modelo (coherentes con WhySection)
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
