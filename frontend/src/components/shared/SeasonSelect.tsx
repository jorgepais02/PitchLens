import { useMemo } from 'react'
import { useSeasons } from '@/hooks/useCatalog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ALL_VALUE = '__all__'

interface SeasonSelectProps {
  leagueCode?: string
  /** Año de fin de temporada; undefined = todas. */
  value?: number
  onChange: (season: number | undefined) => void
  allLabel?: string
  placeholder?: string
  id?: string
  disabled?: boolean
}

/** Selector de temporada por año de fin; ordena de más reciente a más antigua. */
export function SeasonSelect({
  leagueCode,
  value,
  onChange,
  allLabel = 'Todas las temporadas',
  placeholder = 'Temporada',
  id,
  disabled,
}: SeasonSelectProps) {
  const { data: seasons, isLoading } = useSeasons(leagueCode, Boolean(leagueCode))

  // Distintos end_year (varias ligas pueden compartirlos si no se filtra).
  const years = useMemo(() => {
    if (!seasons) return []
    const map = new Map<number, string>()
    for (const s of seasons) map.set(s.end_year, s.label)
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [seasons])

  if (isLoading) return <Skeleton className="h-10 w-full" />

  return (
    <Select
      value={value === undefined ? ALL_VALUE : String(value)}
      disabled={disabled}
      onValueChange={(v) => onChange(v === ALL_VALUE ? undefined : Number(v))}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {years.map(([year, label]) => (
          <SelectItem key={year} value={String(year)}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
