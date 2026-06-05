import { useMutation } from '@tanstack/react-query'
import { predict, predictCustom } from '@/lib/api/endpoints'
import type {
  PredictCustomRequest,
  PredictRequest,
  PredictResponse,
} from '@/lib/api/types'

/** Predicción con modelo preentrenado. */
export function usePredict() {
  return useMutation<PredictResponse, unknown, PredictRequest>({
    mutationFn: (body) => predict(body),
  })
}

/** Predicción con modelo custom del usuario (requiere sesión). */
export function usePredictCustom() {
  return useMutation<PredictResponse, unknown, PredictCustomRequest>({
    mutationFn: (body) => predictCustom(body),
  })
}
