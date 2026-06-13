import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { api } from '../lib/api'

const TOKEN_KEY = 'kraken_token'
const EMAIL_KEY = 'kraken_email'

interface AuthContextValue {
  token: string | null
  email: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY))

  const persist = useCallback((newToken: string, newEmail: string) => {
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(EMAIL_KEY, newEmail)
    setToken(newToken)
    setEmail(newEmail)
  }, [])

  const login = useCallback(async (userEmail: string, password: string) => {
    const res = await api.login(userEmail, password)
    persist(res.access_token, userEmail)
  }, [persist])

  const register = useCallback(async (userEmail: string, password: string) => {
    const res = await api.register(userEmail, password)
    persist(res.access_token, userEmail)
  }, [persist])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setToken(null)
    setEmail(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, email, isAuthenticated: token !== null, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
