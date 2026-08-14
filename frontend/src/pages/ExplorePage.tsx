import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { api, type MatchListItem, type Team } from '../lib/api'
import { Crest, SEP } from '../components/shared'
import { fmtDate } from '../lib/format'
import { useIsMobile, useIsNarrow, useMediaQuery } from '../lib/useMediaQuery'

const PAGE_SIZE = 20

interface FilterOption {
  value: string
  label: string
}

/**
 * Ancho del contenedor de un filtro.
 *
 * En la fila flex de escritorio cada filtro parte de 140px y crece con los
 * demás. En la rejilla de móvil manda la celda: el ancho fijo tiene que
 * desaparecer para que los tres midan exactamente lo mismo, se envuelvan o no.
 */
function anchoFiltro(fluid: boolean): React.CSSProperties {
  return fluid ? { width: '100%' } : { width: 160, flex: '1 1 140px' }
}

/** Panel desplegable anclado bajo el control que lo abre. */
const PANEL_DESPLEGABLE: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40,
  background: '#111213', border: '1px solid #252525', borderRadius: 10,
  boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 4px 16px rgba(0,0,0,0.5)',
  overflowY: 'auto', padding: '4px 0',
}

/**
 * Ancho mínimo de la lista de equipos.
 *
 * En móvil el buscador ocupa media fila, y a ese ancho "Borussia
 * Mönchengladbach" se parte en dos líneas. La lista se despega del ancho del
 * filtro solo aquí; las de liga y temporada tienen etiquetas cortas y no lo
 * necesitan.
 */
const ANCHO_LISTA_EQUIPOS = 240

function FilterSelect({ value, options, placeholder, disabled, fluid, onChange }: {
  label: string
  value: string | null
  options: FilterOption[]
  placeholder: string
  disabled?: boolean
  fluid: boolean
  onChange: (value: string | null) => void
}) {
  const [open, setOpen]           = useState(false)
  const [, setFocusedIdx] = useState(-1)
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
    <div ref={rootRef} style={{ position: 'relative', maxWidth: '100%', ...anchoFiltro(fluid) }}>
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
          color: disabled ? 'rgba(255,255,255,0.18)' : selected ? '#f0f0f0' : 'rgba(255,255,255,0.45)',
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
          style={{ ...PANEL_DESPLEGABLE, maxHeight: 280 }}
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
                className="listbox-option"
                data-selected={isSel}
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
      className="match-row"
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        width: '100%', padding: '12px 0 14px',
        background: 'transparent', border: 'none',
        borderTop: `0.5px solid ${SEP}`,
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
        transition: 'background 60ms', textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--color-ink-muted)', lineHeight: 1, paddingLeft: '12%' }}>
        {fmtDate(match.date)}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          flex: 1, display: 'flex', alignItems: 'center',
          justifyContent: 'flex-end', gap: 10, minWidth: 0,
          fontSize: 'clamp(13px, 3.6vw, 17px)', fontWeight: 400, color: TEAM_C,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{homeName}</span>
          <Crest url={home?.crest_url ?? null} name={homeName} size={32} />
        </span>

        <span style={{
          flexShrink: 0, minWidth: 44, textAlign: 'center',
          fontSize: 'clamp(13px, 3.6vw, 17px)', fontWeight: 600,
          color: 'rgba(255,255,255,0.90)', fontFamily: 'var(--font-sans)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {match.fthg}–{match.ftag}
        </span>

        <span style={{
          flex: 1, display: 'flex', alignItems: 'center',
          justifyContent: 'flex-start', gap: 10, minWidth: 0,
          fontSize: 'clamp(13px, 3.6vw, 17px)', fontWeight: 400, color: TEAM_C,
        }}>
          <Crest url={away?.crest_url ?? null} name={awayName} size={32} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{awayName}</span>
        </span>
      </div>
    </button>
  )
}

function TeamSearch({ teams, teamId, fluid, onSelect, onClear }: {
  teams: Team[]
  teamId: number | null
  fluid: boolean
  onSelect: (id: number) => void
  onClear: () => void
}) {
  const [query,      setQuery]      = useState('')
  const [open,       setOpen]       = useState(false)
  const [anclaDerecha, setAnclaDerecha] = useState(false)
  const [, setFocusedIdx] = useState(-1)
  const rootRef    = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([])

  const esTactil = useMediaQuery('(hover: none) and (pointer: coarse)')

  /**
   * Abre la lista, anclándola al lado por el que quepa.
   *
   * La lista es más ancha que el filtro; si este cae en la mitad derecha de la
   * pantalla — en móvil puede tocarle la columna derecha de la rejilla —,
   * crecer hacia la derecha la sacaría de pantalla, así que se ancla al revés.
   */
  const abrirLista = useCallback(() => {
    const caja = rootRef.current?.getBoundingClientRect()
    if (caja) setAnclaDerecha(caja.left + ANCHO_LISTA_EQUIPOS > window.innerWidth - 12)
    setOpen(true)
  }, [])

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

  /**
   * Devuelve el foco al input tras elegir o limpiar, sin reabrir la lista.
   *
   * En táctil se hace lo contrario: enfocar levanta otra vez el teclado justo
   * cuando el usuario acaba de terminar, así que se suelta el foco y el teclado
   * se cierra solo.
   */
  const devolverFoco = () => {
    if (esTactil) inputRef.current?.blur()
    else inputRef.current?.focus()
  }

  const handleSelect = (id: number) => {
    onSelect(id); setQuery(''); closeDropdown(); devolverFoco()
  }

  const handleClear = () => {
    onClear(); setQuery(''); closeDropdown(); devolverFoco()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (open) { closeDropdown() }
      else if (teamId !== null) { handleClear() }
      return
    }
    if (e.key === 'ArrowDown' && filtered.length > 0) {
      e.preventDefault(); abrirLista(); focusResult(0)
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
    <div ref={rootRef} style={{ position: 'relative', maxWidth: '100%', ...anchoFiltro(fluid) }}>
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
          onChange={e => { setQuery(e.target.value); abrirLista(); setFocusedIdx(-1) }}
          // Abre al pulsar, no al recibir el foco: tras elegir un equipo se le
          // devuelve el foco al input, y con onFocus la lista se reabría sola —
          // en táctil parecía que el toque no había hecho nada.
          onClick={abrirLista}
          onKeyDown={handleInputKeyDown}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="Buscar equipo"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: '0.9375rem', fontFamily: 'var(--font-sans)',
            color: teamId !== null && !query ? 'rgba(255,255,255,0.75)' : '#f0f0f0',
            minWidth: 0,
            // A media fila no cabe "Borussia Mönchengladbach": mejor cortarlo
            // con puntos suspensivos que a mitad de letra.
            textOverflow: 'ellipsis',
          }}
        />
        {teamId !== null && (
          <button
            type="button"
            className="icon-clear"
            onClick={handleClear}
            aria-label="Quitar filtro"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0,
              transition: 'color 120ms',
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div role="listbox" style={{
          ...PANEL_DESPLEGABLE,
          maxHeight: 260,
          minWidth: ANCHO_LISTA_EQUIPOS,
          maxWidth: 'calc(100vw - 24px)',
          ...(anclaDerecha ? { left: 'auto', right: 0 } : { left: 0, right: 'auto' }),
        }}>
          {filtered.map((t, idx) => {
            const isSel = t.id === teamId
            return (
              <button
                key={t.id}
                ref={el => { resultRefs.current[idx] = el }}
                type="button"
                role="option"
                aria-selected={isSel}
                tabIndex={-1}
                className="listbox-option"
                data-selected={isSel}
                onClick={() => handleSelect(t.id)}
                onKeyDown={e => handleResultKeyDown(e, idx)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 14px', fontSize: '0.9375rem',
                  color: isSel ? '#f0f0f0' : '#d0d0d0',
                  background: isSel ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  transition: 'background 60ms',
                }}
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
      className="pagination-btn"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 6,
        background: 'transparent',
        border: '1px solid var(--color-border)',
        color: disabled ? 'rgba(255,255,255,0.18)' : 'var(--color-ink-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'color 120ms, border-color 120ms',
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

export default function ExplorePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isNarrow = useIsNarrow()
  const isMobile = useIsMobile()

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
    <div style={{ minHeight: 'calc(100svh - 60px)', background: 'var(--color-bg)', paddingBottom: 80 }}>
      <title>Explorar · PitchLens</title>
      <div style={{ paddingTop: 48 }}>
        <div style={{ maxWidth: 900, marginLeft: 'auto', marginRight: 'auto', paddingLeft: 16, paddingRight: 16 }}>

        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            margin: 0, fontSize: 'clamp(1.6rem, 5.4vw, 2.125rem)', fontWeight: 700,
            letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
          }}>
            Explorar el dataset
          </h1>
          <p style={{
            margin: '8px 0 0', fontSize: 18, fontWeight: 400,
            color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-sans)',
          }}>
            Resultados históricos de Premier League, La Liga y Bundesliga.
          </p>
        </div>

        {/* En móvil los filtros van en rejilla, no en fila flex: al envolverse,
            el buscador se quedaba solo en la segunda línea y se estiraba a todo
            el ancho, el doble que los selectores de arriba. Con la rejilla cada
            filtro ocupa una celda y los tres miden lo mismo, quepan dos por
            fila, tres o uno solo. */}
        <div style={{
          marginBottom: 28, gap: 10, alignItems: 'center',
          ...(isMobile
            ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }
            : { display: 'flex', flexWrap: 'wrap' }),
        }}>
          <FilterSelect
            label="Liga"
            value={leagueCode}
            placeholder="Liga"
            fluid={isMobile}
            options={leagues.map(l => ({ value: l.code, label: l.display_name ?? l.name }))}
            onChange={handleLeagueChange}
          />
          <FilterSelect
            label="Temporada"
            value={season !== null ? String(season) : null}
            placeholder="Temporada"
            disabled={leagueCode === null}
            fluid={isMobile}
            options={seasonOptions}
            onChange={handleSeasonChange}
          />

          {filtersReady && (
            <>
              {/* El empujón a la derecha y la barra separadora solo tienen
                  sentido con los tres filtros en una sola fila. */}
              {!isNarrow && <div style={{ marginLeft: 'auto' }} />}
              {!isNarrow && <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />}

              <TeamSearch
                teams={teams}
                teamId={teamId}
                fluid={isMobile}
                onSelect={id => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('team', String(id)); n.delete('page'); return n })}
                onClear={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('team'); n.delete('page'); return n })}
              />
            </>
          )}
        </div>

        {!filtersReady ? (
          <div style={{ borderTop: `0.5px solid ${SEP}`, padding: '48px 0', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 16, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-sans)' }}>
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
                      <PaginationBtn disabled={false} onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', String(page - 1)); return n })} aria-label="Página anterior">
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
                      <PaginationBtn disabled={false} onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('page', String(page + 1)); return n })} aria-label="Página siguiente">
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
