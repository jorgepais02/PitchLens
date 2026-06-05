import { cn } from '@/lib/utils'
import type { MatchResult, Result } from '@/lib/api/types'
import {
  MATCH_RESULT_LABEL,
  MATCH_RESULT_TOKEN,
  OUTCOME_TOKEN,
  RESULT_CODE,
  RESULT_SHORT,
} from '@/lib/constants'
import { OUTCOME_SOFT, OUTCOME_SOLID, type OutcomeToken } from '@/components/shared/outcome'

type Variant = 'solid' | 'soft'
type Size = 'sm' | 'md'

interface BaseProps {
  token: OutcomeToken
  variant?: Variant
  size?: Size
  className?: string
  /** Texto accesible cuando el contenido visible es solo una letra. */
  srLabel?: string
  children: React.ReactNode
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-5 min-w-5 px-1.5 text-[11px]',
  md: 'h-6 min-w-6 px-2 text-xs',
}

/** Chip de resultado con color semántico. El color refuerza; la letra informa. */
export function ResultBadge({
  token,
  variant = 'soft',
  size = 'md',
  className,
  srLabel,
  children,
}: BaseProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md font-semibold leading-none tabular-nums',
        variant === 'solid'
          ? OUTCOME_SOLID[token]
          : cn(OUTCOME_SOFT[token], 'rounded-md'),
        sizeClasses[size],
        className,
      )}
    >
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
      <span aria-hidden={srLabel ? true : undefined}>{children}</span>
    </span>
  )
}

/** Resultado de partido (1·X·2) a partir de `ftr`. */
export function FtrBadge({
  ftr,
  variant = 'soft',
  size = 'md',
  notation = 'code',
  className,
}: {
  ftr: Result
  variant?: Variant
  size?: Size
  notation?: 'code' | 'letter'
  className?: string
}) {
  const token = OUTCOME_TOKEN[ftr]
  const visible = notation === 'code' ? RESULT_CODE[ftr] : ftr
  return (
    <ResultBadge
      token={token}
      variant={variant}
      size={size}
      className={className}
      srLabel={RESULT_SHORT[ftr]}
    >
      {visible}
    </ResultBadge>
  )
}

/** Resultado desde la perspectiva de un equipo (W/D/L) — racha. */
export function TeamResultBadge({
  result,
  variant = 'soft',
  size = 'sm',
  className,
}: {
  result: MatchResult
  variant?: Variant
  size?: Size
  className?: string
}) {
  const token = MATCH_RESULT_TOKEN[result]
  return (
    <ResultBadge
      token={token}
      variant={variant}
      size={size}
      className={cn('rounded-[5px]', className)}
      srLabel={MATCH_RESULT_LABEL[result]}
    >
      {result}
    </ResultBadge>
  )
}
