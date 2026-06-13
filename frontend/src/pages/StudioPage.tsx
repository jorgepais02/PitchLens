import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Lock, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Algorithm, type CustomModel, type TrainResult } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import AuthModal from '../components/AuthModal'
import { FEATURE_LABELS, SEP, Spinner, fmtDate } from '../components/shared'

type View = 'list' | 'create' | 'result'

const PRIMARY   = 'rgba(255,255,255,0.92)'
const SECONDARY = 'rgba(255,255,255,0.45)'
const DIM       = 'rgba(255,255,255,0.28)'

// Métricas de los 3 preentrenados — fuente de verdad (models/metrics.json)
const PRETRAINED = [
  { key: 'baseline', label: 'Baseline', val_acc: 0.5428, test_acc: 0.5378, test_log_loss: 0.9565,
    desc: 'ELO histórico · puntos en temporada · historial H2H' },
  { key: 'extended', label: 'Extended', val_acc: 0.5409, test_acc: 0.5466, test_log_loss: 0.9506,
    desc: 'Baseline + xG generado/encajado · tiros a puerta · descanso' },
  { key: 'market',   label: 'Market',   val_acc: 0.5360, test_acc: 0.5731, test_log_loss: 0.9324,
    desc: 'Extended + probabilidad implícita de cierre Pinnacle' },
] as const

const FEATURE_BLOCKS: { title: string; features: string[] }[] = [
  { title: 'Bloque A — Contexto global',   features: ['elo_diff_pre', 'points_diff_global', 'points_diff_venue'] },
  { title: 'Bloque B — Forma rolling 5',   features: ['goal_diff_last5_global', 'goal_diff_last5_venue', 'sot_diff_last5_global', 'xg_diff_last5_global', 'xg_conceded_diff_last5_global', 'rest_days_diff'] },
  { title: 'Bloque C — Historial directo', features: ['h2h_goal_diff_last5', 'h2h_result_diff_last5'] },
  { title: 'Bloque D — Mercado',           features: ['prob_diff_market'] },
]

const ALGORITHMS: { key: Algorithm; short: string; name: string; desc: string }[] = [
  { key: 'lr',  short: 'LR',  name: 'Logistic Regression', desc: 'Lineal con regularización L2 — el algoritmo de los modelos oficiales' },
  { key: 'dt',  short: 'DT',  name: 'Decision Tree',       desc: 'Árbol de decisión interpretable, calibrado con sigmoide' },
  { key: 'rf',  short: 'RF',  name: 'Random Forest',       desc: 'Ensemble de árboles con calibración de probabilidades' },
  { key: 'xgb', short: 'XGB', name: 'XGBoost',             desc: 'Gradient boosting sobre árboles, calibrado' },
]

const ALGO_SHORT: Record<string, string> = { lr: 'LR', dt: 'DT', rf: 'RF', xgb: 'XGB' }

const fmtAcc = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : '—'
const fmtLoss = (v: number | null | undefined) => v != null ? v.toFixed(4) : '—'

// ─── Piezas pequeñas ──────────────────────────────────────────────────────────
function AlgoBadge({ algorithm }: { algorithm: string }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20, flexShrink: 0,
      fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
      background: 'var(--color-accent-subtle)', color: '#a5b4fc',
      border: '1px solid rgba(99,102,241,0.35)',
      fontFamily: 'var(--font-sans)',
    }}>
      {ALGO_SHORT[algorithm] ?? algorithm}
    </span>
  )
}

function OfficialBadge() {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20, flexShrink: 0,
      fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
      background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)',
      border: '1px solid rgba(255,255,255,0.14)',
      fontFamily: 'var(--font-sans)',
    }}>
      Oficial
    </span>
  )
}

function MetricInline({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: strong ? 20 : 15, fontWeight: strong ? 600 : 500,
        color: strong ? PRIMARY : SECONDARY,
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  )
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 12,
  padding: '18px 20px',
  display: 'flex', flexDirection: 'column', gap: 14,
}

// ─── Vista list ───────────────────────────────────────────────────────────────
function ModelCard({ model, onDelete }: { model: CustomModel; onDelete: () => void }) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, color: PRIMARY,
          fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {model.name}
        </span>
        <AlgoBadge algorithm={model.algorithm} />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Borrar ${model.name}`}
          title="Borrar modelo"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-ink-faint)',
            transition: 'color var(--duration-fast), background var(--duration-fast)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--color-error)'
            e.currentTarget.style.background = 'var(--color-error-subtle)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-ink-faint)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        <MetricInline strong label="Test acc" value={fmtAcc(model.test_accuracy)} />
        <MetricInline label="Val acc" value={fmtAcc(model.val_accuracy)} />
        <MetricInline label="Log loss" value={fmtLoss(model.test_log_loss)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 12.5, color: DIM, fontFamily: 'var(--font-sans)' }}>
          {model.features.length} features · {fmtDate(model.created_at)}
        </span>
      </div>
    </div>
  )
}

function ListView({ onCreate, onShowAuth }: { onCreate: () => void; onShowAuth: () => void }) {
  const { isAuthenticated, token } = useAuth()
  const queryClient = useQueryClient()

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
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={22} style={{ color: 'var(--color-ink-muted)' }} />
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: PRIMARY, fontFamily: 'var(--font-sans)', marginBottom: 8 }}>
            Tu taller de modelos
          </div>
          <p style={{ margin: 0, fontSize: 16, color: SECONDARY, fontFamily: 'var(--font-sans)', maxWidth: 420, lineHeight: 1.55 }}>
            Elige tus features, entrena tu propio modelo y compáralo con los oficiales.
            Necesitas una cuenta para guardar tus modelos.
          </p>
        </div>
        <button
          type="button"
          onClick={onShowAuth}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            padding: '11px 24px', borderRadius: 6, marginTop: 4,
            fontSize: '0.9375rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
            background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.62)', cursor: 'pointer',
            transition: 'background 120ms, border-color 120ms, color 120ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' }}
        >
          <Lock size={13} /> Iniciar sesión
        </button>
      </div>
    )
  }

  const customModels = models?.custom ?? []

  return (
    <div>
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 44 }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: '2.125rem', fontWeight: 700,
            letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
          }}>
            Studio
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 400, color: SECONDARY, fontFamily: 'var(--font-sans)' }}>
            Entrena tus propios modelos y compáralos con los oficiales.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
            padding: '10px 20px', borderRadius: 6, marginTop: 6,
            fontSize: '0.9375rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
            background: 'var(--color-accent)', color: '#fff',
            border: 'none', cursor: 'pointer',
            transition: 'background var(--duration-fast)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-accent)' }}
        >
          <Plus size={14} strokeWidth={2.2} /> Crear nuevo modelo
        </button>
      </div>

      {/* Mis modelos */}
      <div style={{ marginBottom: 56 }}>
        <h2 style={{
          margin: '0 0 18px', fontSize: '1.375rem', fontWeight: 600,
          letterSpacing: '-0.01em', color: PRIMARY, fontFamily: 'var(--font-sans)',
        }}>
          Mis modelos
        </h2>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Spinner />
          </div>
        ) : customModels.length === 0 ? (
          <div style={{
            padding: '44px 0', textAlign: 'center',
            border: `1px dashed ${SEP}`, borderRadius: 12,
          }}>
            <p style={{ margin: 0, fontSize: 16, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-sans)' }}>
              Aún no has entrenado ningún modelo — crea el primero.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {customModels.map(m => (
              <ModelCard key={m.id} model={m} onDelete={() => handleDelete(m)} />
            ))}
          </div>
        )}
      </div>

      {/* Modelos de referencia */}
      <div>
        <h2 style={{
          margin: '0 0 18px', fontSize: '1.375rem', fontWeight: 600,
          letterSpacing: '-0.01em', color: PRIMARY, fontFamily: 'var(--font-sans)',
        }}>
          Modelos de referencia
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {PRETRAINED.map(m => (
            <div key={m.key} style={CARD_STYLE}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: PRIMARY, fontFamily: 'var(--font-sans)' }}>
                  {m.label}
                </span>
                <OfficialBadge />
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <MetricInline strong label="Test acc" value={fmtAcc(m.test_acc)} />
                <MetricInline label="Val acc" value={fmtAcc(m.val_acc)} />
                <MetricInline label="Log loss" value={fmtLoss(m.test_log_loss)} />
              </div>
              <span style={{ fontSize: 12.5, color: DIM, fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>
                {m.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Vista create ─────────────────────────────────────────────────────────────
interface CreateFormState {
  name: string
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
  const toggleFeature = (f: string) => {
    setForm(prev => {
      const next = new Set(prev.features)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return { ...prev, features: next }
    })
  }

  const canSubmit = form.name.trim() !== '' && form.features.size > 0 && form.algorithm !== null && !isTraining

  return (
    <div>
      <BackButton onClick={onBack} disabled={isTraining} />

      <h1 style={{
        margin: '18px 0 0', fontSize: '2.125rem', fontWeight: 700,
        letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
      }}>
        Nuevo modelo
      </h1>
      <p style={{ margin: '8px 0 36px', fontSize: 18, color: SECONDARY, fontFamily: 'var(--font-sans)' }}>
        Elige las features y el algoritmo — entrenamos con split temporal y te damos las métricas en test.
      </p>

      {/* Nombre */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 420, marginBottom: 40 }}>
        <label htmlFor="model-name" style={{
          fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-sans)',
        }}>
          Nombre del modelo
        </label>
        <input
          id="model-name"
          type="text"
          placeholder="Mi modelo"
          value={form.name}
          maxLength={100}
          disabled={isTraining}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
          style={{
            width: '100%', padding: '10px 12px',
            background: '#1a1a1c', border: '1px solid #2a2a2a',
            borderRadius: 6, color: '#f0f0f0',
            fontSize: '0.9375rem', fontFamily: 'var(--font-sans)', outline: 'none',
            transition: 'border-color 120ms',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = '#4a4a4a' }}
          onBlur={e => { e.currentTarget.style.borderColor = '#2a2a2a' }}
        />
      </div>

      {/* Features por bloque */}
      <div style={{ marginBottom: 44 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.01em', color: PRIMARY, fontFamily: 'var(--font-sans)' }}>
            Features
          </h2>
          <span style={{ fontSize: 14, color: form.features.size > 0 ? SECONDARY : DIM, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {form.features.size}/12
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '28px 36px' }}>
          {FEATURE_BLOCKS.map(block => (
            <div key={block.title}>
              <div style={{
                marginBottom: 10, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-sans)',
              }}>
                {block.title}
              </div>
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
                      display: 'flex', alignItems: 'center', gap: 11,
                      width: '100%', textAlign: 'left',
                      padding: '8px 10px', borderRadius: 8,
                      background: checked ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${checked ? 'rgba(255,255,255,0.10)' : 'transparent'}`,
                      cursor: isTraining ? 'default' : 'pointer',
                      fontFamily: 'var(--font-sans)',
                      transition: 'background 150ms, border-color 150ms',
                      marginBottom: 2,
                    }}
                    onMouseEnter={e => { if (!checked && !isTraining) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                    onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      background: checked ? 'rgba(255,255,255,0.85)' : 'transparent',
                      border: `1.5px solid ${checked ? 'rgba(255,255,255,0.85)' : '#3a3a3a'}`,
                      transition: 'background 150ms, border-color 150ms',
                    }}>
                      {checked && <Check size={11} strokeWidth={3} color="#111" />}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 15,
                      color: checked ? '#e8e8e8' : 'rgba(255,255,255,0.5)',
                      transition: 'color 150ms',
                    }}>
                      {FEATURE_LABELS[f] ?? f}
                    </span>
                    <span style={{
                      fontSize: 11.5, color: 'rgba(255,255,255,0.18)',
                      fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                    }}>
                      {f}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Algoritmo */}
      <div style={{ marginBottom: 44 }}>
        <h2 style={{ margin: '0 0 18px', fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.01em', color: PRIMARY, fontFamily: 'var(--font-sans)' }}>
          Algoritmo
        </h2>
        <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
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
                  display: 'flex', flexDirection: 'column', gap: 7,
                  textAlign: 'left', padding: '14px 16px', borderRadius: 10,
                  background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                  cursor: isTraining ? 'default' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'background 150ms, border-color 150ms',
                }}
                onMouseEnter={e => { if (!isActive && !isTraining) e.currentTarget.style.borderColor = 'var(--color-border)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--color-border-subtle)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)',
                    color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
                  }}>
                    {a.short}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: isActive ? 600 : 500, color: isActive ? '#e8e8e8' : 'rgba(255,255,255,0.6)' }}>
                    {a.name}
                  </span>
                </div>
                <span style={{ fontSize: 12.5, lineHeight: 1.45, color: isActive ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)' }}>
                  {a.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '13px 28px', borderRadius: 6,
            fontSize: '1rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
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
            ? <><Spinner size={14} /> Entrenando — puede tardar hasta 30s...</>
            : <>Entrenar modelo <ArrowRight size={15} aria-hidden="true" /></>
          }
        </button>
      </div>
    </div>
  )
}

// ─── Vista result ─────────────────────────────────────────────────────────────
function ImportanceChart({ importance }: { importance: { feature: string; importance: number }[] }) {
  const sorted = [...importance].sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
  const maxAbs = Math.max(...sorted.map(r => Math.abs(r.importance)), 1e-9)

  return (
    <div>
      {sorted.map((row, i) => (
        <div key={row.feature} style={{
          paddingTop: 14, paddingBottom: 14,
          borderBottom: i === sorted.length - 1 ? 'none' : `0.5px solid ${SEP}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
            <span style={{ fontSize: 15, fontWeight: 400, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-sans)' }}>
              {FEATURE_LABELS[row.feature] ?? row.feature}
            </span>
            <span style={{
              fontSize: 14, fontWeight: 600, color: SECONDARY,
              fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
            }}>
              {row.importance.toFixed(3)}
            </span>
          </div>
          <div style={{ display: 'flex', height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: `${(Math.abs(row.importance) / maxAbs) * 100}%`,
              background: 'var(--color-accent)', borderRadius: 99,
              boxShadow: '0 0 8px 0px rgba(99,102,241,0.30)',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ComparisonChart({ result }: { result: TrainResult }) {
  const entries = [
    { label: result.name, acc: result.test_accuracy, loss: result.test_log_loss, mine: true },
    ...PRETRAINED.map(m => ({ label: m.label, acc: m.test_acc, loss: m.test_log_loss, mine: false })),
  ]
  const accs = entries.map(e => e.acc)
  const min = Math.min(...accs) - 0.012
  const max = Math.max(...accs) + 0.012
  const toX = (v: number) => ((v - min) / (max - min)) * 100
  const myX = toX(result.test_accuracy)
  const beaten = PRETRAINED.filter(m => result.test_accuracy > m.test_acc).length

  return (
    <div>
      <div style={{ position: 'relative' }}>
        {/* Línea de referencia del modelo del usuario, cruza todas las filas */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `calc(150px + (100% - 150px - 64px) * ${myX / 100})`,
          width: 0, borderLeft: '1px dashed rgba(99,102,241,0.45)',
          pointerEvents: 'none',
        }} />

        {entries.map(e => (
          <div key={e.label} style={{ display: 'flex', alignItems: 'center', height: 56 }}>
            <span style={{
              width: 150, minWidth: 150, paddingRight: 14,
              fontSize: 15, fontWeight: e.mine ? 600 : 400,
              color: e.mine ? PRIMARY : SECONDARY, fontFamily: 'var(--font-sans)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {e.mine ? 'Tu modelo' : e.label}
            </span>
            <div style={{ flex: 1, position: 'relative', height: '100%', marginRight: 64 }}>
              {/* Pista */}
              <div style={{
                position: 'absolute', left: 0, right: 0, top: '50%', height: 1,
                background: 'rgba(255,255,255,0.08)',
              }} />
              <div style={{
                position: 'absolute', left: `${toX(e.acc)}%`, top: '50%',
                transform: 'translate(-50%, -50%)',
                width: e.mine ? 11 : 9, height: e.mine ? 11 : 9, borderRadius: '50%',
                background: e.mine ? 'var(--color-accent)' : 'rgba(255,255,255,0.40)',
                boxShadow: e.mine ? '0 0 10px 1px rgba(99,102,241,0.45)' : 'none',
              }} />
              <span style={{
                position: 'absolute', left: `calc(${toX(e.acc)}% + 12px)`, top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 13.5, fontWeight: e.mine ? 700 : 500,
                color: e.mine ? '#a5b4fc' : DIM,
                fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}>
                {fmtAcc(e.acc)}
              </span>
            </div>
            <span style={{
              width: 64, textAlign: 'right',
              fontSize: 13, color: e.mine ? SECONDARY : DIM,
              fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
            }}>
              {fmtLoss(e.loss)}
            </span>
          </div>
        ))}
      </div>

      {/* Leyenda de la columna log loss + lectura */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
        <span style={{ fontSize: 13.5, color: SECONDARY, fontFamily: 'var(--font-sans)' }}>
          {beaten === 3
            ? 'Tu modelo supera a los 3 preentrenados en test accuracy.'
            : beaten > 0
              ? `Tu modelo supera a ${beaten} de los 3 preentrenados en test accuracy.`
              : 'Tu modelo no supera a ningún preentrenado en test accuracy.'}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-sans)',
        }}>
          Log loss →
        </span>
      </div>
    </div>
  )
}

function ResultView({ result, onBack }: { result: TrainResult; onBack: () => void }) {
  return (
    <div>
      <BackButton onClick={onBack} />

      {/* Cabecera: nombre + badge + chips de features */}
      <div style={{ margin: '18px 0 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{
            margin: 0, fontSize: '2.125rem', fontWeight: 700,
            letterSpacing: '-0.02em', color: '#f0f0f0', fontFamily: 'var(--font-sans)',
          }}>
            {result.name}
          </h1>
          <AlgoBadge algorithm={result.algorithm} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 16 }}>
          {result.features.map(f => (
            <span key={f} style={{
              padding: '3px 10px', borderRadius: 20,
              fontSize: 12.5, fontWeight: 400,
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(255,255,255,0.10)',
              fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
            }}>
              {FEATURE_LABELS[f] ?? f}
            </span>
          ))}
        </div>
      </div>

      {/* Métricas — test accuracy manda */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 56, flexWrap: 'wrap',
        paddingBottom: 36, marginBottom: 44, borderBottom: `0.5px solid ${SEP}`,
      }}>
        <div>
          <div style={{
            fontSize: 12, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: SECONDARY, fontFamily: 'var(--font-sans)', marginBottom: 8,
          }}>
            Test accuracy
          </div>
          <span style={{
            fontSize: 64, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em',
            color: PRIMARY, fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtAcc(result.test_accuracy)}
          </span>
        </div>
        {[
          { label: 'Test log loss', value: fmtLoss(result.test_log_loss) },
          { label: 'Val accuracy',  value: fmtAcc(result.val_accuracy) },
          { label: 'Val log loss',  value: fmtLoss(result.val_log_loss) },
        ].map(m => (
          <div key={m.label}>
            <div style={{
              fontSize: 12, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-sans)', marginBottom: 8,
            }}>
              {m.label}
            </div>
            <span style={{
              fontSize: 30, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em',
              color: SECONDARY, fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums',
            }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      {/* Dos columnas: importancia + comparativa */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: PRIMARY, fontFamily: 'var(--font-sans)' }, display: 'block', marginBottom: 6 }}>
            Importancia de features
          </span>
          <p style={{ margin: '0 0 10px', fontSize: 14.5, color: SECONDARY, fontFamily: 'var(--font-sans)' }}>
            Magnitud relativa de cada variable en el modelo entrenado.
          </p>
          <ImportanceChart importance={result.feature_importance} />
        </div>

        <div style={{ width: 0, borderLeft: '1px dashed rgba(255,255,255,0.12)', flexShrink: 0, margin: '0 48px' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: PRIMARY, fontFamily: 'var(--font-sans)' }, display: 'block', marginBottom: 6 }}>
            Frente a los oficiales
          </span>
          <p style={{ margin: '0 0 10px', fontSize: 14.5, color: SECONDARY, fontFamily: 'var(--font-sans)' }}>
            Test accuracy de tu modelo frente a los 3 preentrenados.
          </p>
          <ComparisonChart result={result} />
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
        fontSize: '0.875rem', fontFamily: 'var(--font-sans)',
        background: 'transparent', border: 'none',
        color: 'var(--color-ink-muted)', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'color var(--duration-fast)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--color-ink)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-muted)' }}
    >
      <ArrowLeft size={14} /> Mis modelos
    </button>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function StudioPage() {
  const { isAuthenticated, token } = useAuth()
  const queryClient = useQueryClient()

  const [view, setView] = useState<View>('list')
  const [authOpen, setAuthOpen] = useState(false)
  const [isTraining, setIsTraining] = useState(false)
  const [result, setResult] = useState<TrainResult | null>(null)
  const [form, setForm] = useState<CreateFormState>({ name: '', features: new Set(), algorithm: null })
  const [prevAuth, setPrevAuth] = useState(isAuthenticated)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Limpia el polling al desmontar
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // Al cerrar sesión, vuelve a la vista list — ajuste de estado en render
  if (prevAuth !== isAuthenticated) {
    setPrevAuth(isAuthenticated)
    if (!isAuthenticated) setView('list')
  }

  const handleCreate = () => {
    setForm({ name: '', features: new Set(), algorithm: null })
    setView('create')
  }

  const handleSubmit = async () => {
    if (!token || !form.algorithm) return
    setIsTraining(true)
    try {
      const { job_id } = await api.train(
        { features: Array.from(form.features), algorithm: form.algorithm, name: form.name.trim() },
        token,
      )
      pollRef.current = setInterval(async () => {
        try {
          const job = await api.trainJob(job_id, token)
          if (job.status === 'done' && job.result) {
            if (pollRef.current) clearInterval(pollRef.current)
            setIsTraining(false)
            setResult(job.result)
            setView('result')
            queryClient.invalidateQueries({ queryKey: ['models'] })
            toast.success(`Modelo «${job.result.name}» entrenado`)
          } else if (job.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current)
            setIsTraining(false)
            toast.error(job.error ?? 'Error entrenando el modelo')
          }
        } catch (err) {
          if (pollRef.current) clearInterval(pollRef.current)
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
    <div style={{ minHeight: 'calc(100svh - 48px)', background: 'var(--color-bg)', paddingBottom: 80 }}>
      <div style={{ maxWidth: '82.5vw', margin: '0 auto', paddingTop: 48 }}>
        {view === 'list' && (
          <ListView onCreate={handleCreate} onShowAuth={() => setAuthOpen(true)} />
        )}
        {view === 'create' && (
          <CreateView
            form={form}
            setForm={setForm}
            isTraining={isTraining}
            onBack={() => setView('list')}
            onSubmit={handleSubmit}
          />
        )}
        {view === 'result' && result && (
          <ResultView result={result} onBack={() => setView('list')} />
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
