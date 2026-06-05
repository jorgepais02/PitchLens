import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { OUTCOME_BAR } from '@/components/shared/outcome'

export interface OddsValue {
  psch: string
  pscd: string
  psca: string
}

export const EMPTY_ODDS: OddsValue = { psch: '', pscd: '', psca: '' }

type Field = keyof OddsValue

const FIELDS: { key: Field; code: string; label: string; token: 'home' | 'draw' | 'away' }[] = [
  { key: 'psch', code: '1', label: 'Local', token: 'home' },
  { key: 'pscd', code: 'X', label: 'Empate', token: 'draw' },
  { key: 'psca', code: '2', label: 'Visitante', token: 'away' },
]

/** Una cuota es válida si es número > 1.0 (regla del backend; evita el 422). */
function fieldError(raw: string): string | null {
  if (raw.trim() === '') return null
  const n = Number(raw.replace(',', '.'))
  if (Number.isNaN(n)) return 'No es un número'
  if (n <= 1) return 'Debe ser > 1.00'
  return null
}

/** Las tres cuotas presentes y > 1.0. */
export function oddsAreValid(value: OddsValue): boolean {
  return FIELDS.every(({ key }) => {
    const raw = value[key].trim()
    if (raw === '') return false
    const n = Number(raw.replace(',', '.'))
    return !Number.isNaN(n) && n > 1
  })
}

/** Convierte a números para el request; null si alguna no es válida. */
export function parseOdds(
  value: OddsValue,
): { psch: number; pscd: number; psca: number } | null {
  if (!oddsAreValid(value)) return null
  return {
    psch: Number(value.psch.replace(',', '.')),
    pscd: Number(value.pscd.replace(',', '.')),
    psca: Number(value.psca.replace(',', '.')),
  }
}

interface OddsInputProps {
  value: OddsValue
  onChange: (value: OddsValue) => void
  disabled?: boolean
  className?: string
}

/** Grupo de 3 cuotas Pinnacle de cierre (local / empate / visitante). */
export function OddsInput({ value, onChange, disabled, className }: OddsInputProps) {
  return (
    <fieldset className={cn('flex flex-col gap-2', className)} disabled={disabled}>
      <legend className="sr-only">Cuotas Pinnacle de cierre</legend>
      <div className="grid grid-cols-3 gap-3">
        {FIELDS.map(({ key, code, label, token }) => {
          const error = fieldError(value[key])
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <label
                htmlFor={`odds-${key}`}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              >
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-[4px] text-[10px] font-bold text-[var(--color-background)]',
                    OUTCOME_BAR[token],
                  )}
                  aria-hidden
                >
                  {code}
                </span>
                {label}
              </label>
              <Input
                id={`odds-${key}`}
                inputMode="decimal"
                placeholder="1.00"
                className="tabular"
                value={value[key]}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `odds-${key}-error` : undefined}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              />
              {error ? (
                <span id={`odds-${key}-error`} className="text-xs text-destructive">
                  {error}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
