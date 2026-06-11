import { createContext, useContext, useState, type ReactNode } from 'react'
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

interface PredictionContextValue {
  activePrediction: ActivePrediction | null
  setActivePrediction: (p: ActivePrediction) => void
  clearPrediction: () => void
}

const PredictionContext = createContext<PredictionContextValue | null>(null)

export function PredictionProvider({ children }: { children: ReactNode }) {
  const [activePrediction, setActivePrediction] = useState<ActivePrediction | null>(null)

  return (
    <PredictionContext.Provider
      value={{
        activePrediction,
        setActivePrediction,
        clearPrediction: () => setActivePrediction(null),
      }}
    >
      {children}
    </PredictionContext.Provider>
  )
}

export function usePrediction() {
  const ctx = useContext(PredictionContext)
  if (!ctx) throw new Error('usePrediction debe usarse dentro de PredictionProvider')
  return ctx
}
