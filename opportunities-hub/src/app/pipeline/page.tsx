'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useHub } from '@/lib/store'
import type { City, OpportunityStatus, Sector, SourceType } from '@/lib/types'
import { CITIES, OPPORTUNITY_STATUSES, SECTORS, SOURCE_TYPES, SUB_SECTORS } from '@/lib/types'
import { SCORE_BANDS, formatDate, scoreBand, totalScore } from '@/lib/scoring'
import {
  BandBadge,
  Callout,
  Card,
  ConfidenceDots,
  OppStatusBadge,
  PageHeader,
  ScorePill,
  SectorBadge,
  tdClass,
  thClass,
} from '@/components/ui'

const selectClass =
  'rounded-[5px] border border-hairline2 bg-card px-2 py-1 text-[12.5px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink'

export default function PipelinePage() {
  const { opportunities } = useHub()
  const [q, setQ] = useState('')
  const [city, setCity] = useState<'' | City>('')
  const [sector, setSector] = useState<'' | Sector>('')
  const [subSector, setSubSector] = useState('')
  const [source, setSource] = useState<'' | SourceType>('')
  const [status, setStatus] = useState<'' | OpportunityStatus>('')
  const [band, setBand] = useState('')
  const [minConfidence, setMinConfidence] = useState(0)
  const [owner, setOwner] = useState('')

  const owners = useMemo(() => [...new Set(opportunities.map((o) => o.owner))].sort(), [opportunities])
  const subSectorOptions = sector ? SUB_SECTORS[sector] : [...SUB_SECTORS.Office, ...SUB_SECTORS.Living]

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return opportunities
      .filter((o) => {
        if (city && o.city !== city) return false
        if (sector && o.sector !== sector) return false
        if (subSector && o.subSector !== subSector) return false
        if (source && o.sourceType !== source) return false
        if (status && o.status !== status) return false
        if (band && scoreBand(totalScore(o.scores)) !== band) return false
        if (minConfidence && o.confidence < minConfidence) return false
        if (owner && o.owner !== owner) return false
        if (needle) {
          const hay = `${o.name} ${o.client} ${o.city} ${o.district} ${o.signalSummary}`.toLowerCase()
          if (!hay.includes(needle)) return false
        }
        return true
      })
      .sort((a, b) => totalScore(b.scores) - totalScore(a.scores) || b.dateAdded.localeCompare(a.dateAdded))
  }, [opportunities, q, city, sector, subSector, source, status, band, minConfidence, owner])

  return (
    <div>
      <PageHeader title="Opportunities pipeline" sub="Reviewed and qualified leads, ranked by score" />
      <Callout>
        Everything here has passed human review. Scores use the seven-criterion model (max 35); confidence is evidence
        strength and never adds to the score.
      </Callout>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <input type="search" placeholder="Search name, client, district…" value={q} onChange={(e) => setQ(e.target.value)} className={`${selectClass} w-52`} />
        <select value={city} onChange={(e) => setCity(e.target.value as '' | City)} className={selectClass}>
          <option value="">City — all</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={sector}
          onChange={(e) => {
            setSector(e.target.value as '' | Sector)
            setSubSector('')
          }}
          className={selectClass}
        >
          <option value="">Sector — all</option>
          {SECTORS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={subSector} onChange={(e) => setSubSector(e.target.value)} className={selectClass}>
          <option value="">Sub-sector — all</option>
          {subSectorOptions.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value as '' | SourceType)} className={selectClass}>
          <option value="">Source — all</option>
          {SOURCE_TYPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | OpportunityStatus)} className={selectClass}>
          <option value="">Status — all</option>
          {OPPORTUNITY_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={band} onChange={(e) => setBand(e.target.value)} className={selectClass}>
          <option value="">Score band — all</option>
          {SCORE_BANDS.map((b) => (
            <option key={b.band} value={b.band}>
              {b.band} ({b.range})
            </option>
          ))}
        </select>
        <select value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} className={selectClass}>
          <option value={0}>Confidence — any</option>
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              ≥ {n}/5
            </option>
          ))}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={selectClass}>
          <option value="">Owner — all</option>
          {owners.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <span className="ml-auto text-[12px] text-ink3">
          {filtered.length} of {opportunities.length}
        </span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className={thClass}>Project / site</th>
                <th className={thClass}>City</th>
                <th className={thClass}>Sector</th>
                <th className={thClass}>Client / applicant</th>
                <th className={thClass}>Source</th>
                <th className={thClass}>Stage</th>
                <th className={thClass}>Score</th>
                <th className={thClass}>Confidence</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Next action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="group">
                  <td className={`${tdClass} min-w-[190px] font-medium`}>
                    <Link href={`/pipeline/${o.id}`} className="hover:underline underline-offset-2">
                      {o.name}
                    </Link>
                    <span className="block text-[11.5px] font-normal text-ink3">{o.district}</span>
                  </td>
                  <td className={tdClass}>{o.city}</td>
                  <td className={tdClass}>
                    <SectorBadge sector={o.sector} subSector={o.subSector} />
                  </td>
                  <td className={`${tdClass} max-w-[170px]`}>{o.client}</td>
                  <td className={tdClass}>{o.sourceType}</td>
                  <td className={`${tdClass} max-w-[160px]`}>{o.stage}</td>
                  <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
                    <ScorePill o={o} /> <BandBadge total={totalScore(o.scores)} />
                  </td>
                  <td className={tdClass}>
                    <ConfidenceDots value={o.confidence} compact />
                  </td>
                  <td className={tdClass}>
                    <OppStatusBadge status={o.status} />
                  </td>
                  <td className={`${tdClass} min-w-[220px]`}>
                    {o.nextAction}
                    <span className="block text-[11.5px] text-ink3">
                      {o.owner} · reviewed {formatDate(o.lastReviewed)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
