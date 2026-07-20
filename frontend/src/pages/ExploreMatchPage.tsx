import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { api, type MatchDetail, type Team } from '../lib/api'
import { AWAY_C, Crest, HOME_C, SEP, Spinner, fmtDate } from '../components/shared'

const PRIMARY   = 'rgba(255,255,255,0.92)'

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em',
  color: PRIMARY, fontFamily: 'var(--font-sans)',
  marginBottom: 24,
}

function StatRow({ label, home, away, lowerWins = false, isLast = false }: {
  label: string; home: number; away: number
  lowerWins?: boolean; isLast?: boolean
}) {
  const homeWins = lowerWins ? home < away : home > away
  const awayWins = lowerWins ? away < home : away > home

  const homeAlpha = 'rgba(77,147,248,0.15)'
  const awayAlpha = 'rgba(243,90,90,0.15)'

  const pill = (value: number, color: string, bg: string) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 42, height: 42, padding: '0 14px', borderRadius: 99,
      background: bg, fontSize: 17, fontWeight: 600, color,
      fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums',
      flexShrink: 0,
    }}>{value}</span>
  )
  const plain = (value: number) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 42, height: 42,
      fontSize: 17, fontWeight: 400, color: 'rgba(255,255,255,0.62)',
      fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums',
      flexShrink: 0,
    }}>{value}</span>
  )

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 0',
      borderBottom: isLast ? 'none' : `0.5px solid ${SEP}`,
    }}>
      {homeWins ? pill(home, HOME_C, homeAlpha) : plain(home)}
      <span style={{
        fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.85)',
        fontFamily: 'var(--font-sans)', textAlign: 'center',
      }}>{label}</span>
      {awayWins ? pill(away, AWAY_C, awayAlpha) : plain(away)}
    </div>
  )
}


function ShotsBlock({ homeSots, awaySots, homeMisses, awayMisses }: {
  homeSots: number; awaySots: number; homeMisses: number; awayMisses: number
}) {
  const num = (n: number) => (
    <span style={{
      minWidth: 42, height: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 17, fontWeight: 400, fontVariantNumeric: 'tabular-nums',
      fontFamily: 'var(--font-sans)', color: 'rgba(255,255,255,0.62)',
    }}>{n}</span>
  )

  const rowLabel = (text: string) => (
    <span style={{ fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-sans)', textAlign: 'center' }}>
      {text}
    </span>
  )

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '24% 52% 24%',
        alignItems: 'center', padding: '18px 0',
        borderBottom: 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>{num(homeMisses)}</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>{rowLabel('Tiros fuera')}</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>{num(awayMisses)}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 0' }}>
        <div style={{
          width: '52%',
          borderLeft: '7px solid rgba(255,255,255,0.75)',
          borderRight: '7px solid rgba(255,255,255,0.75)',
          borderTop: '7px solid rgba(255,255,255,0.75)',
          borderBottom: 'none',
          borderRadius: '8px 8px 0 0',
          background: 'transparent',
          padding: '6px 10px 10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {num(homeSots)}
            {rowLabel('Tiros a puerta')}
            {num(awaySots)}
          </div>
        </div>
      </div>
    </div>
  )
}

function OddsCard({ psch, pscd, psca, b365h, b365d, b365a }: {
  psch: number; pscd: number; psca: number
  b365h: number; b365d: number; b365a: number
}) {
  const OUTCOMES = ['1', 'X', '2']

  const OddsCell = ({ label, value }: { label: string; value: number }) => (
    <div style={{
      display: 'flex', flexDirection: 'row',
      alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px',
      background: 'rgba(255,255,255,0.04)', borderRadius: 10,
      gap: 8, minWidth: 0,
    }}>
      <span style={{
        fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
        color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-sans)',
        flexShrink: 0,
      }}>{label}</span>
      <span style={{
        fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em',
        color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-sans)',
        fontVariantNumeric: 'tabular-nums',
      }}>{value.toFixed(2)}</span>
    </div>
  )

  const PinnacleLogo = () => (
    <div style={{
      width: 90, height: 40, borderRadius: 8, flexShrink: 0,
      background: '#0f1923', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 3, padding: '4px 8px',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: '#fff',
        fontFamily: 'var(--font-sans)', lineHeight: 1,
      }}>PINNACLE</span>
      <div style={{ width: '70%', height: 2, background: '#f05a22', borderRadius: 1 }} />
    </div>
  )

  const Bet365Logo = () => (
    <div style={{
      width: 90, height: 40, borderRadius: 8, flexShrink: 0,
      background: '#027b5b', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '0 8px',
    }}>
      <span style={{
        fontSize: 13, fontWeight: 700, color: '#fff',
        fontFamily: 'var(--font-sans)', lineHeight: 1,
      }}>bet<span style={{ color: '#ffd700' }}>365</span></span>
    </div>
  )

  const BookRow = ({ logo, h, d, a, isLast = false }: {
    logo: React.ReactNode; h: number; d: number; a: number; isLast?: boolean
  }) => (
    <div style={{
      paddingBottom: isLast ? 0 : 20,
      borderBottom: isLast ? 'none' : `0.5px solid ${SEP}`,
      marginBottom: isLast ? 0 : 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {logo}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, flex: 1, minWidth: 0 }}>
          {[h, d, a].map((v, i) => <OddsCell key={i} label={OUTCOMES[i]} value={v} />)}
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div style={SECTION_TITLE}>Mercado</div>
      <BookRow logo={<PinnacleLogo />} h={psch}  d={pscd}  a={psca}  />
      <BookRow logo={<Bet365Logo />}   h={b365h} d={b365d} a={b365a} isLast />
    </div>
  )
}

const CLASI_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '34px 32px minmax(0,1fr) 44px 36px 36px 36px 44px 52px',
  alignItems: 'center', gap: 8,
}

function StandingsCompact({ leagueCode, season, homeTeamId, awayTeamId }: {
  leagueCode: string; season: number
  homeTeamId: number; awayTeamId: number
}) {
  const { data: rows, isLoading } = useQuery({
    queryKey: ['standings', leagueCode, season],
    queryFn: () => api.standings(leagueCode, season),
  })

  const MONO: React.CSSProperties = {
    fontSize: 16, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
    color: 'rgba(255,255,255,0.62)', textAlign: 'center',
  }
  const COLS = ['PJ', 'G', 'E', 'P', 'GD', 'PTS']

  if (isLoading || !rows) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}><Spinner /></div>
  )

  const involved = rows
    .map((r, i) => ({ ...r, pos: i + 1 }))
    .filter(r => r.team_id === homeTeamId || r.team_id === awayTeamId)

  return (
    <div>
      <div style={{ ...SECTION_TITLE, marginBottom: 16 }}>
        Clasificación
      </div>

      <div style={{ ...CLASI_GRID, paddingBottom: 8, borderBottom: `0.5px solid ${SEP}` }}>
        <span /><span /><span />
        {COLS.map(c => (
          <span key={c} style={{
            fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-sans)', textAlign: 'center', fontSize: 13,
          }}>{c}</span>
        ))}
      </div>

      {involved.map((r, i) => (
        <div key={r.team_id} style={{
          ...CLASI_GRID,
          padding: '20px 0',
          borderBottom: i < involved.length - 1 ? `0.5px solid ${SEP}` : 'none',
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.80)', textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
            {r.pos}
          </span>
          <Crest url={r.crest_url} name={r.team_name} size={26} />
          <span style={{
            fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-sans)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{r.team_name}</span>
          <span style={MONO}>{r.played}</span>
          <span style={MONO}>{r.wins}</span>
          <span style={MONO}>{r.draws}</span>
          <span style={MONO}>{r.losses}</span>
          <span style={MONO}>{r.goal_diff > 0 ? `+${r.goal_diff}` : r.goal_diff}</span>
          <span style={{ ...MONO, fontWeight: 600, color: 'rgba(255,255,255,0.80)' }}>{r.points}</span>
        </div>
      ))}
    </div>
  )
}

function MatchHeader({ match, home, away, leagueName, seasonLabel }: {
  match: MatchDetail; home: Team | undefined; away: Team | undefined
  leagueName: string; seasonLabel: string
}) {
  const homeName = home?.display_name ?? home?.name ?? 'Local'
  const awayName = away?.display_name ?? away?.name ?? 'Visitante'

  const XG_LABEL: React.CSSProperties = {
    fontSize: 16, fontWeight: 600, letterSpacing: '0.04em',
    fontFamily: 'var(--font-sans)',
  }

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(to right, #091524, #190909)',
      marginTop: -60, padding: '88px 8.75vw 52px',
      animation: 'hero-fade-in 0.4s ease-out both',
    }}>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
        background: 'linear-gradient(to bottom, transparent, #0c0d0f)',
        pointerEvents: 'none',
      }} />

      <div style={{ margin: '12px 0 44px', fontFamily: 'var(--font-sans)' }}>
        <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{leagueName}</span>
          <span style={{ margin: '0 6px', color: 'rgba(255,255,255,0.55)' }}>·</span>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{seasonLabel}</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>
          {fmtDate(match.date)}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0,320px) auto minmax(0,320px)',
        alignItems: 'flex-start', gap: '0 32px', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Crest url={home?.crest_url ?? null} name={homeName} size={80} />
          <span style={{
            fontSize: 'clamp(16px, 2vw, 26px)', fontWeight: 500,
            letterSpacing: '-0.025em', lineHeight: 1.25,
            color: 'rgba(255,255,255,0.88)', fontFamily: 'var(--font-sans)', textAlign: 'center',
          }}>{homeName}</span>
          <span style={{ ...XG_LABEL, color: HOME_C }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, letterSpacing: 0 }}>
              {match.home_xg.toFixed(2)}
            </span>{' '}xG
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 8 }}>
          <span style={{
            fontSize: 'clamp(44px, 5vw, 64px)', fontWeight: 600, lineHeight: 1,
            letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.95)',
            fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}>{match.fthg} – {match.ftag}</span>
          <span style={{
            fontSize: 16, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.50)', fontFamily: 'var(--font-sans)',
            fontVariantNumeric: 'tabular-nums',
          }}>HT {match.hthg}–{match.htag}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Crest url={away?.crest_url ?? null} name={awayName} size={80} />
          <span style={{
            fontSize: 'clamp(16px, 2vw, 26px)', fontWeight: 500,
            letterSpacing: '-0.025em', lineHeight: 1.25,
            color: 'rgba(255,255,255,0.88)', fontFamily: 'var(--font-sans)', textAlign: 'center',
          }}>{awayName}</span>
          <span style={{ ...XG_LABEL, color: AWAY_C }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, letterSpacing: 0 }}>
              {match.away_xg.toFixed(2)}
            </span>{' '}xG
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ExploreMatchPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const { data: match, isLoading, isError } = useQuery({
    queryKey: ['match', slug],
    queryFn: () => api.matchDetail(slug!),
    enabled: !!slug,
  })

  const { data: leagues = [] } = useQuery({ queryKey: ['leagues'], queryFn: api.leagues })
  const league = useMemo(() => leagues.find(l => l.id === match?.league_id) ?? null, [leagues, match])

  const { data: seasons = [] } = useQuery({
    queryKey: ['seasons', league?.code],
    queryFn: () => api.seasons(league!.code),
    enabled: league !== null,
  })

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', league?.code],
    queryFn: () => api.teams(league!.code),
    enabled: league !== null,
  })

  const season = useMemo(() => seasons.find(s => s.id === match?.season_id) ?? null, [seasons, match])
  const teamById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

  if (isLoading) return (
    <div style={{ height: 'calc(100svh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={22} />
    </div>
  )

  if (isError || !match) return (
    <div style={{
      height: 'calc(100svh - 60px)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 18,
    }}>
      <p style={{ margin: 0, fontSize: 17, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-sans)' }}>
        Partido no encontrado.
      </p>
      <button type="button" onClick={() => navigate('/explore')} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 18px', borderRadius: 6, fontSize: '0.9375rem',
        fontFamily: 'var(--font-sans)', background: 'transparent',
        color: 'var(--color-ink-muted)', border: '1px solid var(--color-border)', cursor: 'pointer',
      }}>
        <ArrowLeft size={14} /> Volver a Explorar
      </button>
    </div>
  )

  const home = teamById.get(match.home_team_id)
  const away = teamById.get(match.away_team_id)
  const homeMisses = match.home_shots - match.home_shots_on_target
  const awayMisses = match.away_shots - match.away_shots_on_target
  const showReds = match.home_reds > 0 || match.away_reds > 0

  return (
    <div style={{ minHeight: 'calc(100svh - 60px)', background: '#0c0d0f', paddingBottom: 80 }}>
      <title>{`${home?.display_name ?? home?.name ?? 'Local'} vs ${away?.display_name ?? away?.name ?? 'Visitante'} · PitchLens`}</title>

      <MatchHeader
        match={match} home={home} away={away}
        leagueName={league?.display_name ?? league?.name ?? ''}
        seasonLabel={season?.label ?? ''}
      />

      <div style={{ maxWidth: '82.5vw', margin: '52px auto 0' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: 16 }}>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...SECTION_TITLE, marginBottom: 6 }}>Stats del partido</div>
            <div>
              <StatRow label="Total de tiros" home={match.home_shots} away={match.away_shots} isLast />
              <div style={{ padding: '4px 0' }}>
                <ShotsBlock
                  homeSots={match.home_shots_on_target} awaySots={match.away_shots_on_target}
                  homeMisses={homeMisses} awayMisses={awayMisses}
                />
              </div>
              <div style={{ borderBottom: `0.5px solid ${SEP}`, margin: '4px 0 0' }} />
              <StatRow label="Córners" home={match.home_corners} away={match.away_corners} />
              <StatRow label="Faltas" home={match.home_fouls} away={match.away_fouls} lowerWins />
              <StatRow label="Amarillas" home={match.home_yellows} away={match.away_yellows} lowerWins isLast={!showReds} />
              {showReds && (
                <StatRow label="Rojas" home={match.home_reds} away={match.away_reds} lowerWins isLast />
              )}
            </div>
          </div>

          <div style={{ width: 0, borderLeft: '1px dashed rgba(255,255,255,0.12)', flexShrink: 0, margin: '0 48px', alignSelf: 'stretch' }} />

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 52 }}>
            <OddsCard
              psch={match.psch} pscd={match.pscd} psca={match.psca}
              b365h={match.b365h} b365d={match.b365d} b365a={match.b365a}
            />
            {league && season && (
              <StandingsCompact
                leagueCode={league.code}
                season={season.end_year}
                homeTeamId={match.home_team_id}
                awayTeamId={match.away_team_id}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
