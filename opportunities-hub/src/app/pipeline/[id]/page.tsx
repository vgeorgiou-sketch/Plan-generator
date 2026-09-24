'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useHub } from '@/lib/store'
import { SCORE_CRITERIA } from '@/lib/types'
import { formatDateLong, scoreBand, totalScore } from '@/lib/scoring'
import {
  BandBadge,
  Card,
  ConfidenceDots,
  CriteriaCells,
  OppStatusBadge,
  SectorBadge,
} from '@/components/ui'

/**
 * The full lead card — written to be read by a principal in under a minute,
 * in the order of the five decision questions.
 */
export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { opportunities } = useHub()
  const o = opportunities.find((x) => x.id === id)

  if (!o) {
    return (
      <div>
        <p className="text-[13px] text-ink2">Opportunity not found.</p>
        <Link href="/pipeline" className="text-[13px] font-medium text-ink underline underline-offset-2">
          Back to pipeline
        </Link>
      </div>
    )
  }

  const total = totalScore(o.scores)
  const trail = [
    { label: 'The signal', body: o.signalSummary },
    { label: 'Why it matters', body: o.opportunityAngle },
    { label: 'Architectural opportunity', body: o.architecturalIssue },
    { label: 'Relevance to practice', body: o.relevance },
    { label: 'Commercial reason to care', body: o.commercialReason },
    { label: 'Next action', body: o.nextAction, strong: true },
  ]

  const meta: [string, React.ReactNode][] = [
    ['Client / applicant', o.client],
    ['City · district', `${o.city} · ${o.district}`],
    ['Address', o.address],
    ['Stage', o.stage],
    [
      'Source',
      <a key="src" href={o.sourceLink} target="_blank" rel="noreferrer" className="text-ink underline decoration-hairline2 underline-offset-2 hover:decoration-ink">
        {o.sourceType} — open source link
      </a>,
    ],
    ['Reference', o.reference],
    ['Owner', o.owner],
    ['Dates', `Added ${formatDateLong(o.dateAdded)} · last reviewed ${formatDateLong(o.lastReviewed)}`],
  ]
  if (o.fromSignalId) meta.push(['Origin', `Converted from raw signal ${o.fromSignalId}`])

  return (
    <div className="max-w-[880px]">
      <Link href="/pipeline" className="text-[12px] text-ink3 hover:text-ink">
        ← Opportunities pipeline
      </Link>
      <div className="mb-1 mt-2 text-[11px] uppercase tracking-[0.08em] text-ink3">{o.id} · Lead card</div>
      <h1 className="text-[21px] font-semibold tracking-tight">{o.name}</h1>
      <p className="mb-2.5 mt-0.5 text-[12.5px] text-ink3">{o.address}</p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <SectorBadge sector={o.sector} subSector={o.subSector} />
        <OppStatusBadge status={o.status} />
        <BandBadge total={total} />
        <span className="inline-flex items-center rounded-full border border-hairline2 px-2 py-px text-[11.5px] text-ink2">
          {o.sourceType}
        </span>
        <span className="inline-flex items-center rounded-full border border-hairline2 px-2 py-px text-[11.5px] text-ink2">
          {o.stage}
        </span>
      </div>

      <div className="mb-4 grid gap-4 rounded-md border border-hairline bg-inset p-4 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-[5px]">
          {SCORE_CRITERIA.map((c) => (
            <div key={c.key} className="grid grid-cols-[158px_auto] items-center gap-2.5 text-[12px] text-ink2">
              <span title={c.hint}>{c.label}</span>
              <CriteriaCells value={o.scores[c.key]} />
            </div>
          ))}
        </div>
        <div className="flex flex-col items-end gap-1.5 text-right">
          <div>
            <div className="text-[32px] font-semibold leading-none tracking-tight">{total}</div>
            <div className="text-[12px] text-ink3">of 35 — {scoreBand(total)}</div>
          </div>
          <div className="mt-1.5 border-t border-hairline pt-2">
            <div className="mb-1 text-[12px] text-ink3">Confidence (scored separately)</div>
            <ConfidenceDots value={o.confidence} />
          </div>
        </div>
      </div>

      <ol className="m-0 mb-4 list-none p-0">
        {trail.map((t, i) => (
          <li key={t.label} className="grid grid-cols-[20px_170px_1fr] gap-3 border-b border-hairline py-2.5 last:border-0">
            <span className="pt-px text-[11px] text-ink3 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            <span className="pt-px text-[11px] font-semibold uppercase tracking-[0.06em] text-ink2">{t.label}</span>
            <p className={`m-0 text-[13px] ${t.strong ? 'font-medium text-ink' : 'text-ink2'}`}>{t.body}</p>
          </li>
        ))}
      </ol>

      <div className="mb-4 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
        {meta.map(([label, value]) => (
          <dl key={label} className="m-0 text-[12.5px]">
            <dt className="text-[11px] uppercase tracking-[0.04em] text-ink3">{label}</dt>
            <dd className="m-0 break-words text-ink2">{value}</dd>
          </dl>
        ))}
      </div>

      <Card className="bg-inset">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">Notes</div>
        <p className="m-0 text-[12.5px] text-ink2">{o.notes}</p>
      </Card>
    </div>
  )
}
