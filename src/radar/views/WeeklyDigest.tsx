import { useState } from 'react'
import type { Opportunity } from '../types'
import { SECTOR_LABEL } from '../types'
import { formatDate, isNewThisWeek, needsReview, scoreBand, topRanked, totalScore } from '../model'
import { BandChip, Card, ScorePill, SectionTitle, SectorChip } from '../ui'

/** Hand-written weekly commentary — the analyst layer over the numbers. */
const SECTOR_MOVEMENT = [
  {
    sector: 'office-retrofit' as const,
    text: 'Momentum building at the top of the list: Aldgate House moved to Approach after the pre-app validated, and the Camden estate-strategy tender adds a live public-sector route. Watch-tier assets (Vauxhall, Croydon) unchanged.',
  },
  {
    sector: 'pbsa-living' as const,
    text: 'The Holloway Road refusal is now the sector’s defining decision — appeal deadline 12 Aug forces the client’s hand. Operator activity (Habitat & Co at Filmworks) and the universities framework both point to buyer relationships over single sites.',
  },
]

function digestText(opportunities: Opportunity[]): string {
  const top5 = topRanked(opportunities, 5)
  const fresh = opportunities.filter(isNewThisWeek)
  const review = opportunities.filter(needsReview)
  const lines: string[] = [
    'OPPORTUNITY RADAR — WEEKLY BRIEFING',
    'Week commencing 6 July 2026 · London pilot (office retrofit, PBSA/living)',
    '',
    'TOP 5 OPPORTUNITIES',
    ...top5.map(
      (o, i) =>
        `${i + 1}. ${o.name} (${SECTOR_LABEL[o.sector]}, ${o.borough}) — ${totalScore(o.scores)}/30 ${scoreBand(totalScore(o.scores))}. Next: ${o.nextAction}`,
    ),
    '',
    `NEW THIS WEEK (${fresh.length})`,
    ...fresh.map((o) => `- ${o.name} — ${o.sourceType}, ${o.borough}. ${o.signalSummary}`),
    '',
    `NEEDING REVIEW (${review.length})`,
    ...review.map((o) => `- ${o.name} — last reviewed ${formatDate(o.lastReviewed)} (${o.owner})`),
    '',
    'SECTOR MOVEMENT',
    ...SECTOR_MOVEMENT.map((s) => `- ${SECTOR_LABEL[s.sector]}: ${s.text}`),
    '',
    'RECOMMENDED ACTIONS',
    ...topRanked(opportunities, 3).map((o) => `- ${o.name}: ${o.nextAction}`),
  ]
  return lines.join('\n')
}

export function WeeklyDigest({
  opportunities,
  onOpen,
}: {
  opportunities: Opportunity[]
  onOpen: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const top5 = topRanked(opportunities, 5)
  const fresh = opportunities.filter(isNewThisWeek)
  const review = opportunities.filter(needsReview)
  const rfps = opportunities.filter((o) => o.rfp)
  const preRfp = opportunities.filter((o) => o.signalKind && isNewThisWeek(o))
  const notableSignals = preRfp.length
    ? preRfp
    : opportunities.filter((o) => o.signalKind).sort((a, b) => totalScore(b.scores) - totalScore(a.scores)).slice(0, 3)

  const copy = async () => {
    await navigator.clipboard.writeText(digestText(opportunities))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rp-content-narrow">
      <div className="rp-digest-head">
        <h2>Weekly briefing — w/c 6 July 2026</h2>
        <button type="button" className="rp-copybtn" onClick={copy}>
          {copied ? 'Copied' : 'Copy as text'}
        </button>
      </div>
      <p className="rp-digest-intro">
        London pilot · office retrofit and PBSA/living · prepared for Monday partners’ review.
      </p>

      <div className="rp-stack">
        <Card>
          <SectionTitle>Top 5 opportunities</SectionTitle>
          <div className="rp-tablewrap">
            <table className="rp-table">
              <tbody>
                {top5.map((o, i) => (
                  <tr key={o.id} className="rp-row--click" onClick={() => onOpen(o.id)}>
                    <td className="rp-td-num" style={{ width: 24, color: 'var(--rp-ink-3)' }}>
                      {i + 1}
                    </td>
                    <td className="rp-td-name">
                      {o.name}
                      <span className="rp-td-sub">{o.nextAction}</span>
                    </td>
                    <td>
                      <SectorChip sector={o.sector} />
                    </td>
                    <td className="rp-td-num">
                      <ScorePill o={o} />
                    </td>
                    <td>
                      <BandChip total={totalScore(o.scores)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionTitle aside={`${fresh.length} added`}>New this week</SectionTitle>
          <ul className="rp-linelist">
            {fresh.map((o) => (
              <li key={o.id}>
                <span className="rp-linelist-date">{formatDate(o.dateAdded)}</span>
                <span className="rp-linelist-text">
                  <button type="button" onClick={() => onOpen(o.id)}>
                    {o.name}
                  </button>{' '}
                  — {o.sourceType}, {o.borough}. {o.signalSummary}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle aside="No review in 14+ days">Needing review</SectionTitle>
          <ul className="rp-linelist">
            {review.map((o) => (
              <li key={o.id}>
                <span className="rp-linelist-date">{formatDate(o.lastReviewed)}</span>
                <span className="rp-linelist-text">
                  <button type="button" onClick={() => onOpen(o.id)}>
                    {o.name}
                  </button>{' '}
                  — owner {o.owner}, status {o.status}. Progress or move to Dormant.
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle>Sector movement</SectionTitle>
          {SECTOR_MOVEMENT.map((s) => (
            <p key={s.sector} className="rp-prose">
              <strong>{SECTOR_LABEL[s.sector]}.</strong> {s.text}
            </p>
          ))}
        </Card>

        <Card>
          <SectionTitle>Notable RFPs</SectionTitle>
          <ul className="rp-linelist">
            {rfps.map((o) => (
              <li key={o.id}>
                <span className="rp-linelist-date">{o.rfp!.deadline ? formatDate(o.rfp!.deadline) : '—'}</span>
                <span className="rp-linelist-text">
                  <button type="button" onClick={() => onOpen(o.id)}>
                    {o.name}
                  </button>{' '}
                  — {o.rfp!.classification}. {o.nextAction}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle>Notable pre-RFP signals</SectionTitle>
          <ul className="rp-linelist">
            {notableSignals.map((o) => (
              <li key={o.id}>
                <span className="rp-linelist-date">{formatDate(o.dateAdded)}</span>
                <span className="rp-linelist-text">
                  <button type="button" onClick={() => onOpen(o.id)}>
                    {o.name}
                  </button>{' '}
                  — {o.signalKind}. {o.opportunityAngle}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle>Recommended actions</SectionTitle>
          <ol className="rp-actionlist">
            {topRanked(opportunities, 3).map((o) => (
              <li key={o.id}>
                <span>
                  <strong>{o.name}</strong> — {o.nextAction}
                </span>
              </li>
            ))}
            <li>
              <span>Review the {review.length} stale leads above; progress or move to Dormant at Monday’s meeting.</span>
            </li>
          </ol>
        </Card>
      </div>
    </div>
  )
}
