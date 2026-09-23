/*
  Planning history — the discriminator axis.

  Why this exists: the wider Southwark sweep surfaced a false positive at
  68 Borough Road — a pub (The Ship) whose SPV/charge/PSC activity was
  ordinary hospitality-business structuring, not a development scheme.
  SPV formation, charges and PSC changes are thrown off by ordinary commerce
  exactly as much as by real schemes; three kinetic signals alone can't tell
  them apart. Planning history can: a building with a real application on
  record is a scheme; a pub with none (or only minor consents) is not.

  Source, attempted in the brief's stated preference order — from THIS
  sandbox, all three were checked and are unreachable (egress-blocked):
    1. southwark.gov.uk/download-our-planning-datasets — a bulk/queryable
       dataset would be more robust than what follows. CHECK THIS MANUALLY
       before trusting the scrape below.
    2. Planning London Datahub (GLA) — a real API, if it covers Southwark.
       Also unchecked from here.
    3. THIS FILE: Idox Public Access address search (planning.southwark.gov.uk),
       parsed with the same <li class="searchresult"> convention already
       proven (structurally) against southwarkDemolition.ts's weekly list.

  Structural uncertainty, not hidden: Idox's ADDRESS/KEYWORD search sometimes
  needs a server-side session, unlike the weekly list (a stateless, date-
  parameterised GET). searchVariants() tries GET-only patterns first;
  planning-probe.ts reports which one — if any — actually returns a real
  results page. Do not trust this file's output until the probe confirms it,
  and DO NOT skip straight to `planningCheck.ts` without running the probe
  first if the check's own two verification cases behave unexpectedly.
*/

import { looksLikeIdoxResultsPage, parseIdoxResultList, ukDateToIso, IDOX_BASE, type IdoxResultRow } from './idox.ts'
import { matchAddress } from './addressMatch.ts'
import type { Signal } from '../signal-model/types.ts'

export interface PlanningSearchVariant {
  name: string
  url: string
}

/** GET-only search URL candidates, most-likely-to-work-without-a-session first. */
export function planningSearchVariants(address: string): PlanningSearchVariant[] {
  const q = encodeURIComponent(address)
  return [
    { name: 'simpleSearchResults (GET, common Idox pattern)', url: `${IDOX_BASE}/simpleSearchResults.do?action=firstPage&searchCriteria.simpleSearchString=${q}` },
    { name: 'advancedSearchResults (GET, address field)', url: `${IDOX_BASE}/advancedSearchResults.do?action=firstPage&searchCriteria.address=${q}` },
  ]
}

export async function fetchPlanningSearchHtml(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'opportunity-radar-spike/0.1 (planning-search, low-volume)' },
      redirect: 'follow',
    })
  } catch (cause) {
    throw new Error(
      'Southwark planning search request failed. This environment blocks egress to ' +
        `planning.southwark.gov.uk — run where reachable. Cause: ${(cause as Error).message}`,
    )
  }
  if (!res.ok) throw new Error(`Southwark planning search ${res.status}`)
  return res.text()
}

// ── application-type classification (from proposal text — Idox rarely
// exposes a clean structured "type" field on the results list itself) ──────

export type ApplicationType = 'preApplication' | 'changeOfUse' | 'full' | 'listedBuilding' | 'minor' | 'advertisement' | 'other'

const TYPE_PATTERNS: { pattern: RegExp; type: ApplicationType }[] = [
  { pattern: /\bpre[- ]?application\b/i, type: 'preApplication' },
  { pattern: /change of use/i, type: 'changeOfUse' },
  { pattern: /listed building consent/i, type: 'listedBuilding' },
  { pattern: /advertisement consent/i, type: 'advertisement' },
  { pattern: /full planning permission|erection of|redevelopment|demolition and/i, type: 'full' },
  { pattern: /minor material amendment|non[- ]material amendment|householder/i, type: 'minor' },
]

export function classifyApplicationType(description: string): ApplicationType {
  for (const { pattern, type } of TYPE_PATTERNS) if (pattern.test(description)) return type
  return 'other'
}

/** Relative development-signal strength — highest for a pre-app (the
 *  brief's "highest-value planning signal", when one is ever public),
 *  lowest for an advertisement consent. Used for eyeballing, not scoring —
 *  the graph engine already treats every planningApplication signal as one
 *  kinetic layer regardless of type; type differentiates within that. */
export const APPLICATION_TYPE_STRENGTH: Record<ApplicationType, number> = {
  preApplication: 5,
  changeOfUse: 4,
  full: 3,
  listedBuilding: 2,
  minor: 1,
  advertisement: 0,
  other: 1,
}

export interface MatchedPlanningRow extends IdoxResultRow {
  matchScore: number
  applicationType: ApplicationType
}

/**
 * Rows whose ADDRESS actually matches the target site — Idox's own search
 * can be loose (partial street/keyword matches). Standing rule: match the
 * real site, not a registered office — this is exactly the corroboration
 * the sweep's registered-office-guessed buildings need.
 */
export function matchPlanningRows(rows: IdoxResultRow[], targetAddress: string, threshold = 0.6): MatchedPlanningRow[] {
  return rows
    .map((r) => ({ ...r, matchScore: matchAddress(targetAddress, r.address).score, applicationType: classifyApplicationType(r.description) }))
    .filter((r) => r.matchScore >= threshold)
    .sort((a, b) => b.matchScore - a.matchScore)
}

/**
 * A filed `planningApplication` signal for one matched row — or null if no
 * date could be extracted. NEVER fabricates observedAt: if the result page
 * didn't carry a parseable date, this refuses to emit a signal rather than
 * guess one, and the caller should print the raw row for manual inspection.
 */
export function planningSignalForBuilding(row: MatchedPlanningRow, buildingId: string): Signal | null {
  const observedAt = row.dateText ? ukDateToIso(row.dateText) : undefined
  if (!observedAt) return null

  return {
    id: `planning-${row.reference || buildingId}-${observedAt}`.replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 64),
    buildingId,
    layer: 'planningApplication',
    factType: 'filed',
    label: `Planning application: ${row.reference || '(ref n/a)'} — ${row.description}`.slice(0, 200),
    value: row.reference || row.description.slice(0, 40),
    sourceUrl: row.detailUrl,
    sourceRef: row.reference || undefined,
    observedAt,
    retrievedAt: new Date().toISOString().slice(0, 10),
    confidence: 1,
    note: `Application type (classified from the proposal text, not a structured field): ${row.applicationType}`,
  }
}

export interface PlanningCheckResult {
  checked: boolean
  variantUsed?: string
  matches: MatchedPlanningRow[]
  error?: string
}

/**
 * Safe, per-address planning check: tries each search variant until one
 * returns a real results page, matches rows to the target address, and
 * NEVER throws — a failed/undiagnosable check comes back `checked: false`
 * with the error explained, so absence-because-we-couldn't-check is never
 * confused with absence-because-we-confirmed-there's-nothing (per the
 * standing rule: absence renders as genuinely empty, never padded — and
 * that includes not padding a failed check into a false "empty" result).
 */
export async function checkPlanningForAddress(address: string): Promise<PlanningCheckResult> {
  const errors: string[] = []
  for (const variant of planningSearchVariants(address)) {
    try {
      const html = await fetchPlanningSearchHtml(variant.url)
      if (!looksLikeIdoxResultsPage(html)) {
        errors.push(`${variant.name}: page did not look like a real results page (session/login/error page?)`)
        continue
      }
      const rows = parseIdoxResultList(html)
      const matches = matchPlanningRows(rows, address)
      return { checked: true, variantUsed: variant.name, matches }
    } catch (err) {
      errors.push(`${variant.name}: ${(err as Error).message}`)
    }
  }
  return { checked: false, matches: [], error: errors.join(' | ') }
}
