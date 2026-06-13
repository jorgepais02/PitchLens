import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { api, type MatchListItem, type Team } from '../lib/api'
import { Crest, ResultBadge, SEP, Spinner, fmtDate } from '../components/shared'

const PAGE_SIZE = 20

const ROW_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 3fr 72px 3fr 44px',
  alignItems: 'center',
  gap: 16,
}

// ─── Select de filtro — botón + panel, lenguaje del TeamDropdown ──────────────
interface FilterOption {
  value: string
  label: string
}

function FilterSelect({ label, value, options, placeholder, disabled, onChange }: {
  label: string
  value: string | null
  options: FilterOption[]
  placeholder: string
  disabled?: boolean
  onChange: (value: string | null) => void
}) {
  const [open, setOpen]           = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const rootRef    = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const close = useCallback(() => { setOpen(false); setFocusedIdx(-1) }, [])

  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onMouse)
    return () => document.removeEventListener('mousedown', onMouse)
  }, [open, close])

  const focusOption = (idx: number) => {
    setFocusedIdx(idx)
    requestAnimationFrame(() => optionRefs.current[idx]?.focus())
  }

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(true)
      const start = options.findIndex(o => o.value === value)
      focusOption(start >= 0 ? start : 0)
    }
  }

  const handleOptionKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (idx < options.length - 1) focusOption(idx + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx > 0) focusOption(idx - 1)
      else { close(); triggerRef.current?.focus() }
    } else if (e.key === 'Escape') {
      close(); triggerRef.current?.focus()
    } else if (e.key === 'Tab') {
      close()
    }
  }

  const selected = options.find(o => o.value === value) ?? null

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 160 }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!open) { setOpen(true); setFocusedIdx(-1) } else close() }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '8px 12px', width: '100%',
          background: '#1a1a1c', border: `1px solid ${open ? '#4a4a4a' : '#2a2a2a'}`,
          borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '0.9375rem', fontFamily: 'var(--font-sans)',
          color: disabled ? 'rgba(255,255,255,0.18)' : selected ? '#f0f0f0' : 'rgba(255,255,255,0.35)',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 120ms, color 120ms',
          textAlign: 'left',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'rgba(255,255,255,0.35)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms var(--ease-out)' }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40,
            background: '#111213', border: '1px solid #252525', borderRadius: 10,
            boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 4px 16px rgba(0,0,0,0.5)',
            maxHeight: 280, overflowY: 'auto', padding: '4px 0',
          }}
        >
          {options.map((opt, idx) => {
            const isSel = opt.value === value
            return (
              <button
                key={opt.value}
                ref={el => { optionRefs.current[idx] = el }}
                type="button"
                role="option"
                aria-selected={isSel}
                tabIndex={-1}
                onClick={() => { onChange(isSel ? null : opt.value); close(); triggerRef.current?.focus() }}
                onKeyDown={e => handleOptionKeyDown(e, idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', textAlign: 'left',
                  padding: '8px 14px', fontSize: '0.9375rem',
                  fontWeight: isSel ? 500 : 400,
                  color: isSel ? '#f0f0f0' : '#d0d0d0',
                  background: isSel ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', transition: 'background 60ms',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#1a1a1c' }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? 'rgba(255,255,255,0.08)' : 'transparent' }}
              >
                <span aria-hidden="true" style={{
                  width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                  background: isSel ? 'rgba(255,255,255,0.7)' : 'transparent',
                }} />
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const PRIMARY = 'rgba(255,255,255,0.92)'
const DIM     = 'rgba(255,255,255,0.28)'

// ─── Fila de partido ──────────────────────────────────────────────────────────
function MatchRow({ match, teamById, onClick }: {
  match: MatchListItem
  teamById: Map<number, Team>
  onClick: () => void
}) {
  const home = teamById.get(match.home_team_id)
  const away = teamById.get(match.away_team_id)
  const homeName = home?.display_name ?? home?.name ?? String(match.home_team_id)
  const awayName = away?.display_name ?? away?.name ?? String(match.away_team_id)

  const TEAM_C = 'rgba(255,255,255,1)'

  return (
    <button
      type="button"
      onClick={onClick}
      data-row
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        width: '100%', padding: '12px 0 14px',
        background: 'transparent', border: 'none',
        borderTop: `0.5px solid ${SEP}`,
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
        transition: 'background 60ms', textAlign: 'left',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Fecha */}
      <span style={{ fontSize: 13, color: 'var(--color-ink-muted)', lineHeight: 1, paddingLeft: '12%' }}>
        {fmtDate(match.date)}
      </span>

      {/* Partido */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Local */}
        <span style={{
          flex: 1, display: 'flex', alignItems: 'center',
          justifyContent: 'flex-end', gap: 10, minWidth: 0,
          fontSize: 17, fontWeight: 400, color: TEAM_C,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{homeName}</span>
          <Crest url={home?.crest_url ?? null} name={homeName} size={32} />
        </span>

        {/* Marcador */}
        <span style={{
          flexShrink: 0, minWidth: 52, textAlign: 'center',
          fontSize: 17, fontWeight: 600,
          color: 'rgba(255,255,255,0.90)', fontFamily: 'var(--font-sans)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {match.fthg}–{match.ftag}
        </span>

        {/* Visitante */}
        <span style={{
          flex: 1, display: 'flex', alignItems: 'center',
          justifyContent: 'flex-start', gap: 10, minWidth: 0,
          fontSize: 17, fontWeight: 400, color: TEAM_C,
        }}>
          <Crest url={away?.crest_url ?? null} name={awayName} size={32} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{awayName}</span>
        </span>
      </div>
    </button>
  )
}

function TeamSearch({ teams, teamId, onSelect, onClear }: {
  teams: Team[]
  teamId: number | null
  onSelect: (id: number) => void
  onClear: () => void
}) {
  const [query,      setQuery]      = useState('')
  const [open,       setOpen]       = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const rootRef    = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selectedName = teamId !== null
    ? (teams.find(t => t.id === teamId)?.display_name ?? teams.find(t => t.id === teamId)?.name ?? '')
    : ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return teams
    return teams.filter(t => (t.display_name ?? t.name).toLowerCase().includes(q))
  }, [query, teams])

  const closeDropdown = useCallback(() => { setOpen(false); setFocusedIdx(-1) }, [])

  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeDropdown()
    }
    document.addEventListener('mousedown', onMouse)
    return () => document.removeEventListener('mousedown', onMouse)
  }, [open, closeDropdown])

  const focusResult = (idx: number) => {
    setFocusedIdx(idx)
    requestAnimationFrame(() => resultRefs.current[idx]?.focus())
  }

  const handleSelect = (id: number) => {
    onSelect(id); setQuery(''); closeDropdown(); inputRef.current?.focus()
  }

  const handleClear = () => {
    onClear(); setQuery(''); closeDropdown(); inputRef.current?.focus()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (open) { closeDropdown() }
      else if (teamId !== null) { handleClear() }
      return
    }
    if (e.key === 'ArrowDown' && filtered.length > 0) {
      e.preventDefault(); setOpen(true); focusResult(0)
    }
  }

  const handleResultKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (idx < filtered.length - 1) focusResult(idx + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx > 0) focusResult(idx - 1)
      else { setFocusedIdx(-1); inputRef.current?.focus() }
    } else if (e.key === 'Escape') {
      closeDropdown(); inputRef.current?.focus()
    } else if (e.key === 'Tab') {
      closeDropdown()
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 160 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        background: '#1a1a1c', border: `1px solid ${open ? '#4a4a4a' : '#2a2a2a'}`,
        borderRadius: 6, transition: 'border-color 120ms',
      }}>
        <Search size={13} style={{ flexShrink: 0, color: 'rgba(255,255,255,0.3)' }} />
        <input
          ref={inputRef}
          type="text"
          placeholder={teamId !== null ? selectedName : 'Buscar equipo…'}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setFocusedIdx(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: '0.9375rem', fontFamily: 'var(--font-sans)',
            color: teamId !== null && !query ? 'rgba(255,255,255,0.75)' : '#f0f0f0',
            minWidth: 0,
          }}
        />
        {teamId !== null && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Quitar filtro"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0,
              transition: 'color 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40,
          background: '#111213', border: '1px solid #252525', borderRadius: 10,
          boxShadow: '0 24px 64px rgba(0,0,0,0.85)', maxHeight: 260, overflowY: 'auto', padding: '4px 0',
        }}>
          {filtered.map((t, idx) => {
            const isSel = t.id === teamId
            return (
              <button
                key={t.id}
                ref={el => { resultRefs.current[idx] = el }}
                type="button"
                tabIndex={-1}
                onClick={() => handleSelect(t.id)}
                onKeyDown={e => handleResultKeyDown(e, idx)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', fontSize: '0.9375rem',
                  color: isSel ? '#f0f0f0' : '#d0d0d0',
                  background: isSel ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  transition: 'background 60ms',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#1a1a1c' }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
              >
                {t.display_name ?? t.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}


function PaginationBtn({ children, onClick, disabled, 'aria-label': ariaLabel }: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
  'aria-label': string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 6,
        background: 'transparent',
        border: '1px solid var(--color-border)',
        color: disabled ? 'rgba(255,255,255,0.18)' : 'var(--color-ink-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'color 120ms, border-color 120ms',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.color = 'var(--color-ink)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'
        }
      }}
      onMouseLeave={e => {
        if (!disabled) {
          e.currentTarget.style.color = 'var(--color-ink-muted)'
          e.currentTarget.style.borderColor = 'var(--color-border)'
        }
      }}
    >
      {children}
    </button>
  )
}

function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 12px', borderTop: `0.5px solid ${SEP}` }}>
          <span style={{ width: 170, flexShrink: 0, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ flex: 1, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
            <span style={{ flexShrink: 0, width: 36, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
            <span style={{ flex: 1, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.05)' }} />
          </span>
          <span style={{ width: 170, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const leagueCode  = searchParams.get('league')
  const season      = searchParams.has('season') ? Number(searchParams.get('season')) : null
  const teamId      = searchParams.has('team')   ? Number(searchParams.get('team'))   : null
  const roundNumber = searchParams.has('round')  ? Number(searchParams.get('round'))  : null
  const page        = searchParams.has('page')   ? Number(searchParams.get('page'))   : 1

  const { data: leagues = [] } = useQuery({ queryKey: ['leagues'], queryFn: api.leagues })

  const { data: seasons = [] } = useQuery({
    queryKey: ['seasons', leagueCode],
    queryFn: () => api.seasons(leagueCode!),
    enabled: leagueCode !== null,
  })

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', leagueCode],
    queryFn: () => api.teams(leagueCode!),
    enabled: leagueCode !== null,
  })

  const teamById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

  const filtersReady = leagueCode !== null && season !== null

  const { data: rawMatches = [], isLoading: isLoadingMatches } = useQuery({
    queryKey: ['matches', leagueCode, season, teamId, roundNumber, page],
    queryFn: () => api.matches({
      league_code: leagueCode!, season: season!,
      team_id: teamId, round_number: roundNumber,
      limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE,
    }),
    enabled: filtersReady,
    placeholderData: (prev) => prev,
  })

  const hasNextPage = rawMatches.length > PAGE_SIZE
  const matches     = hasNextPage ? rawMatches.slice(0, PAGE_SIZE) : rawMatches

  // Jornadas disponibles para la temporada actual (valores únicos, ordenados)
  const { data: allSeasonMatches = [] } = useQuery({
    queryKey: ['matches-all', leagueCode, season],
    queryFn: () => api.matches({ league_code: leagueCode!, season: season!, limit: 500, offset: 0 }),
    enabled: filtersReady,
    staleTime: Infinity,
  })
  const availableRounds = useMemo(() => {
    const rounds = allSeasonMatches
      .map(m => m.round_number)
      .filter((r): r is number => r !== null)
    return [...new Set(rounds)].sort((a, b) => a - b)
  }, [allSeasonMatches])

  const handleLeagueChange = (code: string | null) => {
    setSearchParams(code ? { league: code } : {})
  }

  const handleSeasonChange = (v: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams()
      const league = prev.get('league')
      if (league) next.set('league', league)
      if (v) next.set('season', v)
      return next
    })
  }

  const seasonOptions = useMemo(
    () => [...seasons].sort((a, b) => b.end_year - a.end_year)
      .map(s => ({ value: String(s.end_year), label: s.label })),
    [seasons]
  )

  return (
    <div style={{ minHeight: 'calc(100svh - 48px)', background: 'var(--color-bg)', paddingBottom: 80 }}>
      <div style={{ paddingTop: 48 }}>
        <div style={{ maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>

        {/* Cabecera */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            margin: 0, fontSize: '2.125rem', fontWeight: 700,
            letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
          }}>
            Explorar
          </h1>
          <p style={{
            margin: '8px 0 0', fontSize: 18, fontWeight: 400,
            color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-sans)',
          }}>
            Resultados históricos de Premier League, La Liga y Bundesliga.
          </p>
        </div>

        {/* Barra de filtros */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FilterSelect
            label="Liga"
            value={leagueCode}
            placeholder="Liga"
            options={leagues.map(l => ({ value: l.code, label: l.display_name ?? l.name }))}
            onChange={handleLeagueChange}
          />
          <FilterSelect
            label="Temporada"
            value={season !== null ? String(season) : null}
            placeholder="Temporada"
            disabled={leagueCode === null}
            options={seasonOptions}
            onChange={handleSeasonChange}
          />

          {/* Divisor vertical + filtro equipo — empujado a la derecha */}
          {filtersReady && (
            <>
              <div style={{ marginLeft: 'auto' }} />
              <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

              <TeamSearch
                teams={teams}
                teamId={teamId}
                onSelect={id => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('team', String(id)); n.delete('page'); return n })}
                onClear={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('team'); n.delete('page'); return n })}
              />
            </>
          )}
        </div>

        {!filtersReady ? (
          <div style={{ minHeight: '40vh', borderTop: `0.5px solid ${SEP}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ margin: 0, fontSize: 15, color: 'rgba(255,255,255,0.22)', fontFamily: 'var(--font-sans)' }}>
              Selecciona liga y temporada para ver los partidos
            </p>
          </div>
        ) : (
          <div style={{ maxWidth: 900, margin: '0 auto' }}>

            {isLoadingMatches ? (
              <SkeletonRows />
            ) : matches.length === 0 ? (
              <div style={{ padding: '80px 0', textAlign: 'center', borderTop: `0.5px solid ${SEP}` }}>
                <p style={{ margin: 0, fontSize: 17, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-sans)' }}>
                  Sin partidos para estos filtros.
                </p>
              </div>
            ) : (
              <>
                <div
                  onKeyDown={e => {
                    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                    e.preventDefault()
                    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-row]'))
                    const idx  = rows.indexOf(document.activeElement as HTMLButtonElement)
                    if (e.key === 'ArrowDown') rows[Math.min(rows.length - 1, idx + 1)]?.focus()
                    else rows[Math.max(0, idx - 1)]?.focus()
                  }}
                >
                {matches.map(m => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    teamById={teamById}
                    onClick={() => navigate(`/explore/${m.slug}`)}
                  />
                ))}
                </div>

                {(page > 1 || hasNextPage) && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28 }}>
                    {page > 1 ? (
                      <PaginationBtn onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', String(page - 1)); return n })} aria-label="Página anterior">
                        <ChevronLeft size={15} />
                      </PaginationBtn>
                    ) : (
                      <span style={{ width: 32 }} />
                    )}

                    <span style={{
                      fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.5)',
                      fontFamily: 'var(--font-sans)', padding: '0 8px',
                    }}>
                      Página {page}
                    </span>

                    {hasNextPage ? (
                      <PaginationBtn onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', String(page + 1)); return n })} aria-label="Página siguiente">
                        <ChevronRight size={15} />
                      </PaginationBtn>
                    ) : (
                      <span style={{ width: 32 }} />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
