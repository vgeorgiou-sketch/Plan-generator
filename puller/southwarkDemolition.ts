/*
  Task 4 — Southwark demolition notices (kinetic layer).
  Idox Public Access has no documented API, so this reads the council's own
  routinely-published Weekly List HTML (Building Control). Same weekly cadence
  the council uses — not aggressive scraping. Check
  southwark.gov.uk/download-our-planning-datasets for bulk data first.

  parseWeeklyList is a pure function, unit-tested against a fixture. The live
  fetch is thin and clearly marked as needing verification against real HTML.
*/

import type { Signal } from '../signal-model/types.ts'
import type { KineticHit } from './crossReference.ts'

const BASE = 'https://planning.southwark.gov.uk/online-applications'

export interface WeeklyListRow {
  reference: string
  address: string
  description: string
  detailUrl: string
}

const DEMOLITION = /\bdemolition\b|\bdemolish\b|s(?:ection)?\s?80\b|prior notification of demolition/i

/**
 * Parse the Idox Public Access weekly/search results HTML into rows.
 * Tolerant by design — Idox markup varies between installs and versions, so
 * this must be checked against Southwark's live HTML before being trusted.
 */
export function parseWeeklyList(html: string): WeeklyListRow[] {
  const rows: WeeklyListRow[] = []
  // Each result is an <li class="searchresult"> … </li> block.
  const blocks = html.match(/<li[^>]*class="[^"]*searchresult[^"]*"[\s\S]*?<\/li>/gi) ?? []
  for (const block of blocks) {
    const anchor = block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!anchor) continue
    const href = anchor[1].replace(/&amp;/g, '&')
    const description = stripTags(anchor[2])
    // Address usually sits in the following <p class="address"> or metaInfo line.
    const addrMatch = block.match(/<p[^>]*class="[^"]*address[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    const address = addrMatch ? stripTags(addrMatch[1]) : ''
    const refMatch = (description + ' ' + address).match(/\b\d{2}\/[A-Z]{2}\/\d{3,5}\b/)
    rows.push({
      reference: refMatch ? refMatch[0] : '',
      address,
      description,
      detailUrl: href.startsWith('http') ? href : `${BASE}/${href.replace(/^\//, '')}`,
    })
  }
  return rows
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
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
