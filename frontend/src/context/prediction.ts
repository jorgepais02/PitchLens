/**
 * Contrato del contexto de predicción: tipos, objeto de contexto y hook.
 *
 * Vive aparte del provider (`PredictionContext.tsx`) porque un módulo que
 * exporta componentes y valores a la vez rompe la recarga en caliente: al
 * tocarlo, Vite no puede saber si basta con refrescar el componente o hay que
 * recargar la página entera, y opta por lo segundo. Con el provider solo en el
 * .tsx y todo lo demás aquí, editar cualquiera de los dos se refresca solo.
 */
import { createContext, useContext } from 'react'
import type { League, Team, PredictResponse } from '../lib/api'

export type ModelKey = 'baseline' | 'extended' | 'market' | 'custom'

export interface ActivePrediction {
  id: string
  home: Team
  away: Team
  league: League
  model: ModelKey
  result: PredictResponse
  odds?: { psch: number; pscd: number; psca: number }
}

export interface PredictionContextValue {
  activePrediction: ActivePrediction | null
  setActivePrediction: (p: ActivePrediction) => void
  clearPrediction: () => void
}

export const PredictionContext = createContext<PredictionContextValue | null>(null)

export function usePrediction(): PredictionContextValue {
  const ctx = useContext(PredictionContext)
  if (!ctx) throw new Error('usePrediction debe usarse dentro de PredictionProvider')
  return ctx
}
