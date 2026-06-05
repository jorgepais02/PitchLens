import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative flex w-full items-start gap-3 rounded-lg border p-4 text-sm',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-foreground',
        warning: 'border-draw/30 bg-draw/10 text-foreground',
        danger: 'border-destructive/35 bg-destructive/10 text-foreground',
        info: 'border-primary/30 bg-primary/10 text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface AlertProps
  extends ComponentProps<'div'>,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, role = 'alert', ...props }: AlertProps) {
  return (
    <div role={role} className={cn(alertVariants({ variant }), className)} {...props} />
  )
}

export function AlertTitle({ className, ...props }: ComponentProps<'h5'>) {
  return (
    <h5 className={cn('font-semibold leading-tight tracking-tight', className)} {...props} />
  )
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('text-sm text-muted-foreground [&_p]:leading-relaxed', className)} {...props} />
  )
}
