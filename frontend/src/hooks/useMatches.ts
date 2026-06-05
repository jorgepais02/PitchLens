import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { getMatch, getMatches, type MatchesQuery } from '@/lib/api/endpoints'

/** Partidos paginados (orden por fecha desc). Mantiene datos previos al paginar. */
export function useMatches(params: MatchesQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.matches(params as Record<string, unknown>),
    queryFn: ({ signal }) => getMatches(params, signal),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/** Detalle completo de un partido por slug. */
export function useMatch(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.match(slug ?? ''),
    queryFn: ({ signal }) => getMatch(slug!, signal),
    enabled: Boolean(slug),
  })
}
