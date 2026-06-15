const MODEL_LABEL: Record<string, string> = {
  baseline: 'Modelo Baseline',
  extended:  'Modelo Extended',
  market:    'Modelo Market',
  custom:    'Mi modelo',
}

export interface PredictionHeroProps {
  home_team:       string
  away_team:       string
  home_crest_url:  string | null
  away_crest_url:  string | null
  league:          string
  model:           string
  prob_h:          number
  prob_d:          number
  prob_a:          number
}


export default function PredictionHero({
  home_team, away_team, home_crest_url, away_crest_url, league, model, prob_h, prob_d, prob_a,
}: PredictionHeroProps) {
  const pctH = (prob_h * 100).toFixed(1)
  const pctD = (prob_d * 100).toFixed(1)
  const pctA = (prob_a * 100).toFixed(1)

  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(to right, #091524, #190909)',
        marginTop: -55, padding: '95px 8.75vw 60px',
        animation: 'hero-fade-in 0.4s ease-out both',
      }}
    >
      {/* Tinte local */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: '45%',
        background: 'linear-gradient(to right, rgba(59,130,246,0.13), transparent)',
        pointerEvents: 'none',
      }} />
      {/* Tinte visitante */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: '45%',
        background: 'linear-gradient(to left, rgba(239,68,68,0.13), transparent)',
        pointerEvents: 'none',
      }} />
      {/* Fade inferior */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
        background: 'linear-gradient(to bottom, transparent, #0c0d0f)',
        pointerEvents: 'none',
      }} />

        {/* Meta: liga · modelo */}
        <div style={{
          textAlign: 'left', marginBottom: 44,
          fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
          fontFamily: 'var(--font-sans)',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{league}</span>
          <span style={{ margin: '0 6px', color: 'rgba(255,255,255,0.55)' }}>·</span>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{MODEL_LABEL[model] ?? model}</span>
        </div>

        {/* Grid 1fr auto 1fr — vertical: escudo arriba, nombre abajo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,320px) auto minmax(0,320px)', alignItems: 'flex-start', gap: '0 16px', justifyContent: 'center' }}>

          {/* Local */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {home_crest_url ? (
              <img src={home_crest_url} alt={home_team}
                style={{ width: 80, height: 80, objectFit: 'contain', opacity: 0.95, flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div style={{
                width: 80, height: 80, borderRadius: 12, flexShrink: 0,
                background: 'rgba(59,130,246,0.10)', border: '0.5px solid rgba(59,130,246,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 500, color: 'rgba(59,130,246,0.7)', fontFamily: 'monospace',
              }}>{home_team.slice(0, 3).toUpperCase()}</div>
            )}
            <span style={{
              fontSize: 'clamp(16px, 2vw, 26px)', fontWeight: 500,
              letterSpacing: '-0.025em', lineHeight: 1.25,
              color: 'rgba(255,255,255,0.82)', fontFamily: 'var(--font-sans)',
              textAlign: 'center',
            }}>{home_team}</span>
          </div>

          {/* VS — alineado con los escudos */}
          <div style={{
            fontSize: 28, fontWeight: 600, letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.40)', fontFamily: 'var(--font-sans)',
            userSelect: 'none', paddingTop: 24,
          }}>—</div>

          {/* Visitante */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {away_crest_url ? (
              <img src={away_crest_url} alt={away_team}
                style={{ width: 80, height: 80, objectFit: 'contain', opacity: 0.95, flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div style={{
                width: 80, height: 80, borderRadius: 12, flexShrink: 0,
                background: 'rgba(239,68,68,0.10)', border: '0.5px solid rgba(239,68,68,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 500, color: 'rgba(239,68,68,0.7)', fontFamily: 'monospace',
              }}>{away_team.slice(0, 3).toUpperCase()}</div>
            )}
            <span style={{
              fontSize: 'clamp(16px, 2vw, 26px)', fontWeight: 500,
              letterSpacing: '-0.025em', lineHeight: 1.25,
              color: 'rgba(255,255,255,0.82)', fontFamily: 'var(--font-sans)',
              textAlign: 'center',
            }}>{away_team}</span>
          </div>

        </div>

        {/* Probability columns — tercios iguales para q los números siempre quepan */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <span style={{ fontSize: 80, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', color: '#4D93F8', fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>{pctH}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 80, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.42)', fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>{pctD}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 80, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', color: '#F35A5A', fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>{pctA}%</span>
          </div>
        </div>

        {/* Spectrum bar — tres segmentos con glow */}
        <div style={{ display: 'flex', marginTop: 20, gap: 3, height: 12 }}>
          <div style={{ flex: prob_h, borderRadius: 99, background: '#4D93F8', boxShadow: '0 0 8px 0px rgba(77,147,248,0.30)' }} />
          <div style={{ flex: prob_d, borderRadius: 99, background: 'rgba(255,255,255,0.32)', boxShadow: '0 0 6px 1px rgba(255,255,255,0.10)' }} />
          <div style={{ flex: prob_a, borderRadius: 99, background: '#F35A5A', boxShadow: '0 0 8px 0px rgba(243,90,90,0.30)' }} />
        </div>

        {/* Labels debajo de la barra — tercios iguales, empate siempre centrado */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginTop: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4D93F8', fontFamily: 'var(--font-sans)' }}>Local</span>
          <span style={{ fontSize: 12, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-sans)', textAlign: 'center' }}>Empate</span>
          <span style={{ fontSize: 12, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#F35A5A', fontFamily: 'var(--font-sans)', textAlign: 'right' }}>Visitante</span>
        </div>

    </div>
  )
}
