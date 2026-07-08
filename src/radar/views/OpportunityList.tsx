import { useMemo, useState } from 'react'
import type { Opportunity, Sector, SourceType, Status } from '../types'
import { SECTOR_LABEL, SOURCE_TYPES, STATUSES } from '../types'
import { SCORE_BANDS, formatDate, scoreBand, totalScore } from '../model'
import { BandChip, Card, ConfidenceMeter, ScorePill, SectorChip, StatusChip, EmptyNote } from '../ui'

interface Filters {
  q: string
  sector: '' | Sector
  borough: string
  source: '' | SourceType
  stage: string
  status: '' | Status
  band: string
  owner: string
}

const BLANK: Filters = { q: '', sector: '', borough: '', source: '', stage: '', status: '', band: '', owner: '' }

export function OpportunityList({
  opportunities,
  onOpen,
  initialFilters,
}: {
  opportunities: Opportunity[]
  onOpen: (id: string) => void
  initialFilters?: Partial<Filters>
}) {
  const [f, setF] = useState<Filters>({ ...BLANK, ...initialFilters })
  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }))

  const boroughs = useMemo(() => [...new Set(opportunities.map((o) => o.borough))].sort(), [opportunities])
  const owners = useMemo(() => [...new Set(opportunities.map((o) => o.owner))].sort(), [opportunities])
  const stages = useMemo(() => [...new Set(opportunities.map((o) => o.stage))].sort(), [opportunities])

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return opportunities
      .filter((o) => {
        if (f.sector && o.sector !== f.sector) return false
        if (f.borough && o.borough !== f.borough) return false
        if (f.source && o.sourceType !== f.source) return false
        if (f.stage && o.stage !== f.stage) return false
        if (f.status && o.status !== f.status) return false
        if (f.band && scoreBand(totalScore(o.scores)) !== f.band) return false
        if (f.owner && o.owner !== f.owner) return false
        if (q) {
          const hay = `${o.name} ${o.client} ${o.borough} ${o.address} ${o.signalSummary}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => totalScore(b.scores) - totalScore(a.scores))
  }, [opportunities, f])

  const isFiltered = JSON.stringify(f) !== JSON.stringify(BLANK)

  return (
    <div>
      <div className="rp-filterrow">
        <input
          type="search"
          placeholder="Search site, client, borough…"
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <select value={f.sector} onChange={(e) => set({ sector: e.target.value as Filters['sector'] })}>
          <option value="">Sector — all</option>
          {(Object.keys(SECTOR_LABEL) as Sector[]).map((s) => (
            <option key={s} value={s}>
              {SECTOR_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={f.borough} onChange={(e) => set({ borough: e.target.value })}>
          <option value="">Borough — all</option>
          {boroughs.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select value={f.source} onChange={(e) => set({ source: e.target.value as Filters['source'] })}>
          <option value="">Source — all</option>
          {SOURCE_TYPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={f.stage} onChange={(e) => set({ stage: e.target.value })}>
          <option value="">Stage — all</option>
          {stages.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={f.status} onChange={(e) => set({ status: e.target.value as Filters['status'] })}>
          <option value="">Status — all</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={f.band} onChange={(e) => set({ band: e.target.value })}>
          <option value="">Score band — all</option>
          {SCORE_BANDS.map((b) => (
            <option key={b.band} value={b.band}>
              {b.band} ({b.range})
            </option>
          ))}
        </select>
        <select value={f.owner} onChange={(e) => set({ owner: e.target.value })}>
          <option value="">Owner — all</option>
          {owners.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        {isFiltered && (
          <button type="button" className="rp-filter-clear" onClick={() => setF(BLANK)}>
            Clear
          </button>
        )}
        <span className="rp-resultcount">
          {filtered.length} of {opportunities.length}
        </span>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyNote>No opportunities match the current filters.</EmptyNote>
        ) : (
          <div className="rp-tablewrap">
            <table className="rp-table" style={{ minWidth: 1080 }}>
              <thead>
                <tr>
                  <th>Project / site</th>
                  <th>Sector</th>
                  <th>Borough</th>
                  <th>Client / applicant</th>
                  <th>Source</th>
                  <th>Stage</th>
                  <th>Score</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Next action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="rp-row--click" onClick={() => onOpen(o.id)}>
                    <td className="rp-td-name">{o.name}</td>
                    <td>
                      <SectorChip sector={o.sector} />
                    </td>
                    <td>{o.borough}</td>
                    <td style={{ maxWidth: 180 }}>{o.client}</td>
                    <td>{o.sourceType}</td>
                    <td style={{ maxWidth: 160 }}>{o.stage}</td>
                    <td className="rp-td-num">
                      <ScorePill o={o} /> <BandChip total={totalScore(o.scores)} />
                    </td>
                    <td>
                      <ConfidenceMeter pct={o.confidence} compact />
                    </td>
                    <td>
                      <StatusChip status={o.status} />
                    </td>
                    <td style={{ minWidth: 220 }}>
                      {o.nextAction}
                      <span className="rp-td-sub">
                        {o.owner} · added {formatDate(o.dateAdded)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
