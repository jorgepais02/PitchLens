import { useParams, Navigate } from 'react-router-dom'
import { usePrediction } from '../../context/PredictionContext'
import PredictionHero from './PredictionHero'
import WhySection from './WhySection'
import ContextSection from './ContextSection'

export default function PredictionPage() {
  const { id } = useParams<{ id: string }>()
  const { activePrediction } = usePrediction()

  let pred = activePrediction
  if (!pred && id) {
    const raw = sessionStorage.getItem(`pred-${id}`)
    if (raw) {
      try { pred = JSON.parse(raw) } catch { /* ignorar */ }
    }
  }

  if (!pred) return <Navigate to="/new" replace />

  return (
    <div style={{ minHeight: 'calc(100svh - 60px)', background: '#0c0d0f', paddingBottom: 80 }}>
      <title>{`${pred.home.display_name ?? pred.home.name} vs ${pred.away.display_name ?? pred.away.name} · PitchLens`}</title>
      <div style={{ zoom: 1.1 }}>
        <PredictionHero
          home_team={pred.home.display_name ?? pred.home.name}
          away_team={pred.away.display_name ?? pred.away.name}
          home_crest_url={pred.home.crest_url ?? null}
          away_crest_url={pred.away.crest_url ?? null}
          league={pred.league.display_name ?? pred.league.name}
          model={pred.model}
          prob_h={pred.result.prob_h}
          prob_d={pred.result.prob_d}
          prob_a={pred.result.prob_a}
        />
      </div>

      <div style={{ maxWidth: '82.5vw', margin: '40px auto 0' }}>
        <WhySection pred={pred} />
        <ContextSection
          homeId={pred.home.id}
          awayId={pred.away.id}
          homeName={pred.home.name}
          awayName={pred.away.name}
          homeDisplayName={pred.home.display_name ?? pred.home.name}
          awayDisplayName={pred.away.display_name ?? pred.away.name}
          homeCrestUrl={pred.home.crest_url ?? null}
          awayCrestUrl={pred.away.crest_url ?? null}
        />
      </div>
    </div>
  )
}
