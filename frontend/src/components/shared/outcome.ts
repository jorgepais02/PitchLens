/**
 * Mapas de clases por outcome H/D/A. Literales a propósito: el JIT de Tailwind
 * necesita ver las clases completas en el código fuente (no `bg-${token}`).
 * Única fuente de las clases de color de resultado en toda la app.
 */
export type OutcomeToken = 'home' | 'draw' | 'away'

/** Relleno sólido + ink legible encima (badges sólidos, segmento dominante). */
export const OUTCOME_SOLID: Record<OutcomeToken, string> = {
  home: 'bg-home text-home-foreground',
  draw: 'bg-draw text-draw-foreground',
  away: 'bg-away text-away-foreground',
}

/** Chip "soft": fondo tenue + texto del color + borde sutil. */
export const OUTCOME_SOFT: Record<OutcomeToken, string> = {
  home: 'fill-home text-home border border-home/30',
  draw: 'fill-draw text-draw border border-draw/30',
  away: 'fill-away text-away border border-away/30',
}

/** Solo texto del color (cifras grandes sobre fondo oscuro: pasan AA). */
export const OUTCOME_TEXT: Record<OutcomeToken, string> = {
  home: 'text-home',
  draw: 'text-draw',
  away: 'text-away',
}

/** Relleno de barra (segmentos del espectro, importancia). */
export const OUTCOME_BAR: Record<OutcomeToken, string> = {
  home: 'bg-home',
  draw: 'bg-draw',
  away: 'bg-away',
}

/** Track tenue de fondo de barra. */
export const OUTCOME_TRACK: Record<OutcomeToken, string> = {
  home: 'fill-home',
  draw: 'fill-draw',
  away: 'fill-away',
}

/** Borde del color. */
export const OUTCOME_BORDER: Record<OutcomeToken, string> = {
  home: 'border-home',
  draw: 'border-draw',
  away: 'border-away',
}

/** Variable CSS del color (para Recharts y estilos inline). */
export const OUTCOME_VAR: Record<OutcomeToken, string> = {
  home: 'var(--color-home)',
  draw: 'var(--color-draw)',
  away: 'var(--color-away)',
}
