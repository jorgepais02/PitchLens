import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Compass, LogOut, Menu, Sparkles, Swords } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { initials } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { BrandMark } from '@/components/layout/BrandMark'

const NAV_ITEMS = [
  { to: '/', label: 'Predecir', icon: Swords, end: true },
  { to: '/explore', label: 'Explorar', icon: Compass, end: false },
  { to: '/studio', label: 'Mi modelo', icon: Sparkles, end: false },
]

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
    isActive
      ? 'bg-accent text-foreground'
      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
  )
}

export function Navbar() {
  const { isAuthenticated, email, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <BrandMark />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
            Football Analytics
          </span>
        </Link>

        {/* Navegación principal (desktop) */}
        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Menú de cuenta"
                >
                  {initials(email ?? 'U', 1)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Sesión iniciada</DropdownMenuLabel>
                <div className="truncate px-2 pb-1 text-sm font-medium text-foreground">
                  {email ?? 'Usuario'}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout}>
                  <LogOut />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Iniciar sesión</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">Registrarse</Link>
              </Button>
            </div>
          )}

          {/* Menú móvil */}
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden" aria-label="Abrir menú">
                <Menu />
              </Button>
            </DialogTrigger>
            <DialogContent className="top-20 max-w-[calc(100%-2rem)] translate-y-0">
              <DialogHeader>
                <DialogTitle>Navegación</DialogTitle>
              </DialogHeader>
              <nav className="flex flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      )
                    }
                  >
                    <item.icon className="size-4" aria-hidden />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              {!isAuthenticated ? (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <Button asChild onClick={() => setMobileOpen(false)}>
                    <Link to="/register">Registrarse</Link>
                  </Button>
                  <Button asChild variant="secondary" onClick={() => setMobileOpen(false)}>
                    <Link to="/login">Iniciar sesión</Link>
                  </Button>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  )
}
