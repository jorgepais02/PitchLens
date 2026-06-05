import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { OUTCOME_TEXT, type OutcomeToken } from '@/components/shared/outcome'

interface MetricTileProps {
  label: string
  value: ReactNode
  /** Texto secundario bajo el valor (contexto, unidad, comparación). */
  hint?: ReactNode
  tone?: OutcomeToken | 'default' | 'accent'
  /** El valor en mono tabular (cifras). Por defecto sí. */
  mono?: boolean
  icon?: ReactNode
  className?: string
}

const toneClass: Record<OutcomeToken | 'default' | 'accent', string> = {
  home: OUTCOME_TEXT.home,
  draw: OUTCOME_TEXT.draw,
  away: OUTCOME_TEXT.away,
  accent: 'text-primary',
  default: 'text-foreground',
}

/** Tarjeta de métrica: label pequeño arriba, valor grande en mono. */
export function MetricTile({
  label,
  value,
  hint,
  tone = 'default',
  mono = true,
  icon,
  className,
}: MetricTileProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border bg-card p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <span
        className={cn(
          'text-2xl font-semibold leading-none tracking-tight',
          mono && 'tabular',
          toneClass[tone],
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  )
}
