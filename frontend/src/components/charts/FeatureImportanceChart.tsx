import { cn } from '@/lib/utils'
import type { FeatureImportance } from '@/lib/api/types'
import { featureLabel } from '@/lib/constants'
import { formatNumber } from '@/lib/format'
import { useMounted } from '@/hooks/useMounted'

interface FeatureImportanceChartProps {
  data: FeatureImportance[]
  /** Resaltar estas features (las que el partido usa / el usuario eligió). */
  highlight?: string[]
  animate?: boolean
  maxItems?: number
  className?: string
}

/**
 * Importancia de features del modelo (0..1, normalizada a max=1, desc).
 * Barras horizontales animadas en el acento (la importancia no es un outcome:
 * nunca usa la semántica H/D/A). Las barras dibujan su width al montar.
 */
export function FeatureImportanceChart({
  data,
  highlight,
  animate = true,
  maxItems,
  className,
}: FeatureImportanceChartProps) {
  const mounted = useMounted()
  const grown = !animate || mounted
  const rows = [...data]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, maxItems ?? data.length)
  const highlightSet = new Set(highlight ?? [])

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sin datos de importancia.</p>
    )
  }

  return (
    <ul
      className={cn('flex flex-col gap-3', className)}
      aria-label="Importancia de las features del modelo"
    >
      {rows.map((row, i) => {
        const emphasized = highlightSet.size === 0 || highlightSet.has(row.feature)
        return (
          <li key={row.feature} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  'text-sm leading-tight',
                  emphasized ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {featureLabel(row.feature)}
              </span>
              <span className="tabular shrink-0 text-sm font-medium text-foreground">
                {formatNumber(row.importance, 2)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full origin-left rounded-full bg-primary transition-[width,opacity] duration-500 ease-out',
                  emphasized ? 'opacity-100' : 'opacity-40',
                )}
                style={{
                  width: grown ? `${Math.max(row.importance * 100, 1.5)}%` : '0%',
                  transitionDelay: animate ? `${i * 50}ms` : undefined,
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
