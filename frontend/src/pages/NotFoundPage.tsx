import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div style={{
      height: 'calc(100svh - 60px)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      <span style={{
        fontSize: 72, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.03em',
        color: 'rgba(255,255,255,0.92)', fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        404
      </span>
      <p style={{ margin: 0, fontSize: 17, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-sans)' }}>
        Página no encontrada.
      </p>
      <button type="button" onClick={() => navigate('/new')} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 18px', borderRadius: 6, fontSize: '0.9375rem',
        fontFamily: 'var(--font-sans)', background: 'transparent',
        color: 'var(--color-ink-muted)', border: '1px solid var(--color-border)', cursor: 'pointer',
      }}>
        <ArrowLeft size={14} /> Volver al inicio
      </button>
    </div>
  )
}
