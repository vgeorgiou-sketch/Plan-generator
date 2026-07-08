import type { Opportunity, SignalKind } from '../types'
import { formatDate, totalScore } from '../model'
import { BandChip, EmptyNote, ScorePill, SectorChip } from '../ui'

const SIGNAL_ORDER: { kind: SignalKind; blurb: string }[] = [
  {
    kind: 'Refusal',
    blurb: 'Design failed, use principle often intact — the strongest redesign openings.',
  },
  {
    kind: 'Stalled scheme',
    blurb: 'Repeated amendments signal a design or team problem the owner is paying for.',
  },
  {
    kind: 'Asset repositioning',
    blurb: 'Owners committing to intervention before appointing a design team.',
  },
  {
    kind: 'Office-to-living potential',
    blurb: 'Vacancy and economics pointing to conversion — feasibility work comes first.',
  },
  {
    kind: 'PBSA / living feasibility',
    blurb: 'Site assembly and survey activity ahead of any application.',
  },
  {
    kind: 'Planning amendment',
    blurb: 'Use swaps and operator entries inside consented schemes.',
  },
  {
    kind: 'Planning application',
    blurb: 'Fresh applications worth tracking for delivery or adjacent-site roles.',
  },
  {
    kind: 'Regeneration site',
    blurb: 'Prospectus-stage sites a full cycle ahead of procurement.',
  },
]

/**
 * The earliest end of the funnel — signals that precede any formal
 * procurement. This is where the radar earns its keep.
 */
export function PreRfpMonitor({
  opportunities,
  onOpen,
}: {
  opportunities: Opportunity[]
  onOpen: (id: string) => void
}) {
  const signals = opportunities.filter((o) => o.signalKind)
  const groups = SIGNAL_ORDER.map((g) => ({
    ...g,
    items: signals
      .filter((o) => o.signalKind === g.kind)
      .sort((a, b) => totalScore(b.scores) - totalScore(a.scores)),
  })).filter((g) => g.items.length > 0)

  return (
    <div>
      <div className="rp-callout">
        {signals.length} of {opportunities.length} current opportunities surfaced before any RFP existed. Every card
        below links to its planning register entry or evidence source.
      </div>

      {groups.length === 0 && <EmptyNote>No pre-RFP signals on the radar.</EmptyNote>}

      {groups.map((g) => (
        <div key={g.kind} className="rp-signalgroup">
          <h3>
            {g.kind}
            <span>
              {g.items.length} · {g.blurb}
            </span>
          </h3>
          <div className="rp-signalcards">
            {g.items.map((o) => (
              <button key={o.id} type="button" className="rp-signalcard" onClick={() => onOpen(o.id)}>
                <div className="rp-signalcard-top">
                  <strong>{o.name}</strong>
                  <span>
                    <ScorePill o={o} /> <BandChip total={totalScore(o.scores)} />
                  </span>
                </div>
                <p>{o.signalSummary}</p>
                <div className="rp-signalcard-foot">
                  <SectorChip sector={o.sector} />
                  <span>{o.borough}</span>
                  <span>·</span>
                  <span>{o.stage}</span>
                  <span>·</span>
                  <span>added {formatDate(o.dateAdded)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
