import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { getTeamStats } from '@/lib/api/endpoints'

/** Stats agregadas + últimos 5 de un equipo, opcionalmente por temporada. */
export function useTeamStats(teamId: number | undefined, season?: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.teamStats(teamId ?? -1, season),
    queryFn: ({ signal }) => getTeamStats(teamId!, season, signal),
    enabled: enabled && teamId !== undefined && teamId > 0,
  })
}
