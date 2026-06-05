import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/client'
import { queryKeys } from '@/lib/query'
import { getTrainJob, startTraining } from '@/lib/api/endpoints'
import type { TrainRequest, TrainResult } from '@/lib/api/types'

export type TrainingPhase =
  | 'idle'
  | 'starting'
  | 'pending'
  | 'running'
  | 'done'
  | 'error'
  | 'lost'

/**
 * Entrenamiento asíncrono (API_SPEC.md §6.5): POST /train → 202 + job_id, luego
 * polling de /train/jobs/{id} cada 1.5s hasta done/error. Si el polling devuelve
 * 404 (backend reiniciado) → fase "lost": el caller recarga /models.
 */
export function useTraining() {
  const queryClient = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(null)

  const startMutation = useMutation({
    mutationFn: (req: TrainRequest) => startTraining(req),
    onSuccess: (data) => setJobId(data.job_id),
  })

  const pollQuery = useQuery({
    queryKey: queryKeys.trainJob(jobId ?? ''),
    queryFn: ({ signal }) => getTrainJob(jobId!, signal),
    enabled: jobId !== null,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'done' || status === 'error') return false
      if (query.state.error) return false
      return 1500
    },
  })

  const job = pollQuery.data
  const isJobLost = pollQuery.error instanceof ApiError && pollQuery.error.isNotFound

  let phase: TrainingPhase = 'idle'
  if (startMutation.isPending) phase = 'starting'
  else if (isJobLost) phase = 'lost'
  else if (job?.status === 'done') phase = 'done'
  else if (job?.status === 'error') phase = 'error'
  else if (job?.status === 'running') phase = 'running'
  else if (jobId !== null) phase = 'pending'

  const reset = useCallback(() => {
    if (jobId) queryClient.removeQueries({ queryKey: queryKeys.trainJob(jobId) })
    startMutation.reset()
    setJobId(null)
  }, [jobId, queryClient, startMutation])

  const start = useCallback(
    (req: TrainRequest) => {
      reset()
      startMutation.mutate(req)
    },
    [reset, startMutation],
  )

  return {
    start,
    reset,
    phase,
    jobId,
    job,
    result: (job?.result ?? null) as TrainResult | null,
    /** Error del entrenamiento en sí (job.error). */
    trainingError: job?.error ?? null,
    /** Error al encolar (422 validación de features/algoritmo, etc.). */
    startError: startMutation.error as unknown,
    /** Error de red del polling (no 404). */
    pollError: isJobLost ? null : (pollQuery.error as unknown),
    isActive: phase === 'starting' || phase === 'pending' || phase === 'running',
    isJobLost,
  }
}
