import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { impliedProbsNormalized } from '@/lib/format'
import { OUTCOME_VAR, type OutcomeToken } from '@/components/shared/outcome'

interface MarketCompareProps {
  probH: number
  probD: number
  probA: number
  odds: { psch: number; pscd: number; psca: number }
  className?: string
}

interface Datum {
  name: string
  token: OutcomeToken
  modelo: number
  mercado: number
}

interface TooltipPayload {
  payload: Datum
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayload[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0]!.payload
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg shadow-black/40">
      <p className="mb-1 font-medium text-foreground">{d.name}</p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>Modelo</span>
        <span className="tabular text-foreground">{d.modelo.toFixed(1)}%</span>
      </p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>Mercado</span>
        <span className="tabular text-foreground">{d.mercado.toFixed(1)}%</span>
      </p>
    </div>
  )
}

/**
 * Comparación de la predicción del modelo frente a la probabilidad implícita del
 * mercado (1/cuota normalizado). Sólido = modelo, tenue = mercado; el color por
 * outcome se mantiene (semántica H/D/A).
 */
export function MarketCompare({ probH, probD, probA, odds, className }: MarketCompareProps) {
  const implied = impliedProbsNormalized(odds.psch, odds.pscd, odds.psca)
  const data: Datum[] = [
    { name: '1 · Local', token: 'home', modelo: probH * 100, mercado: implied.h * 100 },
    { name: 'X · Empate', token: 'draw', modelo: probD * 100, mercado: implied.d * 100 },
    { name: '2 · Visitante', token: 'away', modelo: probA * 100, mercado: implied.a * 100 },
  ]

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            domain={[0, 'dataMax']}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
            tickFormatter={(v: number) => `${Math.round(v)}%`}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-accent)', opacity: 0.4 }}
            content={<CustomTooltip />}
          />
          <Bar dataKey="modelo" radius={[4, 4, 0, 0]} maxBarSize={46}>
            {data.map((d) => (
              <Cell key={d.token} fill={OUTCOME_VAR[d.token]} />
            ))}
          </Bar>
          <Bar dataKey="mercado" radius={[4, 4, 0, 0]} maxBarSize={46}>
            {data.map((d) => (
              <Cell key={d.token} fill={OUTCOME_VAR[d.token]} fillOpacity={0.32} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-foreground/80" aria-hidden />
          Modelo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-foreground/30" aria-hidden />
          Mercado (cuotas)
        </span>
      </div>
    </div>
  )
}
