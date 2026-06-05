import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ColdStartAlertProps {
  title?: string
  children?: ReactNode
  className?: string
}

/**
 * Aviso de fiabilidad por falta de historial. Honestidad sobre la predicción:
 * nunca se oculta cuando aplica (cold_start_warning o matches_with_features_pct bajo).
 */
export function ColdStartAlert({ title, children, className }: ColdStartAlertProps) {
  return (
    <Alert variant="warning" className={cn(className)}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-draw" aria-hidden />
      <div className="flex flex-col gap-1">
        <AlertTitle className="text-draw">
          {title ?? 'Datos insuficientes — predicción poco fiable'}
        </AlertTitle>
        <AlertDescription>
          {children ??
            'Alguno de los equipos tiene menos de 5 partidos en la base de datos. Las features se calculan con poco historial, así que la probabilidad debe tomarse con cautela.'}
        </AlertDescription>
      </div>
    </Alert>
  )
}
