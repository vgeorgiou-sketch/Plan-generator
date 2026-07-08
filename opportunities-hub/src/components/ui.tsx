import type { ReactNode } from 'react'
import type { Opportunity, OpportunityStatus, ReviewStatus, Sector } from '@/lib/types'
import { CONFIDENCE_LEVELS } from '@/lib/types'
import { scoreBand, totalScore } from '@/lib/scoring'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-md border border-hairline bg-card p-4 ${className}`}>{children}</section>
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">{children}</h2>
      {aside && <span className="text-[11.5px] text-ink3">{aside}</span>}
    </div>
  )
}

export function PageHeader({ title, sub, aside }: { title: string; sub: string; aside?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h1 className="text-[17px] font-semibold tracking-tight">{title}</h1>
      <span className="text-[12.5px] text-ink3">{sub}</span>
      {aside && <span className="ml-auto">{aside}</span>}
    </div>
  )
}

export function StatTile({
  label,
  value,
  detail,
  attention,
}: {
  label: string
  value: number | string
  detail?: string
  attention?: boolean
}) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-md border border-hairline bg-card px-4 py-3 ${attention ? 'border-l-[3px] border-l-ink' : ''}`}>
      <span className="text-[11px] uppercase tracking-[0.06em] text-ink3">{label}</span>
      <span className="text-[28px] font-semibold leading-tight tracking-tight">{value}</span>
      {detail && <span className="text-[11.5px] text-ink3">{detail}</span>}
    </div>
  )
}

const chipBase = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-px text-[11.5px]'

export function SectorBadge({ sector, subSector }: { sector: Sector; subSector?: string }) {
  const office = sector === 'Office'
  return (
    <span className={`${chipBase} ${office ? 'bg-officewash' : 'bg-livingwash'} text-ink`}>
      <i className={`h-[7px] w-[7px] shrink-0 rounded-full ${office ? 'bg-office' : 'bg-living'}`} aria-hidden />
      {subSector ?? sector}
    </span>
  )
}

/** Review status by ink weight — "Needs review" is the loud one. */
export function ReviewBadge({ status }: { status: ReviewStatus }) {
  if (status === 'Needs review')
    return <span className={`${chipBase} bg-ink font-medium text-white`}>Needs review</span>
  if (status === 'Convert to opportunity')
    return <span className={`${chipBase} border border-ink2 text-ink`}>Converted</span>
  if (status === 'Ignored')
    return <span className={`${chipBase} border border-dashed border-hairline2 text-ink3`}>Ignored</span>
  if (status === 'Watch') return <span className={`${chipBase} border border-hairline2 text-ink2`}>Watch</span>
  return <span className={`${chipBase} border border-hairline2 text-ink3`}>Unreviewed</span>
}

export function OppStatusBadge({ status }: { status: OpportunityStatus }) {
  const dim = status === 'Dormant' || status === 'Closed'
  return (
    <span className={`${chipBase} border ${dim ? 'border-dashed border-hairline2 text-ink3' : 'border-hairline2 text-ink2'}`}>
      {status}
    </span>
  )
}

/** Score band by ink weight: Priority is the solid chip. */
export function BandBadge({ total }: { total: number }) {
  const band = scoreBand(total)
  if (band === 'Priority') return <span className={`${chipBase} bg-ink font-medium text-white`}>Priority</span>
  if (band === 'Research further') return <span className={`${chipBase} border border-ink2 text-ink`}>Research further</span>
  if (band === 'Watch') return <span className={`${chipBase} border border-hairline2 text-ink2`}>Watch</span>
  return <span className={`${chipBase} border border-dashed border-hairline2 text-ink3`}>Low relevance</span>
}

export function ScorePill({ o }: { o: Opportunity }) {
  const total = totalScore(o.scores)
  return (
    <span className="whitespace-nowrap tabular-nums" title={`Score ${total} / 35 — ${scoreBand(total)}`}>
      <strong className="text-[13.5px] font-semibold">{total}</strong>
      <span className="text-[11px] text-ink3">/35</span>
    </span>
  )
}

/** Confidence 1–5 as filled dots + label — always separate from score. */
export function ConfidenceDots({ value, compact }: { value: number; compact?: boolean }) {
  const label = CONFIDENCE_LEVELS.find((c) => c.value === value)?.label ?? ''
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={`Confidence ${value}/5 — ${label}`}>
      <span className="inline-flex gap-[3px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} className={`h-[7px] w-[7px] rounded-full ${n <= value ? 'bg-ink2' : 'bg-hairline'}`} />
        ))}
      </span>
      {!compact && <span className="text-[11.5px] text-ink2 tabular-nums">{value}/5</span>}
    </span>
  )
}

/** 1–5 criterion value as five cells. */
export function CriteriaCells({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={`h-2 w-3.5 rounded-[2px] ${n <= value ? 'bg-office' : 'bg-hairline'}`} aria-hidden />
      ))}
      <span className="ml-1.5 text-[12px] text-ink2 tabular-nums">{value}</span>
    </span>
  )
}

/** Direct-labelled horizontal bar row for split charts. */
export function BarRow({
  label,
  count,
  max,
  color = 'var(--color-office)',
}: {
  label: string
  count: number
  max: number
  color?: string
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_26px] items-center gap-2.5 py-1">
      <span className="truncate text-[12.5px] text-ink2">{label}</span>
      <span className="h-2 overflow-hidden rounded-r border-l border-hairline2">
        <span
          className="block h-full rounded-r"
          style={{ width: `${max ? (count / max) * 100 : 0}%`, background: color }}
        />
      </span>
      <span className="text-right text-[12px] text-ink2 tabular-nums">{count}</span>
    </div>
  )
}

export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-r-md border-l-[3px] border-ink bg-card px-4 py-3 text-[12.5px] text-ink2">
      {children}
    </div>
  )
}

export const thClass =
  'whitespace-nowrap border-b border-hairline2 pb-1.5 pr-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink3'
export const tdClass = 'border-b border-hairline py-2 pr-3 align-top'
