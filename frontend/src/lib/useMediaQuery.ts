import { useCallback, useSyncExternalStore } from 'react'

/**
 * Suscribe el componente a una media query CSS.
 *
 * La app usa estilos inline (no clases Tailwind responsive), así que los
 * breakpoints que cambian *estructura* — no solo tamaños — se resuelven en JS.
 * Para ajustes puramente visuales, preferir @media en index.css.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** Móvil: una sola columna, layouts apilados. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}

/** Tablet o menor: dos columnas se vuelven una, pero cabe más que en móvil. */
export function useIsNarrow(): boolean {
  return useMediaQuery('(max-width: 1023px)')
}

/**
 * Viewport sin sitio para layouts anclados o de altura fija: móvil en vertical
 * (estrecho) o en horizontal (bajo). Un iPhone tumbado mide 852×393 — ancho de
 * escritorio pero con menos alto que un móvil de gama baja, así que mirar solo
 * el ancho le daba el layout de escritorio y lo rompía.
 */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 767px), (max-height: 560px)')
}
