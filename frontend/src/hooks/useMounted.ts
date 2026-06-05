import { useEffect, useState } from 'react'

/**
 * Devuelve false en el primer render y true tras montar (doble rAF), para
 * disparar transiciones CSS de entrada (p. ej. barras que crecen su width).
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}
