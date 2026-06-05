/**
 * Selección de modelo en el Predictor: preentrenado (por name) o custom (por id).
 * Helpers para codificar/decodificar al valor string de Radix Select y para
 * decidir si el modelo requiere cuotas (incluye la feature de mercado).
 */
import { MARKET_FEATURE } from '@/lib/constants'
import type {
  ModelsResponse,
  PretrainedModelName,
} from '@/lib/api/types'

export type ModelSelection =
  | { kind: 'pretrained'; name: PretrainedModelName }
  | { kind: 'custom'; id: number }

export function encodeModel(sel: ModelSelection): string {
  return sel.kind === 'pretrained' ? `p:${sel.name}` : `c:${sel.id}`
}

export function decodeModel(value: string): ModelSelection | null {
  if (value.startsWith('p:')) {
    return { kind: 'pretrained', name: value.slice(2) as PretrainedModelName }
  }
  if (value.startsWith('c:')) {
    const id = Number(value.slice(2))
    return Number.isNaN(id) ? null : { kind: 'custom', id }
  }
  return null
}

/** ¿El modelo seleccionado usa prob_diff_market? → pedir cuotas Pinnacle de cierre. */
export function modelRequiresOdds(sel: ModelSelection, models: ModelsResponse): boolean {
  if (sel.kind === 'pretrained') return sel.name === 'market'
  const custom = models.custom.find((m) => m.id === sel.id)
  return custom ? custom.features.includes(MARKET_FEATURE) : false
}

/** Etiqueta visible del modelo seleccionado. */
export function modelLabelOf(sel: ModelSelection, models: ModelsResponse): string {
  if (sel.kind === 'pretrained') {
    const m = models.pretrained.find((p) => p.name === sel.name)
    return m ? capitalize(m.name) : capitalize(sel.name)
  }
  const custom = models.custom.find((m) => m.id === sel.id)
  return custom?.name ?? `Modelo #${sel.id}`
}

/** Features del modelo seleccionado. */
export function modelFeaturesOf(sel: ModelSelection, models: ModelsResponse): string[] {
  if (sel.kind === 'pretrained') {
    return models.pretrained.find((p) => p.name === sel.name)?.features ?? []
  }
  return models.custom.find((m) => m.id === sel.id)?.features ?? []
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
