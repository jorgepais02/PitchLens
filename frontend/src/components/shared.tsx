/**
 * Piezas visuales compartidas por las páginas nuevas (/explore, /studio).
 * Replican el lenguaje de PredictionHero / ContextSection sin modificarlos.
 */
import { useState } from 'react'

// Paleta de gráficos partido (idéntica a PredictionHero / WhySection / ContextSection)
export const HOME_C = '#4D93F8'
export const AWAY_C = '#F35A5A'
export const DRAW_C = 'rgba(255,255,255,0.32)'
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

const FTR_BADGE: Record<string, { letter: string; color: string; bg: string }> = {
  H: { letter: '1', color: HOME_C, bg: 'rgba(77,147,248,0.15)' },
  D: { letter: 'X', color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.07)' },
  A: { letter: '2', color: AWAY_C, bg: 'rgba(243,90,90,0.15)' },
}

export function ResultBadge({ ftr, size = 24 }: { ftr: string; size?: number }) {
  const b = FTR_BADGE[ftr] ?? FTR_BADGE.D
  return (
    <span
      aria-label={`Resultado ${b.letter}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: 6, flexShrink: 0,
        background: b.bg, color: b.color,
        fontSize: size * 0.5, fontWeight: 600,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {b.letter}
    </span>
  )
}

// ─── Barra espectro — mismo componente visual que la de PredictionHero ───────
export interface SpectrumSegment {
  flex: number
  color: string
  glow?: string
}

export interface SpectrumLabel {
  text: string
  value?: string
  color: string
}

export function SpectrumBar({ segments, labels, height = 12 }: {
  segments: SpectrumSegment[]
  labels?: SpectrumLabel[]
  height?: number
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 3, height }}>
        {segments.map((s, i) => (
          <div key={i} style={{
            flex: Math.max(s.flex, 0.001), borderRadius: 99,
            background: s.color,
            boxShadow: s.glow ? `0 0 8px 0px ${s.glow}` : undefined,
          }} />
        ))}
      </div>
      {labels && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${labels.length}, 1fr)`, marginTop: 8 }}>
          {labels.map((l, i) => {
            const align = i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center'
            return (
              <span key={i} style={{ textAlign: align as React.CSSProperties['textAlign'] }}>
                <span style={{
                  fontSize: 12, fontWeight: 400, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: l.color, fontFamily: 'var(--font-sans)',
                }}>
                  {l.text}
                </span>
                {l.value !== undefined && (
                  <span style={{
                    marginLeft: 8, fontSize: 13, fontWeight: 600,
                    color: l.color, fontFamily: 'var(--font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {l.value}
                  </span>
                )}
              </span>
            )
          })}
        </div>
      )}
    </div>
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
  goal_diff_last5_global:        'Forma reciente',
  goal_diff_last5_venue:         'Forma por localía',
  sot_diff_last5_global:         'Tiros a puerta (últ. 5)',
  xg_diff_last5_global:          'Ocasiones creadas',
  xg_conceded_diff_last5_global: 'xG encajado (últ. 5)',
  rest_days_diff:                'Días de descanso',
  prob_diff_market:              'Probabilidad de mercado',
  h2h_goal_diff_last5:           'Saldo goles H2H',
  h2h_result_diff_last5:         'Historial directo (últ. 5)',
}
