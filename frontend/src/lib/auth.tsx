/**
 * Sesión JWT del cliente (API_SPEC.md §3).
 * - Sin endpoint /me: el email se guarda del formulario de login/registro.
 * - Sin logout server-side: "cerrar sesión" = borrar el token en cliente.
 * - 401/403 en endpoints protegidos → limpiar sesión (callback registrado en el cliente).
 * - El token caduca a 24h; se comprueba `exp` al cargar.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { login as apiLogin, register as apiRegister } from '@/lib/api/endpoints'
import { registerTokenProvider, registerUnauthorizedHandler } from '@/lib/api/client'
import type { Credentials } from '@/lib/api/types'

const TOKEN_KEY = 'fa.token'
const EMAIL_KEY = 'fa.email'

interface Session {
  token: string
  email: string | null
}

interface AuthContextValue {
  token: string | null
  email: string | null
  isAuthenticated: boolean
  login: (credentials: Credentials) => Promise<void>
  register: (credentials: Credentials) => Promise<void>
  logout: (silent?: boolean) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Decodifica el payload del JWT (base64url) sin verificar firma — solo lectura. */
function decodeJwt(token: string): { exp?: number; sub?: string } | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as { exp?: number; sub?: string }
  } catch {
    return null
  }
}

function isExpired(token: string): boolean {
  const payload = decodeJwt(token)
  if (!payload?.exp) return false
  return payload.exp * 1000 <= Date.now()
}

function readInitialSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token || isExpired(token)) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    return null
  }
  return { token, email: localStorage.getItem(EMAIL_KEY) }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readInitialSession())
  const sessionRef = useRef(session)
  sessionRef.current = session

  // El cliente HTTP lee el token vigente y avisa de 401/403 sin import circular.
  useEffect(() => {
    registerTokenProvider(() => sessionRef.current?.token ?? null)
  }, [])

  const clearSession = useCallback((silent = false) => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setSession(null)
    if (!silent && sessionRef.current) {
      toast.error('Tu sesión ha caducado. Vuelve a iniciar sesión.')
    }
  }, [])

  useEffect(() => {
    registerUnauthorizedHandler(() => clearSession(false))
  }, [clearSession])

  // Caducidad pasiva: si el token expira mientras la pestaña está abierta.
  useEffect(() => {
    if (!session) return
    const payload = decodeJwt(session.token)
    if (!payload?.exp) return
    const ms = payload.exp * 1000 - Date.now()
    if (ms <= 0) {
      clearSession(false)
      return
    }
    const timer = window.setTimeout(() => clearSession(false), Math.min(ms, 2 ** 31 - 1))
    return () => window.clearTimeout(timer)
  }, [session, clearSession])

  const persist = useCallback((token: string, email: string) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(EMAIL_KEY, email)
    setSession({ token, email })
  }, [])

  const login = useCallback(
    async (credentials: Credentials) => {
      const res = await apiLogin(credentials)
      persist(res.access_token, credentials.email)
    },
    [persist],
  )

  const register = useCallback(
    async (credentials: Credentials) => {
      const res = await apiRegister(credentials)
      persist(res.access_token, credentials.email)
    },
    [persist],
  )

  const logout = useCallback(
    (silent = false) => {
      clearSession(true)
      if (!silent) toast.success('Sesión cerrada.')
    },
    [clearSession],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      token: session?.token ?? null,
      email: session?.email ?? null,
      isAuthenticated: session !== null,
      login,
      register,
      logout,
    }),
    [session, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
