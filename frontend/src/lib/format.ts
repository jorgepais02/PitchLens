/**
 * Helpers de formato (cifras siempre como dato preciso, en español).
 * Las probabilidades llegan 0..1 y se muestran como porcentaje (×100).
 */

/** Probabilidad 0..1 → "57.3 %" (1 decimal por defecto). */
export function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)} %`
}

/** Probabilidad 0..1 → "57.3" (sin símbolo, para componer). */
export function formatPctValue(value: number, decimals = 1): string {
  return (value * 100).toFixed(decimals)
}

/** Número con signo explícito: 1.6 → "+1.6", -0.45 → "-0.45". Útil en features diferenciales. */
export function formatSigned(value: number, decimals = 2): string {
  const fixed = value.toFixed(decimals)
  return value > 0 ? `+${fixed}` : fixed
}

/** Número a N decimales (xG, log loss, cuotas). */
export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals)
}

/** Accuracy 0..1 → "57.3 %"; null → "—". */
export function formatAccuracy(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—'
  return `${(value * 100).toFixed(decimals)} %`
}

/** Log loss → "0.9324"; null → "—". */
export function formatLogLoss(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined) return '—'
  return value.toFixed(decimals)
}

/** Cuota → "1.85"; valores no válidos → "—". */
export function formatOdds(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(2)
}

/** Fecha ISO naive → "19 may 2024". */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/** Fecha ISO naive → "19/05/2024" (denso, tablas). */
export function formatDateShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** Cuota → probabilidad implícita cruda (1/cuota). Para comparación vs mercado. */
export function impliedProb(odd: number): number {
  return odd > 1 ? 1 / odd : 0
}

/**
 * Trío de cuotas H/D/A → probabilidades implícitas normalizadas por overround
 * (suman 1). Modelo Market: comparar la predicción contra el mercado.
 */
export function impliedProbsNormalized(
  oddH: number,
  oddD: number,
  oddA: number,
): { h: number; d: number; a: number } {
  const ih = impliedProb(oddH)
  const id = impliedProb(oddD)
  const ia = impliedProb(oddA)
  const total = ih + id + ia
  if (total <= 0) return { h: 0, d: 0, a: 0 }
  return { h: ih / total, d: id / total, a: ia / total }
}

/** Iniciales para avatares de equipo / usuario. */
export function initials(text: string, max = 2): string {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, max)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}
