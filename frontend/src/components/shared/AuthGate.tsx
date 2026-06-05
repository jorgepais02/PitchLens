import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

interface AuthGateProps {
  title?: string
  description?: ReactNode
  children: ReactNode
}

/**
 * Muestra el contenido si hay sesión; si no, un CTA para iniciar sesión
 * (sin redirección brusca). Pasa la ruta actual para volver tras el login.
 */
export function AuthGate({ title, description, children }: AuthGateProps) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (isAuthenticated) return <>{children}</>

  const from = location.pathname + location.search

  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-border bg-card px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
        <Lock className="size-5" aria-hidden />
      </div>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight">
          {title ?? 'Inicia sesión para crear tu modelo'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {description ??
            'El Studio te deja elegir features y algoritmo, entrenar tu propio modelo y compararlo con los preentrenados. Necesitas una cuenta para guardarlo.'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button asChild>
          <Link to="/login" state={{ from }}>
            Iniciar sesión
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/register" state={{ from }}>
            Crear cuenta
          </Link>
        </Button>
      </div>
    </div>
  )
}
