import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { MatchList } from '@/lib/api/types'
import { formatDate } from '@/lib/format'
import { FtrBadge } from '@/components/shared/ResultBadge'

interface MatchRowProps {
  match: MatchList
  resolveTeam: (id: number) => string
  className?: string
}

/** Fila de partido como tarjeta (vista móvil de /explore). */
export function MatchRow({ match, resolveTeam, className }: MatchRowProps) {
  const home = resolveTeam(match.home_team_id)
  const away = resolveTeam(match.away_team_id)
  return (
    <Link
      to={`/matches/${match.slug}`}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors duration-100 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="tabular text-xs text-muted-foreground">{formatDate(match.date)}</span>
        <FtrBadge ftr={match.ftr} size="sm" />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="truncate text-right text-sm font-medium">{home}</span>
        <span className="tabular rounded-md bg-muted px-2 py-1 text-sm font-semibold">
          {match.fthg}
          <span className="px-1 text-muted-foreground">·</span>
          {match.ftag}
        </span>
        <span className="truncate text-left text-sm font-medium">{away}</span>
      </div>
    </Link>
  )
}
