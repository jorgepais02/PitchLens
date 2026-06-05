import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { getFeatures } from '@/lib/api/endpoints'

/** Las 12 features disponibles con descripción legible (Studio). */
export function useFeatures() {
  return useQuery({
    queryKey: queryKeys.features,
    queryFn: ({ signal }) => getFeatures(signal),
    staleTime: Infinity,
  })
}
