import { cn } from '@/lib/utils'
import { TeamCrest } from '@/components/shared/TeamCrest'

interface MatchupHeaderProps {
  homeName: string
  awayName: string
  meta?: React.ReactNode
  className?: string
}

/** Cabecera de enfrentamiento (Local ⟷ VS ⟷ Visitante) — firma reutilizada. */
export function MatchupHeader({ homeName, awayName, meta, className }: MatchupHeaderProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-end sm:text-right">
          <TeamCrest name={homeName} tone="home" size="lg" className="sm:order-2" />
          <div className="sm:order-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-home">Local</div>
            <div className="text-base font-semibold leading-tight sm:text-lg">{homeName}</div>
          </div>
        </div>

        <div className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground">
          VS
        </div>

        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-start sm:text-left">
          <TeamCrest name={awayName} tone="away" size="lg" />
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-away">
              Visitante
            </div>
            <div className="text-base font-semibold leading-tight sm:text-lg">{awayName}</div>
          </div>
        </div>
      </div>
      {meta ? <div className="text-sm text-muted-foreground">{meta}</div> : null}
    </div>
  )
}
