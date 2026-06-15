import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Search, ArrowLeftRight, X, Lock } from 'lucide-react'
import { createPortal } from 'react-dom'
import { api, type League, type Team, type PredictResponse } from '../lib/api'
import { usePrediction, type ModelKey } from '../context/PredictionContext'
import { useAuth } from '../context/AuthContext'
import AuthModal from '../components/AuthModal'

// ─── Types ────────────────────────────────────────────────────────────────────
type EnrichedTeam = Team & { league: League }

// ─── Colors ──────────────────────────────────────────────────────────────────
const HOME_BG        = '#091524'
const AWAY_BG        = '#190909'
const HOME_LABEL     = 'rgba(77, 147, 248, 0.65)'
const AWAY_LABEL     = 'rgba(243, 90, 90, 0.65)'
const LABEL_PRIMARY  = 'rgba(255,255,255,0.7)'
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

  const transition = 'width 760ms cubic-bezier(0.65,0,0.35,1), height 760ms cubic-bezier(0.65,0,0.35,1)'

  // El escudo arranca en el tamaño grande (108) y anima hasta su size objetivo en
  // el siguiente frame. Así el segundo equipo —que se monta cuando teamsReady ya es
  // true (size=72)— entra grande y encoge igual que el primero, en lugar de aparecer
  // pequeño de golpe. El primer equipo cambia de prop y transiciona como siempre.
  const [displaySize, setDisplaySize] = useState(() => Math.max(size, 108))
  useEffect(() => {
    const id = requestAnimationFrame(() => setDisplaySize(size))
    return () => cancelAnimationFrame(id)
  }, [size])

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        width={displaySize}
        height={displaySize}
        onError={() => setFailed(true)}
        style={{ objectFit: 'contain', display: 'block', width: displaySize, height: displaySize, transition }}
      />
    )
  }

  return (
    <div style={{
      width: displaySize, height: displaySize,
      borderRadius: 8,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: displaySize * 0.28, fontWeight: 600,
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

  // Centrado bajo el contenido visible del trigger (círculo/label), no bajo el
  // borde del botón — que ocupa el 100% de su mitad y dejaría el panel descolgado.
  const anchorCenter = anchorRect.left + anchorRect.width / 2
  const left = Math.max(16, Math.min(anchorCenter - PW / 2, VW - PW - 16))

  // La card se acota al hueco disponible (abajo o arriba) y la lista scrollea
  // dentro — así nunca se corta por el borde de la pantalla.
  const M = 16   // margen al borde del viewport
  const GAP = 10 // separación al ancla
  // Emerge desde el círculo (≈140px de alto), no desde el final del botón —
  // así la card sale del slot pulsado en vez de quedar descolgada bajo el label.
  const originBelowY = Math.min(anchorRect.top + 150, anchorRect.bottom)
  const spaceBelow = VH - originBelowY - GAP - M
  const spaceAbove = anchorRect.top - GAP - M
  const openBelow = spaceBelow >= 280 || spaceBelow >= spaceAbove
  const panelMaxH = Math.max(220, Math.min(520, openBelow ? spaceBelow : spaceAbove))
  const top = openBelow
    ? originBelowY + GAP
    : Math.max(M, anchorRect.top - GAP - panelMaxH)

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={side === 'home' ? 'Seleccionar equipo local' : 'Seleccionar equipo visitante'}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{
        position: 'fixed', top, left, width: PW, zIndex: 1000,
        maxHeight: panelMaxH,
        display: 'flex', flexDirection: 'column',
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
                  border: `1px solid ${isActive ? 'oklch(0.63 0.21 272 / 0.6)' : isFocused ? 'oklch(0.63 0.21 272 / 0.45)' : '#2a2a2a'}`,
                  background: isActive ? 'oklch(0.63 0.21 272 / 0.1)' : 'transparent',
                  color: isActive ? '#a5b4fc' : isFocused ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.42)',
                  boxShadow: isActive ? '0 0 0 2px oklch(0.63 0.21 272 / 0.18), inset 0 0 12px oklch(0.63 0.21 272 / 0.06)' : 'none',
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
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}>
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
                      ? 'oklch(0.63 0.21 272 / 0.10)'
                      : isSel ? 'oklch(0.63 0.21 272 / 0.08)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', transition: 'background 60ms',
                    outline: isFocused ? '1px solid oklch(0.63 0.21 272 / 0.3)' : 'none',
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
  const { isAuthenticated, token } = useAuth()

  const [home,         setHome]         = useState<EnrichedTeam | null>(null)
  const [away,         setAway]         = useState<EnrichedTeam | null>(null)
  const [hoveredSide,  setHoveredSide]  = useState<'home' | 'away' | null>(null)
  const [model,        setModel]        = useState<ModelKey | null>(null)
  // Qué modelo custom está seleccionado (model === 'custom' apunta a este id)
  const [customModelId, setCustomModelId] = useState<number | null>(null)
  const [authOpen,     setAuthOpen]     = useState(false)
  const [odds,         setOdds]         = useState({ psch: '', pscd: '', psca: '' })
  const [touchedOdds, setTouchedOdds]  = useState({ psch: false, pscd: false, psca: false })
  const [focusedOdd,  setFocusedOdd]   = useState<keyof typeof odds | null>(null)
  const [isDeselecting, setIsDeselecting] = useState(false)
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
    // La card empieza a volver a reposo bastante antes (220ms) de que el popover
    // termine de irse (360ms), para que no haya pausa entre ambos gestos. El botón
    // Predecir no participa: reaparece directamente deshabilitado (ver canClick).
    if (deselect) {
      setTimeout(() => {
        setModel(null)
        setCustomModelId(null)
        setIsDeselecting(true)
        setTimeout(() => setIsDeselecting(false), 1000)
      }, 220)
    }
    setTimeout(() => {
      setShowOddsPopover(false)
      setIsOddsClosing(false)
      setTouchedOdds({ psch: false, pscd: false, psca: false })
      if (deselect) setOdds({ psch: '', pscd: '', psca: '' })
    }, 360)
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

  // Modelos custom del usuario — solo con sesión; al loguear, refresca la columna Studio en sitio
  const { data: modelsData } = useQuery({
    queryKey: ['models', token],
    queryFn: () => api.models(token ?? undefined),
    enabled: isAuthenticated,
  })
  const customModels = modelsData?.custom ?? []
  const selectedCustom = customModelId != null
    ? customModels.find(m => m.id === customModelId) ?? null
    : null
  // El modelo (preset Market o custom con prob_diff_market) necesita cuotas Pinnacle
  const requiresMarketOdds =
    model === 'market' ||
    (model === 'custom' && !!selectedCustom?.features.includes('prob_diff_market'))

  // Si se cierra sesión con un modelo custom seleccionado, se deselecciona
  useEffect(() => {
    if (!isAuthenticated && model === 'custom') {
      setModel(null)
      setCustomModelId(null)
    }
  }, [isAuthenticated, model])

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
    if (!home || !away || !model) return
    if (model === 'custom' && customModelId == null) return
    // Modelos con señal de mercado piden las cuotas antes de predecir
    if (requiresMarketOdds && !oddsValid) {
      setShowOddsPopover(true)
      setIsOddsEntering(true)
      requestAnimationFrame(() => setIsOddsEntering(false))
      return
    }
    const marketOdds = {
      psch: parseOdd(odds.psch),
      pscd: parseOdd(odds.pscd),
      psca: parseOdd(odds.psca),
    }
    setIsPredicting(true)
    try {
      let result: PredictResponse
      if (model === 'custom') {
        if (!token) { setIsPredicting(false); setAuthOpen(true); return }
        result = await api.predictCustom({
          home_team_id: home.id,
          away_team_id: away.id,
          model_id: customModelId!,
          ...(requiresMarketOdds && marketOdds),
        }, token)
      } else {
        const pretrainedModel = model as 'baseline' | 'extended' | 'market'
        result = await api.predict({
          home_team_id: home.id,
          away_team_id: away.id,
          model: pretrainedModel,
          ...(pretrainedModel === 'market' && marketOdds),
        })
      }
      const id      = `${home.id}-${away.id}-${model}-${Date.now()}`
      const predData = {
        id, result, home, away, league: home.league, model,
        ...(requiresMarketOdds && { odds: marketOdds }),
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

  // Durante el retorno a reposo tras "No tengo cuotas", las cards usan una transición
  // larga y gentil; en uso normal (hover/selección) mantienen su duración ágil.
  const cardBgTransition = isDeselecting
    ? 'background 800ms var(--ease-out), border-color 800ms var(--ease-out)'
    : 'background 300ms var(--ease-out), border-color 300ms var(--ease-out)'
  const cardColorTransition = isDeselecting
    ? 'color 800ms var(--ease-out)'
    : 'color 300ms var(--ease-out)'
  // El botón Predecir no se anima al cerrar el popover: queda quieto y disabled.
  // La transición solo cubre hover en uso normal.
  const predictBtnTransition =
    'background 180ms var(--ease-out), border-color 300ms var(--ease-out), color 300ms var(--ease-out)'

  // ── Entrada del contenido de modelos ─────────────────────────────────────
  // Un solo gesto: todo entra junto, suave, montado sobre la apertura de la
  // sección. Sin cascada por elemento — es una pantalla de uso repetido y la
  // coreografía escalonada estorbaría al pulsar "Predecir" una y otra vez.
  // El parámetro order se mantiene por firma pero ya no escalona.
  const REVEAL_EASE = 'cubic-bezier(0.33, 0, 0.2, 1)'
  const reveal = (_order: number): React.CSSProperties => {
    const delay = teamsReady ? 200 : 0
    return {
      opacity: teamsReady ? 1 : 0,
      transform: teamsReady ? 'none' : 'translateY(12px)',
      transition:
        `opacity 520ms ${REVEAL_EASE} ${delay}ms, transform 520ms ${REVEAL_EASE} ${delay}ms`,
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: '100svh', marginTop: -60,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: '#0a0a0c',
    }}>
      <title>PitchLens — Predicción de resultados</title>

      {/* ── Hero — ocupa todo hasta elegir equipos ───────────────────── */}
      <div style={{
        height: teamsReady ? '44svh' : '100svh',
        flexShrink: 0, position: 'relative', overflow: 'hidden', background: '#28282d',
        transition: 'height 760ms cubic-bezier(0.65, 0, 0.35, 1)',
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
          style={{ position: 'absolute', left: '5%', right: '53%', top: '50%', transform: 'translateY(-50%)', textAlign: 'center' }}
        >
          <button
            ref={homeButtonRef}
            type="button"
            onClick={() => hoveredSide === 'home' && home ? setHome(null) : handleOpenDropdown('home')}
            onMouseEnter={() => setHoveredSide('home')}
            onMouseLeave={() => setHoveredSide(null)}
            aria-haspopup="dialog"
            aria-expanded={openSide === 'home'}
            aria-label={home ? 'Cambiar o quitar equipo local' : 'Seleccionar equipo local'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, fontFamily: 'var(--font-sans)',
              textAlign: home ? 'left' : 'center', display: 'inline-block', width: 'auto', maxWidth: '100%',
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
          style={{ position: 'absolute', left: '53%', right: '5%', top: '50%', transform: 'translateY(-50%)', textAlign: 'center' }}
        >
          <button
            ref={awayButtonRef}
            type="button"
            onClick={() => hoveredSide === 'away' && away ? setAway(null) : handleOpenDropdown('away')}
            onMouseEnter={() => setHoveredSide('away')}
            onMouseLeave={() => setHoveredSide(null)}
            aria-haspopup="dialog"
            aria-expanded={openSide === 'away'}
            aria-label={away ? 'Cambiar o quitar equipo visitante' : 'Seleccionar equipo visitante'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, fontFamily: 'var(--font-sans)',
              textAlign: away ? 'right' : 'center', display: 'inline-block', width: 'auto', maxWidth: '100%',
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
      {/* flex:1 absorbe el espacio que cede el hero — la altura la anima la
          misma transición del hero (560ms), así el reveal va perfectamente
          sincronizado en vez del clásico salto del max-height. */}
      <div style={{
        flex: 1, minHeight: 0,
        background: '#0a0a0c', borderTop: '1px solid #1e1e1e', position: 'relative',
        opacity: teamsReady ? 1 : 0,
        overflow: 'hidden',
        // Fundido rápido del panel (borde/fondo); la entrada visible la hacen
        // los hijos en cascada, no este contenedor — así no aparece todo de golpe.
        transition: `opacity 200ms ease-out ${teamsReady ? '120ms' : '0ms'}`,
      }}>
        <div className="model-section-inner">

          {/* ── Two equal columns ────────────────────────────────────── */}
          <div className="model-cols">

          {/* ── Left: Preentrenados ──────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="model-header" style={{
              margin: 0,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: LABEL_PRIMARY,
              marginBottom: 18,
              ...reveal(0),
            }}>
              Modelos preentrenados
            </h2>
            <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              {PRESET_MODELS.map((m, idx) => {
                const isActive = model === m.key
                // Atenuado solo cuando OTRO modelo está seleccionado; en reposo, legible
                const dimmed = model !== null && !isActive
                // Card sutil: reposo apenas perceptible, seleccionado claramente más fuerte
                const cardBg     = isActive ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)'
                const cardBorder = isActive ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'
                const rv = reveal(idx + 1)
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
                      padding: '12px 15px', borderRadius: 10,
                      background: cardBg,
                      border: `1px solid ${cardBorder}`,
                      cursor: 'pointer',
                      opacity: rv.opacity, transform: rv.transform,
                      transition: `${cardBgTransition}, ${rv.transition}`,
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' } }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = cardBg; e.currentTarget.style.borderColor = cardBorder } }}
                  >
                    {/* Line 1: marcador + name + accuracy */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <span aria-hidden="true" style={{
                          fontSize: '1.15rem', lineHeight: 1, flexShrink: 0,
                          fontWeight: isActive ? 700 : 400,
                          color: isActive ? '#e8e8e8' : dimmed ? '#3a3a3a' : 'rgba(255,255,255,0.45)',
                          transition: cardColorTransition,
                        }}>›</span>
                        <span style={{
                          fontSize: '1.25rem', fontWeight: isActive ? 600 : 400,
                          color: isActive ? '#e8e8e8' : dimmed ? '#666' : 'rgba(255,255,255,0.82)',
                          minWidth: 0, transition: cardColorTransition,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {m.label}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '1.0625rem', fontWeight: isActive ? 700 : 600,
                        color: isActive ? 'rgba(255,255,255,0.78)' : dimmed ? '#3a3a3a' : 'rgba(255,255,255,0.6)',
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                        transition: cardColorTransition,
                      }}>
                        {m.acc}
                      </span>
                    </div>
                    {/* Line 2: description */}
                    <div style={{
                      marginTop: 6,
                      fontSize: '1.0625rem',
                      color: isActive ? 'rgba(255,255,255,0.38)' : dimmed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.34)',
                      transition: cardColorTransition, lineHeight: 1.5,
                    }}>
                      {m.desc}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="model-divider" style={{
            width: 0,
            borderLeft: '1px dashed rgba(255,255,255,0.12)',
            margin: '0 36px', alignSelf: 'stretch', flexShrink: 0,
            ...reveal(1),
          }} />

          {/* ── Right: Studio ────────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column' }}>
            <h2 className="model-header" style={{
              margin: 0,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: LABEL_PRIMARY,
              marginBottom: 18,
              ...reveal(0),
            }}>
              Studio
            </h2>

            {!isAuthenticated ? (
              /* Estado A — sin sesión: atajo a login en el sitio, sin salir del flujo */
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 16,
                  width: '100%', textAlign: 'center', padding: '24px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  opacity: reveal(1).opacity, transform: reveal(1).transform,
                  transition: `background 220ms, border-color 220ms, ${reveal(1).transition}`,
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Lock size={20} aria-hidden="true" style={{ color: '#888' }} />
                </div>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 500, color: 'rgba(255,255,255,0.82)', marginBottom: 7 }}>
                    Mis modelos
                  </div>
                  <div style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.34)', lineHeight: 1.5, maxWidth: 300 }}>
                    Inicia sesión para usar tus modelos entrenados
                  </div>
                </div>
              </button>
            ) : customModels.length === 0 ? (
              /* Estado B — con sesión, sin modelos: invita a crear el primero */
              <button
                type="button"
                onClick={() => navigate('/studio/new')}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 16,
                  width: '100%', textAlign: 'center', padding: '24px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  opacity: reveal(1).opacity, transform: reveal(1).transform,
                  transition: `background 220ms, border-color 220ms, ${reveal(1).transition}`,
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
              >
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 500, color: 'rgba(255,255,255,0.82)', marginBottom: 7 }}>
                    Aún no tienes modelos
                  </div>
                  <div style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.34)', lineHeight: 1.5, maxWidth: 300 }}>
                    Crea el tuyo eligiendo features y algoritmo
                  </div>
                </div>
              </button>
            ) : (
              /* Estado C — con sesión y modelos: seleccionables como los preentrenados.
                 maxHeight ≈ 3 tarjetas (como preentrenados); a partir de ahí scroll interno */
              <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 15, maxHeight: 282, overflowY: 'auto', ...reveal(1) }}>
                {customModels.map(m => {
                  const isActive = model === 'custom' && customModelId === m.id
                  const dimmed = model !== null && !isActive
                  const cardBg     = isActive ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)'
                  const cardBorder = isActive ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'
                  const acc = m.test_accuracy != null ? `${(m.test_accuracy * 100).toFixed(1)}%` : '—'
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => { setModel('custom'); setCustomModelId(m.id) }}
                      style={{
                        display: 'flex', flexDirection: 'column',
                        width: '100%', textAlign: 'left',
                        padding: '12px 15px', borderRadius: 10,
                        background: cardBg,
                        border: `1px solid ${cardBorder}`,
                        cursor: 'pointer',
                        transition: cardBgTransition,
                        fontFamily: 'var(--font-sans)',
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = cardBg; e.currentTarget.style.borderColor = cardBorder } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <span aria-hidden="true" style={{
                            fontSize: '1.15rem', lineHeight: 1, flexShrink: 0,
                            fontWeight: isActive ? 700 : 400,
                            color: isActive ? '#e8e8e8' : dimmed ? '#3a3a3a' : 'rgba(255,255,255,0.45)',
                            transition: cardColorTransition,
                          }}>›</span>
                          <span style={{
                            fontSize: '1.25rem', fontWeight: isActive ? 600 : 400,
                            color: isActive ? '#e8e8e8' : dimmed ? '#666' : 'rgba(255,255,255,0.82)',
                            minWidth: 0, transition: cardColorTransition,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {m.name}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '1.0625rem', fontWeight: 500,
                          color: isActive ? 'rgba(255,255,255,0.78)' : dimmed ? '#3a3a3a' : 'rgba(255,255,255,0.6)',
                          fontFamily: 'var(--font-mono)',
                          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                          transition: cardColorTransition,
                        }}>
                          {acc}
                        </span>
                      </div>
                      <div style={{
                        marginTop: 6,
                        fontSize: '1.0625rem',
                        color: isActive ? 'rgba(255,255,255,0.38)' : dimmed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.34)',
                        transition: cardColorTransition, lineHeight: 1.5,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.description?.trim()
                          ? m.description
                          : `${m.algorithm.toUpperCase()} · ${m.features.length} features`}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          </div>{/* end two columns */}

          {/* ── Predict row ──────────────────────────────────────────── */}
          {(() => {
            // En cuanto se abre el popover de cuotas, Predecir se considera deshabilitado:
            // así reaparece tras cerrarlo ya en estado disabled, sin animarse de habilitado.
            const canClick = !!home && !!away && !!model && (model !== 'custom' || customModelId != null) && !isPredicting && !showOddsPopover
            return (
              <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 45, position: 'relative', ...reveal(4) }}>


                  <button
                    type="button"
                    onClick={handlePredict}
                    disabled={!canClick || showOddsPopover}
                    style={{
                      // No se anima: queda quieto y deshabilitado mientras el popover está
                      // abierto (tapado por el velo). Al levantarse el velo, ya está disabled.
                      pointerEvents: showOddsPopover ? 'none' : 'auto',
                      width: '30%',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      padding: '13px 28px', borderRadius: 6,
                      fontSize: '1rem', fontWeight: 500,
                      fontFamily: 'var(--font-sans)',
                      cursor: canClick ? 'pointer' : 'not-allowed',
                      transition: predictBtnTransition,
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
              </>
            )
          })()}
          {/* end predict row */}

        </div>

        {/* ── Odds overlay — cubre solo la sección de modelos ────────── */}
        {showOddsPopover && (
          <div
            style={{
              position: 'absolute', inset: 0,
              // El velo (backdrop) se anima por separado de la card y más lento, para
              // que la card salga primero y el velo revele el estado ya limpio al final.
              background: isOddsClosing || isOddsEntering ? 'rgba(10,10,12,0)' : 'rgba(10,10,12,0.88)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 50,
              transition: 'background 340ms var(--ease-out)',
            }}
          >
            <div
              ref={oddsPopoverRef}
              onMouseDown={e => e.stopPropagation()}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 14,
                boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 4px 16px rgba(0,0,0,0.5)',
                padding: '24px 28px',
                width: 'min(580px, calc(100vw - 32px))',
                display: 'flex', flexDirection: 'column', gap: 20,
                fontFamily: 'var(--font-sans)',
                opacity: isOddsClosing || isOddsEntering ? 0 : 1,
                transform: isOddsClosing
                  ? 'translateY(8px) scale(0.98)'
                  : isOddsEntering ? 'translateY(6px) scale(0.985)' : 'translateY(0) scale(1)',
                transition: 'opacity 300ms var(--ease-out), transform 340ms var(--ease-out)',
              }}
            >
              {/* Título + subtítulo */}
              <div>
                <div style={{ fontSize: '1.1875rem', fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '-0.01em', marginBottom: 5 }}>
                  Cuotas de cierre Pinnacle
                </div>
                <div style={{ fontSize: '0.9375rem', color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>
                  Este modelo requiere estas cuotas para incorporar la señal del mercado
                </div>
              </div>

              {/* Inputs */}
              <div style={{ display: 'flex', gap: 12 }}>
                {([
                  { key: 'psch' as const, label: 'Local'     },
                  { key: 'pscd' as const, label: 'Empate'    },
                  { key: 'psca' as const, label: 'Visitante' },
                ] as { key: keyof typeof odds; label: string }[]).map(({ key, label }) => {
                  const n = parseOdd(odds[key])
                  const focused = focusedOdd === key
                  // El error solo aparece al perder el foco: mientras el campo está enfocado
                  // el usuario puede seguir tecleando (p. ej. 1 → 1,5). Si sale del campo con
                  // la cuota en ≤ 1, entonces sí avisa.
                  const invalid = touchedOdds[key] && !focused && odds[key] !== '' && (isNaN(n) || n <= 1)
                  const borderColor = invalid ? 'var(--color-error)' : focused ? 'var(--color-ink-faint)' : 'var(--color-border)'
                  return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 600,
                      letterSpacing: '0.09em', textTransform: 'uppercase',
                      color: 'var(--color-ink-muted)',
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
                      aria-invalid={invalid}
                      autoFocus={key === 'psch'}
                      style={{
                        width: '100%', fontSize: '1.375rem', textAlign: 'center',
                        padding: '12px 10px', borderRadius: 8,
                        background: 'var(--color-bg)',
                        border: `1px solid ${borderColor}`,
                        color: 'var(--color-ink)', fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums', outline: 'none',
                        transition: 'border-color 120ms',
                      }}
                      onFocus={() => setFocusedOdd(key)}
                      onBlur={() => {
                        setFocusedOdd(null)
                        setTouchedOdds(p => ({ ...p, [key]: true }))
                      }}
                    />
                    {invalid && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-error)', lineHeight: 1.3 }}>
                        Debe ser &gt; 1
                      </span>
                    )}
                  </div>
                  )
                })}
              </div>

              {/* Hint global — la suma de probabilidades implícitas debe ser ≥ 100%.
                  La validación por campo (cuota ≤ 1) se muestra bajo cada input. */}
              {oddsFilled && !oddsValid && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-error)', lineHeight: 1.5 }}>
                  La suma de probabilidades implícitas es {(impliedSum * 100).toFixed(1)}% — debe ser ≥ 100%.
                </div>
              )}

              {/* Error de API */}
              {predictError && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-error)', lineHeight: 1.5 }}>
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
                  fontSize: '0.8125rem', color: 'var(--color-ink-muted)',
                  fontFamily: 'var(--font-sans)', cursor: 'pointer',
                  textAlign: 'center', width: '100%',
                  transition: cardColorTransition,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-ink)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-muted)' }}
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

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
