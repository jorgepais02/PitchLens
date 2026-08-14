/**
 * Piezas visuales compartidas por las páginas nuevas (/explore, /studio).
 * Replican el lenguaje de PredictionHero / ContextSection sin modificarlos.
 */
import { useState } from 'react'

export const HOME_C = '#4D93F8'
export const AWAY_C = '#F35A5A'
export const SEP    = 'rgba(255,255,255,0.11)'

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 animate-spin"
      style={{ width: size, height: size, borderColor: '#2a2a2a #2a2a2a #2a2a2a #6366f1', flexShrink: 0 }}
      aria-hidden="true"
    />
  )
}

export function Crest({ url, name, size = 22 }: { url: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()
  if (url && !failed) {
    return (
      <img src={url} alt={name} onError={() => setFailed(true)}
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, flexShrink: 0,
      background: 'rgba(255,255,255,0.08)', borderRadius: 4,
      fontSize: size * 0.32, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
      fontFamily: 'var(--font-sans)',
    }}>{initials}</span>
  )
}
