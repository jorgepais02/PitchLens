import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Search, ArrowLeftRight, X, Lock } from 'lucide-react'
import { createPortal } from 'react-dom'
import { api, type League, type Team, type PredictResponse } from '../lib/api'
import { usePrediction, type ModelKey } from '../context/PredictionContext'
import { useAuth } from '../context/AuthContext'
import { useIsMobile, useIsCompact } from '../lib/useMediaQuery'
import { useThemeColor } from '../lib/useThemeColor'
import AuthModal from '../components/AuthModal'

type EnrichedTeam = Team & { league: League }

const HOME_BG        = '#091524'
const AWAY_BG        = '#190909'
const HOME_LABEL     = 'rgba(77, 147, 248, 0.65)'
const AWAY_LABEL     = 'rgba(243, 90, 90, 0.65)'
const LABEL_PRIMARY  = 'rgba(255,255,255,0.7)'
const LABEL_SECONDARY = 'rgba(255,255,255,0.22)'

const PRESET_MODELS: { key: ModelKey; label: string; desc: string; acc: string }[] = [
  { key: 'baseline', label: 'Baseline', acc: '53.8%', desc: 'ELO histórico · puntos en temporada · historial H2H' },
  { key: 'extended', label: 'Extended', acc: '54.7%', desc: 'Baseline + xG generado/encajado · tiros a puerta · descanso' },
  { key: 'market',   label: 'Market',   acc: '57.3%', desc: 'Extended + probabilidad implícita de cierre Pinnacle' },
]

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 animate-spin"
      style={{ width: size, height: size, borderColor: '#2a2a2a #2a2a2a #2a2a2a #6366f1', flexShrink: 0 }}
      aria-hidden="true"
    />
  )
}

function TeamCrest({ url, name, size }: { url: string | null; name: string; size: number }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()

  const transition = 'width 760ms cubic-bezier(0.65,0,0.35,1), height 760ms cubic-bezier(0.65,0,0.35,1)'

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


/**
 * Alto y desplazamiento del viewport *visual* — el que encoge el teclado en iOS.
 * `window.innerHeight` no cambia al abrirse el teclado, así que posicionar con él
 * deja media hoja de selección debajo de las teclas.
 */
function useVisualViewport(): { height: number; offsetTop: number } {
  const [vv, setVv] = useState(() => ({
    height: typeof window !== 'undefined'
      ? (window.visualViewport?.height ?? window.innerHeight)
      : 0,
    offsetTop: 0,
  }))

  useEffect(() => {
    const target = window.visualViewport
    if (!target) return
    const update = () => setVv({ height: target.height, offsetTop: target.offsetTop })
    update()
    target.addEventListener('resize', update)
    target.addEventListener('scroll', update)
    return () => {
      target.removeEventListener('resize', update)
      target.removeEventListener('scroll', update)
    }
  }, [])

  return vv
}

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

  const isCompact = useIsCompact()
  const vv        = useVisualViewport()

  useEffect(() => {
    // En táctil no se autoenfoca: abriría el teclado tapando la lista antes de que
    // el usuario haya podido verla, y la mayoría elige de la lista sin escribir.
    if (!isCompact) inputRef.current?.focus()
  }, [isCompact])

  useEffect(() => {
    // pointerdown y no mousedown: en iOS los eventos de ratón sintetizados sobre
    // zonas no interactivas son poco fiables y la hoja se quedaba abierta.
    const onOutside = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [onClose])

  useEffect(() => {
    // A nivel de documento y no del panel: sin autofoco (móvil) no hay nada
    // enfocado dentro del diálogo y el handler local nunca recibiría la tecla.
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
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

  useEffect(() => {
    setFocusedIdx(-1)
    if (query) setFocusZone('input')
  }, [query])

  const moveFocusToInput = () => {
    skipInputFocus.current = true
    setFocusZone('input')
    inputRef.current?.focus()
    skipInputFocus.current = false
  }

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
      e.preventDefault()
      moveFocusToInput()
    }
  }


  // En escritorio el panel se ancla al escudo pulsado. En móvil no: anclarlo hacía
  // que el local se abriera hacia abajo y el visitante hacia arriba (tapando la
  // navbar), y con el teclado abierto la mitad quedaba fuera de pantalla. Ahí se
  // convierte en una hoja de posición fija — siempre el mismo sitio, abra el lado
  // que abra — dimensionada sobre el viewport visual para respetar el teclado.
  let panelStyle: React.CSSProperties

  if (isCompact) {
    const M = 12
    panelStyle = {
      position: 'fixed', zIndex: 1000,
      top: `calc(${vv.offsetTop + M}px + env(safe-area-inset-top))`,
      // left+right+margin auto centra la hoja cuando maxWidth la limita: en
      // horizontal, a ancho completo, la lista quedaría de 828px.
      left: M, right: M, width: 'auto', maxWidth: 420, marginInline: 'auto',
      maxHeight: `calc(${vv.height - M * 2}px - env(safe-area-inset-top))`,
      borderRadius: 14,
    }
  } else {
    const PW = 316
    const VW = window.innerWidth
    const VH = window.innerHeight

    const anchorCenter = anchorRect.left + anchorRect.width / 2
    const left = Math.max(16, Math.min(anchorCenter - PW / 2, VW - PW - 16))

    const M = 16   // margen al borde del viewport
    const GAP = 10 // separación al ancla
    const originBelowY = Math.min(anchorRect.top + 150, anchorRect.bottom)
    const spaceBelow = VH - originBelowY - GAP - M
    const spaceAbove = anchorRect.top - GAP - M
    const openBelow = spaceBelow >= 280 || spaceBelow >= spaceAbove
    const panelMaxH = Math.max(220, Math.min(520, openBelow ? spaceBelow : spaceAbove))
    const top = openBelow
      ? originBelowY + GAP
      : Math.max(M, anchorRect.top - GAP - panelMaxH)

    panelStyle = {
      position: 'fixed', top, left, width: PW, zIndex: 1000,
      maxHeight: panelMaxH,
      borderRadius: 10,
    }
  }

  return createPortal(
    <>
    {isCompact && (
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', left: 0, width: '100%',
          top: vv.offsetTop, height: vv.height, zIndex: 999,
          background: 'rgba(6,6,8,0.62)',
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          animation: 'hero-fade-in 0.18s ease-out both',
        }}
      />
    )}
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={isCompact || undefined}
      aria-label={side === 'home' ? 'Seleccionar equipo local' : 'Seleccionar equipo visitante'}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{
        ...panelStyle,
        display: 'flex', flexDirection: 'column',
        background: '#111213',
        border: '1px solid #252525',
        boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 4px 16px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: isCompact ? '10px 10px 10px' : '10px 10px 8px',
        borderBottom: '1px solid #1c1c1c',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <Search
            size={isCompact ? 15 : 13}
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
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label="Buscar equipo"
            style={{
              width: '100%', padding: isCompact ? '10px 10px 10px 32px' : '7px 10px 7px 30px',
              background: '#1a1a1c', border: '1px solid #2a2a2a',
              borderRadius: 6, color: '#f0f0f0',
              fontSize: '0.9375rem', fontFamily: 'var(--font-sans)', outline: 'none',
            }}
            onBlur={e => { e.currentTarget.style.borderColor = '#2a2a2a' }}
          />
        </div>
        {isCompact && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar selector de equipo"
            style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid #2a2a2a',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
            }}
          >
            <X size={17} strokeWidth={2} />
          </button>
        )}
      </div>

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
                  padding: isCompact ? '7px 14px' : '3px 10px', borderRadius: 20,
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
                    // 44px de alto mínimo en táctil (objetivo mínimo de iOS).
                    padding: isCompact ? '13px 16px' : '9px 16px', fontSize: '0.9375rem',
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

    </div>
    </>,
    document.body
  )
}

export default function PredictorPage() {
  const navigate           = useNavigate()
  const { setActivePrediction } = usePrediction()
  const { isAuthenticated, token } = useAuth()
  const isMobile = useIsMobile()
  // Móvil tumbado: ancho de escritorio pero sin alto. El hero de altura calculada
  // se aplastaba hasta su suelo de 120px y los escudos se salían sobre la navbar.
  // Con poco alto la página scrollea entera, igual que en vertical.
  const pageScrolls = useIsCompact()

  const [home,         setHome]         = useState<EnrichedTeam | null>(null)
  const [away,         setAway]         = useState<EnrichedTeam | null>(null)
  const [hoveredSide,  setHoveredSide]  = useState<'home' | 'away' | null>(null)
  const [model,        setModel]        = useState<ModelKey | null>(null)
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
  const [panelContentH, setPanelContentH] = useState(0)
  const oddsPopoverRef = useRef<HTMLDivElement>(null)
  const modelInnerRef  = useRef<HTMLDivElement>(null)

  const closeOddsPopover = useCallback((deselect = true) => {
    setIsOddsClosing(true)
    setPredictError(null)
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

  const { data: leagues = [] } = useQuery({
    queryKey: ['leagues'], queryFn: api.leagues,
  })
  const { data: rawTeams = [], isLoading: isLoadingTeams } = useQuery({
    queryKey: ['teams-all'], queryFn: api.allTeams, staleTime: Infinity,
  })

  const { data: modelsData } = useQuery({
    queryKey: ['models', token],
    queryFn: () => api.models(token ?? undefined),
    enabled: isAuthenticated,
  })
  const customModels = modelsData?.custom ?? []
  const selectedCustom = customModelId != null
    ? customModels.find(m => m.id === customModelId) ?? null
    : null
  const requiresMarketOdds =
    model === 'market' ||
    (model === 'custom' && !!selectedCustom?.features.includes('prob_diff_market'))

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

  const awayTeams = allTeams.filter(t =>
    t.id !== home?.id && (!home || t.league.id === home.league.id)
  )
  const homeTeams = allTeams.filter(t =>
    t.id !== away?.id && (!away || t.league.id === away.league.id)
  )

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

  // Sin equipos el hero llega hasta abajo y lo último que se ve es la mitad del
  // visitante (granate); con equipos, el panel de modelos (casi negro). El chrome
  // de Safari se tiñe con esto, así que sigue al color de más abajo o se ve un
  // corte de tono sobre la barra de direcciones.
  useThemeColor(teamsReady ? '#0a0a0c' : AWAY_BG)

  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 0)
  useEffect(() => {
    const el = modelInnerRef.current
    const measure = () => {
      if (el) setPanelContentH(el.scrollHeight)
      setViewportH(window.innerHeight)
    }
    measure()
    const ro = el ? new ResizeObserver(measure) : null
    if (el && ro) ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [isAuthenticated, customModels.length])

  const HERO_FLOOR = 120
  const PANEL_PAD  = 16  // colchón sobre la altura medida del contenido
  const heroPx = teamsReady && panelContentH > 0 && viewportH > 0
    ? Math.max(HERO_FLOOR, Math.min(0.44 * viewportH, viewportH - panelContentH - PANEL_PAD))
    : null
  // En móvil el panel apilado no cabe junto al hero: la página scrollea entera
  // en vez de encogerlo hasta romperlo.
  //
  // Sin equipos la página no scrollea, así que el hero puede usar `dvh` y cubrir
  // exactamente el área visible: con `svh` Safari deja una franja del fondo de la
  // página (casi negra) entre el final del hero y su barra inferior.
  const heroHeight = pageScrolls
    ? (!teamsReady ? '100dvh' : (isMobile ? '56svh' : '78svh'))
    : (!teamsReady ? '100svh' : (heroPx != null ? `${Math.round(heroPx)}px` : '44svh'))
  const needsPanelScroll = !pageScrolls && heroPx != null && panelContentH > viewportH - heroPx + 1

  const cardBgTransition = isDeselecting
    ? 'background 800ms var(--ease-out), border-color 800ms var(--ease-out)'
    : 'background 300ms var(--ease-out), border-color 300ms var(--ease-out)'
  const cardColorTransition = isDeselecting
    ? 'color 800ms var(--ease-out)'
    : 'color 300ms var(--ease-out)'
  const predictBtnTransition =
    'background 180ms var(--ease-out), border-color 300ms var(--ease-out), color 300ms var(--ease-out)'

  // El hero se mete bajo la navbar (marginTop -60). En vertical el reparto de
  // las dos mitades debe hacerse sobre el área *visible*, o el escudo del local
  // queda tapado por la navbar en pantallas cortas.
  const band = (fraction: number) => `calc(60px + (100% - 60px) * ${fraction})`

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

  return (
    <div style={{
      ...(pageScrolls
        ? { minHeight: '100dvh', overflow: 'visible' }
        : { height: '100svh', overflow: 'hidden' }),
      marginTop: -60,
      display: 'flex', flexDirection: 'column',
      background: '#0a0a0c',
    }}>
      <title>PitchLens — Predicción de fútbol con ML</title>

      <div style={{
        height: heroHeight,
        flexShrink: 0, position: 'relative', overflow: 'hidden', background: '#28282d',
        transition: 'height 760ms cubic-bezier(0.65, 0, 0.35, 1)',
      }}>

        {/* La diagonal se gira 90º en móvil: local arriba / visitante abajo. */}
        <div style={{
          position: 'absolute', inset: 0,
          background: HOME_BG,
          clipPath: isMobile
            ? `polygon(0 0, 100% 0, 100% calc(${band(0.5)} - 34px), 0 calc(${band(0.5)} + 34px))`
            : 'polygon(0 0, calc(50% + 68px) 0, calc(50% - 68px) 100%, 0 100%)',
        }} />

        <div style={{
          position: 'absolute', inset: 0,
          background: AWAY_BG,
          clipPath: isMobile
            ? `polygon(0 calc(${band(0.5)} + 36px), 100% calc(${band(0.5)} - 36px), 100% 100%, 0 100%)`
            : 'polygon(calc(50% + 70px) 0, 100% 0, 100% 100%, calc(50% - 66px) 100%)',
        }} />

        <div className="hero-side-label" style={{
          position: 'absolute', left: '5%',
          fontSize: '1.25rem', fontWeight: 500,
          letterSpacing: '0.13em', textTransform: 'uppercase',
          color: HOME_LABEL, userSelect: 'none', pointerEvents: 'none',
        }}>
          LOCAL
        </div>

        <div className="hero-side-label hero-side-label--away" style={{
          position: 'absolute', right: '5%',
          fontSize: '1.25rem', fontWeight: 500,
          letterSpacing: '0.13em', textTransform: 'uppercase',
          color: AWAY_LABEL, userSelect: 'none', pointerEvents: 'none',
        }}>
          VISITANTE
        </div>

        <div
          style={isMobile
            ? { position: 'absolute', left: '5%', right: '5%', top: band(0.24), transform: 'translateY(-50%)', textAlign: 'center' }
            : { position: 'absolute', left: '5%', right: '53%', top: '50%', transform: 'translateY(-50%)', textAlign: 'center' }}
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 12 : 20 }}>
                <div style={{ position: 'relative', display: 'inline-block', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    opacity: hoveredSide === 'home' ? 0.35 : 1,
                    transition: 'opacity 150ms var(--ease-out)',
                  }}>
                    <TeamCrest url={home.crest_url} name={home.display_name ?? home.name} size={teamsReady ? (isMobile ? 54 : 72) : (isMobile ? 88 : 108)} />
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 16 : 24 }}>
                <div style={{
                  width: isMobile ? 104 : 140, height: isMobile ? 104 : 140, borderRadius: '50%', flexShrink: 0,
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

          {home && (
            <button
              type="button"
              className="team-touch-remove"
              onClick={() => setHome(null)}
              aria-label="Quitar equipo local"
              style={{
                position: 'absolute', top: 8,
                // A ancho completo, en el borde quedaría desligada del escudo.
                ...(isMobile ? { left: 'calc(50% + 46px)' } : { right: 8 }),
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

        <div
          style={isMobile
            ? { position: 'absolute', left: '5%', right: '5%', top: band(0.78), transform: 'translateY(-50%)', textAlign: 'center' }
            : { position: 'absolute', left: '53%', right: '5%', top: '50%', transform: 'translateY(-50%)', textAlign: 'center' }}
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 12 : 20 }}>
                <div style={{ position: 'relative', display: 'inline-block', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    opacity: hoveredSide === 'away' ? 0.35 : 1,
                    transition: 'opacity 150ms var(--ease-out)',
                  }}>
                    <TeamCrest url={away.crest_url} name={away.display_name ?? away.name} size={teamsReady ? (isMobile ? 54 : 72) : (isMobile ? 88 : 108)} />
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 16 : 24 }}>
                <div style={{
                  width: isMobile ? 104 : 140, height: isMobile ? 104 : 140, borderRadius: '50%', flexShrink: 0,
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

          {away && (
            <button
              type="button"
              className="team-touch-remove"
              onClick={() => setAway(null)}
              aria-label="Quitar equipo visitante"
              style={{
                position: 'absolute', top: 8,
                // En móvil, misma posición que la X del local (a la derecha del
                // escudo): un control que cambia de lado obliga a buscarlo cada vez.
                ...(isMobile ? { left: 'calc(50% + 46px)' } : { left: 8 }),
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

        <div style={{
          position: 'absolute', left: '50%', top: isMobile ? band(0.5) : '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
        }}>
          <div style={{
            width: isMobile ? 52 : 64, height: isMobile ? 52 : 64, borderRadius: '50%',
            background: '#171719',
            border: '1px solid #2a2a2a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}>
            <span style={{
              fontSize: isMobile ? '0.875rem' : '1rem', fontWeight: 600,
              letterSpacing: '0.06em', color: LABEL_SECONDARY,
              userSelect: 'none',
            }}>
              VS
            </span>
          </div>

        </div>

        <button
          type="button"
          onClick={() => { setHome(away); setAway(home) }}
          disabled={!home && !away}
          aria-label="Intercambiar local y visitante"
          style={{
            position: 'absolute',
            // En vertical, debajo del VS pisaría al visitante: se coloca al lado.
            ...(isMobile
              ? { top: band(0.5), left: 'calc(50% + 42px)', transform: 'translateY(-50%)' }
              : { top: 'calc(50% + 48px)', left: '50%', transform: 'translateX(-50%)' }),
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

      <div style={{
        // Oculto en móvil hasta elegir los dos equipos: si no, deja una franja
        // vacía enorme bajo el hero de pantalla completa.
        ...(pageScrolls
          ? { display: teamsReady ? 'block' : 'none', flex: 'none', overflow: 'visible' }
          : { flex: 1, minHeight: 0, overflowX: 'hidden', overflowY: needsPanelScroll ? 'auto' : 'hidden' }),
        background: '#0a0a0c', borderTop: '1px solid #1e1e1e', position: 'relative',
        opacity: teamsReady ? 1 : 0,
        transition: `opacity 200ms ease-out ${teamsReady ? '120ms' : '0ms'}`,
      }}>
        <div className="model-section-inner" ref={modelInnerRef}>

          <div className="model-cols">

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
                const dimmed = model !== null && !isActive
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
                      padding: isMobile ? '11px 13px' : '12px 15px', borderRadius: 10,
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <span aria-hidden="true" style={{
                          fontSize: isMobile ? '1rem' : '1.15rem', lineHeight: 1, flexShrink: 0,
                          fontWeight: isActive ? 700 : 400,
                          color: isActive ? '#e8e8e8' : dimmed ? '#3a3a3a' : 'rgba(255,255,255,0.45)',
                          transition: cardColorTransition,
                        }}>›</span>
                        <span style={{
                          fontSize: isMobile ? '1.0625rem' : '1.25rem', fontWeight: isActive ? 600 : 400,
                          color: isActive ? '#e8e8e8' : dimmed ? '#666' : 'rgba(255,255,255,0.82)',
                          minWidth: 0, transition: cardColorTransition,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {m.label}
                        </span>
                      </div>
                      <span style={{
                        fontSize: isMobile ? '0.9375rem' : '1.0625rem', fontWeight: isActive ? 700 : 600,
                        color: isActive ? 'rgba(255,255,255,0.78)' : dimmed ? '#3a3a3a' : 'rgba(255,255,255,0.6)',
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                        transition: cardColorTransition,
                      }}>
                        {m.acc}
                      </span>
                    </div>
                    <div style={{
                      marginTop: 6,
                      fontSize: isMobile ? '0.8125rem' : '1.0625rem',
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
                        padding: isMobile ? '11px 13px' : '12px 15px', borderRadius: 10,
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
                            fontSize: isMobile ? '1rem' : '1.15rem', lineHeight: 1, flexShrink: 0,
                            fontWeight: isActive ? 700 : 400,
                            color: isActive ? '#e8e8e8' : dimmed ? '#3a3a3a' : 'rgba(255,255,255,0.45)',
                            transition: cardColorTransition,
                          }}>›</span>
                          <span style={{
                            fontSize: isMobile ? '1.0625rem' : '1.25rem', fontWeight: isActive ? 600 : 400,
                            color: isActive ? '#e8e8e8' : dimmed ? '#666' : 'rgba(255,255,255,0.82)',
                            minWidth: 0, transition: cardColorTransition,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {m.name}
                          </span>
                        </div>
                        <span style={{
                          fontSize: isMobile ? '0.9375rem' : '1.0625rem', fontWeight: 500,
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
                        fontSize: isMobile ? '0.8125rem' : '1.0625rem',
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

          </div>

          {(() => {
            const canClick = !!home && !!away && !!model && (model !== 'custom' || customModelId != null) && !isPredicting && !showOddsPopover
            // En móvil el CTA queda muy por debajo del pliegue: se fija abajo.
            // Se oculta con el popover de cuotas abierto, que trae su propio botón.
            const sticky = isMobile && !showOddsPopover
            return (
              <>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: isMobile ? 26 : 45, position: 'relative', ...reveal(4),
                ...(sticky ? {
                  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, marginTop: 0,
                  padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
                  background: 'rgba(10,10,12,0.94)',
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  borderTop: '1px solid #1e1e1e',
                } : null),
              }}>


                  <button
                    type="button"
                    onClick={handlePredict}
                    disabled={!canClick || showOddsPopover}
                    style={{
                      pointerEvents: showOddsPopover ? 'none' : 'auto',
                      width: isMobile ? '100%' : '30%',
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

        </div>

        {showOddsPopover && (
          <div
            style={{
              position: 'absolute', inset: 0,
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
              <div>
                <div style={{ fontSize: '1.1875rem', fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '-0.01em', marginBottom: 5 }}>
                  Cuotas de cierre Pinnacle
                </div>
                <div style={{ fontSize: '0.9375rem', color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>
                  Este modelo requiere estas cuotas para incorporar la señal del mercado
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                {([
                  { key: 'psch' as const, label: 'Local'     },
                  { key: 'pscd' as const, label: 'Empate'    },
                  { key: 'psca' as const, label: 'Visitante' },
                ] as { key: keyof typeof odds; label: string }[]).map(({ key, label }) => {
                  const n = parseOdd(odds[key])
                  const focused = focusedOdd === key
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

              {oddsFilled && !oddsValid && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-error)', lineHeight: 1.5 }}>
                  La suma de probabilidades implícitas es {(impliedSum * 100).toFixed(1)}% — debe ser ≥ 100%.
                </div>
              )}

              {predictError && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-error)', lineHeight: 1.5 }}>
                  {predictError}
                </div>
              )}

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
