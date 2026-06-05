import { CircleAlert, LoaderCircle, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'

// ── Spinner inline (acción en curso; nunca a pantalla completa) ────────────
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-4 animate-spin', className)} aria-hidden />
}

// ── Empty state: enseña cómo poblar, no "no hay nada" ──────────────────────
interface EmptyStateProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <SearchX className="size-5" aria-hidden />}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

// ── Error state: distingue 404 del resto, permite reintentar ───────────────
interface ErrorStateProps {
  error?: unknown
  title?: string
  description?: ReactNode
  onRetry?: () => void
  notFoundTitle?: string
  notFoundDescription?: ReactNode
  className?: string
}

export function ErrorState({
  error,
  title,
  description,
  onRetry,
  notFoundTitle,
  notFoundDescription,
  className,
}: ErrorStateProps) {
  const isNotFound = error instanceof ApiError && error.isNotFound
  const message =
    error instanceof ApiError ? error.message : 'Ha ocurrido un error inesperado.'

  const heading = isNotFound
    ? (notFoundTitle ?? 'No encontrado')
    : (title ?? 'Algo ha fallado')
  const body = isNotFound
    ? (notFoundDescription ?? message)
    : (description ?? message)

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/12 text-destructive">
        <CircleAlert className="size-5" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
      {onRetry && !isNotFound ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}
