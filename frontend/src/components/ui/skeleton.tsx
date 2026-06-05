import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Skeleton con barrido (shimmer), no pulse plano. Estados de carga del §9:
 * siempre skeletons con la forma del contenido final, nunca spinner a pantalla completa.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
        'after:bg-gradient-to-r after:from-transparent after:via-white/[0.06] after:to-transparent',
        className,
      )}
      {...props}
    />
  )
}
