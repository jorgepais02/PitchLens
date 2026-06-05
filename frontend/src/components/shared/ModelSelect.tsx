import { Sparkles } from 'lucide-react'
import type { ModelsResponse } from '@/lib/api/types'
import { ALGORITHM_SHORT, MODEL_LABEL } from '@/lib/constants'
import { formatAccuracy } from '@/lib/format'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  decodeModel,
  encodeModel,
  type ModelSelection,
} from '@/components/shared/modelValue'
import type { PretrainedModelName } from '@/lib/api/types'

interface ModelSelectProps {
  models: ModelsResponse
  value: ModelSelection | null
  onChange: (sel: ModelSelection) => void
  id?: string
}

/** Selector de modelo: agrupa preentrenados y custom, con accuracy de test visible. */
export function ModelSelect({ models, value, onChange, id }: ModelSelectProps) {
  return (
    <Select
      value={value ? encodeModel(value) : undefined}
      onValueChange={(v) => {
        const sel = decodeModel(v)
        if (sel) onChange(sel)
      }}
    >
      <SelectTrigger id={id} className="h-12">
        <SelectValue placeholder="Elige un modelo" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Preentrenados</SelectLabel>
          {models.pretrained.map((m) => (
            <SelectItem key={m.name} value={`p:${m.name}`}>
              <span className="flex w-full items-center justify-between gap-3">
                <span className="font-medium">
                  {MODEL_LABEL[m.name as PretrainedModelName] ?? m.name}
                </span>
                <span className="tabular text-xs text-muted-foreground">
                  {formatAccuracy(m.test_accuracy)} test
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>

        {models.custom.length > 0 ? (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="flex items-center gap-1.5">
                <Sparkles className="size-3 text-primary" />
                Mis modelos
              </SelectLabel>
              {models.custom.map((m) => (
                <SelectItem key={m.id} value={`c:${m.id}`}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate">{m.name}</span>
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {ALGORITHM_SHORT[m.algorithm]}
                      </span>
                    </span>
                    <span className="tabular text-xs text-muted-foreground">
                      {formatAccuracy(m.test_accuracy)} test
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        ) : null}
      </SelectContent>
    </Select>
  )
}
