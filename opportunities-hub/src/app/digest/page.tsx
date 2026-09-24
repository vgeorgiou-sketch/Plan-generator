'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useHub } from '@/lib/store'
import type { Opportunity, RawSignal } from '@/lib/types'
import {
  byScoreDesc,
  formatDate,
  isNewThisWeek,
  needsAction,
  scoreBand,
  topRanked,
  totalScore,
} from '@/lib/scoring'
import { BandBadge, Card, ScorePill, SectionTitle, SectorBadge, tdClass } from '@/components/ui'

function digestText(opportunities: Opportunity[], signals: RawSignal[]): string {
  const top5 = topRanked(opportunities, 5)
  const fresh = signals.filter((s) => isNewThisWeek(s.dateFound))
  const review = signals.filter((s) => s.reviewStatus === 'Needs review' || s.reviewStatus === 'Unreviewed')
  const action = opportunities.filter(needsAction)
  const lines = [
    'OPPORTUNITIES HUB — WEEKLY LEADERSHIP BRIEFING',
    'Week commencing 6 July 2026 · Office & Living · London / Birmingham / Manchester / Bristol',
    '',
    'TOP 5 OPPORTUNITIES',
    ...top5.map(
      (o, i) =>
        `${i + 1}. ${o.name} (${o.sector} — ${o.subSector}, ${o.city}) — ${totalScore(o.scores)}/35 ${scoreBand(totalScore(o.scores))}. Next: ${o.nextAction}`,
    ),
    '',
    `NEW SIGNALS THIS WEEK (${fresh.length})`,
    ...fresh.map((s) => `- ${s.title} — ${s.sourceType}, ${s.city}.`),
    '',
    `SIGNALS AWAITING REVIEW: ${review.length}`,
    `OPPORTUNITIES NEEDING ACTION: ${action.length}${action.length ? ' — ' + action.map((o) => o.name).join('; ') : ''}`,
    '',
    'RECOMMENDED NEXT ACTIONS',
    ...topRanked(opportunities, 3).map((o) => `- ${o.name}: ${o.nextAction}`),
    `- Clear the ${review.length} unreviewed signals at Monday's triage session.`,
  ]
  return lines.join('\n')
}

export default function DigestPage() {
  const { opportunities, signals } = useHub()
  const [copied, setCopied] = useState(false)

  const top5 = topRanked(opportunities, 5)
  const fresh = signals.filter((s) => isNewThisWeek(s.dateFound))
  const review = signals.filter((s) => s.reviewStatus === 'Needs review' || s.reviewStatus === 'Unreviewed')
  const action = opportunities.filter(needsAction)
  const office = [...opportunities.filter((o) => o.sector === 'Office')].sort(byScoreDesc).slice(0, 3)
  const living = [...opportunities.filter((o) => o.sector === 'Living')].sort(byScoreDesc).slice(0, 3)
  const rfps = [
    ...opportunities.filter((o) => o.sourceType === 'RFP').map((o) => ({
      key: o.id,
      href: `/pipeline/${o.id}`,
      text: `${o.name} — ${o.stage}. ${o.nextAction}`,
    })),
    ...signals
      .filter((s) => s.sourceType === 'RFP' && !s.linkedOpportunityId)
      .map((s) => ({ key: s.id, href: '/signals', text: `${s.title} — ${s.rawSummary}` })),
  ]
  const preRfp = signals.filter(
    (s) =>
      ['Planning', 'Regeneration prospectus', 'Company/developer signal'].includes(s.sourceType) &&
      ['Unreviewed', 'Needs review', 'Watch'].includes(s.reviewStatus),
  )

  const copy = async () => {
    await navigator.clipboard.writeText(digestText(opportunities, signals))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lineItem = (key: string, date: string, body: React.ReactNode) => (
    <li key={key} className="flex gap-2.5 border-b border-hairline py-2 text-[12.5px] last:border-0">
      <span className="w-11 flex-none pt-px text-[11.5px] text-ink3 tabular-nums">{date}</span>
      <span className="text-ink2">{body}</span>
    </li>
  )

  return (
    <div className="max-w-[860px]">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-[19px] font-semibold tracking-tight">Weekly briefing — w/c 6 July 2026</h1>
        <button
          type="button"
          onClick={copy}
          className="whitespace-nowrap rounded-[5px] border border-hairline2 bg-card px-3 py-1.5 text-[12px] text-ink2 hover:border-ink2 hover:text-ink"
        >
          {copied ? 'Copied' : 'Copy as text'}
        </button>
      </div>
      <p className="mb-4 text-[12.5px] text-ink3">
        Office & Living · London, Birmingham, Manchester, Bristol · prepared for the Monday leadership update.
      </p>

      <div className="flex flex-col gap-3">
        <Card>
          <SectionTitle>Top 5 opportunities</SectionTitle>
          <table className="w-full border-collapse text-[12.5px]">
            <tbody>
              {top5.map((o, i) => (
                <tr key={o.id}>
                  <td className={`${tdClass} w-6 text-ink3 tabular-nums`}>{i + 1}</td>
                  <td className={`${tdClass} font-medium`}>
                    <Link href={`/pipeline/${o.id}`} className="hover:underline underline-offset-2">
                      {o.name}
                    </Link>
                    <span className="block text-[11.5px] font-normal text-ink3">{o.nextAction}</span>
                  </td>
                  <td className={tdClass}>
                    <SectorBadge sector={o.sector} subSector={o.subSector} />
                  </td>
                  <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
                    <ScorePill o={o} />
                  </td>
                  <td className={tdClass}>
                    <BandBadge total={totalScore(o.scores)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <SectionTitle aside={`${fresh.length} found`}>New signals this week</SectionTitle>
          <ul className="m-0 list-none p-0">
            {fresh.map((s) =>
              lineItem(
                s.id,
                formatDate(s.dateFound),
                <>
                  <Link href="/signals" className="font-medium text-ink hover:underline underline-offset-2">
                    {s.title}
                  </Link>{' '}
                  — {s.sourceType}, {s.city}.
                </>,
              ),
            )}
          </ul>
        </Card>

        <Card>
          <SectionTitle aside={`${review.length} waiting`}>Signals needing review</SectionTitle>
          <p className="m-0 text-[12.5px] text-ink2">
            {review.length} signals sit unreviewed in the inbox — clear at Monday’s triage session.{' '}
            <Link href="/signals" className="font-medium text-ink underline underline-offset-2">
              Open the inbox
            </Link>
            .
          </p>
        </Card>

        <Card>
          <SectionTitle aside="Overdue review">Opportunities needing action</SectionTitle>
          <ul className="m-0 list-none p-0">
            {action.map((o) =>
              lineItem(
                o.id,
                formatDate(o.lastReviewed),
                <>
                  <Link href={`/pipeline/${o.id}`} className="font-medium text-ink hover:underline underline-offset-2">
                    {o.name}
                  </Link>{' '}
                  — owner {o.owner}, status {o.status}. Progress or move to Dormant.
                </>,
              ),
            )}
          </ul>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <SectionTitle>Strongest office opportunities</SectionTitle>
            {office.map((o) => (
              <p key={o.id} className="m-0 border-b border-hairline py-2 text-[12.5px] text-ink2 last:border-0">
                <Link href={`/pipeline/${o.id}`} className="font-medium text-ink hover:underline underline-offset-2">
                  {o.name}
                </Link>{' '}
                ({o.city}, {totalScore(o.scores)}/35) — {o.opportunityAngle}
              </p>
            ))}
          </Card>
          <Card>
            <SectionTitle>Strongest living opportunities</SectionTitle>
            {living.map((o) => (
              <p key={o.id} className="m-0 border-b border-hairline py-2 text-[12.5px] text-ink2 last:border-0">
                <Link href={`/pipeline/${o.id}`} className="font-medium text-ink hover:underline underline-offset-2">
                  {o.name}
                </Link>{' '}
                ({o.city}, {totalScore(o.scores)}/35) — {o.opportunityAngle}
              </p>
            ))}
          </Card>
        </div>

        <Card>
          <SectionTitle>RFPs worth checking</SectionTitle>
          <ul className="m-0 list-none p-0">
            {rfps.map((r) => (
              <li key={r.key} className="border-b border-hairline py-2 text-[12.5px] text-ink2 last:border-0">
                <Link href={r.href} className="font-medium text-ink hover:underline underline-offset-2">
                  {r.text.split(' — ')[0]}
                </Link>{' '}
                — {r.text.split(' — ').slice(1).join(' — ')}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle aside="Pre-RFP — where the practice differentiates">Planning & early signals worth watching</SectionTitle>
          <ul className="m-0 list-none p-0">
            {preRfp.slice(0, 6).map((s) =>
              lineItem(
                s.id,
                formatDate(s.dateFound),
                <>
                  <span className="font-medium text-ink">{s.title}</span> — {s.aiNote}
                </>,
              ),
            )}
          </ul>
        </Card>

        <Card>
          <SectionTitle>Recommended next actions</SectionTitle>
          <ol className="m-0 list-none p-0">
            {[...topRanked(opportunities, 3).map((o) => ({ key: o.id, text: `${o.name} — ${o.nextAction}` })), { key: 'triage', text: `Clear the ${review.length} unreviewed signals at Monday's triage session.` }].map(
              (item, i) => (
                <li key={item.key} className="flex gap-3 border-b border-hairline py-2 text-[12.5px] text-ink2 last:border-0">
                  <span className="pt-px text-[11px] text-ink3 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <span>{item.text}</span>
                </li>
              ),
            )}
          </ol>
        </Card>
      </div>
    </div>
  )
}
