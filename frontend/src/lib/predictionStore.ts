/**
 * La app no persiste predicciones: el resultado viaja en el estado de navegación
 * (DESIGN_PROMPT.md §6.2). Guardamos además una copia en memoria como respaldo
 * dentro de la misma sesión de JS; un refresco la pierde y /prediction muestra
 * su EmptyState con CTA a `/`.
 */
import type { PredictResponse } from '@/lib/api/types'

export interface PredictionTeam {
  id: number
  name: string
}

export interface PredictionOdds {
  psch: number
  pscd: number
  psca: number
}

export interface PredictionView {
  response: PredictResponse
  home: PredictionTeam
  away: PredictionTeam
  leagueCode: string
  leagueName: string
  /** Etiqueta visible del modelo: "Market" o el nombre del modelo custom. */
  modelLabel: string
  modelKind: 'pretrained' | 'custom'
  modelFeatures: string[]
  /** Si true → mostrar comparación con el mercado y se incluyen las cuotas. */
  isMarket: boolean
  odds?: PredictionOdds
}

let lastPrediction: PredictionView | null = null

export function setLastPrediction(view: PredictionView): void {
  lastPrediction = view
}

export function getLastPrediction(): PredictionView | null {
  return lastPrediction
}

/** Clave de estado de ruta donde viaja el payload. */
export const PREDICTION_STATE_KEY = 'prediction'
