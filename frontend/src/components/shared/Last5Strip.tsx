import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { MatchBrief } from '@/lib/api/types'
import { MATCH_RESULT_LABEL } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { TeamResultBadge } from '@/components/shared/ResultBadge'

interface Last5StripProps {
  last5: MatchBrief[]
  /** Si true, ordena de más antiguo (izq) a más reciente (der). */
  chronological?: boolean
  linkToMatches?: boolean
  className?: string
}

/** Racha de los últimos 5 resultados como secuencia de chips W/D/L. */
export function Last5Strip({
  last5,
  chronological = true,
  linkToMatches = true,
  className,
}: Last5StripProps) {
  if (last5.length === 0) {
    return <span className="text-xs text-muted-foreground">Sin partidos recientes</span>
  }
  const items = chronological ? [...last5].reverse() : last5

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {items.map((m) => {
        const title = `${MATCH_RESULT_LABEL[m.result]} ${m.goals_for}-${m.goals_against} (${m.venue === 'home' ? 'local' : 'visitante'}) · ${formatDate(m.date)}`
        if (linkToMatches) {
          return (
            <Link
              key={m.slug}
              to={`/matches/${m.slug}`}
              title={title}
              aria-label={title}
              className="rounded-[5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <TeamResultBadge result={m.result} />
            </Link>
          )
        }
        return <TeamResultBadge key={m.slug} result={m.result} />
      })}
    </div>
  )
}
