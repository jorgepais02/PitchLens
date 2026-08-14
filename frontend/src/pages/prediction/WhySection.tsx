import type { ActivePrediction } from '../../context/prediction'
import { useIsMobile } from '../../lib/useMediaQuery'

const HOME_C  = '#4D93F8'
const AWAY_C  = '#F35A5A'
const DRAW_C  = 'rgba(255,255,255,0.35)'
const TRACK_C = 'rgba(255,255,255,0.07)'

const DISPLAY_LABELS: Record<string, string> = {
  elo_diff_pre:             'ELO',
  goal_diff_last5_global:   'Forma reciente',
  xg_diff_last5_global:     'Ocasiones creadas',
  h2h_result_diff_last5:    'Historial directo (últ. 5)',
  h2h_goal_diff_last5:      'Saldo goles H2H',
  prob_diff_market:         'Probabilidad de mercado',
  goals_scored_last5:       'Goles marcados (últ. 5)',
  goals_conceded_last5:     'Goles encajados (últ. 5)',
  h2h_goals_scored_last5:   'Goles cara a cara (últ. 5)',
  h2h_goals_conceded_last5: 'Goles en contra directos (últ. 5)',
  xg_scored_last5:          'xG generado (últ. 5)',
  xg_conceded_last5:        'xG encajado (últ. 5)',
}

const CONCEDED_FEATURES = new Set(['goals_conceded_last5', 'h2h_goals_conceded_last5', 'xg_conceded_last5'])

const MODEL_DISPLAY_FEATURES: Record<string, string[]> = {
  baseline: ['elo_diff_pre', 'h2h_result_diff_last5', 'h2h_goals_scored_last5'],
  extended: ['elo_diff_pre', 'goals_scored_last5', 'xg_scored_last5', 'goals_conceded_last5', 'xg_conceded_last5', 'h2h_result_diff_last5'],
  market:   ['prob_diff_market', 'goals_scored_last5', 'xg_scored_last5', 'goals_conceded_last5', 'xg_conceded_last5', 'h2h_goals_scored_last5'],
  custom:   ['elo_diff_pre', 'goals_scored_last5', 'goals_conceded_last5', 'xg_scored_last5', 'xg_conceded_last5', 'h2h_result_diff_last5'],
}

function fmt(feature: string, value: number): string {
  const s = value > 0 ? '+' : ''
  switch (feature) {
    case 'elo_diff_pre':                  return String(Math.round(value))
    case 'goal_diff_last5_global':        return s + value.toFixed(1)
    case 'xg_diff_last5_global':          return s + value.toFixed(2)
    case 'prob_diff_market':              return Math.round(value * 100) + '%'
    case 'h2h_result_diff_last5':         return String(Math.round(value * 5))
    case 'h2h_goal_diff_last5':           return value.toFixed(1)
    case 'h2h_goals_scored_last5':
    case 'h2h_goals_conceded_last5':      return String(Math.round(value))
    case 'goals_scored_last5':
    case 'goals_conceded_last5':          return String(Math.round(value))
    case 'xg_scored_last5':
    case 'xg_conceded_last5':             return value.toFixed(2)
    default:                              return value.toFixed(2)
  }
}

interface ChartRow {
  feature:  string
  rawValue: number
  split:    { home: number; away: number }
}

function ButterflyRow({ row, isLast }: { row: ChartRow; isLast: boolean }) {
  const hv = row.split.home
  const av = row.split.away

  const homeWins = row.rawValue >  0.001
  const awayWins = row.rawValue < -0.001
  const tied     = !homeWins && !awayWins

  const ELO_FLOOR = 1200
  const adjH = row.feature === 'elo_diff_pre' ? hv - ELO_FLOOR : hv
  const adjA = row.feature === 'elo_diff_pre' ? av - ELO_FLOOR : av
  const posH = Math.max(0, adjH)
  const posA = Math.max(0, adjA)

  let homeSpacer: number, homeFillFlex: number
  let awaySpacer: number, awayFillFlex: number

  if (row.feature === 'h2h_result_diff_last5') {
    homeFillFlex = posH              // 0.8  → 80% de barra
    homeSpacer   = 1 - posH         // 0.2  → 20% gris (1 empate/derrota)
    awayFillFlex = posA              // 0.0  → 0%
    awaySpacer   = 1 - posA         // 1.0  → 100% gris
  } else {
    const total = posH + posA
    const scale  = total > 0 && total < 1 ? 1 / total : 1
    homeFillFlex = (total > 0 ? posH : 1) * scale
    awayFillFlex = (total > 0 ? posA : 1) * scale
    homeSpacer   = awayFillFlex
    awaySpacer   = homeFillFlex
  }

  const homeFill = HOME_C
  const awayFill = AWAY_C
  const homeValC = tied ? 'rgba(255,255,255,0.80)' : homeWins ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.28)'
  const awayValC = tied ? 'rgba(255,255,255,0.80)' : awayWins ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.28)'

  const trackBase: React.CSSProperties = {
    display: 'flex', flex: 1, height: 10,
    background: TRACK_C, borderRadius: 99, overflow: 'hidden',
  }

  return (
    <div style={{
      paddingTop: 18, paddingBottom: 18,
      borderBottom: isLast ? 'none' : '0.5px solid rgba(255,255,255,0.07)',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 'clamp(17px, 4.6vw, 22px)', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          fontFamily: 'var(--font-sans)', color: homeValC,
          minWidth: 44, flexShrink: 0,
        }}>
          {fmt(row.feature, hv)}
        </span>

        <span style={{
          fontSize: 'clamp(14px, 3.6vw, 18px)', fontWeight: 400, letterSpacing: '0.01em',
          color: 'rgba(255,255,255,0.92)',
          fontFamily: 'var(--font-sans)', textAlign: 'center',
          minWidth: 0,
        }}>
          {DISPLAY_LABELS[row.feature] ?? row.feature}
        </span>

        <span style={{
          fontSize: 'clamp(17px, 4.6vw, 22px)', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          fontFamily: 'var(--font-sans)', color: awayValC,
          minWidth: 44, flexShrink: 0, textAlign: 'right',
        }}>
          {fmt(row.feature, av)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 'clamp(12px, 4vw, 32px)', alignItems: 'center' }}>

        <div style={{ ...trackBase, opacity: homeWins || tied ? 1 : 0.35 }}>
          <div style={{ flex: homeSpacer }} />
          <div style={{ flex: homeFillFlex, background: homeFill }} />
        </div>

        <div style={{ ...trackBase, opacity: awayWins || tied ? 1 : 0.35 }}>
          <div style={{ flex: awayFillFlex, background: awayFill }} />
          <div style={{ flex: awaySpacer }} />
        </div>

      </div>
    </div>
  )
}

function ButterflyChart({ rows }: {
  rows: ChartRow[]
}) {
  return (
    <div>
      {rows.map((row, i) => (
        <ButterflyRow key={row.feature} row={row} isLast={i === rows.length - 1} />
      ))}
    </div>
  )
}

const MKT_BAR_H   = 40
const MKT_ROW_H   = 80
const MKT_DOT_R   = 9

function MarketDivergingChart({ diffs }: {
  diffs: { label: string; diffPp: number; outcome: 'H' | 'D' | 'A' }[]
}) {
  const isMobile = useIsMobile()
  // A 180px la columna de etiquetas se come media pantalla de móvil.
  const MKT_LABEL_W = isMobile ? 88 : 180
  const maxAbs = Math.max(...diffs.map(d => Math.abs(d.diffPp)), 3)
  const step     = maxAbs <= 9 ? 3 : maxAbs <= 20 ? 5 : 10
  const maxScale = Math.ceil(maxAbs / step) * step + step
  const ticks    = Array.from({ length: (2 * maxScale) / step + 1 }, (_, i) => -maxScale + i * step)

  const toX  = (pp: number) => 50 + (pp / maxScale) * 50
  const fade = (t: number)  => 1 - (Math.abs(t) / maxScale) * 0.55

  return (
    <div>
      <div style={{ display: 'flex', marginBottom: 8 }}>
        <div style={{ width: MKT_LABEL_W, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: 20 }}>
          {ticks.map(t => (
            <span key={t} style={{
              position: 'absolute', left: `${toX(t)}%`, transform: 'translateX(-50%)',
              fontSize: isMobile ? 11 : 14, color: `rgba(255,255,255,${(0.50 * fade(t)).toFixed(3)})`,
              fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
            }}>
              {t > 0 ? '+' : ''}{t}
            </span>
          ))}
        </div>
      </div>

      {diffs.map(({ label, diffPp, outcome }) => {
        const isNearZero   = Math.abs(diffPp) <= 0.5
        const isPos        = diffPp > 0
        const outcomeColor = outcome === 'H' ? HOME_C : outcome === 'A' ? AWAY_C : DRAW_C
        const fillColor    = outcome === 'H'
          ? 'rgba(77,147,248,0.18)'
          : outcome === 'A' ? 'rgba(243,90,90,0.18)' : 'rgba(255,255,255,0.08)'
        const rounded  = parseFloat(diffPp.toFixed(1))
        const tag      = `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}pp`
        const dotX     = isNearZero ? 50 : toX(diffPp)
        const barLeft  = isPos ? 50 : toX(diffPp)
        const barWidth = Math.abs(toX(diffPp) - 50)

        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', height: MKT_ROW_H }}>
            <span style={{
              width: MKT_LABEL_W, minWidth: MKT_LABEL_W, flexShrink: 0,
              fontSize: isMobile ? 14 : 18, fontWeight: 500, lineHeight: 1.25,
              color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--font-sans)',
              paddingRight: 8,
            }}>
              {label}
            </span>

            <div style={{ flex: 1, position: 'relative', height: MKT_ROW_H }}>
              {ticks.map(t => (
                <div key={t} style={{
                  position: 'absolute', left: `${toX(t)}%`, top: 0, bottom: 0, width: 1,
                  borderLeft: t === 0
                    ? `1px solid rgba(255,255,255,${(0.30 * fade(t)).toFixed(3)})`
                    : `1px dashed rgba(255,255,255,${(0.16 * fade(t)).toFixed(3)})`,
                }} />
              ))}

              {!isNearZero && (
                <div style={{
                  position: 'absolute', left: `${barLeft}%`, width: `${barWidth}%`,
                  top: '50%', transform: 'translateY(-50%)',
                  height: MKT_BAR_H, background: fillColor,
                  borderRadius: isPos ? '0 6px 6px 0' : '6px 0 0 6px',
                }} />
              )}

              <div style={{
                position: 'absolute', left: `${dotX}%`, top: '50%',
                transform: 'translate(-50%, -50%)',
                width: MKT_DOT_R, height: MKT_DOT_R, borderRadius: '50%',
                background: outcomeColor,
              }} />

              {(isPos || isNearZero) ? (
                <span style={{
                  position: 'absolute',
                  left: `calc(${isNearZero ? 50 : dotX}% + ${MKT_DOT_R / 2 + 8}px)`,
                  top: '50%', transform: 'translateY(-50%)',
                  fontSize: isMobile ? 13 : 16, fontWeight: 700, color: outcomeColor,
                  fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                }}>{tag}</span>
              ) : (
                <span style={{
                  position: 'absolute',
                  right: `calc(${100 - dotX}% + ${MKT_DOT_R / 2 + 8}px)`,
                  top: '50%', transform: 'translateY(-50%)',
                  fontSize: isMobile ? 13 : 16, fontWeight: 700, color: outcomeColor,
                  fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                }}>{tag}</span>
              )}
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', marginTop: 16 }}>
        <div style={{ width: MKT_LABEL_W, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: 18 }}>
          <span style={{
            position: 'absolute', left: `${toX(0)}%`, transform: 'translateX(-50%)',
            fontSize: 12, fontWeight: 400, letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-sans)',
          }}>Mercado</span>
        </div>
      </div>
    </div>
  )
}

export default function WhySection({ pred }: { pred: ActivePrediction }) {
  const { home, away, model, result } = pred

  const H2H_FEATURES = new Set(['h2h_goal_diff_last5', 'h2h_result_diff_last5', 'h2h_goals_scored_last5', 'h2h_goals_conceded_last5'])
  const rows: ChartRow[] = (MODEL_DISPLAY_FEATURES[model] ?? MODEL_DISPLAY_FEATURES.extended)
    .filter(f => result.feature_values[f] !== undefined || result.feature_values_split?.[f] !== undefined)
    .filter(f => !(H2H_FEATURES.has(f) && result.h2h_cold_start))
    .map(f => {
      const split = result.feature_values_split?.[f] ?? { home: 0, away: 0 }
      const isConceded = CONCEDED_FEATURES.has(f)
      const rawValue = result.feature_values[f] !== undefined
        ? result.feature_values[f]
        : isConceded
          ? split.away - split.home   // menos encajado = gana (positivo = local mejor)
          : split.home - split.away
      return { feature: f, rawValue, split }
    })

  const isMarket = model === 'market'
  const marketProbs = (() => {
    if (!isMarket || !pred.odds) return null
    const { psch, pscd, psca } = pred.odds
    const rH = 1 / psch, rD = 1 / pscd, rA = 1 / psca
    const ov = rH + rD + rA
    return { ph: rH / ov, pd: rD / ov, pa: rA / ov }
  })()

  return (
    <>
      <div style={{ marginBottom: 35 }}>
        <h2 style={{
          margin: 0, fontSize: 'clamp(1.6rem, 5.4vw, 2.125rem)', fontWeight: 700,
          letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
        }}>
          ¿Por qué esta predicción?
        </h2>
        <p style={{
          margin: '8px 0 0', fontSize: 18, fontWeight: 400,
          color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-sans)',
        }}>
          Comparación de las variables que han tenido mayor impacto en la predicción.
        </p>
      </div>

      <ButterflyChart rows={rows} />

      {isMarket && marketProbs && (
        <div style={{ marginTop: 64 }}>
          <div style={{ marginBottom: 35 }}>
            <h2 style={{
              margin: 0, fontSize: 'clamp(1.35rem, 4.4vw, 1.75rem)', fontWeight: 600,
              letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
            }}>
              Modelo vs Mercado
            </h2>
            <p style={{
              margin: '8px 0 0', fontSize: 18, fontWeight: 400,
              color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-sans)',
            }}>
              Diferencia entre la probabilidad del modelo y la implícita en las cuotas Pinnacle, en puntos porcentuales.
            </p>
          </div>
          <MarketDivergingChart diffs={[
            { label: home.display_name ?? home.name, diffPp: (result.prob_h - marketProbs.ph) * 100, outcome: 'H' },
            { label: 'Empate',  diffPp: (result.prob_d - marketProbs.pd) * 100, outcome: 'D' },
            { label: away.display_name ?? away.name, diffPp: (result.prob_a - marketProbs.pa) * 100, outcome: 'A' },
          ]} />
        </div>
      )}
    </>
  )
}
