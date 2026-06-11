import { NavLink, useNavigate } from 'react-router-dom'
import { Lock, Plus } from 'lucide-react'
import { usePrediction } from '../context/PredictionContext'

const STATIC_LINKS = [
  { to: '/explore', label: 'Explorar' },
  { to: '/studio',  label: 'Studio'   },
]

export default function Navbar() {
  const navigate = useNavigate()
  const { activePrediction, clearPrediction } = usePrediction()

  const predictionTo = activePrediction ? `/prediction/${activePrediction.id}` : '/new'

  const handleNueva = () => {
    clearPrediction()
    navigate('/new')
  }

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-6 h-12"
      style={{
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'oklch(0.1 0.006 268 / 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Logo */}
      <NavLink
        to="/"
        className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        style={{ color: 'var(--color-ink)', textDecoration: 'none' }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7.5" stroke="var(--color-ink)" strokeWidth="1.2" />
          <path
            d="M9 4.5L11.1 7.5H6.9L9 4.5ZM9 13.5L6.9 10.5H11.1L9 13.5Z"
            fill="var(--color-ink)" opacity="0.7"
          />
          <path
            d="M4.5 9L7.5 6.9V11.1L4.5 9ZM13.5 9L10.5 11.1V6.9L13.5 9Z"
            fill="var(--color-ink)" opacity="0.4"
          />
        </svg>
        Kraken
      </NavLink>

      {/* Nav links */}
      <nav className="flex items-center gap-1" aria-label="Navegación principal">
        {/* Predicción — contextual */}
        <NavLink
          to={predictionTo}
          className={({ isActive }) =>
            ['px-3 py-1.5 text-sm rounded-md transition-colors', 'focus-visible:outline-2'].join(' ')
            + (isActive ? ' font-medium' : '')
          }
          style={({ isActive }) => ({
            color: isActive ? 'var(--color-ink)' : 'var(--color-ink-muted)',
            background: isActive ? 'var(--color-surface)' : 'transparent',
            textDecoration: 'none',
            transitionDuration: 'var(--duration-fast)',
          })}
        >
          Predicción
        </NavLink>

        {STATIC_LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              ['px-3 py-1.5 text-sm rounded-md transition-colors', 'focus-visible:outline-2'].join(' ')
              + (isActive ? ' font-medium' : '')
            }
            style={({ isActive }) => ({
              color: isActive ? 'var(--color-ink)' : 'var(--color-ink-muted)',
              background: isActive ? 'var(--color-surface)' : 'transparent',
              textDecoration: 'none',
              transitionDuration: 'var(--duration-fast)',
            })}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Right: Nueva predicción + Auth */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleNueva}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer"
          style={{
            color: 'var(--color-ink-muted)',
            border: '1px solid var(--color-border-subtle)',
            background: 'transparent',
            fontFamily: 'var(--font-sans)',
            transitionDuration: 'var(--duration-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-ink)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-ink-muted)'
            e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
          }}
        >
          <Plus size={12} />
          Nueva predicción
        </button>

        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer"
          style={{
            color: 'var(--color-ink-muted)',
            border: '1px solid var(--color-border-subtle)',
            background: 'transparent',
            transitionDuration: 'var(--duration-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-ink)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-ink-muted)'
            e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
          }}
        >
          <Lock size={12} />
          Iniciar sesión
        </button>
      </div>
    </header>
  )
}
