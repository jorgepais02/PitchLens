/**
 * Descarta los eventos de hover en dispositivos sin puntero.
 *
 * Al tocar la pantalla, iOS y Android emulan un `mouseover` justo antes del
 * `click`, pero no mandan nunca el `mouseout` de salida: no hay puntero que se
 * vaya a ningún sitio. La app pinta buena parte de sus estados de hover
 * mutando el nodo (`e.currentTarget.style.background = ...`), y React no
 * deshace esas mutaciones al volver a renderizar, así que el último elemento
 * tocado se quedaba encendido hasta que el usuario tocaba otra cosa — parecía
 * que seguía pulsado.
 *
 * Se cortan en fase de captura sobre `document`, antes de que lleguen al nodo
 * raíz donde React tiene sus escuchas delegadas, y solo mientras el dispositivo
 * no tenga hover de verdad (un portátil con pantalla táctil sí lo tiene, y ahí
 * el hover debe seguir funcionando). Solo se filtran `mouseover`/`mouseout`:
 * `mousedown`, `mouseup` y `click` pasan intactos, así que no afecta ni a los
 * botones ni a los cierres por clic fuera.
 *
 * Nada en la app abre o cierra nada al pasar por encima: el hover es
 * únicamente decorativo, de ahí que se pueda ignorar entero.
 */
export function ignorarHoverEmulado(): void {
  const conHover = window.matchMedia('(hover: hover)')

  const cortar = (e: Event) => {
    if (!conHover.matches) e.stopPropagation()
  }

  document.addEventListener('mouseover', cortar, true)
  document.addEventListener('mouseout', cortar, true)
}
