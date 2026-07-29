'use client'

import Link from 'next/link'
import { useHub } from '@/lib/store'
import {
  countBy,
  formatDate,
  isNewThisWeek,
  isPriority,
  needsAction,
  topRanked,
  totalScore,
} from '@/lib/scoring'
import {
  BandBadge,
  BarRow,
  Card,
  PageHeader,
  ScorePill,
  SectionTitle,
  SectorBadge,
  StatTile,
  tdClass,
  thClass,
} from '@/components/ui'

export default function DashboardPage() {
  const { signals, opportunities, activity } = useHub()

  const needsReview = signals.filter((s) => s.reviewStatus === 'Needs review' || s.reviewStatus === 'Unreviewed')
  const priority = opportunities.filter(isPriority)
  const newThisWeek = [
    ...signals.filter((s) => isNewThisWeek(s.dateFound)),
    ...opportunities.filter((o) => isNewThisWeek(o.dateAdded)),
  ]
  const action = opportunities.filter(needsAction)
  const top5 = topRanked(opportunities, 5)

  const bySector = countBy(opportunities, (o) => o.sector)
  const byCity = countBy(opportunities, (o) => o.city)
  const bySource = countBy(signals, (s) => s.sourceType)
  const maxCity = Math.max(1, ...byCity.map((c) => c.count))
  const maxSource = Math.max(1, ...bySource.map((s) => s.count))

  const funnel = [
    { label: 'Raw signals', value: signals.length },
    { label: 'Awaiting review', value: needsReview.length },
    { label: 'Watching', value: signals.filter((s) => s.reviewStatus === 'Watch').length },
    { label: 'Converted', value: signals.filter((s) => s.reviewStatus === 'Convert to opportunity').length },
    { label: 'Ignored', value: signals.filter((s) => s.reviewStatus === 'Ignored').length },
  ]

  return (
    <div>
      <PageHeader title="Dashboard" sub="Where attention is needed this week" aside={<span className="text-[12.5px] text-ink2">Wednesday 8 July 2026</span>} />

      <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatTile label="Raw signals" value={signals.length} detail="Unreviewed market information" />
        <StatTile label="Needing review" value={needsReview.length} detail="Signals awaiting a decision" attention />
        <StatTile label="Opportunities" value={opportunities.length} detail="Reviewed & qualified leads" />
        <StatTile label="Priority (31–35)" value={priority.length} detail="Partner attention required" attention />
        <StatTile label="New this week" value={newThisWeek.length} detail="Signals + leads since Mon 6 Jul" />
      </div>

      <Card className="mb-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">Signal → opportunity</span>
          {funnel.map((f, i) => (
            <span key={f.label} className="flex items-center gap-6 text-[12.5px] text-ink2">
              {i > 0 && <span className="text-ink3">→</span>}
              <span>
                <strong className="mr-1.5 font-semibold text-ink tabular-nums">{f.value}</strong>
                {f.label}
              </span>
            </span>
          ))}
          <span className="ml-auto text-[11.5px] text-ink3">
            A raw signal is unreviewed market information; an opportunity is a reviewed, qualified lead.
          </span>
        </div>
      </Card>

      <div className="grid items-start gap-3 xl:grid-cols-[1.9fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <SectionTitle aside="Ranked by opportunity score">Top 5 opportunities</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    <th className={thClass}>Opportunity</th>
                    <th className={thClass}>Sector</th>
                    <th className={thClass}>Score</th>
                    <th className={thClass}>Band</th>
                    <th className={thClass}>Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((o) => (
                    <tr key={o.id} className="group">
                      <td className={`${tdClass} font-medium`}>
                        <Link href={`/pipeline/${o.id}`} className="group-hover:underline underline-offset-2">
                          {o.name}
                        </Link>
                        <span className="block text-[11.5px] font-normal text-ink3">
                          {o.city} · {o.client}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <SectorBadge sector={o.sector} subSector={o.subSector} />
                      </td>
                      <td className={`${tdClass} tabular-nums`}>
                        <ScorePill o={o} />
                      </td>
                      <td className={tdClass}>
                        <BandBadge total={totalScore(o.scores)} />
                      </td>
                      <td className={`${tdClass} max-w-[280px]`}>{o.nextAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle aside="Overdue review or hard deadline">Opportunities needing action</SectionTitle>
            {action.length === 0 ? (
              <p className="py-2 text-[12.5px] text-ink3">Nothing overdue — all active leads reviewed inside 14 days.</p>
            ) : (
              <ol className="m-0 list-none p-0">
                {action.map((o, i) => (
                  <li key={o.id} className="flex gap-3 border-b border-hairline py-2 text-[12.5px] text-ink2 last:border-0">
                    <span className="pt-px text-[11px] text-ink3 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      <Link href={`/pipeline/${o.id}`} className="font-medium text-ink hover:underline underline-offset-2">
                        {o.name}
                      </Link>{' '}
                      — last reviewed {formatDate(o.lastReviewed)} ({o.owner}). {o.nextAction}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <SectionTitle aside="Last 7 days">Recent activity</SectionTitle>
            <ul className="m-0 list-none p-0">
              {activity.slice(0, 8).map((a, i) => (
                <li key={i} className="flex gap-2.5 border-b border-hairline py-2 text-[12.5px] last:border-0">
                  <span className="w-11 flex-none pt-px text-[11.5px] text-ink3 tabular-nums">{formatDate(a.date)}</span>
                  {a.href ? (
                    <Link href={a.href} className="text-ink2 hover:text-ink hover:underline underline-offset-2">
                      {a.text}
                    </Link>
                  ) : (
                    <span className="text-ink2">{a.text}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <SectionTitle aside="Opportunities">Sector split</SectionTitle>
            {bySector.map((s) => (
              <BarRow
                key={s.label}
                label={s.label}
                count={s.count}
                max={opportunities.length}
                color={s.label === 'Office' ? 'var(--color-office)' : 'var(--color-living)'}
              />
            ))}
          </Card>
          <Card>
            <SectionTitle aside="Opportunities">City split</SectionTitle>
            {byCity.map((c) => (
              <BarRow key={c.label} label={c.label} count={c.count} max={maxCity} />
            ))}
          </Card>
          <Card>
            <SectionTitle aside="Raw signals">Source type split</SectionTitle>
            {bySource.map((s) => (
              <BarRow key={s.label} label={s.label} count={s.count} max={maxSource} />
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
