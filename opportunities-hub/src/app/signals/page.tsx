'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useHub } from '@/lib/store'
import type { City, RawSignal, ReviewStatus, Sector, SourceType } from '@/lib/types'
import { CITIES, REVIEW_STATUSES, SECTORS, SOURCE_TYPES } from '@/lib/types'
import { formatDate, formatDateLong } from '@/lib/scoring'
import { Callout, Card, ConfidenceDots, PageHeader, ReviewBadge, SectorBadge, tdClass, thClass } from '@/components/ui'

const selectClass =
  'rounded-[5px] border border-hairline2 bg-card px-2 py-1 text-[12.5px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink'

export default function SignalsPage() {
  const { signals } = useHub()
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [city, setCity] = useState<'' | City>('')
  const [sector, setSector] = useState<'' | Sector>('')
  const [source, setSource] = useState<'' | SourceType>('')
  const [status, setStatus] = useState<'' | ReviewStatus>('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const order: ReviewStatus[] = ['Needs review', 'Unreviewed', 'Watch', 'Convert to opportunity', 'Ignored']
    return signals
      .filter((s) => {
        if (city && s.city !== city) return false
        if (sector && s.sectorGuess !== sector) return false
        if (source && s.sourceType !== source) return false
        if (status && s.reviewStatus !== status) return false
        if (needle) {
          const hay = `${s.title} ${s.district} ${s.rawSummary}`.toLowerCase()
          if (!hay.includes(needle)) return false
        }
        return true
      })
      .sort(
        (a, b) =>
          order.indexOf(a.reviewStatus) - order.indexOf(b.reviewStatus) || b.dateFound.localeCompare(a.dateFound),
      )
  }, [signals, q, city, sector, source, status])

  const open = signals.find((s) => s.id === openId) ?? null

  return (
    <div>
      <PageHeader title="Raw signals inbox" sub="Unreviewed market information — triage before it becomes an opportunity" />
      <Callout>
        Signals arrive from the intake feeds and are pre-classified by AI triage (mocked in this MVP). Nothing here is
        a lead yet — click a row to review it and decide: ignore, watch, or convert.
      </Callout>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search title, district, summary…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${selectClass} w-56`}
        />
        <select value={city} onChange={(e) => setCity(e.target.value as '' | City)} className={selectClass}>
          <option value="">City — all</option>
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={sector} onChange={(e) => setSector(e.target.value as '' | Sector)} className={selectClass}>
          <option value="">Sector — all</option>
          {SECTORS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value as '' | SourceType)} className={selectClass}>
          <option value="">Source — all</option>
          {SOURCE_TYPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | ReviewStatus)} className={selectClass}>
          <option value="">Review status — all</option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="ml-auto text-[12px] text-ink3">
          {filtered.length} of {signals.length}
        </span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className={thClass}>Signal</th>
                <th className={thClass}>City</th>
                <th className={thClass}>Sector guess</th>
                <th className={thClass}>Source</th>
                <th className={thClass}>AI triage</th>
                <th className={thClass}>Confidence</th>
                <th className={thClass}>Found</th>
                <th className={thClass}>Review status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-inset" onClick={() => setOpenId(s.id)}>
                  <td className={`${tdClass} max-w-[340px] font-medium`}>
                    {s.title}
                    <span className="block text-[11.5px] font-normal text-ink3">{s.district}</span>
                  </td>
                  <td className={tdClass}>{s.city}</td>
                  <td className={tdClass}>
                    <SectorBadge sector={s.sectorGuess} subSector={s.subSectorGuess} />
                  </td>
                  <td className={tdClass}>{s.sourceType}</td>
                  <td className={`${tdClass} text-ink2`}>{s.aiStatus}</td>
                  <td className={tdClass}>
                    <ConfidenceDots value={s.confidence} compact />
                  </td>
                  <td className={`${tdClass} tabular-nums`}>{formatDate(s.dateFound)}</td>
                  <td className={tdClass}>
                    <ReviewBadge status={s.reviewStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && <ReviewPanel signal={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function ReviewPanel({ signal: s, onClose }: { signal: RawSignal; onClose: () => void }) {
  const { reviewSignal, convertSignal } = useHub()
  const [convertedId, setConvertedId] = useState<string | null>(s.linkedOpportunityId ?? null)

  const act = (status: ReviewStatus) => {
    reviewSignal(s.id, status)
    onClose()
  }

  const buttonClass =
    'rounded-[5px] border border-hairline2 bg-card px-3 py-1.5 text-[12.5px] text-ink2 hover:border-ink2 hover:text-ink'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/25" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-[min(560px,92vw)] overflow-y-auto border-l border-hairline bg-card px-7 py-6 shadow-[-24px_0_48px_rgba(21,21,19,0.1)]">
        <button type="button" onClick={onClose} className={`${buttonClass} absolute right-5 top-5 !py-1 text-[12px]`}>
          Close
        </button>
        <div className="text-[11px] uppercase tracking-[0.08em] text-ink3">{s.id} · Raw signal</div>
        <h2 className="mb-1 mt-1 pr-16 text-[19px] font-semibold tracking-tight">{s.title}</h2>
        <div className="mb-4 flex flex-wrap gap-1.5">
          <SectorBadge sector={s.sectorGuess} subSector={s.subSectorGuess} />
          <span className="inline-flex items-center rounded-full border border-hairline2 px-2 py-px text-[11.5px] text-ink2">
            {s.city} · {s.district}
          </span>
          <span className="inline-flex items-center rounded-full border border-hairline2 px-2 py-px text-[11.5px] text-ink2">
            {s.sourceType}
          </span>
          <ReviewBadge status={s.reviewStatus} />
        </div>

        <div className="mb-4 rounded-md border border-hairline bg-inset px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">Raw summary</div>
          <p className="m-0 text-[13px] text-ink2">{s.rawSummary}</p>
        </div>

        <div className="mb-4 rounded-md border border-hairline2 px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">AI triage</span>
            <span className="text-[11px] text-ink3">Mocked in this MVP — verify against the source</span>
          </div>
          <dl className="m-0 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
            <dt className="text-ink3">Status</dt>
            <dd className="m-0 text-ink2">{s.aiStatus}</dd>
            <dt className="text-ink3">Classification</dt>
            <dd className="m-0 text-ink2">
              {s.sectorGuess} → {s.subSectorGuess}
            </dd>
            <dt className="text-ink3">Why surfaced</dt>
            <dd className="m-0 text-ink2">{s.aiNote}</dd>
            <dt className="text-ink3">Confidence</dt>
            <dd className="m-0">
              <ConfidenceDots value={s.confidence} />
            </dd>
          </dl>
        </div>

        <dl className="mb-5 grid grid-cols-2 gap-x-5 gap-y-2 text-[12.5px]">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.04em] text-ink3">Source</dt>
            <dd className="m-0 break-words text-ink2">
              <a href={s.sourceLink} target="_blank" rel="noreferrer" className="text-ink underline decoration-hairline2 underline-offset-2 hover:decoration-ink">
                {s.sourceLink.replace(/^https?:\/\//, '').slice(0, 44)}…
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.04em] text-ink3">Date found</dt>
            <dd className="m-0 text-ink2">{formatDateLong(s.dateFound)}</dd>
          </div>
        </dl>

        <div className="border-t border-hairline pt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">Review decision</div>
          {convertedId ? (
            <p className="m-0 text-[13px] text-ink2">
              Converted to opportunity —{' '}
              <Link href={`/pipeline/${convertedId}`} className="font-medium text-ink underline underline-offset-2">
                open the lead card
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-[5px] bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-ink/85"
                onClick={() => setConvertedId(convertSignal(s.id) ?? null)}
              >
                Convert to opportunity
              </button>
              <button type="button" className={buttonClass} onClick={() => act('Watch')}>
                Watch
              </button>
              <button type="button" className={buttonClass} onClick={() => act('Needs review')}>
                Flag for review
              </button>
              <button type="button" className={buttonClass} onClick={() => act('Ignored')}>
                Ignore
              </button>
            </div>
          )}
          <p className="mb-0 mt-3 text-[11.5px] text-ink3">
            Converting creates a draft lead card with neutral placeholder scores — qualification and scoring happen on
            the opportunity, not the signal.
          </p>
        </div>
      </aside>
    </>
  )
}
