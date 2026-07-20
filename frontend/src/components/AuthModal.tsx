import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'

type Tab = 'login' | 'register'

const TABS: { key: Tab; label: string }[] = [
  { key: 'login',    label: 'Iniciar sesión' },
  { key: 'register', label: 'Registrarse' },
]

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 animate-spin"
      style={{ width: size, height: size, borderColor: '#2a2a2a #2a2a2a #2a2a2a #6366f1', flexShrink: 0 }}
      aria-hidden="true"
    />
  )
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#1a1a1c', border: '1px solid #2a2a2a',
  borderRadius: 6, color: '#f0f0f0',
  fontSize: '0.9375rem', fontFamily: 'var(--font-sans)', outline: 'none',
  transition: 'border-color 120ms',
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem', fontWeight: 600,
  letterSpacing: '0.09em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.3)',
}

export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { login, register } = useAuth()
  const [tab,        setTab]        = useState<Tab>('login')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [prevOpen,   setPrevOpen]   = useState(open)
  const emailRef = useRef<HTMLInputElement>(null)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setTab('login')
      setEmail('')
      setPassword('')
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => emailRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const canSubmit = email.trim() !== '' && password !== '' && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    if (tab === 'register' && password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setSubmitting(true)
    try {
      if (tab === 'login') await login(email.trim(), password)
      else await register(email.trim(), password)
      toast.success(tab === 'login' ? `Bienvenido de nuevo, ${email.trim()}` : `Cuenta creada — bienvenido, ${email.trim()}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de autenticación')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(8,8,10,0.72)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'hero-fade-in 0.2s ease-out both',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Autenticación"
        style={{
          width: 'min(400px, calc(100vw - 32px))',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 4px 16px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)' }}>
          {TABS.map(({ key, label }) => {
            const isActive = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  flex: 1, padding: '14px 0 12px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: '0.9375rem', fontWeight: isActive ? 600 : 400,
                  fontFamily: 'var(--font-sans)',
                  color: isActive ? 'var(--color-ink)' : 'var(--color-ink-muted)',
                  borderBottom: `2px solid ${isActive ? 'rgba(255,255,255,0.82)' : 'transparent'}`,
                  marginBottom: -1,
                  transition: 'color var(--duration-fast), border-color var(--duration-fast)',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-ink)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-ink-muted)' }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '24px 28px 28px' }}>
          <div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f0f0f0', marginBottom: 5 }}>
              {tab === 'login' ? 'Accede a tu taller' : 'Crea tu cuenta'}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
              {tab === 'login'
                ? 'Tus modelos entrenados te esperan en el Studio'
                : 'Entrena tus propios modelos y compáralos con los oficiales'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label htmlFor="auth-email" style={LABEL_STYLE}>Email</label>
            <input
              ref={emailRef}
              id="auth-email"
              type="email"
              autoComplete="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={INPUT_STYLE}
              onFocus={e => { e.currentTarget.style.borderColor = '#4a4a4a' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#2a2a2a' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label htmlFor="auth-password" style={LABEL_STYLE}>Contraseña</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              placeholder={tab === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={INPUT_STYLE}
              onFocus={e => { e.currentTarget.style.borderColor = '#4a4a4a' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#2a2a2a' }}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px', borderRadius: 8, marginTop: 4,
              fontSize: '0.9375rem', fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 120ms, border-color 120ms, color 120ms',
              ...(canSubmit
                ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.62)' }
                : { background: 'transparent', color: '#333', border: '1px solid #222' }
              ),
            }}
            onMouseEnter={e => { if (canSubmit) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.75)'; e.currentTarget.style.color = '#fff' } }}
            onMouseLeave={e => { if (canSubmit) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.62)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' } }}
          >
            {submitting
              ? <><Spinner /> {tab === 'login' ? 'Entrando...' : 'Creando cuenta...'}</>
              : tab === 'login' ? 'Entrar' : 'Crear cuenta'
            }
          </button>
        </form>
      </div>
    </div>,
    document.body
  )
}
