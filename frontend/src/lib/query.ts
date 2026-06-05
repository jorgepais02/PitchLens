import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/client'

/**
 * QueryClient global. No reintenta errores de cliente (4xx) porque son
 * deterministas (404, 422, 401); solo reintenta fallos transitorios.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false
        }
        return failureCount < 2
      },
    },
    mutations: {
      retry: false,
    },
  },
})

/** Claves de query centralizadas para invalidación consistente. */
export const queryKeys = {
  health: ['health'] as const,
  leagues: ['leagues'] as const,
  seasons: (leagueCode?: string) => ['seasons', leagueCode ?? 'all'] as const,
  teams: (leagueCode?: string) => ['teams', leagueCode ?? 'all'] as const,
  team: (id: number) => ['team', id] as const,
  teamStats: (id: number, season?: number) => ['team-stats', id, season ?? 'all'] as const,
  matches: (params: Record<string, unknown>) => ['matches', params] as const,
  match: (slug: string) => ['match', slug] as const,
  models: (authed: boolean) => ['models', authed] as const,
  features: ['features'] as const,
  trainJob: (jobId: string) => ['train-job', jobId] as const,
}
