/*
  Task 4 — Southwark demolition notices (kinetic layer).
  Idox Public Access has no documented API, so this reads the council's own
  routinely-published Weekly List HTML (Building Control). Same weekly cadence
  the council uses — not aggressive scraping. Check
  southwark.gov.uk/download-our-planning-datasets for bulk data first.

  The actual HTML parsing lives in idox.ts (shared with planning.ts — both
  read the same Idox result-list markup). This file keeps its own exported
  names (WeeklyListRow, parseWeeklyList) for backward compatibility with
  existing callers/tests.
*/

import { parseIdoxResultList, type IdoxResultRow } from './idox.ts'
import type { Signal } from '../signal-model/types.ts'
import type { KineticHit } from './crossReference.ts'

const BASE = 'https://planning.southwark.gov.uk/online-applications'

export type WeeklyListRow = IdoxResultRow

const DEMOLITION = /\bdemolition\b|\bdemolish\b|s(?:ection)?\s?80\b|prior notification of demolition/i

/** Parse the Idox Public Access weekly-list HTML into rows. */
export function parseWeeklyList(html: string): WeeklyListRow[] {
  return parseIdoxResultList(html, BASE)
}

/** Keep only rows whose description reads as a demolition notice. */
export function demolitionRows(rows: WeeklyListRow[]): WeeklyListRow[] {
  return rows.filter((r) => DEMOLITION.test(r.description))
}

/** One weekly-list demolition row → a kinetic hit for the cross-reference. */
export function demolitionToHit(row: WeeklyListRow, noticeDate: string): KineticHit {
  const signal: Signal = {
    id: `demo-${row.reference || row.address}`.replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 48),
    buildingId: '',
    layer: 'buildingControlDemolition',
    factType: 'filed',
    label: `Demolition notice: ${row.description}`.slice(0, 120),
    value: row.reference || row.description.slice(0, 40),
    sourceUrl: row.detailUrl,
    sourceRef: row.reference || undefined,
    observedAt: noticeDate,
    retrievedAt: new Date().toISOString().slice(0, 10),
    confidence: 1,
  }
  return { address: row.address, signal }
}

export async function fetchWeeklyListHtml(searchUrl = `${BASE}/search.do?action=weeklyList`): Promise<string> {
  let res: Response
  try {
    res = await fetch(searchUrl, { headers: { 'User-Agent': 'opportunity-radar-spike/0.1 (weekly-list, low-volume)' } })
  } catch (cause) {
    throw new Error(
      `Southwark weekly-list request failed. This environment blocks egress to ` +
        `planning.southwark.gov.uk — run where reachable. Cause: ${(cause as Error).message}`,
    )
  }
  if (!res.ok) throw new Error(`Southwark weekly list ${res.status}`)
  return res.text()
}
