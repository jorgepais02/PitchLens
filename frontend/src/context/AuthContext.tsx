import { useCallback, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { AuthContext } from './auth'

const TOKEN_KEY = 'kraken_token'
const EMAIL_KEY = 'kraken_email'

/** Mantiene el token en localStorage para que la sesión sobreviva a recargas. */
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

  const deleteAccount = useCallback(async () => {
    if (!token) return
    await api.deleteAccount(token)
    logout()
  }, [token, logout])

  return (
    <AuthContext.Provider value={{ token, email, isAuthenticated: token !== null, login, register, logout, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}
