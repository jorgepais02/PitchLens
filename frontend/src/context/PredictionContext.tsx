import { useState, type ReactNode } from 'react'
import { PredictionContext, type ActivePrediction } from './prediction'

/** Guarda la predicción activa mientras dura la sesión — no se persiste. */
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
