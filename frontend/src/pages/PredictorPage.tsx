import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Search, ArrowLeftRight, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { api, type League, type Team } from '../lib/api'
import { usePrediction, type ModelKey } from '../context/PredictionContext'

// ─── Types ────────────────────────────────────────────────────────────────────
type EnrichedTeam = Team & { league: League }

// ─── Colors ──────────────────────────────────────────────────────────────────
const HOME_BG        = '#091524'
const AWAY_BG        = '#190909'
const HOME_LABEL     = 'rgba(77, 147, 248, 0.65)'
const AWAY_LABEL     = 'rgba(243, 90, 90, 0.65)'
const LABEL_PRIMARY  = 'rgba(255,255,255,0.45)'
const LABEL_SECONDARY = 'rgba(255,255,255,0.22)'

// ─── Models ───────────────────────────────────────────────────────────────────
const PRESET_MODELS: { key: ModelKey; label: string; desc: string; acc: string }[] = [
  { key: 'baseline', label: 'Baseline', acc: '53.8%', desc: 'ELO histórico · puntos en temporada · historial H2H' },
  { key: 'extended', label: 'Extended', acc: '54.7%', desc: 'Baseline + xG generado/encajado · tiros a puerta · descanso' },
  { key: 'market',   label: 'Market',   acc: '57.3%', desc: 'Extended + probabilidad implícita de cierre Pinnacle' },
]

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 animate-spin"
      style={{ width: size, height: size, borderColor: '#2a2a2a #2a2a2a #2a2a2a #6366f1', flexShrink: 0 }}
      aria-hidden="true"
    />
  )
}

// ─── TeamCrest — escudo con fallback de iniciales ────────────────────────────
function TeamCrest({ url, name, size }: { url: string | null; name: string; size: number }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()

  const transition = 'width 560ms cubic-bezier(0.25,0,0.1,1), height 560ms cubic-bezier(0.25,0,0.1,1)'

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{ objectFit: 'contain', display: 'block', width: size, height: size, transition }}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size,
      borderRadius: 8,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.28, fontWeight: 600,
      color: 'rgba(255,255,255,0.25)',
      letterSpacing: '0.04em',
      userSelect: 'none',
      transition,
    }}>
      {initials}
    </div>
  )
}


// ─── Team Dropdown Portal ─────────────────────────────────────────────────────
interface DropdownProps {
  teams: EnrichedTeam[]
  selectedId: number | null
  onSelect: (t: EnrichedTeam) => void
  onClose: () => void
  anchorRect: DOMRect
  side: 'home' | 'away'
}

function TeamDropdown({ teams, selectedId, onSelect, onClose, anchorRect, side }: DropdownProps) {
  const [query,          setQuery]          = useState('')
  const [activePill,     setActivePill]     = useState<number | null>(null)
  const [focusedIdx,     setFocusedIdx]     = useState(-1)
  const [focusZone,      setFocusZone]      = useState<'input' | 'pills'>('input')
  const [focusedPillIdx, setFocusedPillIdx] = useState(0)

  const inputRef       = useRef<HTMLInputElement>(null)
  const panelRef       = useRef<HTMLDivElement>(null)
  const itemRefs       = useRef<Map<number, HTMLButtonElement>>(new Map())
  const pillRefs       = useRef<Map<number, HTMLButtonElement>>(new Map())
  const skipInputFocus = useRef(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onMouse)
    return () => document.removeEventListener('mousedown', onMouse)
  }, [onClose])

  const availableLeagues = useMemo(() => {
    const seen = new Map<number, League>()
    for (const t of teams) {
      if (!seen.has(t.league.id)) seen.set(t.league.id, t.league)
    }
    return Array.from(seen.values())
  }, [teams])

  const hasPills = availableLeagues.length > 1

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teams.filter(t => {
      if (activePill !== null && t.league.id !== activePill) return false
      if (q && !(t.display_name ?? t.name).toLowerCase().includes(q)) return false
      return true
    })
  }, [teams, query, activePill])

  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedTeam[]>()
    for (const t of filtered) {
      const key = t.league.display_name ?? t.league.name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return map
  }, [filtered])

  const flatList = useMemo(() => Array.from(grouped.values()).flat(), [grouped])

  useEffect(() => {
    if (focusedIdx < 0) return
    const team = flatList[focusedIdx]
    if (team) itemRefs.current.get(team.id)?.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx, flatList])

  // Typing resets list highlight and returns to input zone
  useEffect(() => {
    setFocusedIdx(-1)
    if (query) setFocusZone('input')
  }, [query])

  // Devuelve el foco al input. skipInputFocus previene que onFocus sobreescriba la zona.
  const moveFocusToInput = () => {
    skipInputFocus.current = true
    setFocusZone('input')
    inputRef.current?.focus()
    skipInputFocus.current = false
  }

  // ── Zona input: flechas eligen equipo, Tab cambia de liga ─────────────────
  const handleInputNav = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (hasPills && !e.shiftKey) {
        setFocusZone('pills')
        pillRefs.current.get(availableLeagues[focusedPillIdx]?.id)?.focus()
      } else if (!hasPills) {
        onClose()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(flatList.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(-1, i - 1))
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      e.preventDefault()
      const team = flatList[focusedIdx]
      if (team) { onSelect(team); onClose() }
    }
  }

  // ── Zona pills: ← → cambian liga, Tab vuelve al input ────────────────────
  const handlePillNav = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Escape') { onClose(); return }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = Math.min(availableLeagues.length - 1, idx + 1)
      setFocusedPillIdx(next)
      pillRefs.current.get(availableLeagues[next].id)?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = Math.max(0, idx - 1)
      setFocusedPillIdx(next)
      pillRefs.current.get(availableLeagues[next].id)?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const l = availableLeagues[idx]
      setActivePill(prev => prev === l.id ? null : l.id)
      setFocusedIdx(0) // auto-resalta el primer equipo de la liga seleccionada
    } else if (e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // cualquier tecla de avance devuelve el foco al input
      e.preventDefault()
      moveFocusToInput()
    }
  }


  const PW = 316
  const VW = window.innerWidth
  const VH = window.innerHeight

  const left = side === 'home'
    ? Math.max(16, Math.min(anchorRect.left, VW - PW - 16))
    : Math.max(16, Math.min(anchorRect.right - PW, VW - PW - 16))

  const spaceBelow = VH - anchorRect.bottom
  const top = spaceBelow >= 340
    ? anchorRect.bottom + 10
    : anchorRect.top - Math.min(360, anchorRect.top - 16)

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={side === 'home' ? 'Seleccionar equipo local' : 'Seleccionar equipo visitante'}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{
        position: 'fixed', top, left, width: PW, zIndex: 1000,
        background: '#111213',
        border: '1px solid #252525',
        borderRadius: 10,
        boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 4px 16px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      {/* Búsqueda */}
      <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #1c1c1c' }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={13}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#444', pointerEvents: 'none' }}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar equipo..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleInputNav}
            onFocus={() => {
              if (!skipInputFocus.current) setFocusZone('input')
            }}
            aria-label="Buscar equipo"
            style={{
              width: '100%', padding: '7px 10px 7px 30px',
              background: '#1a1a1c', border: '1px solid #2a2a2a',
              borderRadius: 6, color: '#f0f0f0',
              fontSize: '0.9375rem', fontFamily: 'var(--font-sans)', outline: 'none',
            }}
            onBlur={e => { e.currentTarget.style.borderColor = '#2a2a2a' }}
          />
        </div>
      </div>

      {/* Pills de liga — solo cuando hay más de una disponible */}
      {hasPills && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 10px',
          borderBottom: '1px solid #1c1c1c',
          flexWrap: 'wrap',
        }}>
          {availableLeagues.map((l, idx) => {
            const isActive  = activePill === l.id
            const isFocused = focusedPillIdx === idx && focusZone === 'pills'
            return (
              <button
                key={l.id}
                ref={el => { if (el) pillRefs.current.set(l.id, el); else pillRefs.current.delete(l.id) }}
                type="button"
                tabIndex={focusedPillIdx === idx ? 0 : -1}
                onClick={() => { setActivePill(isActive ? null : l.id); setFocusedIdx(-1) }}
                onKeyDown={e => handlePillNav(e, idx)}
                onFocus={() => { setFocusZone('pills'); setFocusedPillIdx(idx) }}
                style={{
                  padding: '3px 10px', borderRadius: 20,
                  fontSize: '0.6875rem', fontWeight: 600,
                  letterSpacing: '0.02em', textTransform: 'uppercase',
                  fontFamily: 'var(--font-sans)', cursor: 'pointer',
                  border: `1px solid ${isActive ? 'rgba(99,102,241,0.6)' : isFocused ? 'rgba(99,102,241,0.45)' : '#2a2a2a'}`,
                  background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                  color: isActive ? '#a5b4fc' : isFocused ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.42)',
                  boxShadow: isActive ? '0 0 0 2px rgba(99,102,241,0.18), inset 0 0 12px rgba(99,102,241,0.06)' : 'none',
                  outline: 'none',
                  transition: 'all 120ms',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!isActive && !isFocused) e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
                onMouseLeave={e => { if (!isActive && !isFocused) e.currentTarget.style.color = 'rgba(255,255,255,0.48)' }}
              >
                {l.display_name ?? l.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Lista de equipos */}
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
        {grouped.size === 0 ? (
          <p style={{ padding: '18px 16px', textAlign: 'center', color: '#444', fontSize: '0.9375rem' }}>
            Sin resultados
          </p>
        ) : Array.from(grouped.entries()).map(([leagueName, leagueTeams]) => (
          <div key={leagueName}>
            {activePill === null && (
              <div style={{
                padding: '10px 16px 3px',
                fontSize: '0.73rem', fontWeight: 600,
                letterSpacing: '0.10em', textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.38)',
              }}>
                {leagueName}
              </div>
            )}
            {leagueTeams.map(t => {
              const isSel     = t.id === selectedId
              const isFocused = flatList[focusedIdx]?.id === t.id
              const label     = t.display_name ?? t.name
              return (
                <button
                  key={t.id}
                  ref={el => { if (el) itemRefs.current.set(t.id, el); else itemRefs.current.delete(t.id) }}
                  type="button"
                  tabIndex={-1}
                  role="option"
                  aria-selected={isSel}
                  onClick={() => { onSelect(t); onClose() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', textAlign: 'left',
                    padding: '9px 16px', fontSize: '0.9375rem',
                    fontWeight: isSel ? 500 : 400, letterSpacing: '-0.01em',
                    color: isSel ? '#818cf8' : '#d0d0d0',
                    background: isFocused
                      ? 'rgba(99,102,241,0.10)'
                      : isSel ? 'rgba(99,102,241,0.08)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', transition: 'background 60ms',
                    outline: isFocused ? '1px solid rgba(99,102,241,0.3)' : 'none',
                    outlineOffset: -1,
                  }}
                  onMouseEnter={e => { if (!isSel && !isFocused) e.currentTarget.style.background = '#1a1a1c' }}
                  onMouseLeave={e => { if (!isSel && !isFocused) e.currentTarget.style.background = 'transparent' }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                      background: isSel ? '#818cf8' : 'transparent',
                    }}
                  />
                  {label}
                </button>
              )
            })}
          </div>
        ))}
      </div>

    </div>,
    document.body
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PredictorPage() {
  const navigate           = useNavigate()
  const { setActivePrediction } = usePrediction()

  const [home,         setHome]         = useState<EnrichedTeam | null>(null)
  const [away,         setAway]         = useState<EnrichedTeam | null>(null)
  const [hoveredSide,  setHoveredSide]  = useState<'home' | 'away' | null>(null)
  const [model,        setModel]        = useState<ModelKey | null>(null)
  const [odds,         setOdds]         = useState({ psch: '', pscd: '', psca: '' })
  const [touchedOdds, setTouchedOdds]  = useState({ psch: false, pscd: false, psca: false })
  const [isPredicting, setIsPredicting] = useState(false)
  const [openSide,      setOpenSide]      = useState<'home' | 'away' | null>(null)
  const [anchorRect,    setAnchorRect]    = useState<DOMRect | null>(null)
  const [showOddsPopover,  setShowOddsPopover]  = useState(false)
  const [isOddsClosing,    setIsOddsClosing]    = useState(false)
  const [isOddsEntering,   setIsOddsEntering]   = useState(false)
  const [predictError,     setPredictError]     = useState<string | null>(null)
  const oddsPopoverRef = useRef<HTMLDivElement>(null)

  // deselect=true → vuelve a ningún modelo seleccionado (comportamiento por defecto al descartar)
  // deselect=false → solo cierra el overlay (usado tras predicción exitosa, ya navegamos)
  const closeOddsPopover = useCallback((deselect = true) => {
    setIsOddsClosing(true)
    setPredictError(null)
    setTimeout(() => {
      setShowOddsPopover(false)
      setIsOddsClosing(false)
      setTouchedOdds({ psch: false, pscd: false, psca: false })
      if (deselect) setTimeout(() => {
        setModel(null)
        setOdds({ psch: '', pscd: '', psca: '' })
      }, 80)
    }, 220)
  }, [])

  const homeButtonRef = useRef<HTMLButtonElement>(null)
  const awayButtonRef = useRef<HTMLButtonElement>(null)

  // ── Un solo request carga todas las ligas y todos los equipos ──
  const { data: leagues = [] } = useQuery({
    queryKey: ['leagues'], queryFn: api.leagues,
  })
  const { data: rawTeams = [], isLoading: isLoadingTeams } = useQuery({
    queryKey: ['teams-all'], queryFn: api.allTeams, staleTime: Infinity,
  })

  const leagueById = useMemo(
    () => new Map(leagues.map(l => [l.id, l])),
    [leagues]
  )

  const allTeams: EnrichedTeam[] = useMemo(
    () => rawTeams.flatMap(t => {
      const league = leagueById.get(t.league_id)
      return league ? [{ ...t, league }] : []
    }),
    [rawTeams, leagueById]
  )

  // ── Filtered lists: second selector follows the first's league ──
  const awayTeams = allTeams.filter(t =>
    t.id !== home?.id && (!home || t.league.id === home.league.id)
  )
  const homeTeams = allTeams.filter(t =>
    t.id !== away?.id && (!away || t.league.id === away.league.id)
  )

  // ── Dropdown handlers ──
  const handleOpenDropdown = (side: 'home' | 'away') => {
    const btn = side === 'home' ? homeButtonRef.current : awayButtonRef.current
    if (btn) setAnchorRect(btn.getBoundingClientRect())
    setOpenSide(side)
  }

  const handleClose = useCallback(() => setOpenSide(null), [])

  const handleHomeSelect = (t: EnrichedTeam) => {
    if (away && away.league.id !== t.league.id) setAway(null)
    setHome(t)
    setOpenSide(null)
  }
  const handleAwaySelect = (t: EnrichedTeam) => {
    if (home && home.league.id !== t.league.id) setHome(null)
    setAway(t)
    setOpenSide(null)
  }

  // Cierra el popover de cuotas al hacer click fuera
  useEffect(() => {
    if (!showOddsPopover) return
    const handler = (e: MouseEvent) => {
      if (oddsPopoverRef.current && !oddsPopoverRef.current.contains(e.target as Node)) {
        closeOddsPopover()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showOddsPopover])

  // ── Predict ──
  const parseOdd   = (v: string) => parseFloat(v.replace(',', '.'))
  const pschVal    = parseOdd(odds.psch)
  const pscdVal    = parseOdd(odds.pscd)
  const pscaVal    = parseOdd(odds.psca)
  const oddsFilled = pschVal > 1 && pscdVal > 1 && pscaVal > 1
  const impliedSum = oddsFilled ? 1/pschVal + 1/pscdVal + 1/pscaVal : 0
  const oddsValid  = oddsFilled && impliedSum >= 1.0

  const handlePredict = async () => {
    if (!home || !away || !model || model === 'custom') return
    if (model === 'market' && !oddsValid) {
      setShowOddsPopover(true)
      setIsOddsEntering(true)
      requestAnimationFrame(() => setIsOddsEntering(false))
      return
    }
    const pretrainedModel = model as 'baseline' | 'extended' | 'market'
    setIsPredicting(true)
    try {
      const body = {
        home_team_id: home.id,
        away_team_id: away.id,
        model: pretrainedModel,
        ...(pretrainedModel === 'market' && {
          psch: parseOdd(odds.psch),
          pscd: parseOdd(odds.pscd),
          psca: parseOdd(odds.psca),
        }),
      }
      const result  = await api.predict(body)
      const id      = `${home.id}-${away.id}-${model}-${Date.now()}`
      const predData = {
        id, result, home, away, league: home.league, model,
        ...(pretrainedModel === 'market' && {
          odds: { psch: parseOdd(odds.psch), pscd: parseOdd(odds.pscd), psca: parseOdd(odds.psca) },
        }),
      }
      sessionStorage.setItem(`pred-${id}`, JSON.stringify(predData))
      setActivePrediction(predData)
      closeOddsPopover(false)
      navigate(`/prediction/${id}`)
    } catch (err) {
      console.error(err)
      setPredictError(err instanceof Error ? err.message : 'Error al predecir. Inténtalo de nuevo.')
    } finally {
      setIsPredicting(false)
    }
  }

  const teamsReady = !!home && !!away

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: 'calc(100svh - 48px)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* ── Hero — ocupa todo hasta elegir equipos ───────────────────── */}
      <div style={{
        height: teamsReady ? 'calc((100svh - 48px) / 2)' : 'calc(100svh - 48px)',
        flexShrink: 0, position: 'relative', overflow: 'hidden', background: '#28282d',
        transition: 'height 560ms cubic-bezier(0.25, 0, 0.1, 1)',
      }}>

        {/* Home background — navy tint, clipped to left diagonal */}
        <div style={{
          position: 'absolute', inset: 0,
          background: HOME_BG,
          clipPath: 'polygon(0 0, calc(50% + 68px) 0, calc(50% - 68px) 100%, 0 100%)',
        }} />

        {/* Away background — crimson tint, clipped to right diagonal */}
        <div style={{
          position: 'absolute', inset: 0,
          background: AWAY_BG,
          clipPath: 'polygon(calc(50% + 70px) 0, 100% 0, 100% 100%, calc(50% - 66px) 100%)',
        }} />

        {/* LOCAL label — alineado con el borde izquierdo del nombre de equipo */}
        <div className="hero-side-label" style={{
          position: 'absolute', left: '5%',
          fontSize: '1.25rem', fontWeight: 500,
          letterSpacing: '0.13em', textTransform: 'uppercase',
          color: HOME_LABEL, userSelect: 'none', pointerEvents: 'none',
        }}>
          LOCAL
        </div>

        {/* VISITANTE label — alineado con el borde derecho del nombre de equipo */}
        <div className="hero-side-label" style={{
          position: 'absolute', right: '5%',
          fontSize: '1.25rem', fontWeight: 500,
          letterSpacing: '0.13em', textTransform: 'uppercase',
          color: AWAY_LABEL, userSelect: 'none', pointerEvents: 'none',
        }}>
          VISITANTE
        </div>

        {/* Home team button — left half */}
        <div
          style={{ position: 'absolute', left: '5%', right: '53%', top: '50%', transform: 'translateY(-50%)' }}
          onMouseEnter={() => setHoveredSide('home')}
          onMouseLeave={() => setHoveredSide(null)}
        >
          <button
            ref={homeButtonRef}
            type="button"
            onClick={() => hoveredSide === 'home' && home ? setHome(null) : handleOpenDropdown('home')}
            aria-haspopup="dialog"
            aria-expanded={openSide === 'home'}
            aria-label={home ? 'Cambiar o quitar equipo local' : 'Seleccionar equipo local'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, fontFamily: 'var(--font-sans)',
              textAlign: home ? 'left' : 'center', display: 'block', width: '100%',
            }}
          >
            {home ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <div style={{ position: 'relative', display: 'inline-block', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    opacity: hoveredSide === 'home' ? 0.35 : 1,
                    transition: 'opacity 150ms var(--ease-out)',
                  }}>
                    <TeamCrest url={home.crest_url} name={home.display_name ?? home.name} size={teamsReady ? 72 : 108} />
                  </div>
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: hoveredSide === 'home' ? 1 : 0,
                      transition: 'opacity 150ms var(--ease-out)',
                      pointerEvents: 'none',
                    }}
                  >
                    <X size={28} color="#ffffff" strokeWidth={1.5} />
                  </span>
                </div>
                <span style={{
                  display: 'block',
                  fontSize: 'clamp(1.25rem, 2.4vw, 2.25rem)',
                  fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15,
                  color: 'rgba(255,255,255,0.82)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}>
                  {home.display_name ?? home.name}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                <div style={{
                  width: 140, height: 140, borderRadius: '50%', flexShrink: 0,
                  border: `1.5px dashed ${hoveredSide === 'home' ? 'rgba(77,147,248,0.60)' : 'rgba(77,147,248,0.32)'}`,
                  background: hoveredSide === 'home' ? 'rgba(77,147,248,0.06)' : 'transparent',
                  transition: 'border-color 180ms var(--ease-out), background 180ms var(--ease-out)',
                }} />
                <span style={{
                  fontSize: 'clamp(1.25rem, 2vw, 1.75rem)',
                  fontWeight: 400, letterSpacing: '-0.015em',
                  color: hoveredSide === 'home' ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.42)',
                  borderBottom: `1px solid ${hoveredSide === 'home' ? 'rgba(77,147,248,0.55)' : 'rgba(77,147,248,0.25)'}`,
                  paddingBottom: 4, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                  transition: 'color 180ms var(--ease-out), border-color 180ms var(--ease-out)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  {isLoadingTeams ? <Spinner size={14} /> : 'Selecciona equipo'}
                </span>
              </div>
            )}
          </button>

          {/* X táctil — solo visible en dispositivos touch */}
          {home && (
            <button
              type="button"
              className="team-touch-remove"
              onClick={() => setHome(null)}
              aria-label="Quitar equipo local"
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)',
                display: 'none', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', zIndex: 5,
              }}
            >
              <X size={14} color="rgba(255,255,255,0.8)" strokeWidth={2} />
            </button>
          )}

        </div>

        {/* Away team button — right half */}
        <div
          style={{ position: 'absolute', left: '53%', right: '5%', top: '50%', transform: 'translateY(-50%)', textAlign: 'right' }}
          onMouseEnter={() => setHoveredSide('away')}
          onMouseLeave={() => setHoveredSide(null)}
        >
          <button
            ref={awayButtonRef}
            type="button"
            onClick={() => hoveredSide === 'away' && away ? setAway(null) : handleOpenDropdown('away')}
            aria-haspopup="dialog"
            aria-expanded={openSide === 'away'}
            aria-label={away ? 'Cambiar o quitar equipo visitante' : 'Seleccionar equipo visitante'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, fontFamily: 'var(--font-sans)',
              textAlign: away ? 'right' : 'center', display: 'block', width: '100%',
            }}
          >
            {away ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <div style={{ position: 'relative', display: 'inline-block', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    opacity: hoveredSide === 'away' ? 0.35 : 1,
                    transition: 'opacity 150ms var(--ease-out)',
                  }}>
                    <TeamCrest url={away.crest_url} name={away.display_name ?? away.name} size={teamsReady ? 72 : 108} />
                  </div>
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: hoveredSide === 'away' ? 1 : 0,
                      transition: 'opacity 150ms var(--ease-out)',
                      pointerEvents: 'none',
                    }}
                  >
                    <X size={28} color="#ffffff" strokeWidth={1.5} />
                  </span>
                </div>
                <span style={{
                  display: 'block',
                  fontSize: 'clamp(1.25rem, 2.4vw, 2.25rem)',
                  fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15,
                  color: 'rgba(255,255,255,0.82)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}>
                  {away.display_name ?? away.name}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                <div style={{
                  width: 140, height: 140, borderRadius: '50%', flexShrink: 0,
                  border: `1.5px dashed ${hoveredSide === 'away' ? 'rgba(243,90,90,0.60)' : 'rgba(243,90,90,0.32)'}`,
                  background: hoveredSide === 'away' ? 'rgba(243,90,90,0.06)' : 'transparent',
                  transition: 'border-color 180ms var(--ease-out), background 180ms var(--ease-out)',
                }} />
                <span style={{
                  fontSize: 'clamp(1.25rem, 2vw, 1.75rem)',
                  fontWeight: 400, letterSpacing: '-0.015em',
                  color: hoveredSide === 'away' ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.42)',
                  borderBottom: `1px solid ${hoveredSide === 'away' ? 'rgba(243,90,90,0.55)' : 'rgba(243,90,90,0.25)'}`,
                  paddingBottom: 4, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                  transition: 'color 180ms var(--ease-out), border-color 180ms var(--ease-out)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  {isLoadingTeams ? <Spinner size={14} /> : 'Selecciona equipo'}
                </span>
              </div>
            )}
          </button>

          {/* X táctil — solo visible en dispositivos touch */}
          {away && (
            <button
              type="button"
              className="team-touch-remove"
              onClick={() => setAway(null)}
              aria-label="Quitar equipo visitante"
              style={{
                position: 'absolute', top: 8, left: 8,
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)',
                display: 'none', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', zIndex: 5,
              }}
            >
              <X size={14} color="rgba(255,255,255,0.8)" strokeWidth={2} />
            </button>
          )}

        </div>

        {/* Stack central: liga · VS · swap */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
        }}>
          {/* VS badge */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#171719',
            border: '1px solid #2a2a2a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}>
            <span style={{
              fontSize: '1rem', fontWeight: 600,
              letterSpacing: '0.06em', color: LABEL_SECONDARY,
              userSelect: 'none',
            }}>
              VS
            </span>
          </div>

        </div>

        {/* Swap — posición absoluta independiente, no afecta al centrado del stack */}
        <button
          type="button"
          onClick={() => { setHome(away); setAway(home) }}
          disabled={!home && !away}
          aria-label="Intercambiar local y visitante"
          style={{
            position: 'absolute',
            top: 'calc(50% + 48px)',
            left: '50%', transform: 'translateX(-50%)',
            zIndex: 10,
            background: 'rgba(35,35,40,0.35)', border: 'none', padding: '3px 10px',
            borderRadius: 20,
            cursor: home || away ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 5,
            color: 'rgba(255,255,255,0.22)',
            opacity: home || away ? 1 : 0,
            transition: 'color 150ms, opacity 200ms',
            fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.22)' }}
        >
          <ArrowLeftRight size={11} />
          <span style={{
            fontSize: '0.6875rem', fontWeight: 500,
            letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>
            swap
          </span>
        </button>
      </div>

      {/* ── Model selector ───────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, background: '#0a0a0c', borderTop: '1px solid #1e1e1e', position: 'relative',
        maxHeight: teamsReady ? '800px' : '0',
        opacity: teamsReady ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 560ms cubic-bezier(0.25, 0, 0.1, 1), opacity 380ms ease 180ms',
      }}>
        <div className="model-section-inner">

          {/* ── Two equal columns ────────────────────────────────────── */}
          <div className="model-cols">

          {/* ── Left: Preentrenados ──────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="model-header" style={{
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: LABEL_PRIMARY,
              marginBottom: 18,
            }}>
              Modelos preentrenados
            </div>
            <div role="radiogroup">
              {PRESET_MODELS.map(m => {
                const isActive = model === m.key
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setModel(m.key)}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      width: '100%', textAlign: 'left',
                      padding: '11px 14px', borderRadius: 9,
                      background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
                      cursor: 'pointer',
                      transition: 'background 220ms, border-color 220ms',
                      marginBottom: 3,
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* Line 1: radio + name + accuracy */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                        background: isActive ? 'rgba(255,255,255,0.82)' : 'transparent',
                        border: `1.5px solid ${isActive ? 'rgba(255,255,255,0.5)' : '#3a3a3a'}`,
                        boxShadow: isActive ? '0 0 0 2.5px rgba(255,255,255,0.1)' : 'none',
                        transition: 'all 220ms',
                      }} />
                      <span style={{
                        fontSize: '1.25rem', fontWeight: isActive ? 600 : 400,
                        color: isActive ? '#e8e8e8' : '#666',
                        flex: 1, transition: 'color 220ms',
                      }}>
                        {m.label}
                      </span>
                      <span style={{
                        fontSize: '1.0625rem', fontWeight: 500,
                        color: isActive ? '#777' : '#3a3a3a',
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                        transition: 'color 220ms',
                      }}>
                        {m.acc}
                      </span>
                    </div>
                    {/* Line 2: description */}
                    <div style={{
                      paddingLeft: 21, marginTop: 6,
                      fontSize: '1.0625rem',
                      color: isActive ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.22)',
                      transition: 'color 220ms', lineHeight: 1.5,
                    }}>
                      {m.desc}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="model-divider" style={{
            width: 1,
            background: '#1a1a1a',
            margin: '0 36px', alignSelf: 'stretch',
          }} />

          {/* ── Right: Studio ────────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)' }}>
            <div className="model-header" style={{
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'rgba(255,255,255,0.14)',
              marginBottom: 18,
            }}>
              Studio
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px', opacity: 0.4 }}>
              <span style={{
                width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                border: '1.5px solid #3a3a3a', marginTop: 3,
              }} />
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 400, color: '#666', marginBottom: 5 }}>
                  🔒 Mi modelo
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)', lineHeight: 1.45 }}>
                  Inicia sesión para usar tus modelos entrenados
                </div>
              </div>
            </div>
          </div>

          </div>{/* end two columns */}

          {/* ── Predict row ──────────────────────────────────────────── */}
          {(() => {
            const canClick = !!home && !!away && !!model && model !== 'custom' && !isPredicting
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: -8, position: 'relative' }}>


                  <button
                    type="button"
                    onClick={handlePredict}
                    disabled={!canClick || showOddsPopover}
                    style={{
                      visibility: showOddsPopover ? 'hidden' : 'visible',
                      display: 'inline-flex', alignItems: 'center', gap: 10,
                      padding: '13px 28px', borderRadius: 6,
                      fontSize: '1rem', fontWeight: 500,
                      fontFamily: 'var(--font-sans)',
                      cursor: canClick ? 'pointer' : 'not-allowed',
                      transition: 'background 120ms',
                      ...(canClick
                        ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.62)' }
                        : { background: 'transparent', color: '#333', border: '1px solid #222' }
                      ),
                    }}
                    onMouseEnter={e => { if (canClick) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.75)'; e.currentTarget.style.color = '#fff' } }}
                    onMouseLeave={e => { if (canClick) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.62)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' } }}
                    aria-label="Predecir resultado del partido"
                  >
                    {isPredicting
                      ? <><Spinner size={14} /> Calculando...</>
                      : <>Predecir <ArrowRight size={15} aria-hidden="true" /></>
                    }
                  </button>

              </div>
            )
          })()}
          {/* end predict row */}

        </div>

        {/* ── Odds overlay — cubre solo la sección de modelos ────────── */}
        {showOddsPopover && (
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(10,10,12,0.88)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 50,
              opacity: isOddsClosing || isOddsEntering ? 0 : 1,
              transform: isOddsClosing || isOddsEntering ? 'translateY(6px)' : 'translateY(0)',
              transition: 'opacity 220ms var(--ease-out), transform 220ms var(--ease-out)',
            }}
          >
            <div
              ref={oddsPopoverRef}
              onMouseDown={e => e.stopPropagation()}
              style={{
                background: '#1e1f22',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                padding: '24px 28px',
                width: 'min(525px, calc(100vw - 32px))',
                display: 'flex', flexDirection: 'column', gap: 20,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {/* Título + subtítulo */}
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f0f0f0', marginBottom: 5 }}>
                  Cuotas de cierre Pinnacle
                </div>
                <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
                  Este modelo requiere estas cuotas para incorporar la señal del mercado
                </div>
              </div>

              {/* Inputs */}
              <div style={{ display: 'flex', gap: 12 }}>
                {([
                  { key: 'psch' as const, label: 'Local'     },
                  { key: 'pscd' as const, label: 'Empate'    },
                  { key: 'psca' as const, label: 'Visitante' },
                ] as { key: keyof typeof odds; label: string }[]).map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 600,
                      letterSpacing: '0.09em', textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.3)',
                    }}>
                      {label}
                    </span>
                    <input
                      type="text" inputMode="decimal" placeholder="—"
                      value={odds[key]}
                      onChange={e => {
                        const v = e.target.value
                        if (v === '' || /^\d*[.,]?\d*$/.test(v)) setOdds(p => ({ ...p, [key]: v }))
                      }}
                      aria-label={`Cuota Pinnacle ${label}`}
                      autoFocus={key === 'psch'}
                      style={{
                        width: '100%', fontSize: '1.375rem', textAlign: 'center',
                        padding: '12px 10px', borderRadius: 8,
                        background: '#111213', border: '1px solid #2a2a2a',
                        color: '#f0f0f0', fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums', outline: 'none',
                        transition: 'border-color 120ms',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#4a4a4a' }}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = '#2a2a2a'
                        setTouchedOdds(p => ({ ...p, [key]: true }))
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Hints de validación — solo tras perder el foco */}
              {(() => {
                const anyTouched = touchedOdds.psch || touchedOdds.pscd || touchedOdds.psca
                if (!anyTouched) return null
                const anyFilledInvalid = (['psch', 'pscd', 'psca'] as const).some(k => {
                  if (!touchedOdds[k]) return false
                  const n = parseOdd(odds[k])
                  return odds[k] !== '' && (isNaN(n) || n <= 1)
                })
                if (anyFilledInvalid) return (
                  <div style={{ fontSize: '0.8125rem', color: 'rgba(255,180,50,0.8)', lineHeight: 1.5 }}>
                    Las cuotas deben ser superiores a 1.
                  </div>
                )
                if (oddsFilled && !oddsValid) return (
                  <div style={{ fontSize: '0.8125rem', color: 'rgba(255,180,50,0.8)', lineHeight: 1.5 }}>
                    La suma de probabilidades implícitas es {(impliedSum * 100).toFixed(1)}% — debe ser ≥ 100%.
                  </div>
                )
                return null
              })()}

              {/* Error de API */}
              {predictError && (
                <div style={{ fontSize: '0.8125rem', color: 'rgba(255,100,100,0.9)', lineHeight: 1.5 }}>
                  {predictError}
                </div>
              )}

              {/* Confirmar */}
              <button
                type="button"
                onClick={handlePredict}
                disabled={!oddsValid || isPredicting}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '14px', borderRadius: 8,
                  fontSize: '1rem', fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  cursor: oddsValid && !isPredicting ? 'pointer' : 'not-allowed',
                  transition: 'background 120ms, border-color 120ms, color 120ms',
                  ...(oddsValid && !isPredicting
                    ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.62)' }
                    : { background: 'transparent', color: '#333', border: '1px solid #222' }
                  ),
                }}
                onMouseEnter={e => { if (oddsValid && !isPredicting) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.75)'; e.currentTarget.style.color = '#fff' } }}
                onMouseLeave={e => { if (oddsValid && !isPredicting) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.62)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' } }}
              >
                {isPredicting
                  ? <><Spinner size={14} /> Calculando...</>
                  : <>Predecir <ArrowRight size={15} /></>
                }
              </button>
              <button
                type="button"
                onClick={() => closeOddsPopover(true)}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontSize: '0.8125rem', color: 'rgba(255,255,255,0.28)',
                  fontFamily: 'var(--font-sans)', cursor: 'pointer',
                  textAlign: 'center', width: '100%',
                  transition: 'color 220ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.28)' }}
              >
                No tengo cuotas
              </button>
            </div>
          </div>
        )}

      </div>


      {/* ── Dropdown portal ──────────────────────────────────────────── */}
      {openSide && anchorRect && (
        <TeamDropdown
          teams={openSide === 'home' ? homeTeams : awayTeams}
          selectedId={openSide === 'home' ? (home?.id ?? null) : (away?.id ?? null)}
          onSelect={openSide === 'home' ? handleHomeSelect : handleAwaySelect}
          onClose={handleClose}
          anchorRect={anchorRect}
          side={openSide}
        />
      )}
    </div>
  )
}
