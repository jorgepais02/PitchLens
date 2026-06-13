import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Plus } from 'lucide-react'
import { usePrediction } from '../context/PredictionContext'
import { useAuth } from '../context/AuthContext'
import AuthModal from './AuthModal'

// La altura es fija (48px): PredictorPage calcula su layout como calc(100svh - 48px)
const NAV_H = 48

function NavItem({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <NavLink
      to={to}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center',
        height: NAV_H, padding: '0 14px',
        fontSize: '0.875rem',
        fontWeight: active ? 500 : 400,
        fontFamily: 'var(--font-sans)',
        color: active ? 'var(--color-ink)' : 'var(--color-ink-muted)',
        textDecoration: 'none',
        transition: 'color var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--color-ink)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--color-ink-muted)' }}
    >
      {label}
      {/* Indicador activo — línea a ras del borde inferior del header */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', left: 14, right: 14, bottom: -1, height: 2,
          background: active ? 'rgba(255,255,255,0.82)' : 'transparent',
          borderRadius: 1,
          transition: 'background var(--duration-fast) var(--ease-out)',
        }}
      />
    </NavLink>
  )
}

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { activePrediction, clearPrediction } = usePrediction()
  const { isAuthenticated, email, logout } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)

  const predictionTo = activePrediction ? `/prediction/${activePrediction.id}` : '/new'
  const predictionActive = pathname.startsWith('/new') || pathname.startsWith('/prediction')

  const handleNueva = () => {
    clearPrediction()
    navigate('/new')
  }

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between"
      style={{
        height: NAV_H,
        padding: '0 20px',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'oklch(0.1 0.006 268 / 0.82)',
        backdropFilter: 'blur(14px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
      }}
    >
      {/* Logo */}
      <NavLink
        to="/"
        aria-label="Kraken — inicio"
        className="flex items-center gap-2.5"
        style={{ color: 'var(--color-ink)', textDecoration: 'none', flexShrink: 0 }}
      >
        <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7.5" stroke="var(--color-ink)" strokeWidth="1.3" />
          <path
            d="M9 4.5L11.1 7.5H6.9L9 4.5ZM9 13.5L6.9 10.5H11.1L9 13.5Z"
            fill="var(--color-ink)"
          />
          <path
            d="M4.5 9L7.5 6.9V11.1L4.5 9ZM13.5 9L10.5 11.1V6.9L13.5 9Z"
            fill="var(--color-ink)" opacity="0.55"
          />
        </svg>
        <span style={{
          fontSize: '0.9375rem', fontWeight: 650,
          letterSpacing: '-0.02em', fontFamily: 'var(--font-sans)',
        }}>
          Kraken
        </span>
      </NavLink>

      {/* Nav central — centrado absoluto, independiente de los laterales */}
      <nav
        aria-label="Navegación principal"
        className="flex items-center"
        style={{
          position: 'absolute', left: '50%', top: 0,
          transform: 'translateX(-50%)', height: NAV_H,
        }}
      >
        <NavItem to={predictionTo} label="Predicción" active={predictionActive} />
        <NavItem to="/explore" label="Explorar" active={pathname.startsWith('/explore')} />
        <NavItem to="/studio" label="Studio" active={pathname.startsWith('/studio')} />
      </nav>

      {/* Acciones derecha */}
      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        {isAuthenticated ? (
          <div className="flex items-center" style={{ gap: 10 }}>
            <span
              title={email ?? undefined}
              style={{
                fontSize: '0.75rem', color: 'var(--color-ink-muted)',
                fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em',
                maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {email}
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex items-center justify-center cursor-pointer"
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'transparent', border: 'none',
                color: 'var(--color-ink-faint)',
                transition: 'color var(--duration-fast), background var(--duration-fast)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-ink)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-ink-faint)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="cursor-pointer"
            style={{
              padding: '6px 10px', borderRadius: 6,
              fontSize: '0.8125rem', fontWeight: 400,
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-ink-muted)',
              background: 'transparent', border: 'none',
              transition: 'color var(--duration-fast)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-ink)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-muted)' }}
          >
            Iniciar sesión
          </button>
        )}

        <button
          type="button"
          onClick={handleNueva}
          className="flex items-center gap-1.5 cursor-pointer"
          style={{
            padding: '6px 12px', borderRadius: 6,
            fontSize: '0.8125rem', fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            color: 'rgba(255,255,255,0.9)',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.28)',
            transition: 'background var(--duration-fast), border-color var(--duration-fast), color var(--duration-fast)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
          }}
        >
          <Plus size={13} strokeWidth={2.2} />
          Nueva predicción
        </button>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  )
}
