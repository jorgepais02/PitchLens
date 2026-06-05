import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query'
import { getModels } from '@/lib/api/endpoints'
import { useAuth } from '@/lib/auth'

/**
 * Modelos disponibles. Auth opcional: con token añade los custom del usuario.
 * Se reconsulta al cambiar la sesión (la clave incluye si hay token).
 */
export function useModels() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: queryKeys.models(isAuthenticated),
    queryFn: ({ signal }) => getModels(signal),
    staleTime: 30_000,
  })
}
