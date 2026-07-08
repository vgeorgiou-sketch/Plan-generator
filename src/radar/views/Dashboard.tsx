import type { Opportunity, Sector } from '../types'
import { SECTOR_LABEL } from '../types'
import {
  countBy,
  formatDate,
  isNewThisWeek,
  isPriority,
  needsReview,
  topRanked,
  totalScore,
} from '../model'
import { ACTIVITY } from '../data'
import { BandChip, BarRow, Card, ScorePill, SectionTitle, SectorChip, StatTile } from '../ui'

const SECTOR_COLOR: Record<Sector, string> = {
  'office-retrofit': 'var(--rp-series-1)',
  'pbsa-living': 'var(--rp-series-2)',
}

export function Dashboard({
  opportunities,
  onOpen,
}: {
  opportunities: Opportunity[]
  onOpen: (id: string) => void
}) {
  const newThisWeek = opportunities.filter(isNewThisWeek)
  const priority = opportunities.filter(isPriority)
  const review = opportunities.filter(needsReview)
  const top5 = topRanked(opportunities, 5)

  const bySector = countBy(opportunities, (o) => o.sector)
  const byBorough = countBy(opportunities, (o) => o.borough)
  const bySource = countBy(opportunities, (o) => o.sourceType)
  const byStatus = countBy(opportunities, (o) => o.status)
  const maxBorough = Math.max(...byBorough.map((b) => b.count))
  const maxSource = Math.max(...bySource.map((b) => b.count))
  const maxStatus = Math.max(...byStatus.map((b) => b.count))

  // Next actions surfaced from the leads that most need movement:
  // priority first, then hard deadlines, then stale reviews.
  const recommended = [
    ...topRanked(opportunities, 3),
    ...opportunities.filter((o) => needsReview(o) && !topRanked(opportunities, 3).includes(o)).slice(0, 2),
  ]

  return (
    <div>
      <div className="rp-statrow">
        <StatTile label="Total opportunities" value={opportunities.length} detail="Active radar, London pilot" />
        <StatTile label="New this week" value={newThisWeek.length} detail="Added since Mon 6 Jul" />
        <StatTile label="Priority (27–30)" value={priority.length} detail="Partner attention required" tone="attention" />
        <StatTile label="Needing review" value={review.length} detail="No review in 14+ days" tone="attention" />
      </div>

      <div className="rp-dashgrid">
        <div className="rp-stack">
          <Card>
            <SectionTitle aside="Ranked by opportunity score">Top 5 opportunities</SectionTitle>
            <div className="rp-tablewrap">
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>Opportunity</th>
                    <th>Sector</th>
                    <th>Score</th>
                    <th>Band</th>
                    <th>Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((o) => (
                    <tr key={o.id} className="rp-row--click" onClick={() => onOpen(o.id)}>
                      <td className="rp-td-name">
                        {o.name}
                        <span className="rp-td-sub">
                          {o.borough} · {o.client}
                        </span>
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
                      <td style={{ maxWidth: 260 }}>{o.nextAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle aside="This week's focus">Recommended next actions</SectionTitle>
            <ol className="rp-actionlist">
              {recommended.map((o) => (
                <li key={o.id}>
                  <span>
                    <strong>{o.name}</strong> — {o.nextAction}
                    {needsReview(o) && ' (review overdue)'}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <SectionTitle aside="Last 7 days">Recent activity</SectionTitle>
            <ul className="rp-linelist">
              {ACTIVITY.map((a, i) => (
                <li key={i}>
                  <span className="rp-linelist-date">{formatDate(a.date)}</span>
                  <span className="rp-linelist-text">
                    {a.opportunityId ? (
                      <button type="button" onClick={() => onOpen(a.opportunityId!)}>
                        {a.text}
                      </button>
                    ) : (
                      a.text
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="rp-stack">
          <Card>
            <SectionTitle>Sector split</SectionTitle>
            {bySector.map((s) => (
              <BarRow
                key={s.label}
                label={SECTOR_LABEL[s.label]}
                count={s.count}
                max={opportunities.length}
                color={SECTOR_COLOR[s.label]}
              />
            ))}
          </Card>

          <Card>
            <SectionTitle>Borough split</SectionTitle>
            {byBorough.map((b) => (
              <BarRow key={b.label} label={b.label} count={b.count} max={maxBorough} />
            ))}
          </Card>

          <Card>
            <SectionTitle>Source split</SectionTitle>
            {bySource.map((s) => (
              <BarRow key={s.label} label={s.label} count={s.count} max={maxSource} />
            ))}
          </Card>

          <Card>
            <SectionTitle>Status summary</SectionTitle>
            {byStatus.map((s) => (
              <BarRow key={s.label} label={s.label} count={s.count} max={maxStatus} />
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
