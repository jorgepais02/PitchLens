import { cn } from '@/lib/utils'
import type { Result } from '@/lib/api/types'
import { RESULT_CODE, RESULT_SHORT } from '@/lib/constants'
import { useCountUp } from '@/hooks/useCountUp'
import { useMounted } from '@/hooks/useMounted'
import { OUTCOME_BAR, OUTCOME_TEXT } from '@/components/shared/outcome'

interface ProbabilityBarsProps {
  probH: number
  probD: number
  probA: number
  variant?: 'spectrum' | 'stacked'
  animate?: boolean
  className?: string
}

interface Row {
  result: Result
  token: 'home' | 'draw' | 'away'
  value: number
}

function buildRows(probH: number, probD: number, probA: number): Row[] {
  return [
    { result: 'H', token: 'home', value: probH },
    { result: 'D', token: 'draw', value: probD },
    { result: 'A', token: 'away', value: probA },
  ]
}

function dominantResult(rows: Row[]): Result {
  return rows.reduce((best, r) => (r.value > best.value ? r : best), rows[0]!).result
}

/** Componente firma: distribución H/D/A con la semántica de color sagrada. */
export function ProbabilityBars({
  probH,
  probD,
  probA,
  variant = 'stacked',
  animate = true,
  className,
}: ProbabilityBarsProps) {
  const rows = buildRows(probH, probD, probA)
  const dominant = dominantResult(rows)
  if (variant === 'spectrum') {
    return (
      <SpectrumBar rows={rows} dominant={dominant} animate={animate} className={className} />
    )
  }
  return <StackedBars rows={rows} dominant={dominant} animate={animate} className={className} />
}

// ── Variante compacta: una barra 100% partida en 3 segmentos ───────────────
function SpectrumBar({
  rows,
  dominant,
  animate,
  className,
}: {
  rows: Row[]
  dominant: Result
  animate: boolean
  className?: string
}) {
  const mounted = useMounted()
  const grown = !animate || mounted
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={rows
          .map((r) => `${RESULT_SHORT[r.result]} ${(r.value * 100).toFixed(1)} por ciento`)
          .join(', ')}
      >
        {rows.map((r) => (
          <div
            key={r.result}
            className={cn(
              'h-full rounded-full transition-[width] duration-[600ms] ease-out',
              OUTCOME_BAR[r.token],
              r.result === dominant ? 'opacity-100' : 'opacity-80',
            )}
            style={{ width: grown ? `${Math.max(r.value * 100, 1.5)}%` : '0%' }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        {rows.map((r) => (
          <div key={r.result} className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-sm', OUTCOME_BAR[r.token])} aria-hidden />
            <span className="text-xs text-muted-foreground">{RESULT_CODE[r.result]}</span>
            <span className={cn('tabular text-xs font-medium', OUTCOME_TEXT[r.token])}>
              {(r.value * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Variante grande: tres barras apiladas con % gigante en mono ────────────
function StackedBars({
  rows,
  dominant,
  animate,
  className,
}: {
  rows: Row[]
  dominant: Result
  animate: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {rows.map((r, i) => (
        <StackedRow
          key={r.result}
          row={r}
          isDominant={r.result === dominant}
          animate={animate}
          delay={i * 60}
        />
      ))}
    </div>
  )
}

function StackedRow({
  row,
  isDominant,
  animate,
  delay,
}: {
  row: Row
  isDominant: boolean
  animate: boolean
  delay: number
}) {
  const mounted = useMounted()
  const grown = !animate || mounted
  const pct = useCountUp(row.value * 100, { decimals: 1, enabled: animate })

  return (
    <div
      className={cn(
        'grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
        isDominant ? 'bg-card' : 'bg-transparent',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums',
            OUTCOME_BAR[row.token],
            'text-[var(--color-background)]',
          )}
          aria-hidden
        >
          {RESULT_CODE[row.result]}
        </span>
        <span className="text-sm text-muted-foreground">{RESULT_SHORT[row.result]}</span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full origin-left rounded-full transition-[width] duration-[600ms] ease-out',
            OUTCOME_BAR[row.token],
            isDominant ? 'opacity-100' : 'opacity-75',
          )}
          style={{
            width: grown ? `${Math.max(row.value * 100, 1)}%` : '0%',
            transitionDelay: animate ? `${delay}ms` : undefined,
          }}
        />
      </div>

      <div className="flex items-baseline justify-end gap-0.5">
        <span
          className={cn(
            'tabular font-semibold tracking-tight',
            isDominant ? 'text-2xl' : 'text-xl',
            OUTCOME_TEXT[row.token],
          )}
        >
          {pct.toFixed(1)}
        </span>
        <span className={cn('tabular text-xs', OUTCOME_TEXT[row.token])}>%</span>
      </div>
    </div>
  )
}
