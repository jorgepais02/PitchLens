import { useEffect, useState } from 'react'
import { api, type H2HMatch, type TeamBriefMatch } from '../../lib/api'

const HOME_C    = '#4D93F8'
const AWAY_C    = '#F35A5A'
const PRIMARY   = 'rgba(255,255,255,0.92)'   // ganador / activo
const SECONDARY = 'rgba(255,255,255,0.45)'   // fechas, subtítulos, labels bajo aggregate
const DIM       = 'rgba(255,255,255,0.28)'   // perdedor, empates, neutro
const SEP       = 'rgba(255,255,255,0.13)'   // separadores
const INITIAL   = 5

const COL_LABEL: React.CSSProperties = {
  fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: PRIMARY,
  fontFamily: 'var(--font-sans)',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace(/\.$/, '')
  const rest = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '')
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${rest}`
}

function Crest({ url, name, size = 22 }: { url: string | null; name: string; size?: number }) {
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
      fontSize: size * 0.32, fontWeight: 600, color: SECONDARY,
      fontFamily: 'var(--font-sans)',
    }}>{initials}</span>
  )
}

function H2HColumn({ matches, homeId, homeName, homeDisplayName, awayDisplayName, homeCrestUrl, awayCrestUrl }: {
  matches: H2HMatch[]
  homeId: number
  awayId: number
  homeName: string
  homeDisplayName: string
  awayDisplayName: string
  homeCrestUrl?: string | null
  awayCrestUrl?: string | null
}) {
  const [atBottom, setAtBottom] = useState(false)

  if (matches.length === 0) {
    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ ...COL_LABEL, display: 'block', textAlign: 'center' }}>H2H</span>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-start', textAlign: 'center',
          gap: 7, padding: '96px 24px 0',
        }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-sans)' }}>
            Sin enfrentamientos previos
          </div>
          <div style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.34)', lineHeight: 1.5, maxWidth: 300, fontFamily: 'var(--font-sans)' }}>
            Estos equipos no se han enfrentado en el historial disponible
          </div>
        </div>
      </div>
    )
  }

  let homeWins = 0, draws = 0, awayWins = 0
  for (const m of matches) {
    const homeIsOurHome = m.home_team_name === homeName
    if (m.ftr === 'D') draws++
    else if ((m.ftr === 'H' && homeIsOurHome) || (m.ftr === 'A' && !homeIsOurHome)) homeWins++
    else awayWins++
  }

  const crestOf = (teamId: number) => teamId === homeId ? (homeCrestUrl ?? null) : (awayCrestUrl ?? null)
  const scrollable = matches.length > INITIAL

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ ...COL_LABEL, display: 'block', textAlign: 'center' }}>H2H</span>

      <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', margin: '28px 0 0' }}>
        {([
          { color: HOME_C, num: homeWins, label: homeDisplayName },
          { color: 'rgba(255,255,255,0.42)', num: draws, label: 'Empates' },
          { color: AWAY_C, num: awayWins, label: awayDisplayName },
        ] as { color: string; num: number; label: string }[]).map(({ color, num, label }, idx) => (
          <div key={label} style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: idx === 0 ? 'flex-start' : idx === 1 ? 'center' : 'flex-end', minWidth: 0 }}>
            <div style={{ width: 3, height: 52, background: color, borderRadius: 2, flexShrink: 0, marginTop: 4 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 40, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', color: PRIMARY, fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>
                {num}
              </span>
              <span style={{ fontSize: 15, color: SECONDARY, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: `0.5px solid ${SEP}`, margin: '24px 0 0' }} />

      <div style={{ position: 'relative' }}>
      <div
        className={scrollable ? 'h2h-scroll' : undefined}
        style={scrollable ? { maxHeight: 420, overflowY: 'auto' } : undefined}
        onScroll={e => {
          const el = e.currentTarget
          setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4)
        }}
      >
        {matches.map((m, i) => {
          const matchHomeWon = m.ftr === 'H'
          const matchAwayWon = m.ftr === 'A'
          const isDraw = m.ftr === 'D'

          const homeColor  = isDraw ? DIM : matchHomeWon ? PRIMARY : DIM
          const awayColor  = isDraw ? DIM : matchAwayWon ? PRIMARY : DIM
          const homeWeight = matchHomeWon ? 600 : 400
          const awayWeight = matchAwayWon ? 600 : 400

          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', gap: 14,
              paddingTop: 12,
              paddingBottom: 16,
              borderTop: i === 0 ? 'none' : `0.5px solid ${SEP}`,
            }}>
              <span style={{
                display: 'block', width: '100%',
                fontSize: 13, lineHeight: 1, color: 'var(--color-ink-muted)',
                fontFamily: 'var(--font-sans)', paddingLeft: 20,
              }}>
                {fmtDate(m.date)}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  flex: 1, display: 'flex', alignItems: 'center',
                  justifyContent: 'flex-end', gap: 10, minWidth: 0,
                  fontSize: 18, fontWeight: homeWeight, color: homeColor,
                  fontFamily: 'var(--font-sans)',
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {m.home_team_name}
                  </span>
                  <Crest url={crestOf(m.home_team_id)} name={m.home_team_name} size={34} />
                </span>

                <span style={{
                  fontSize: 18, fontWeight: 600, letterSpacing: '0.03em',
                  color: SECONDARY, fontFamily: 'var(--font-sans)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0, minWidth: 44, textAlign: 'center',
                }}>
                  {m.fthg}–{m.ftag}
                </span>

                <span style={{
                  flex: 1, display: 'flex', alignItems: 'center',
                  justifyContent: 'flex-start', gap: 10, minWidth: 0,
                  fontSize: 18, fontWeight: awayWeight, color: awayColor,
                  fontFamily: 'var(--font-sans)',
                }}>
                  <Crest url={crestOf(m.away_team_id)} name={m.away_team_name} size={34} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {m.away_team_name}
                  </span>
                </span>
              </div>
            </div>
          )
        })}

      </div>
      {scrollable && !atBottom && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 48,
          background: 'linear-gradient(to bottom, transparent, #0c0d0f)',
          pointerEvents: 'none',
        }} />
      )}
      </div>
    </div>
  )
}

const RESULT_LETTER: Record<string, string> = { W: 'V', D: 'E', L: 'D' }
const WIN_C  = '#4ADE80'
const LOSS_C = '#E05D3A'

function FormBlock({ matches, teamName, color, mt }: {
  matches: TeamBriefMatch[]
  teamName: string
  color: string
  mt?: number
}) {
  const wins   = matches.filter(m => m.result === 'W').length
  const draws  = matches.filter(m => m.result === 'D').length
  const losses = matches.filter(m => m.result === 'L').length
  const ordered = [...matches].reverse() // oldest → newest, último a la derecha

  return (
    <div style={{ marginTop: mt }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: '20px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 24, background: color, borderRadius: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 18, fontWeight: 500, color: PRIMARY, fontFamily: 'var(--font-sans)' }}>
              {teamName}
            </span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--color-ink-muted)', fontFamily: 'var(--font-sans)', letterSpacing: '0.02em' }}>
            {wins}V · {draws}E · {losses}D
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {ordered.map((m, i) => {
            const isWin  = m.result === 'W'
            const isDraw = m.result === 'D'
            const isLast = i === ordered.length - 1
            const tileBg     = isWin  ? 'rgba(74,222,128,0.15)'  : isDraw ? 'rgba(255,255,255,0.07)' : 'rgba(224,93,58,0.12)'
            const tileBorder = isWin  ? 'rgba(74,222,128,0.30)'  : isDraw ? 'rgba(255,255,255,0.10)' : 'rgba(224,93,58,0.28)'
            const tileColor  = isWin  ? WIN_C                    : isDraw ? SECONDARY                : LOSS_C
            return (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                flex: 1,
              }}>
                <Crest url={m.opponent_crest_url} name={m.opponent_name} size={36} />
                <div style={{
                  width: '100%', aspectRatio: '1 / 1',
                  maxWidth: 44, maxHeight: 44,
                  borderRadius: 8, border: `1px solid ${tileBorder}`,
                  background: tileBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{
                    fontSize: 17, fontWeight: 600, lineHeight: 1,
                    color: tileColor, fontFamily: 'var(--font-sans)',
                  }}>
                    {RESULT_LETTER[m.result] ?? '?'}
                  </span>
                </div>
                {isLast && (
                  <div style={{
                    width: '100%', maxWidth: 30, height: 2, borderRadius: 2,
                    background: tileColor, marginTop: -4,
                  }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FormColumn({ homeForm, awayForm, homeDisplayName, awayDisplayName }: {
  homeForm: TeamBriefMatch[] | null
  awayForm: TeamBriefMatch[] | null
  homeDisplayName: string
  awayDisplayName: string
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ ...COL_LABEL, display: 'block', textAlign: 'center' }}>Forma reciente</span>

      {homeForm && (
        <FormBlock matches={homeForm} teamName={homeDisplayName} color={HOME_C} mt={28} />
      )}
      {awayForm && (
        <FormBlock matches={awayForm} teamName={awayDisplayName} color={AWAY_C} mt={20} />
      )}
    </div>
  )
}

export default function ContextSection({ homeId, awayId, homeName, awayName, homeDisplayName, awayDisplayName, homeCrestUrl, awayCrestUrl }: {
  homeId: number
  awayId: number
  homeName: string
  awayName: string
  homeDisplayName?: string
  awayDisplayName?: string
  homeCrestUrl?: string | null
  awayCrestUrl?: string | null
}) {
  const [h2h, setH2h]           = useState<H2HMatch[] | null>(null)
  const [homeForm, setHomeForm]  = useState<TeamBriefMatch[] | null>(null)
  const [awayForm, setAwayForm]  = useState<TeamBriefMatch[] | null>(null)

  useEffect(() => {
    api.h2h(homeId, awayId, 50).then(setH2h).catch(() => setH2h([]))
    api.teamStats(homeId).then(r => setHomeForm(r.last5)).catch(() => setHomeForm([]))
    api.teamStats(awayId).then(r => setAwayForm(r.last5)).catch(() => setAwayForm([]))
  }, [homeId, awayId])

  if (!h2h && !homeForm && !awayForm) return null

  const hDisplay = homeDisplayName ?? homeName
  const aDisplay = awayDisplayName ?? awayName
  const hasForm  = homeForm || awayForm

  return (
    <div style={{ marginTop: 64 }}>
      <div style={{ marginBottom: 40 }}>
        <h2 style={{
          margin: 0, fontSize: '2.125rem', fontWeight: 700,
          letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
        }}>
          Contexto
        </h2>
        <p style={{
          margin: '8px 0 0', fontSize: 18, fontWeight: 400,
          color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-sans)',
        }}>
          Historial entre ambos equipos y estado de forma reciente.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {h2h && (
          <H2HColumn
            matches={h2h}
            homeId={homeId}
            awayId={awayId}
            homeName={homeName}
            homeDisplayName={hDisplay}
            awayDisplayName={aDisplay}
            homeCrestUrl={homeCrestUrl}
            awayCrestUrl={awayCrestUrl}
          />
        )}

        {h2h && hasForm && (
          <div style={{ width: 0, borderLeft: '1px dashed rgba(255,255,255,0.12)', flexShrink: 0, margin: '0 48px' }} />
        )}

        {hasForm && (
          <FormColumn
            homeForm={homeForm}
            awayForm={awayForm}
            homeDisplayName={hDisplay}
            awayDisplayName={aDisplay}
          />
        )}
      </div>
    </div>
  )
}
