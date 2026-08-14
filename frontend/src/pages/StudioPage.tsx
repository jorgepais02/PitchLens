import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ListFilter, Lock, MoreHorizontal, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Algorithm, type CustomModel, type TrainResult } from '../lib/api'
import { useAuth } from '../context/auth'
import AuthModal from '../components/AuthModal'
import { SEP, Spinner } from '../components/shared'
import { FEATURE_LABELS } from '../lib/format'
import { useIsMobile, useIsNarrow } from '../lib/useMediaQuery'

const PRIMARY   = 'rgba(255,255,255,0.92)'
const SECTION   = 'rgba(255,255,255,0.85)'  // headers de sección — por debajo del h1 de título
const SECONDARY = 'rgba(255,255,255,0.45)'
const DIM       = 'rgba(255,255,255,0.28)'

const PRETRAINED = [
  { key: 'baseline', label: 'Baseline', val_acc: 0.5428, test_acc: 0.5378, test_log_loss: 0.9565,
    desc: 'ELO histórico · puntos en temporada · historial H2H' },
  { key: 'extended', label: 'Extended', val_acc: 0.5409, test_acc: 0.5466, test_log_loss: 0.9506,
    desc: 'Baseline + xG generado/encajado · tiros a puerta · descanso' },
  { key: 'market',   label: 'Market',   val_acc: 0.5360, test_acc: 0.5731, test_log_loss: 0.9324,
    desc: 'Extended + probabilidad implícita de cierre Pinnacle' },
] as const


const FEATURE_BLOCKS: { title: string; features: string[] }[] = [
  { title: 'BLOQUE A — Contexto global',   features: ['elo_diff_pre', 'points_diff_global', 'points_diff_venue'] },
  { title: 'BLOQUE B — Forma reciente (últimos 5 partidos)',   features: ['goal_diff_last5_global', 'xg_diff_last5_global', 'goal_diff_last5_venue', 'xg_conceded_diff_last5_global', 'sot_diff_last5_global'] },
  { title: 'BLOQUE C — Historial directo', features: ['h2h_goal_diff_last5', 'h2h_result_diff_last5'] },
  { title: 'BLOQUE D — Mercado',           features: ['prob_diff_market'] },
]

const FEATURE_DESC: Record<string, string> = {
  elo_diff_pre:                  'Nivel de cada equipo según su historial de resultados.',
  points_diff_global:            'Puntos sumados en la última temporada jugada por cada equipo.',
  points_diff_venue:             'Puntos sumados en la última temporada, sólo los partidos en casa del local y los de fuera del visitante.',
  goal_diff_last5_global:        'Balance entre los goles marcados y encajados.',
  goal_diff_last5_venue:         'Balance entre goles marcados y encajados, sólo en casa el local y fuera el visitante.',
  sot_diff_last5_global:         'Balance entre los tiros a puerta a favor y en contra.',
  xg_diff_last5_global:          'Balance entre el xG generado y el concedido.',
  xg_conceded_diff_last5_global: 'Calidad de las ocasiones que cada equipo permite al rival.',
  rest_days_diff:                'Días de descanso desde el último partido.',
  prob_diff_market:              'Probabilidad de victoria según las cuotas de cierre de Pinnacle.',
  h2h_goal_diff_last5:           'Saldo de goles en los últimos 5 enfrentamientos.',
  h2h_result_diff_last5:         'Resultados en los últimos 5 enfrentamientos.',
}

const ALGORITHMS: { key: Algorithm; short: string; name: string; desc: string }[] = [
  { key: 'lr',  short: 'LR',  name: 'Logistic Regression', desc: 'Modelo lineal con regularización L2 y bien calibrado' },
  { key: 'dt',  short: 'DT',  name: 'Decision Tree',       desc: 'Árbol de decisión interpretable, calibrado con sigmoide' },
  { key: 'rf',  short: 'RF',  name: 'Random Forest',       desc: 'Ensemble de árboles con calibración de probabilidades' },
  { key: 'xgb', short: 'XGB', name: 'XGBoost',             desc: 'Gradient boosting sobre árboles de decisión calibrado' },
]

const ALGO_SHORT: Record<string, string> = { lr: 'LR', dt: 'DT', rf: 'RF', xgb: 'XGB' }

const NAME_MAX = 30
const DESC_MAX = 80

const fmtAcc = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : '—'
const fmtLoss = (v: number | null | undefined) => v != null ? v.toFixed(4) : '—'

function timeAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
}

/** Una métrica del modelo entrenado: rótulo, cifra grande y explicación. */
function Metric({ label, value, sub, dim, narrow }: {
  label: string; value: string; sub: string; dim: boolean; narrow: boolean
}) {
  return (
    <div style={{ minWidth: narrow ? 0 : 138, flex: narrow ? '1 1 46%' : undefined }}>
      <div style={{
        fontSize: 13, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: dim ? DIM : 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-sans)', marginBottom: 12,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 'clamp(30px, 8vw, 50px)', fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em',
        color: dim ? SECONDARY : PRIMARY,
        fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 13.5, color: dim ? DIM : 'rgba(255,255,255,0.45)',
        fontFamily: 'var(--font-sans)', marginTop: 10,
      }}>
        {sub}
      </div>
    </div>
  )
}

function ModelCard({ model, onView, onDelete }: { model: CustomModel; onView: () => void; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  return (
    <div
      onClick={onView}
      onMouseEnter={e => { e.currentTarget.style.background = '#2a2a2f'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#232327'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)' }}
      style={{
        position: 'relative', background: '#232327',
        border: '1px solid var(--color-border-subtle)', borderRadius: 10,
        padding: 'clamp(16px, 4vw, 22px) clamp(16px, 5vw, 28px)',
        cursor: 'pointer', transition: 'border-color var(--duration-fast), background var(--duration-fast)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'clamp(10px, 3vw, 24px)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
            <span style={{
              fontSize: 20, fontWeight: 700, color: PRIMARY,
              fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {model.name}
            </span>
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.52)', fontFamily: 'var(--font-sans)' }}>
            {ALGO_SHORT[model.algorithm] ?? model.algorithm}
            <span style={{ margin: '0 8px', opacity: 0.65 }}>·</span>
            {model.features.length} features
            <span style={{ margin: '0 8px', opacity: 0.65 }}>·</span>
            entrenado {timeAgo(model.created_at)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 3vw, 30px)', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: 22, fontWeight: 700, color: PRIMARY,
              fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
            }}>
              {fmtAcc(model.test_accuracy)}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-sans)', marginTop: 3,
            }}>
              Accuracy
            </div>
          </div>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
              aria-label="Opciones"
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'transparent' }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 6,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.45)', transition: 'color var(--duration-fast), background var(--duration-fast)',
              }}
            >
              <MoreHorizontal size={17} />
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 34, zIndex: 50,
                background: '#222224', border: '1px solid #2e2e30', borderRadius: 8,
                padding: '4px 0', minWidth: 148, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); onView() }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'left' }}
                >
                  Ver comparación
                </button>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete() }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-error)', fontSize: 13, textAlign: 'left' }}
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function RankingSection({ customModels }: { customModels: CustomModel[] }) {
  const all = [
    ...customModels.map(m => ({
      key: String(m.id), name: m.name, acc: m.test_accuracy ?? 0,
      algorithm: m.algorithm, isCustom: true as const,
    })),
    ...PRETRAINED.map(m => ({
      key: m.key, name: m.label, acc: m.test_acc,
      algorithm: 'lr', isCustom: false as const,
    })),
  ].sort((a, b) => b.acc - a.acc)

  return (
    <div style={{ marginTop: 52 }}>
      <h2 style={{
        margin: '0 0 4px', fontSize: 'clamp(1.2rem, 3.8vw, 1.5rem)', fontWeight: 600,
        letterSpacing: '-0.01em', color: SECTION, fontFamily: 'var(--font-sans)',
      }}>
        Ranking
      </h2>
      {all.map((m, i) => (
        <div key={m.key} style={{
          display: 'grid',
          gridTemplateColumns: '20px minmax(0,1fr) 40px 0px clamp(52px, 14vw, 64px)',
          alignItems: 'center', gap: 'clamp(10px, 3vw, 24px)',
          padding: '16px 0',
          borderBottom: `0.5px solid ${SEP}`,
        }}>
          <span style={{
            textAlign: 'right', fontSize: 16,
            color: m.isCustom ? 'rgba(255,255,255,0.75)' : DIM,
            fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
          }}>
            {i + 1}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 19, fontWeight: m.isCustom ? 500 : 400,
              color: m.isCustom ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
              fontFamily: 'var(--font-sans)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {m.name}
            </div>
            {!m.isCustom && (
              <div style={{ fontSize: 13, color: DIM, fontFamily: 'var(--font-sans)', marginTop: 3 }}>
                preentrenado
              </div>
            )}
          </div>
          <span style={{
            fontSize: 14, fontWeight: 700, letterSpacing: '0.05em',
            fontFamily: 'var(--font-mono)', textAlign: 'right',
            color: m.isCustom ? 'rgba(255,255,255,0.75)' : DIM,
          }}>
            {ALGO_SHORT[m.algorithm] ?? m.algorithm.toUpperCase()}
          </span>
          <span />
          <span style={{
            textAlign: 'right', fontSize: 19, fontWeight: m.isCustom ? 500 : 400,
            color: m.isCustom ? 'rgba(255,255,255,0.75)' : DIM,
            fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtAcc(m.acc)}
          </span>
        </div>
      ))}
    </div>
  )
}

type SortKey = 'recent' | 'features' | 'name'
const SORT_LABELS: Record<SortKey, string> = { recent: 'Recientes', features: 'Nº features', name: 'Modelo' }

function ListView({ onCreate, onShowAuth, onView }: { onCreate: () => void; onShowAuth: () => void; onView: (model: CustomModel) => void }) {
  const { isAuthenticated, token } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('recent')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortOpen) return
    const onClick = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSortOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [sortOpen])

  const { data: models, isLoading } = useQuery({
    queryKey: ['models', token],
    queryFn: () => api.models(token ?? undefined),
    enabled: isAuthenticated,
  })

  const handleDelete = async (model: CustomModel) => {
    if (!token) return
    try {
      await api.deleteCustomModel(model.id, token)
      toast.success(`Modelo «${model.name}» borrado`)
      queryClient.invalidateQueries({ queryKey: ['models'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al borrar el modelo')
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: 'calc(100svh - 220px)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, textAlign: 'center',
      }}>
        <div style={{
          width: 68, height: 68, borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={24} style={{ color: 'oklch(0.72 0.01 268)' }} />
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, color: PRIMARY, fontFamily: 'var(--font-sans)', marginBottom: 8 }}>
            Tu laboratorio de modelos
          </div>
          <p style={{ margin: 0, fontSize: 17, color: SECONDARY, fontFamily: 'var(--font-sans)', maxWidth: 420, lineHeight: 1.55 }}>
            Elige tus features, entrena tus propios modelos y compáralos con los preentrenados.
            Necesitas una cuenta para guardarlos.
          </p>
        </div>
        <button
          type="button"
          onClick={onShowAuth}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            padding: '12px 26px', borderRadius: 8, marginTop: 4,
            fontSize: '1rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
            background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.62)', cursor: 'pointer',
            transition: 'background 120ms, border-color 120ms, color 120ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' }}
        >
          Iniciar sesión
        </button>
      </div>
    )
  }

  const allModels = models?.custom ?? []
  const filtered = allModels
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === 'features') return b.features.length - a.features.length
      return a.name.localeCompare(b.name)
    })

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 5.4vw, 2.125rem)', fontWeight: 700, letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)' }}>
          Mis modelos
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{
          width: 260, maxWidth: '100%', minWidth: 0, flex: '1 1 160px',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: '#1a1a1c',
          border: '1px solid #2a2a2a', borderRadius: 6,
        }}>
          <Search size={13} style={{ flexShrink: 0, color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Buscar modelo…"
            value={search}
            maxLength={30}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: '0.9375rem', fontFamily: 'var(--font-sans)', color: '#f0f0f0',
            }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex', padding: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>

        <div ref={sortRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setSortOpen(o => !o)}
            title={`Ordenar: ${SORT_LABELS[sortBy]}`}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 4,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.35)',
              transition: 'color 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
          >
            <ListFilter size={16} />
          </button>
          {sortOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
              background: '#1a1a1c', border: '1px solid #2a2a2a', borderRadius: 8,
              padding: '4px', minWidth: 140,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setSortBy(key); setSortOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', borderRadius: 5,
                    fontSize: '0.9375rem', fontFamily: 'var(--font-sans)',
                    background: sortBy === key ? 'rgba(255,255,255,0.06)' : 'transparent',
                    color: sortBy === key ? PRIMARY : SECONDARY,
                    border: 'none', cursor: 'pointer',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={e => { if (sortBy !== key) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (sortBy !== key) e.currentTarget.style.background = 'transparent' }}
                >
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={onCreate}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
            padding: '8px 18px', borderRadius: 6,
            fontSize: '0.9375rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
            background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.62)', cursor: 'pointer',
            transition: 'background 120ms, border-color 120ms, color 120ms',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.75)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.62)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' }}
        >
          <Plus size={14} strokeWidth={2} /> Nuevo modelo
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <Spinner />
        </div>
      ) : allModels.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 16, color: DIM, fontFamily: 'var(--font-sans)' }}>
            Aún no has entrenado ningún modelo — crea el primero
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 16, color: DIM, fontFamily: 'var(--font-sans)' }}>
            Sin resultados para «{search}».
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(m => (
            <ModelCard key={m.id} model={m} onView={() => onView(m)} onDelete={() => handleDelete(m)} />
          ))}
        </div>
      )}

      {allModels.length > 0 && <RankingSection customModels={allModels} />}
    </div>
  )
}

interface CreateFormState {
  name: string
  description: string
  features: Set<string>
  algorithm: Algorithm | null
}

function CreateView({ form, setForm, isTraining, onBack, onSubmit }: {
  form: CreateFormState
  setForm: React.Dispatch<React.SetStateAction<CreateFormState>>
  isTraining: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  const [openBlock, setOpenBlock] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const toggleFeature = (f: string) => {
    setForm(prev => {
      const next = new Set(prev.features)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return { ...prev, features: next }
    })
  }

  const atMax = form.name.length >= NAME_MAX
  const descAtMax = form.description.length >= DESC_MAX
  const canSubmit = form.name.trim() !== '' && form.features.size > 0 && form.algorithm !== null && !isTraining

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <BackButton onClick={onBack} disabled={isTraining} />

      <h1 style={{
        margin: '18px 0 0', fontSize: 'clamp(1.6rem, 5.4vw, 2.125rem)', fontWeight: 700,
        letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
      }}>
        Nuevo modelo
      </h1>
      <p style={{ margin: '8px 0 36px', fontSize: 19, color: SECONDARY, fontFamily: 'var(--font-sans)' }}>
        Configura tu modelo. Se entrena y evalúa con el mismo split temporal que los preentrenados.
      </p>

      <div style={{ marginBottom: 44 }}>
        <label htmlFor="model-name" style={{
          display: 'block', marginBottom: 14,
          fontSize: 'clamp(1.2rem, 3.8vw, 1.5rem)', fontWeight: 600, letterSpacing: '-0.01em',
          color: SECTION, fontFamily: 'var(--font-sans)',
        }}>
          Nombre
        </label>
        <input
          id="model-name"
          className="studio-name-input"
          type="text"
          placeholder="Random Forest · xG + ELO"
          value={form.name}
          maxLength={NAME_MAX}
          size={NAME_MAX}
          disabled={isTraining}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
          style={{
            maxWidth: 320, padding: '13px 16px',
            background: '#1a1a1c',
            border: `1px solid ${atMax ? 'var(--color-error)' : '#2a2a2a'}`,
            boxShadow: atMax ? '0 0 0 3px var(--color-error-subtle)' : 'none',
            borderRadius: 6, color: '#f0f0f0',
            fontSize: '1.0625rem', fontFamily: 'var(--font-sans)', outline: 'none',
            transition: 'border-color 120ms, box-shadow 120ms',
          }}
          onFocus={e => { if (!atMax) e.currentTarget.style.borderColor = '#4a4a4a' }}
          onBlur={e => { if (!atMax) e.currentTarget.style.borderColor = '#2a2a2a' }}
        />
        {atMax && (
          <p style={{
            width: '100%', maxWidth: 320, margin: '6px 0 0', textAlign: 'right',
            fontSize: 13.5, fontWeight: 500, color: 'var(--color-error)',
            fontFamily: 'var(--font-sans)', fontFeatureSettings: 'normal',
          }}>
            Máximo {NAME_MAX} caracteres
          </p>
        )}
      </div>

      <div style={{ marginBottom: 44 }}>
        <label htmlFor="model-desc" style={{
          display: 'block', marginBottom: 14,
          fontSize: 'clamp(1.2rem, 3.8vw, 1.5rem)', fontWeight: 600, letterSpacing: '-0.01em',
          color: SECTION, fontFamily: 'var(--font-sans)',
        }}>
          Descripción <span style={{ fontSize: '0.95rem', fontWeight: 400, color: SECONDARY }}>· opcional</span>
        </label>
        <input
          id="model-desc"
          type="text"
          placeholder="Forma reciente y señal de mercado, sin H2H"
          value={form.description}
          maxLength={DESC_MAX}
          disabled={isTraining}
          onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          style={{
            width: '100%', maxWidth: 520, padding: '13px 16px',
            background: '#1a1a1c',
            border: `1px solid ${descAtMax ? 'var(--color-error)' : '#2a2a2a'}`,
            boxShadow: descAtMax ? '0 0 0 3px var(--color-error-subtle)' : 'none',
            borderRadius: 6, color: '#f0f0f0',
            fontSize: '1.0625rem', fontFamily: 'var(--font-sans)', outline: 'none',
            transition: 'border-color 120ms, box-shadow 120ms',
          }}
          onFocus={e => { if (!descAtMax) e.currentTarget.style.borderColor = '#4a4a4a' }}
          onBlur={e => { if (!descAtMax) e.currentTarget.style.borderColor = '#2a2a2a' }}
        />
        <p style={{
          width: '100%', maxWidth: 520, margin: '6px 0 0', textAlign: 'right',
          fontSize: 13.5, fontWeight: 500,
          color: descAtMax ? 'var(--color-error)' : SECONDARY,
          fontFamily: 'var(--font-sans)', fontFeatureSettings: 'normal',
        }}>
          {descAtMax ? `Máximo ${DESC_MAX} caracteres` : 'Aparecerá en la tarjeta del selector'}
        </p>
      </div>

      <div style={{ marginBottom: 44 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 'clamp(1.2rem, 3.8vw, 1.5rem)', fontWeight: 600, letterSpacing: '-0.01em', color: SECTION, fontFamily: 'var(--font-sans)' }}>
          Features
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 17, color: SECONDARY, fontFamily: 'var(--font-sans)' }}>
          Cada feature compara al equipo local con el visitante (valor del local menos el del visitante).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FEATURE_BLOCKS.map(block => {
            const isOpen = openBlock === block.title
            const selectedInBlock = block.features.filter(f => form.features.has(f)).length
            const bodyId = `feat-block-${block.title.replace(/[^a-zA-Z0-9]+/g, '-')}`
            return (
              <div key={block.title} style={{
                borderRadius: 12, overflow: 'hidden',
                border: `1px solid ${isOpen ? 'oklch(0.63 0.21 272 / 0.45)' : 'var(--color-border-subtle)'}`,
                background: isOpen ? 'oklch(0.63 0.21 272 / 0.04)' : 'var(--color-surface)',
                transition: 'border-color 150ms, background 150ms',
              }}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={bodyId}
                  disabled={isTraining}
                  onClick={() => setOpenBlock(isOpen ? null : block.title)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    padding: '17px 20px', textAlign: 'left',
                    background: 'transparent', border: 'none',
                    cursor: isTraining ? 'default' : 'pointer',
                    fontFamily: 'var(--font-sans)', transition: 'background 150ms',
                  }}
                  onMouseEnter={e => { if (!isTraining && !isOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <ChevronDown
                    size={19}
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      color: isOpen ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                      transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 180ms ease, color 150ms',
                    }}
                  />
                  <span style={{
                    flex: 1, fontSize: 16, fontWeight: 600, letterSpacing: '0.005em',
                    color: isOpen ? '#a5b4fc' : 'rgba(255,255,255,0.75)',
                    transition: 'color 150ms',
                  }}>
                    {block.title}
                  </span>
                  <span style={{
                    flexShrink: 0, fontSize: 16, fontWeight: 500,
                    color: isOpen ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                    fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {selectedInBlock}/{block.features.length}
                  </span>
                </button>

                {isOpen && (
                  <div id={bodyId} style={{
                    padding: '6px 14px 16px',
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                    gap: '2px 24px',
                  }}>
                    {block.features.map(f => {
                      const checked = form.features.has(f)
                      return (
                        <button
                          key={f}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          disabled={isTraining}
                          onClick={() => toggleFeature(f)}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12,
                            width: '100%', textAlign: 'left',
                            padding: '14px 10px', borderRadius: 8,
                            background: 'transparent', border: 'none',
                            cursor: isTraining ? 'default' : 'pointer',
                            fontFamily: 'var(--font-sans)', transition: 'background 150ms',
                          }}
                          onMouseEnter={e => { if (!isTraining) e.currentTarget.style.background = 'rgba(255,255,255,0.055)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2,
                            background: checked ? '#a5b4fc' : 'transparent',
                            border: `1.5px solid ${checked ? '#a5b4fc' : '#3a3a3a'}`,
                            transition: 'background 150ms, border-color 150ms',
                          }}>
                            {checked && <Check size={12} strokeWidth={3} color="#111" />}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                              display: 'block', fontSize: 17,
                              color: checked ? '#f0f0f0' : 'rgba(255,255,255,0.82)',
                              transition: 'color 150ms',
                            }}>
                              {FEATURE_LABELS[f] ?? f}
                            </span>
                            <span style={{
                              display: 'block', marginTop: 4, fontSize: 15, lineHeight: 1.45,
                              color: 'rgba(255,255,255,0.34)',
                            }}>
                              {FEATURE_DESC[f] ?? ''}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 44 }}>
        <h2 style={{ margin: '0 0 18px', fontSize: 'clamp(1.2rem, 3.8vw, 1.5rem)', fontWeight: 600, letterSpacing: '-0.01em', color: SECTION, fontFamily: 'var(--font-sans)' }}>
          Algoritmo
        </h2>
        <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
          {ALGORITHMS.map(a => {
            const isActive = form.algorithm === a.key
            return (
              <button
                key={a.key}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={isTraining}
                onClick={() => setForm(prev => ({ ...prev, algorithm: a.key }))}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  textAlign: 'left', padding: '16px 18px', borderRadius: 10,
                  background: isActive ? 'var(--color-accent-subtle)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                  cursor: isTraining ? 'default' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'background 150ms, border-color 150ms',
                }}
                onMouseEnter={e => { if (!isActive && !isTraining) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 16, fontWeight: isActive ? 600 : 500, color: isActive ? '#e8e8e8' : 'rgba(255,255,255,0.75)' }}>
                    {a.name}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.06em',
                    color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.33)',
                  }}>
                    {a.short}
                  </span>
                </div>
                <span style={{ fontSize: 15, lineHeight: 1.45, color: isActive ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.42)' }}>
                  {a.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: isMobile ? '100%' : 320, padding: '14px 30px', borderRadius: 6,
            fontSize: '1.0625rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'background 120ms, border-color 120ms, color 120ms',
            ...(canSubmit
              ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.62)' }
              : { background: 'transparent', color: '#333', border: '1px solid #222' }
            ),
          }}
          onMouseEnter={e => { if (canSubmit) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff' } }}
          onMouseLeave={e => { if (canSubmit) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' } }}
        >
          {isTraining
            ? <><Spinner size={16} /> Entrenando — puede tardar hasta 30s...</>
            : <>Entrenar modelo <ArrowRight size={16} aria-hidden="true" /></>
          }
        </button>
      </div>
    </div>
  )
}

function ImportanceChart({ importance }: { importance: { feature: string; importance: number }[] }) {
  const sorted = [...importance].sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
  const maxAbs = Math.max(...sorted.map(r => Math.abs(r.importance)), 1e-9)

  return (
    <div>
      {sorted.map((row, i) => (
        <div key={row.feature} style={{
          paddingTop: 20, paddingBottom: 20,
          borderBottom: i === sorted.length - 1 ? 'none' : `0.5px solid ${SEP}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: '0.01em', color: 'rgba(255,255,255,0.78)', fontFamily: 'var(--font-sans)' }}>
              {FEATURE_LABELS[row.feature] ?? row.feature}
            </span>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.06 + 1.7, duration: 1.0, ease: 'easeOut' }}
              style={{
                fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
                fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
              }}
            >
              {row.importance.toFixed(3)}
            </motion.span>
          </div>
          <div style={{ display: 'flex', height: 11, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 2.0, ease: [0.33, 1, 0.68, 1], delay: i * 0.06 }}
              style={{
                width: `${(Math.abs(row.importance) / maxAbs) * 100}%`,
                background: 'var(--color-accent)', borderRadius: 99,
                boxShadow: '0 0 10px 0px oklch(0.63 0.21 272 / 0.35)',
                transformOrigin: 'left',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

const CHART_H = 360

function ComparisonChart({ result }: { result: TrainResult }) {
  const entries = [
    { label: result.name, acc: result.test_accuracy, loss: result.test_log_loss, mine: true },
    ...PRETRAINED.map(m => ({ label: m.label, acc: m.test_acc, loss: m.test_log_loss, mine: false })),
  ]
  const accs = entries.map(e => e.acc)
  const pad = 0.008
  const axisMin = Math.min(...accs) - pad
  const axisMax = Math.max(...accs) + pad
  const axisRange = axisMax - axisMin
  const toY = (v: number) => ((v - axisMin) / axisRange) * CHART_H

  const step = axisRange <= 0.08 ? 0.01 : axisRange <= 0.16 ? 0.02 : 0.05
  const guides: number[] = []
  for (
    let g = Math.ceil((axisMin + step * 0.5) / step) * step;
    g < axisMax - step * 0.1;
    g = Math.round((g + step) * 10000) / 10000
  ) {
    guides.push(g)
  }


  return (
    <div>
      <div style={{ position: 'relative', height: CHART_H }}>
        {guides.map(g => (
          <div key={g} style={{
            position: 'absolute', left: 0, right: 0, bottom: toY(g),
            display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'none',
            transform: 'translateY(50%)',
          }}>
            <span style={{
              width: 38, flexShrink: 0, textAlign: 'left',
              fontSize: 12, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
              color: DIM,
            }}>
              {(g * 100).toFixed(0)}%
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          </div>
        ))}

        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', gap: 20, pointerEvents: 'none',
          transform: 'translateY(50%)',
        }}>
          <span style={{
            width: 38, flexShrink: 0, textAlign: 'left',
            fontSize: 12, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
            color: DIM,
          }}>
            {(axisMin * 100).toFixed(0)}%
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: entries.length * 0.06 + 2.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute', left: 50, right: 0, bottom: 0,
            height: toY(result.test_accuracy),
            background: 'linear-gradient(to top, oklch(0.63 0.21 272 / 0) 0%, oklch(0.63 0.21 272 / 0.03) 70%, oklch(0.63 0.21 272 / 0.07) 100%)',
            borderTop: '1px solid oklch(0.63 0.21 272 / 0.28)',
            pointerEvents: 'none', transformOrigin: 'left',
          }}
        />

        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 50, right: 0,
          display: 'flex', gap: 12,
        }}>
          {entries.map((e, i) => {
            const yPx = toY(e.acc)
            const delay = i * 0.06
            const dotSize = e.mine ? 18 : 15
            const beatsMine = !e.mine && e.acc > result.test_accuracy

            return (
              <div key={e.label} style={{ flex: 1, position: 'relative' }}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: yPx }}
                  transition={{ duration: 2.0, ease: [0.33, 1, 0.68, 1], delay }}
                  style={{
                    position: 'absolute', bottom: 0, left: '50%',
                    width: e.mine ? 2 : 1.5,
                    background: e.mine ? 'oklch(0.63 0.21 272 / 0.4)' : 'rgba(255,255,255,0.18)',
                    transform: 'translateX(-50%)',
                  }}
                />
                <motion.div
                  initial={{ bottom: 0 }}
                  animate={{ bottom: yPx }}
                  transition={{ duration: 2.0, ease: [0.33, 1, 0.68, 1], delay }}
                  style={{ position: 'absolute', left: '50%', width: 0, height: 0 }}
                >
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: delay + 1.7, duration: 1.0, ease: 'easeOut' }}
                    style={{
                      position: 'absolute',
                      bottom: dotSize / 2 + 7,
                      left: '50%', transform: 'translateX(-50%)',
                      fontSize: 'clamp(12px, 3.2vw, 17px)', fontWeight: e.mine ? 700 : beatsMine ? 600 : 500,
                      color: e.mine ? '#a5b4fc' : beatsMine ? 'rgba(255,255,255,0.9)' : DIM,
                      fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmtAcc(e.acc)}
                  </motion.span>
                  <div style={{
                    position: 'absolute',
                    width: dotSize, height: dotSize, borderRadius: '50%',
                    background: e.mine ? 'var(--color-accent)' : beatsMine ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.3)',
                    boxShadow: e.mine
                      ? '0 0 14px 3px oklch(0.63 0.21 272 / 0.55)'
                      : beatsMine ? '0 0 10px 2px rgba(255,255,255,0.18)' : 'none',
                    transform: 'translate(-50%, -50%)',
                  }} />
                </motion.div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', paddingLeft: 50, gap: 12, marginTop: 15 }}>
        {entries.map(e => (
          <div key={e.label} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              fontSize: 'clamp(12px, 3.2vw, 16.5px)', fontWeight: e.mine ? 600 : 400,
              color: e.mine ? 'rgba(255,255,255,0.78)' : SECONDARY,
              fontFamily: 'var(--font-sans)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {e.mine ? 'Tu modelo' : e.label}
            </div>
            <div style={{
              fontSize: 13, color: e.mine ? 'rgba(255,255,255,0.7)' : DIM, fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums', marginTop: 3,
            }}>
              {fmtLoss(e.loss)}
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}

function ResultView({ result, onBack }: { result: TrainResult; onBack: () => void }) {
  const isNarrow = useIsNarrow()
  return (
    <div>
      <title>{`${result.name} · PitchLens`}</title>
      <BackButton onClick={onBack} />

      <div style={{ margin: '12px 0 26px' }}>
        <h1 style={{
          margin: '0 0 8px', fontSize: 'clamp(1.6rem, 5.4vw, 2.125rem)', fontWeight: 700,
          letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
        }}>
          {result.name}
        </h1>
        <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-sans)' }}>
          {ALGORITHMS.find(a => a.key === result.algorithm)?.name ?? result.algorithm}
          <span style={{ margin: '0 10px', opacity: 0.85 }}>·</span>
          {result.features.length} features
        </div>
      </div>

      {(() => {
        return (
          <div style={{
            display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap',
            gap: isNarrow ? 26 : 60,
            paddingBottom: 26, marginBottom: 30, borderBottom: `0.5px solid ${SEP}`,
          }}>
            <div style={{ display: 'flex', gap: isNarrow ? 20 : 44, flex: isNarrow ? '1 1 100%' : undefined }}>
              <Metric label="Test accuracy" value={fmtAcc(result.test_accuracy)} sub="Predicciones correctas en test" dim={false} narrow={isNarrow} />
              <Metric label="Test log loss" value={fmtLoss(result.test_log_loss)} sub="Más bajo = mejor calibración" dim={false} narrow={isNarrow} />
            </div>
            <div style={{ display: 'flex', gap: isNarrow ? 20 : 44, flex: isNarrow ? '1 1 100%' : undefined }}>
              <Metric label="Val accuracy" value={fmtAcc(result.val_accuracy)} sub="Acierto en validación" dim narrow={isNarrow} />
              <Metric label="Val log loss" value={fmtLoss(result.val_log_loss)} sub="Calibración en validación" dim narrow={isNarrow} />
            </div>
          </div>
        )
      })()}

      <div style={{
        display: 'flex', alignItems: 'stretch', gap: 0,
        flexDirection: isNarrow ? 'column' : 'row',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', marginBottom: 8, fontSize: 'clamp(1.2rem, 3.8vw, 1.5rem)', fontWeight: 600, letterSpacing: '-0.01em', color: SECTION, fontFamily: 'var(--font-sans)' }}>
            Importancia de features
          </span>
          <p style={{ margin: '0 0 14px', fontSize: 18, color: SECONDARY, fontFamily: 'var(--font-sans)' }}>
            Peso relativo de cada variable en el modelo.
          </p>
          <ImportanceChart importance={result.feature_importance} />
        </div>

        <div style={isNarrow
          ? { height: 0, borderTop: '1px dashed rgba(255,255,255,0.12)', flexShrink: 0, margin: '48px 0' }
          : { width: 0, borderLeft: '1px dashed rgba(255,255,255,0.12)', flexShrink: 0, margin: '0 64px' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', marginBottom: 8, fontSize: 'clamp(1.2rem, 3.8vw, 1.5rem)', fontWeight: 600, letterSpacing: '-0.01em', color: SECTION, fontFamily: 'var(--font-sans)' }}>
            Frente a los preentrenados
          </span>
          <p style={{ margin: '0 0 14px', fontSize: 18, color: SECONDARY, fontFamily: 'var(--font-sans)' }}>
            Métricas de test frente a los 3 preentrenados.
          </p>
          <div style={{ paddingTop: 20 }}>
            <ComparisonChart result={result} />
          </div>
        </div>
      </div>
    </div>
  )
}

function BackButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 10px', marginLeft: -10, borderRadius: 6,
        fontSize: '0.9375rem', fontFamily: 'var(--font-sans)',
        background: 'transparent', border: 'none',
        color: 'var(--color-ink-muted)', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'color var(--duration-fast)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--color-ink)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-muted)' }}
    >
      <ArrowLeft size={15} /> Mis modelos
    </button>
  )
}

function ResultRoute({ cached, onBack }: { cached: TrainResult | null; onBack: () => void }) {
  const { id } = useParams<{ id: string }>()
  const { isAuthenticated, token } = useAuth()
  const modelId = Number(id)

  const { data: models, isLoading } = useQuery({
    queryKey: ['models', token],
    queryFn: () => api.models(token ?? undefined),
    enabled: isAuthenticated,
  })

  if (!isAuthenticated) return <Navigate to="/studio" replace />

  let result: TrainResult | null = cached && cached.model_id === modelId ? cached : null
  if (!result) {
    const m = models?.custom.find(m => m.id === modelId)
    if (m) {
      result = {
        model_id: m.id,
        name: m.name,
        algorithm: m.algorithm,
        features: m.features,
        val_accuracy: m.val_accuracy ?? 0,
        val_log_loss: m.val_log_loss ?? 0,
        test_accuracy: m.test_accuracy ?? 0,
        test_log_loss: m.test_log_loss ?? 0,
        feature_importance: m.feature_importance,
      }
    }
  }

  if (!result) {
    if (isLoading) {
      return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><Spinner /></div>
    }
    return <Navigate to="/studio" replace />
  }

  return <ResultView result={result} onBack={onBack} />
}

export default function StudioPage() {
  const { isAuthenticated, token } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  const [authOpen, setAuthOpen] = useState(false)
  // Si quedó un entrenamiento a medias, la pantalla tiene que arrancar ya en
  // "entrenando". El dato está disponible en el primer render (el token sale de
  // localStorage de forma síncrona), así que se calcula aquí en vez de
  // arreglarlo luego con un setState dentro del efecto, que pintaba un primer
  // frame en falso.
  const [isTraining, setIsTraining] = useState(
    () => Boolean(token) && sessionStorage.getItem('studio_job_id') !== null
  )
  const [result, setResult] = useState<TrainResult | null>(null)
  const [form, setForm] = useState<CreateFormState>({ name: '', description: '', features: new Set(), algorithm: null })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recuperacionLanzada = useRef(false)

  const isCreateRoute = location.pathname === '/studio/new'
  const isResultRoute = location.pathname.startsWith('/studio/models/')

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // Retoma el sondeo de un entrenamiento que quedó en curso al recargar.
  // La guarda por ref evita montar un segundo intervalo si el efecto se
  // reevalúa: sin ella, incluir las dependencias reales lo duplicaría.
  useEffect(() => {
    if (recuperacionLanzada.current) return
    const savedJobId = sessionStorage.getItem('studio_job_id')
    if (!savedJobId) return
    if (!token) {
      sessionStorage.removeItem('studio_job_id')
      return
    }
    recuperacionLanzada.current = true
    toast.info('Recuperando entrenamiento en curso...')
    pollRef.current = setInterval(async () => {
      try {
        const job = await api.trainJob(savedJobId, token)
        if (job.status === 'done' && job.result) {
          if (pollRef.current) clearInterval(pollRef.current)
          sessionStorage.removeItem('studio_job_id')
          setIsTraining(false)
          setResult(job.result)
          queryClient.invalidateQueries({ queryKey: ['models'] })
          navigate(`/studio/models/${job.result.model_id}`, { replace: true })
          toast.success(`Modelo «${job.result.name}» entrenado`)
        } else if (job.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current)
          sessionStorage.removeItem('studio_job_id')
          setIsTraining(false)
          toast.error(job.error ?? 'Error entrenando el modelo')
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current)
        sessionStorage.removeItem('studio_job_id')
        setIsTraining(false)
        toast.error('No se pudo recuperar el entrenamiento.')
      }
    }, 2000)
  }, [token, navigate, queryClient])

  useEffect(() => {
    const formDirty = form.name !== '' || form.description !== '' || form.features.size > 0 || form.algorithm !== null
    if (!isCreateRoute || isTraining || !formDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isCreateRoute, isTraining, form.name, form.description, form.features.size, form.algorithm])

  const handleCreate = () => {
    setForm({ name: '', description: '', features: new Set(), algorithm: null })
    navigate('/studio/new')
  }

  const handleViewModel = (model: CustomModel) => {
    navigate(`/studio/models/${model.id}`)
  }

  const handleSubmit = async () => {
    if (!token || !form.algorithm) return
    setIsTraining(true)
    try {
      const { job_id } = await api.train(
        { features: Array.from(form.features), algorithm: form.algorithm, name: form.name.trim(), description: form.description.trim() },
        token,
      )
      sessionStorage.setItem('studio_job_id', job_id)
      pollRef.current = setInterval(async () => {
        try {
          const job = await api.trainJob(job_id, token)
          if (job.status === 'done' && job.result) {
            if (pollRef.current) clearInterval(pollRef.current)
            sessionStorage.removeItem('studio_job_id')
            setIsTraining(false)
            setResult(job.result)
            queryClient.invalidateQueries({ queryKey: ['models'] })
            navigate(`/studio/models/${job.result.model_id}`, { replace: true })
            toast.success(`Modelo «${job.result.name}» entrenado`)
          } else if (job.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current)
            sessionStorage.removeItem('studio_job_id')
            setIsTraining(false)
            toast.error(job.error ?? 'Error entrenando el modelo')
          }
        } catch (err) {
          if (pollRef.current) clearInterval(pollRef.current)
          sessionStorage.removeItem('studio_job_id')
          setIsTraining(false)
          toast.error(err instanceof Error ? err.message : 'Error consultando el entrenamiento')
        }
      }, 2000)
    } catch (err) {
      setIsTraining(false)
      toast.error(err instanceof Error ? err.message : 'Error al lanzar el entrenamiento')
    }
  }

  return (
    <div style={{ minHeight: 'calc(100svh - 60px)', background: 'var(--color-bg)', paddingBottom: 80, fontFeatureSettings: '"ss09" 1' }}>
      {/* En la vista de resultado el título lo pone ResultView, que sí tiene el nombre. */}
      {!isResultRoute && <title>{isCreateRoute ? 'Nuevo modelo · PitchLens' : 'Studio · PitchLens'}</title>}
      <div style={{ maxWidth: isResultRoute ? 1100 : 900, margin: '0 auto', paddingTop: 48, paddingLeft: 24, paddingRight: 24 }}>
        <Routes>
          <Route
            index
            element={<ListView onCreate={handleCreate} onShowAuth={() => setAuthOpen(true)} onView={handleViewModel} />}
          />
          <Route
            path="new"
            element={
              isAuthenticated
                ? <CreateView
                    form={form}
                    setForm={setForm}
                    isTraining={isTraining}
                    onBack={() => navigate('/studio')}
                    onSubmit={handleSubmit}
                  />
                : <Navigate to="/studio" replace />
            }
          />
          <Route
            path="models/:id"
            element={<ResultRoute cached={result} onBack={() => navigate('/studio')} />}
          />
          <Route path="*" element={<Navigate to="/studio" replace />} />
        </Routes>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
