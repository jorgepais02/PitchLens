import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, LogOut, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../lib/useMediaQuery'
import AuthModal from './AuthModal'

const NAV_H = 60
const SEG_H = 38

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase() || '?'
}


function NavItem({ to, label, active, compact }: { to: string; label: string; active: boolean; compact: boolean }) {
  return (
    <NavLink
      to={to}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: compact ? 32 : SEG_H,
        padding: compact ? '0 11px' : '0 clamp(20px, 1.6vw, 34px)',
        borderRadius: 999,
        fontSize: compact ? '0.8125rem' : '0.9375rem',
        fontWeight: active ? 500 : 400,
        fontFamily: 'var(--font-sans)',
        color: active ? 'var(--color-ink)' : 'oklch(0.66 0.012 268)',
        background: active ? 'rgba(255,255,255,0.09)' : 'transparent',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        transition: 'color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--color-ink)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'oklch(0.66 0.012 268)' }}
    >
      {label}
    </NavLink>
  )
}

function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { email, deleteAccount } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, loading, onClose])

  useEffect(() => { if (!open) setError(null) }, [open])

  if (!open) return null

  const handleDelete = async () => {
    setLoading(true)
    setError(null)
    try {
      await deleteAccount()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta')
      setLoading(false)
    }
  }

  return createPortal(
    <div
      onMouseDown={e => { if (e.target === e.currentTarget && !loading) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        background: 'rgba(8,8,10,0.72)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        animation: 'hero-fade-in 0.2s ease-out both',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="del-title"
        style={{
          width: 'min(400px, calc(100vw - 32px))', padding: 24,
          borderRadius: 14,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        <div
          aria-hidden="true"
          className="flex items-center justify-center"
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--color-error-subtle)', color: 'var(--color-error)',
            marginBottom: 14,
          }}
        >
          <Trash2 size={18} />
        </div>
        <h2 id="del-title" style={{
          margin: 0, fontSize: '1.0625rem', fontWeight: 600,
          fontFamily: 'var(--font-sans)', color: 'var(--color-ink)',
          letterSpacing: '-0.01em',
        }}>
          ¿Eliminar tu cuenta?
        </h2>
        <p style={{
          margin: '8px 0 0', fontSize: '0.875rem', lineHeight: 1.55,
          fontFamily: 'var(--font-sans)', color: 'var(--color-ink-muted)',
        }}>
          Se borrarán <strong style={{ color: 'var(--color-ink)', fontWeight: 500 }}>{email}</strong> y
          todos tus modelos entrenados. Esta acción no se puede deshacer.
        </p>

        {error && (
          <p style={{
            margin: '14px 0 0', padding: '8px 10px', borderRadius: 8,
            fontSize: '0.8125rem', lineHeight: 1.4,
            fontFamily: 'var(--font-sans)', color: 'var(--color-error)',
            background: 'var(--color-error-subtle)',
          }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end" style={{ gap: 8, marginTop: 22 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="cursor-pointer"
            style={{
              padding: '8px 14px', borderRadius: 8,
              fontSize: '0.8125rem', fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-ink-muted)',
              background: 'transparent', border: '1px solid var(--color-border)',
              opacity: loading ? 0.5 : 1,
              transition: 'color var(--duration-fast), border-color var(--duration-fast)',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.color = 'var(--color-ink)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-muted)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="cursor-pointer"
            style={{
              padding: '8px 14px', borderRadius: 8,
              fontSize: '0.8125rem', fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              color: '#fff',
              background: 'var(--color-error)', border: '1px solid transparent',
              opacity: loading ? 0.7 : 1,
              transition: 'background var(--duration-fast)',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'oklch(0.6 0.22 25)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-error)' }}
          >
            {loading ? 'Eliminando…' : 'Eliminar cuenta'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function AccountMenu() {
  const { email, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Cuenta"
        aria-haspopup="menu"
        aria-expanded={open}
        title={email ?? undefined}
        className="flex items-center cursor-pointer"
        style={{
          gap: 3, padding: '5px 6px', borderRadius: 8,
          fontFamily: 'var(--font-sans)',
          background: open ? 'rgba(255,255,255,0.06)' : 'transparent',
          border: 'none',
          transition: 'background var(--duration-fast)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{
          fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.01em',
          color: 'var(--color-ink)',
        }}>
          {email ? initialsFromEmail(email) : '?'}
        </span>
        <ChevronDown
          size={13}
          style={{
            color: 'rgba(255,255,255,0.26)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--duration-fast) var(--ease-out)',
          }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            minWidth: 208, padding: 6,
            borderRadius: 10,
            background: 'oklch(0.185 0.007 268)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          <div
            style={{
              padding: '4px 8px 9px',
              borderBottom: '1px solid var(--color-border-subtle)',
              marginBottom: 2,
            }}
          >
            <div style={{
              fontSize: '0.625rem', fontWeight: 600,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-ink-muted)',
              marginBottom: 3,
            }}>
              Conectado como
            </div>
            <div
              title={email ?? undefined}
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-ink)',
                fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {email}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); logout() }}
            className="flex items-center gap-2 cursor-pointer"
            style={{
              padding: '7px 8px', borderRadius: 6,
              fontSize: '0.8125rem', fontWeight: 400, textAlign: 'left',
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-ink-muted)',
              background: 'transparent', border: 'none',
              transition: 'color var(--duration-fast), background var(--duration-fast)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-ink)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-ink-muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <LogOut size={13} />
            Cerrar sesión
          </button>

          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '2px 0' }} />

          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); setConfirmOpen(true) }}
            className="flex items-center gap-2 cursor-pointer"
            style={{
              padding: '7px 8px', borderRadius: 6,
              fontSize: '0.8125rem', fontWeight: 400, textAlign: 'left',
              fontFamily: 'var(--font-sans)',
              color: 'oklch(0.62 0.13 25)',
              background: 'transparent', border: 'none',
              transition: 'color var(--duration-fast), background var(--duration-fast)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-error)'
              e.currentTarget.style.background = 'var(--color-error-subtle)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'oklch(0.62 0.13 25)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Trash2 size={13} />
            Eliminar cuenta
          </button>
        </div>
      )}

      <DeleteAccountModal open={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </div>
  )
}

export default function Navbar() {
  const { pathname } = useLocation()
  const { isAuthenticated } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const predictionTo = '/new'
  const predictionActive = pathname.startsWith('/new') || pathname.startsWith('/prediction')

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-center"
      style={{
        height: NAV_H,
        padding: isMobile ? '0 10px' : scrolled ? '0 24px' : '0',
        background: scrolled ? 'oklch(0.15 0.006 268 / 0.88)' : 'transparent',
        borderBottom: `1px solid ${scrolled ? 'var(--color-border-subtle)' : 'transparent'}`,
        backdropFilter: scrolled ? 'blur(14px) saturate(1.4)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(14px) saturate(1.4)' : 'none',
        transition: 'background 220ms var(--ease-out), border-color 220ms var(--ease-out), padding 220ms var(--ease-out)',
      }}
    >
      <div
        className="flex items-center"
        style={{
          width: scrolled || isMobile ? '100%' : 'auto',
          minWidth: 0,
          justifyContent: scrolled || isMobile ? 'space-between' : 'center',
          gap: scrolled ? 0 : isMobile ? 4 : 8,
          padding: scrolled ? 0 : isMobile ? '4px 8px' : '5px 18px',
          borderRadius: scrolled ? 0 : 999,
          background: scrolled ? 'transparent' : 'oklch(0.215 0.008 268 / 0.72)',
          border: `1px solid ${scrolled ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
          boxShadow: scrolled ? 'none' : '0 6px 22px rgba(0,0,0,0.38)',
          backdropFilter: scrolled ? 'none' : 'blur(14px) saturate(1.4)',
          WebkitBackdropFilter: scrolled ? 'none' : 'blur(14px) saturate(1.4)',
          transition: 'background 220ms var(--ease-out), border-color 220ms var(--ease-out), box-shadow 220ms var(--ease-out), gap 220ms var(--ease-out), padding 220ms var(--ease-out), border-radius 220ms var(--ease-out)',
        }}
      >
        <NavLink
          to="/"
          aria-label="PitchLens — inicio"
          className="flex items-center gap-2.5"
          style={{ color: 'var(--color-ink)', textDecoration: 'none', flexShrink: 0 }}
        >
          <svg width={isMobile ? 26 : 34} height={isMobile ? 26 : 34} viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <rect x="12" y="28" width="76" height="44" rx="14" stroke="#fff" strokeWidth="4" />
            <circle cx="50" cy="50" r="14" stroke="#fff" strokeWidth="3" />
            <line x1="50" y1="28" x2="50" y2="72" stroke="#fff" strokeWidth="2.5" opacity="0.45" />
            <circle cx="50" cy="50" r="4" fill="#fff" />
          </svg>
          {/* En móvil solo el isotipo: el wordmark no cabe junto a los 3 items + sesión. */}
          {!isMobile && (
            <span style={{
              fontSize: '1.0625rem', fontWeight: 650,
              letterSpacing: '-0.02em', fontFamily: 'var(--font-sans)',
            }}>
              PitchLens
            </span>
          )}
        </NavLink>

        <span aria-hidden="true" style={{ display: scrolled || isMobile ? 'none' : 'block', width: 1, height: 24, background: 'rgba(255,255,255,0.19)', margin: '0 3px' }} />

        <nav aria-label="Navegación principal" className="flex items-center" style={{ gap: isMobile ? 1 : 3, minWidth: 0 }}>
          <NavItem to={predictionTo} label="Predicción" active={predictionActive} compact={isMobile} />
          <NavItem to="/explore" label="Explorar" active={pathname.startsWith('/explore')} compact={isMobile} />
          <NavItem to="/studio" label="Studio" active={pathname.startsWith('/studio')} compact={isMobile} />
        </nav>

        <span aria-hidden="true" style={{ display: scrolled || isMobile ? 'none' : 'block', width: 1, height: 24, background: 'rgba(255,255,255,0.19)', margin: '0 3px' }} />

        {isAuthenticated ? (
          <AccountMenu />
        ) : (
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="cursor-pointer"
            style={{
              padding: isMobile ? '6px 6px' : '8px 10px',
              fontSize: isMobile ? '0.8125rem' : '0.9375rem', fontWeight: 400,
              fontFamily: 'var(--font-sans)',
              color: 'oklch(0.66 0.012 268)',
              background: 'transparent', border: 'none',
              whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'color var(--duration-fast)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-ink)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'oklch(0.66 0.012 268)' }}
          >
            {isMobile ? 'Entrar' : 'Iniciar sesión'}
          </button>
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  )
}
