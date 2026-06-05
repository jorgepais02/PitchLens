import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import {
  getLeagues,
  getSeasons,
  getTeam,
  getTeams,
} from '@/lib/api/endpoints'

/** Ligas (catálogo estable). */
export function useLeagues() {
  return useQuery({
    queryKey: queryKeys.leagues,
    queryFn: ({ signal }) => getLeagues(signal),
    staleTime: Infinity,
  })
}

/** Temporadas, opcionalmente filtradas por liga. */
export function useSeasons(leagueCode?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.seasons(leagueCode),
    queryFn: ({ signal }) => getSeasons(leagueCode, signal),
    enabled,
    staleTime: Infinity,
  })
}

/** Equipos, opcionalmente filtrados por liga. */
export function useTeams(leagueCode?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.teams(leagueCode),
    queryFn: ({ signal }) => getTeams(leagueCode, signal),
    enabled,
    staleTime: 10 * 60_000,
  })
}

/** Detalle de un equipo con su liga embebida. */
export function useTeam(teamId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.team(teamId ?? -1),
    queryFn: ({ signal }) => getTeam(teamId!, signal),
    enabled: teamId !== undefined && teamId > 0,
  })
}
