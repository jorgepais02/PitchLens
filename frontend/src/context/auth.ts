/**
 * Contrato del contexto de autenticación: tipos, objeto de contexto y hook.
 *
 * Separado del provider (`AuthContext.tsx`) por la recarga en caliente: ver la
 * explicación en `prediction.ts`.
 */
import { createContext, useContext } from 'react'

export interface AuthContextValue {
  token: string | null
  email: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  deleteAccount: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
