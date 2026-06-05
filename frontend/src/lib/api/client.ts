/**
 * Cliente HTTP del backend FastAPI.
 * Maneja el modelo de errores REAL del contrato (API_SPEC.md §4): `detail` puede
 * ser string (regla de negocio) o array Pydantic (validación {loc,msg,type}).
 * 401/403 en endpoints protegidos → se trata como "sesión no válida".
 */

const BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

interface ValidationItem {
  type?: string
  loc?: (string | number)[]
  msg?: string
  input?: unknown
}

/** Error tipado de la API: distingue validación (422) de regla de negocio. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown
  readonly isValidation: boolean
  readonly validationItems: ValidationItem[]

  constructor(status: number, detail: unknown) {
    const { message, isValidation, items } = parseDetail(status, detail)
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.isValidation = isValidation
    this.validationItems = items
  }

  /** ¿Es un 401/403? → tratar como sesión inválida. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403
  }

  /** ¿El recurso no existe? */
  get isNotFound(): boolean {
    return this.status === 404
  }
}

function parseDetail(
  status: number,
  detail: unknown,
): { message: string; isValidation: boolean; items: ValidationItem[] } {
  if (typeof detail === 'string' && detail.trim() !== '') {
    return { message: detail, isValidation: false, items: [] }
  }
  if (Array.isArray(detail)) {
    const items = detail as ValidationItem[]
    const first = items[0]
    return {
      message: first?.msg ?? 'Hay datos no válidos en la petición.',
      isValidation: true,
      items,
    }
  }
  return { message: defaultMessage(status), isValidation: false, items: [] }
}

function defaultMessage(status: number): string {
  switch (status) {
    case 0:
      return 'No se pudo conectar con el servidor. ¿Está la API en marcha?'
    case 401:
      return 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
    case 403:
      return 'Necesitas iniciar sesión para hacer esto.'
    case 404:
      return 'No se ha encontrado el recurso solicitado.'
    case 500:
      return 'Error interno del servidor.'
    case 503:
      return 'El servicio no está disponible en este momento.'
    default:
      return `Error inesperado (${status}).`
  }
}

// ── Inyección de sesión (registrada por @/lib/auth, evita import circular) ──
let tokenProvider: () => string | null = () => null
let unauthorizedHandler: () => void = () => {}

export function registerTokenProvider(fn: () => string | null): void {
  tokenProvider = fn
}

export function registerUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  /** Adjunta el token si existe (obligatorio en endpoints protegidos, opcional en /models). */
  auth?: boolean
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, signal } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = tokenProvider()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, null)
  }

  if (!response.ok) {
    let detail: unknown = null
    try {
      const data = await response.json()
      detail = (data as { detail?: unknown })?.detail ?? data
    } catch {
      detail = null
    }
    const error = new ApiError(response.status, detail)
    // 401/403 en endpoint protegido → limpiar sesión y mandar a login.
    if (auth && error.isAuthError) unauthorizedHandler()
    throw error
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Construye un querystring omitiendo valores vacíos/undefined. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const str = search.toString()
  return str ? `?${str}` : ''
}
