'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useHub } from '@/lib/store'
import type { City, Sector } from '@/lib/types'
import { CITIES, SECTORS, SUB_SECTORS } from '@/lib/types'
import { Callout, Card, PageHeader, SectionTitle } from '@/components/ui'

const inputClass =
  'w-full rounded-[5px] border border-hairline2 bg-card px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink'
const labelClass = 'mb-1 block text-[11px] uppercase tracking-[0.05em] text-ink3'

const FUTURE_FEEDS = [
  { name: 'Planning data feed', note: 'Applications, amendments, refusals and appeals across target cities.' },
  { name: 'RFP / tender feed', note: 'Find a Tender, Contracts Finder and portal watchlists.' },
  { name: 'Contract award feed', note: 'Award notices that reveal active buyers before design procurement.' },
  { name: 'Market / news feed', note: 'Trade-press monitoring for repositioning, disposal and vacancy stories.' },
  { name: 'Companies House lookup', note: 'Ownership, charges and new-SPV signals behind assembling sites.' },
]

export default function IntakePage() {
  const { addSignal } = useHub()
  const [urlValue, setUrlValue] = useState('')
  const [urlDone, setUrlDone] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [city, setCity] = useState<City>('London')
  const [district, setDistrict] = useState('')
  const [sector, setSector] = useState<Sector>('Office')
  const [subSector, setSubSector] = useState(SUB_SECTORS.Office[0])
  const [summary, setSummary] = useState('')
  const [confidence, setConfidence] = useState(3)
  const [manualDone, setManualDone] = useState<string | null>(null)

  const submitUrl = () => {
    if (!urlValue.trim()) return
    const id = addSignal({
      title: `Pasted URL: ${urlValue.replace(/^https?:\/\//, '').slice(0, 60)}`,
      city: 'London',
      district: '—',
      sectorGuess: 'Office',
      subSectorGuess: 'Office retrofit',
      sourceType: 'Pasted URL',
      sourceLink: urlValue,
      rawSummary: 'Pasted URL awaiting AI classification (mocked in this MVP) — sector and city are placeholder guesses.',
      aiNote: 'Queued for classification.',
      confidence: 1,
    })
    setUrlDone(id)
    setUrlValue('')
  }

  const submitManual = () => {
    if (!title.trim() || !summary.trim()) return
    const id = addSignal({
      title: title.trim(),
      city,
      district: district.trim() || '—',
      sectorGuess: sector,
      subSectorGuess: subSector,
      sourceType: 'Manual intelligence',
      sourceLink: 'https://example.internal/manual-note',
      rawSummary: summary.trim(),
      aiNote: 'Relationship intelligence — logged manually, no automated source.',
      confidence,
    })
    setManualDone(id)
    setTitle('')
    setDistrict('')
    setSummary('')
  }

  return (
    <div className="max-w-[980px]">
      <PageHeader title="Data intake" sub="How signals reach the inbox — live routes now, feeds later" />
      <Callout>
        The MVP runs on seeded sample data plus the two manual routes below. The feed integrations are structural
        placeholders — the schema and triage flow are ready for them, but nothing here calls a live API yet.
      </Callout>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Card>
            <SectionTitle aside="Available now">Pasted URL</SectionTitle>
            <p className="mb-2.5 mt-0 text-[12.5px] text-ink2">
              Paste a planning-register entry, agent particulars or article. It lands in the inbox as an unclassified
              signal for triage.
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://…"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                className={inputClass}
              />
              <button
                type="button"
                onClick={submitUrl}
                className="whitespace-nowrap rounded-[5px] bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-ink/85"
              >
                Add to inbox
              </button>
            </div>
            {urlDone && (
              <p className="mb-0 mt-2 text-[12px] text-ink2">
                Added as {urlDone} —{' '}
                <Link href="/signals" className="font-medium text-ink underline underline-offset-2">
                  view in the inbox
                </Link>
                .
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle aside="Available now">Manual intelligence note</SectionTitle>
            <div className="flex flex-col gap-2.5">
              <div>
                <label className={labelClass}>Signal title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Former client now Head of Estates at…" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={labelClass}>City</label>
                  <select value={city} onChange={(e) => setCity(e.target.value as City)} className={inputClass}>
                    {CITIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Borough / district</label>
                  <input value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Sector</label>
                  <select
                    value={sector}
                    onChange={(e) => {
                      const s = e.target.value as Sector
                      setSector(s)
                      setSubSector(SUB_SECTORS[s][0])
                    }}
                    className={inputClass}
                  >
                    {SECTORS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Sub-sector</label>
                  <select value={subSector} onChange={(e) => setSubSector(e.target.value)} className={inputClass}>
                    {SUB_SECTORS[sector].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>What was heard / seen</label>
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={inputClass} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <label className={labelClass}>Evidence confidence (1–5)</label>
                  <select value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className={inputClass}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={submitManual}
                  className="rounded-[5px] bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-ink/85"
                >
                  Log signal
                </button>
              </div>
              {manualDone && (
                <p className="m-0 text-[12px] text-ink2">
                  Logged as {manualDone} —{' '}
                  <Link href="/signals" className="font-medium text-ink underline underline-offset-2">
                    view in the inbox
                  </Link>
                  .
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <Card>
            <SectionTitle aside="Placeholder">CSV upload</SectionTitle>
            <p className="mb-2.5 mt-0 text-[12.5px] text-ink2">
              Weekly exports (agent particulars, planning alerts, tender lists) will map columns to the signal schema
              and batch-create inbox rows.
            </p>
            <label className="flex cursor-not-allowed items-center justify-center rounded-md border border-dashed border-hairline2 bg-inset px-4 py-6 text-[12.5px] text-ink3">
              Drop a CSV here — import mapping ships with the Supabase build
            </label>
          </Card>

          <Card>
            <SectionTitle aside="Future integrations">Automated feeds</SectionTitle>
            <ul className="m-0 list-none p-0">
              {FUTURE_FEEDS.map((f) => (
                <li key={f.name} className="flex items-start justify-between gap-3 border-b border-hairline py-2.5 last:border-0">
                  <span className="text-[12.5px]">
                    <span className="font-medium text-ink">{f.name}</span>
                    <span className="block text-[12px] text-ink2">{f.note}</span>
                  </span>
                  <span className="mt-0.5 whitespace-nowrap rounded-full border border-dashed border-hairline2 px-2 py-px text-[11px] text-ink3">
                    Planned
                  </span>
                </li>
              ))}
            </ul>
            <p className="mb-0 mt-2.5 text-[11.5px] text-ink3">
              Each feed writes raw rows into the same inbox and AI-triage pipeline — no separate workflows per source.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
