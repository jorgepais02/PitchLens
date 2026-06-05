import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'

type Tone = 'home' | 'away' | 'neutral'
type Size = 'sm' | 'md' | 'lg'

interface TeamCrestProps {
  name: string
  tone?: Tone
  size?: Size
  className?: string
}

const sizeClasses: Record<Size, string> = {
  sm: 'size-7 text-[11px]',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
}

const toneClasses: Record<Tone, string> = {
  home: 'border-home/30 bg-home/12 text-home',
  away: 'border-away/30 bg-away/12 text-away',
  neutral: 'border-border bg-muted text-muted-foreground',
}

/** Avatar de equipo por iniciales. El tinte refuerza la localía (no la informa solo). */
export function TeamCrest({ name, tone = 'neutral', size = 'md', className }: TeamCrestProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border font-semibold tracking-tight',
        sizeClasses[size],
        toneClasses[tone],
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}
