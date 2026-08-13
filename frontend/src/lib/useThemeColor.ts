import { useEffect } from 'react'

/** Color por defecto del chrome del navegador: el fondo general de la app. */
const DEFAULT_THEME_COLOR = '#0a0a0c'

/**
 * Sincroniza <meta name="theme-color"> con el color que la página pinta en su
 * borde inferior.
 *
 * En iOS con la barra de direcciones abajo, Safari tiñe la franja que rodea a su
 * barra con este valor. Con un color fijo esa franja no casa con pantallas de
 * fondo distinto — el hero granate del predictor, por ejemplo — y se ve un corte
 * de tono justo encima de la barra. Al actualizarlo por vista, la costura
 * desaparece.
 *
 * Restaura el valor por defecto al desmontar para que no se filtre a otra ruta.
 */
export function useThemeColor(color: string | null): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) return

    meta.content = color ?? DEFAULT_THEME_COLOR
    return () => { meta.content = DEFAULT_THEME_COLOR }
  }, [color])
}
