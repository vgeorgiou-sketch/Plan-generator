import { useEffect } from 'react'
import type { Opportunity } from '../types'
import { SCORE_CRITERIA } from '../types'
import { formatDateLong, scoreBand, totalScore } from '../model'
import { BandChip, ConfidenceMeter, CriteriaCells, SectorChip, StatusChip } from '../ui'

/**
 * The lead card a principal reads before deciding whether the lead is worth
 * action. Structured as the five decision questions: signal → why it matters
 * → architectural problem → relevance → next action.
 */
export function DetailPanel({ opportunity: o, onClose }: { opportunity: Opportunity; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const total = totalScore(o.scores)

  return (
    <>
      <div className="rp-overlay" onClick={onClose} />
      <aside className="rp-detail" role="dialog" aria-label={o.name}>
        <button type="button" className="rp-detail-close" onClick={onClose}>
          Close · esc
        </button>
        <div className="rp-detail-id">{o.id}</div>
        <h2>{o.name}</h2>
        <p className="rp-detail-address">{o.address}</p>
        <div className="rp-detail-chips">
          <SectorChip sector={o.sector} />
          <StatusChip status={o.status} />
          <BandChip total={total} />
          <span className="rp-chip">{o.sourceType}</span>
          <span className="rp-chip">{o.stage}</span>
        </div>

        <div className="rp-detail-scoreblock">
          <div className="rp-criteria">
            {SCORE_CRITERIA.map((c) => (
              <div key={c.key} className="rp-criteria-row">
                <span>{c.label}</span>
                <CriteriaCells value={o.scores[c.key]} />
              </div>
            ))}
          </div>
          <div className="rp-detail-total">
            <div>
              <div className="rp-detail-total-num">{total}</div>
              <div className="rp-detail-total-max">of 30 — {scoreBand(total)}</div>
            </div>
            <div className="rp-detail-confidence">
              <div className="rp-detail-total-max" style={{ marginBottom: 4 }}>
                Confidence (scored separately)
              </div>
              <ConfidenceMeter pct={o.confidence} />
            </div>
          </div>
        </div>

        <ol className="rp-trail">
          <li>
            <span className="rp-trail-num">01</span>
            <span className="rp-trail-label">The signal</span>
            <p className="rp-trail-body">{o.signalSummary}</p>
          </li>
          <li>
            <span className="rp-trail-num">02</span>
            <span className="rp-trail-label">Why it matters</span>
            <p className="rp-trail-body">{o.opportunityAngle}</p>
          </li>
          <li>
            <span className="rp-trail-num">03</span>
            <span className="rp-trail-label">Architectural problem</span>
            <p className="rp-trail-body">{o.architecturalIssue}</p>
          </li>
          <li>
            <span className="rp-trail-num">04</span>
            <span className="rp-trail-label">Relevance to practice</span>
            <p className="rp-trail-body">{o.relevance}</p>
          </li>
          <li>
            <span className="rp-trail-num">05</span>
            <span className="rp-trail-label">Next action</span>
            <p className="rp-trail-body">
              <strong>{o.nextAction}</strong>
            </p>
          </li>
        </ol>

        <div className="rp-aibrief">
          <div className="rp-aibrief-head">
            <h3>AI-assisted brief</h3>
            <span>Drafted from the source below — verify before acting</span>
          </div>
          <dl>
            <dt>Executive summary</dt>
            <dd>{o.ai.executiveSummary}</dd>
            <dt>Classification</dt>
            <dd>{o.ai.classification}</dd>
            <dt>Likely issue</dt>
            <dd>{o.ai.likelyIssue}</dd>
            <dt>Commercial relevance</dt>
            <dd>{o.ai.commercialRelevance}</dd>
            <dt>Recommended action</dt>
            <dd>{o.ai.recommendedAction}</dd>
            <dt>Confidence note</dt>
            <dd>{o.ai.confidenceNote}</dd>
            <dt>False-positive risk</dt>
            <dd className="rp-aibrief-risk">{o.ai.falsePositiveRisk}</dd>
          </dl>
        </div>

        <div className="rp-metagrid">
          <dl className="rp-meta">
            <dt>Client / applicant</dt>
            <dd>{o.client}</dd>
          </dl>
          <dl className="rp-meta">
            <dt>Borough</dt>
            <dd>{o.borough}</dd>
          </dl>
          <dl className="rp-meta">
            <dt>Source</dt>
            <dd>
              <a href={o.sourceLink} target="_blank" rel="noreferrer">
                {o.sourceLabel}
              </a>
            </dd>
          </dl>
          <dl className="rp-meta">
            <dt>Reference</dt>
            <dd>{o.reference}</dd>
          </dl>
          <dl className="rp-meta">
            <dt>Owner</dt>
            <dd>{o.owner}</dd>
          </dl>
          <dl className="rp-meta">
            <dt>Dates</dt>
            <dd>
              Added {formatDateLong(o.dateAdded)} · last reviewed {formatDateLong(o.lastReviewed)}
            </dd>
          </dl>
        </div>

        <div className="rp-notes">
          <h3>Notes</h3>
          {o.notes}
        </div>
      </aside>
    </>
  )
}
