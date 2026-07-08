import type { RfpClassification } from '../types'
import { RFP_CLASSIFICATIONS, SECTOR_LABEL } from '../types'
import { RFP_WATCHLIST } from '../data'
import { formatDate } from '../model'
import { Card, SectionTitle } from '../ui'

const CLASSIFICATION_NOTE: Record<RfpClassification, string> = {
  'Bid now': 'Live, matched, winnable — resource a submission.',
  'Watch buyer': 'Wrong tender, right client — log contacts for the next round.',
  'Framework route': 'Access runs through a panel seat, not this notice.',
  'Competitor intelligence': 'Lost or not pursued — record who won and with what angle.',
  'Too late': 'Process too advanced to enter credibly.',
  'Not relevant': 'Outside sector or scale — retained as buyer intelligence only.',
}

function chipClass(c: RfpClassification): string {
  if (c === 'Bid now') return 'rp-chip rp-chip--rfp-bid'
  if (c === 'Too late' || c === 'Not relevant') return 'rp-chip rp-chip--rfp-dim'
  return 'rp-chip'
}

export function RfpMonitor({ onOpen }: { onOpen: (id: string) => void }) {
  const sorted = [...RFP_WATCHLIST].sort(
    (a, b) => RFP_CLASSIFICATIONS.indexOf(a.classification) - RFP_CLASSIFICATIONS.indexOf(b.classification),
  )

  return (
    <div>
      <div className="rp-callout">
        RFPs are one source among nine. By the time a notice is published, the shortlist logic is often set — most of
        the radar’s value sits in the pre-RFP signals that precede these tenders.
      </div>

      <Card>
        <SectionTitle aside={`${sorted.length} tracked`}>Public RFPs & tender signals</SectionTitle>
        <div className="rp-tablewrap">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Tender</th>
                <th>Buyer</th>
                <th>Sector</th>
                <th>Classification</th>
                <th>Deadline</th>
                <th>Portal</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  className={r.opportunityId ? 'rp-row--click' : undefined}
                  onClick={r.opportunityId ? () => onOpen(r.opportunityId!) : undefined}
                >
                  <td className="rp-td-name">
                    {r.title}
                    {r.opportunityId && <span className="rp-td-sub">Full card on the radar — click to open</span>}
                  </td>
                  <td style={{ maxWidth: 170 }}>{r.buyer}</td>
                  <td>{r.sector === 'other' ? 'Other' : SECTOR_LABEL[r.sector]}</td>
                  <td>
                    <span className={chipClass(r.classification)}>{r.classification}</span>
                  </td>
                  <td className="rp-td-num">{r.deadline ? formatDate(r.deadline) : '—'}</td>
                  <td>{r.portal}</td>
                  <td style={{ maxWidth: 260 }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ height: 12 }} />

      <Card>
        <SectionTitle>How classifications are used</SectionTitle>
        <div className="rp-tablewrap">
          <table className="rp-table">
            <tbody>
              {RFP_CLASSIFICATIONS.map((c) => (
                <tr key={c}>
                  <td style={{ width: 190 }}>
                    <span className={chipClass(c)}>{c}</span>
                  </td>
                  <td>{CLASSIFICATION_NOTE[c]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
