'use client'

import {
  CITIES,
  CONFIDENCE_LEVELS,
  OPPORTUNITY_STATUSES,
  REVIEW_STATUSES,
  SCORE_CRITERIA,
  SECTORS,
  SOURCE_TYPES,
  SUB_SECTORS,
} from '@/lib/types'
import { SCORE_BANDS } from '@/lib/scoring'
import { Callout, Card, PageHeader, SectionTitle, tdClass, thClass } from '@/components/ui'

function ChipList({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="rounded-full border border-hairline2 px-2 py-px text-[11.5px] text-ink2">
          {i}
        </span>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="max-w-[980px]">
      <PageHeader title="Settings / scoring model" sub="The rules the whole system runs on — visible now, editable in a later release" />
      <Callout>
        Scoring weights, sectors and cities are configuration, not code — this page shows the current model so
        leadership can challenge it. Editing moves server-side with the Supabase build.
      </Callout>

      <div className="flex flex-col gap-3">
        <Card>
          <SectionTitle aside="Seven criteria · 1–5 each · total out of 35">Scoring criteria</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className={thClass}>Criterion</th>
                  <th className={thClass}>What it measures</th>
                  <th className={thClass}>Scale</th>
                </tr>
              </thead>
              <tbody>
                {SCORE_CRITERIA.map((c) => (
                  <tr key={c.key}>
                    <td className={`${tdClass} font-medium`}>{c.label}</td>
                    <td className={`${tdClass} text-ink2`}>{c.hint}</td>
                    <td className={`${tdClass} whitespace-nowrap text-ink2 tabular-nums`}>1–5</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <SectionTitle>Score interpretation</SectionTitle>
            <table className="w-full border-collapse text-[12.5px]">
              <tbody>
                {SCORE_BANDS.map((b) => (
                  <tr key={b.band}>
                    <td className={`${tdClass} w-16 whitespace-nowrap tabular-nums`}>{b.range}</td>
                    <td className={`${tdClass} font-medium`}>{b.band}</td>
                    <td className={`${tdClass} text-ink2`}>{b.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <SectionTitle aside="Never adds to the score">Confidence scale</SectionTitle>
            <table className="w-full border-collapse text-[12.5px]">
              <tbody>
                {CONFIDENCE_LEVELS.map((c) => (
                  <tr key={c.value}>
                    <td className={`${tdClass} w-8 tabular-nums`}>{c.value}</td>
                    <td className={`${tdClass} text-ink2`}>{c.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <SectionTitle aside="Sub-sectors extensible">Office sub-sectors</SectionTitle>
            <ChipList items={SUB_SECTORS.Office} />
          </Card>
          <Card>
            <SectionTitle aside="Sub-sectors extensible">Living sub-sectors</SectionTitle>
            <ChipList items={SUB_SECTORS.Living} />
          </Card>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <SectionTitle aside="More UK cities can be added">Cities</SectionTitle>
            <ChipList items={CITIES} />
          </Card>
          <Card>
            <SectionTitle>Sectors</SectionTitle>
            <ChipList items={SECTORS} />
          </Card>
        </div>

        <Card>
          <SectionTitle>Source types</SectionTitle>
          <ChipList items={SOURCE_TYPES} />
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <SectionTitle aside="Raw signals">Review statuses</SectionTitle>
            <ChipList items={REVIEW_STATUSES} />
          </Card>
          <Card>
            <SectionTitle aside="Pipeline">Opportunity statuses</SectionTitle>
            <ChipList items={OPPORTUNITY_STATUSES} />
          </Card>
        </div>
      </div>
    </div>
  )
}
