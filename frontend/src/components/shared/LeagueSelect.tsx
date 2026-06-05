import { useLeagues } from '@/hooks/useCatalog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LeagueCode } from '@/lib/api/types'

interface LeagueSelectProps {
  value?: LeagueCode
  onChange: (code: LeagueCode) => void
  placeholder?: string
  id?: string
}

export function LeagueSelect({
  value,
  onChange,
  placeholder = 'Elige una liga',
  id,
}: LeagueSelectProps) {
  const { data: leagues, isLoading, isError } = useLeagues()

  if (isLoading) return <Skeleton className="h-10 w-full" />
  if (isError || !leagues) {
    return (
      <Select disabled>
        <SelectTrigger id={id}>
          <SelectValue placeholder="No se pudieron cargar las ligas" />
        </SelectTrigger>
        <SelectContent />
      </Select>
    )
  }

  return (
    <Select value={value} onValueChange={(v) => onChange(v as LeagueCode)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {leagues.map((league) => (
          <SelectItem key={league.id} value={league.code}>
            {league.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
