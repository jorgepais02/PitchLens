import { Outlet } from 'react-router-dom'
import { Navbar } from '@/components/layout/Navbar'

/** Cromo global: topbar fija + contenedor de página. */
export function AppShell() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

/** Contenedor estándar de página (ancho máximo + padding consistente). */
export function PageContainer({
  children,
  className = '',
  size = 'wide',
}: {
  children: React.ReactNode
  className?: string
  size?: 'wide' | 'narrow' | 'prose'
}) {
  const max =
    size === 'narrow' ? 'max-w-3xl' : size === 'prose' ? 'max-w-xl' : 'max-w-[1400px]'
  return (
    <div className={`mx-auto w-full ${max} px-4 py-8 sm:px-6 ${className}`}>{children}</div>
  )
}
