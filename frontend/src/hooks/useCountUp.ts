import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface CountUpOptions {
  duration?: number
  decimals?: number
  /** Si false, muestra el valor final sin animar. */
  enabled?: boolean
}

/** ease-out-quart — entrada fuerte y decelerada (consistente con --ease-out). */
function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

/**
 * Cuenta hacia un valor con requestAnimationFrame. Motivado: revela la cifra del
 * resultado. Respeta prefers-reduced-motion (salta al valor final).
 */
export function useCountUp(target: number, options: CountUpOptions = {}): number {
  const { duration = 600, decimals = 1, enabled = true } = options
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced || !enabled ? target : 0)
  const frameRef = useRef<number | null>(null)
  const factor = Math.pow(10, decimals)

  useEffect(() => {
    if (reduced || !enabled) {
      setValue(target)
      return
    }
    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(elapsed / duration, 1)
      const current = from + (target - from) * easeOutQuart(t)
      setValue(Math.round(current * factor) / factor)
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [target, duration, factor, reduced, enabled])

  return value
}
