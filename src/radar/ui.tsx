import type { ReactNode } from 'react'
import type { Opportunity, Sector, Status } from './types'
import { SECTOR_LABEL } from './types'
import { confidenceLabel, scoreBand, totalScore } from './model'

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="rp-section-title">
      <h2>{children}</h2>
      {aside && <span className="rp-section-aside">{aside}</span>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`rp-card${className ? ' ' + className : ''}`}>{children}</section>
}

export function StatTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: number | string
  detail?: string
  tone?: 'attention'
}) {
  return (
    <div className={`rp-stat${tone === 'attention' ? ' rp-stat--attention' : ''}`}>
      <span className="rp-stat-label">{label}</span>
      <span className="rp-stat-value">{value}</span>
      {detail && <span className="rp-stat-detail">{detail}</span>}
    </div>
  )
}

export function SectorChip({ sector }: { sector: Sector }) {
  return (
    <span className={`rp-chip rp-chip--sector rp-chip--${sector}`}>
      <i className="rp-dot" aria-hidden />
      {SECTOR_LABEL[sector]}
    </span>
  )
}

export function StatusChip({ status }: { status: Status }) {
  return <span className="rp-chip rp-chip--status">{status}</span>
}

/** Score band rendered by ink weight, not hue — Priority is the solid chip. */
export function BandChip({ total }: { total: number }) {
  const band = scoreBand(total)
  const mod =
    band === 'Priority'
      ? 'priority'
      : band === 'Research further'
        ? 'research'
        : band === 'Watch'
          ? 'watch'
          : 'low'
  return <span className={`rp-chip rp-chip--band rp-chip--band-${mod}`}>{band}</span>
}

export function ScorePill({ o }: { o: Opportunity }) {
  const total = totalScore(o.scores)
  return (
    <span className="rp-scorepill" title={`Score ${total} / 30 — ${scoreBand(total)}`}>
      <strong>{total}</strong>
      <span className="rp-scorepill-max">/30</span>
    </span>
  )
}

/** Confidence shown separately from score — a thin meter plus label. */
export function ConfidenceMeter({ pct, compact }: { pct: number; compact?: boolean }) {
  return (
    <span className="rp-confidence" title={`Confidence ${pct}%`}>
      <span className="rp-confidence-track" aria-hidden>
        <span className="rp-confidence-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="rp-confidence-text">
        {compact ? `${pct}%` : `${confidenceLabel(pct)} · ${pct}%`}
      </span>
    </span>
  )
}

/** One row of a labelled horizontal bar list (counts, direct-labelled). */
export function BarRow({
  label,
  count,
  max,
  color,
  onClick,
}: {
  label: string
  count: number
  max: number
  color?: string
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="rp-barrow" onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="rp-barrow-label">{label}</span>
      <span className="rp-barrow-track">
        <span
          className="rp-barrow-fill"
          style={{ width: `${max ? (count / max) * 100 : 0}%`, background: color ?? 'var(--rp-series-1)' }}
        />
      </span>
      <span className="rp-barrow-value">{count}</span>
    </Tag>
  )
}

/** Six-criteria breakdown: five cells per criterion, filled to the value. */
export function CriteriaCells({ value }: { value: number }) {
  return (
    <span className="rp-cells" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= value ? 'rp-cell rp-cell--on' : 'rp-cell'} aria-hidden />
      ))}
      <span className="rp-cells-num">{value}</span>
    </span>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rp-empty">{children}</p>
}
