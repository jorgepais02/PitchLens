import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import type { Team } from '@/lib/api/types'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Spinner } from '@/components/shared/states'
import { TeamCrest } from '@/components/shared/TeamCrest'

interface TeamSelectProps {
  teams: Team[] | undefined
  value?: number
  onChange: (teamId: number) => void
  loading?: boolean
  disabled?: boolean
  /** Equipos a deshabilitar (p. ej. el ya elegido como rival). */
  disabledIds?: number[]
  placeholder?: string
  tone?: 'home' | 'away' | 'neutral'
  id?: string
}

/** Combobox buscable de equipos (shadcn Command), filtrado por liga desde el caller. */
export function TeamSelect({
  teams,
  value,
  onChange,
  loading = false,
  disabled = false,
  disabledIds = [],
  placeholder = 'Selecciona un equipo',
  tone = 'neutral',
  id,
}: TeamSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = teams?.find((t) => t.id === value)
  const isDisabled = disabled || loading || !teams

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={isDisabled}
          className="h-12 w-full justify-between px-3 text-left font-normal"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {selected ? (
              <>
                <TeamCrest name={selected.name} tone={tone} size="sm" />
                <span className="truncate text-[15px] font-medium text-foreground">
                  {selected.name}
                </span>
              </>
            ) : (
              <>
                <span className="flex size-7 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                  ?
                </span>
                <span className="truncate text-muted-foreground">{placeholder}</span>
              </>
            )}
          </span>
          {loading ? (
            <Spinner className="text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Buscar equipo…" />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {(teams ?? []).map((team) => {
                const itemDisabled = disabledIds.includes(team.id)
                return (
                  <CommandItem
                    key={team.id}
                    value={team.name}
                    disabled={itemDisabled}
                    onSelect={() => {
                      if (itemDisabled) return
                      onChange(team.id)
                      setOpen(false)
                    }}
                  >
                    <TeamCrest name={team.name} tone={tone} size="sm" />
                    <span className="flex-1 truncate">{team.name}</span>
                    {team.id === value ? (
                      <Check className="size-4 text-primary" />
                    ) : itemDisabled ? (
                      <span className="text-[11px] text-muted-foreground">elegido</span>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
