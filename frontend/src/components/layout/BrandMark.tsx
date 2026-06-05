import { cn } from '@/lib/utils'

/**
 * Glifo de marca: tres barras emerald/amber/sky — la barra-espectro H/D/A
 * comprimida en un símbolo. Atado a la identidad del producto, no decorativo.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-6', className)}
      role="img"
      aria-label="Football Analytics"
    >
      <rect x="0" y="0" width="24" height="24" rx="6" className="fill-card" />
      <rect x="0" y="0" width="24" height="24" rx="6" className="fill-transparent stroke-border" strokeWidth="1" />
      <rect x="5" y="13" width="3.4" height="6" rx="1.2" fill="var(--color-home)" />
      <rect x="10.3" y="8" width="3.4" height="11" rx="1.2" fill="var(--color-draw)" />
      <rect x="15.6" y="10.5" width="3.4" height="8.5" rx="1.2" fill="var(--color-away)" />
    </svg>
  )
}
