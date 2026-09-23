/*
  Planning history — the discriminator axis.

  Why this exists: the wider Southwark sweep surfaced a false positive at
  68 Borough Road — a pub (The Ship) whose SPV/charge/PSC activity was
  ordinary hospitality-business structuring, not a development scheme.
  SPV formation, charges and PSC changes are thrown off by ordinary commerce
  exactly as much as by real schemes; three kinetic signals alone can't tell
  them apart. Planning history can: a building with a real application on
  record is a scheme; a pub with none (or only a tree-works/advertisement
  consent) is not.

  Source, revised preference order after manual investigation found better
  options than the original scrape-first plan:
    1. planning.data.gov.uk (national Planning Data Platform, MHCLG) —
       UNCONFIRMED whether it covers application-level records at all (see
       planningDataGovUk.ts). This sandbox could not check: planning.data.gov.uk
       AND bare www.gov.uk are both egress-blocked here, same as every
       council site tried before. Background knowledge, not verified live:
       this platform has historically been spatial/policy data (conservation
       areas, article 4 directions, listed buildings), not a live application
       register — real reason to doubt it has what's needed here, separate
       from just "couldn't check." Treat planningDataGovUk.ts as a PROBE, not
       a proven source, until a live run confirms it one way or the other.
    2. THIS FILE: Southwark's own Idox Public Access register
       (planning.southwark.gov.uk), full history, no date window — the
       authoritative source, and already proven structurally against
       southwarkDemolition.ts's weekly list (same <li class="searchresult">
       markup, now shared via idox.ts).
    3. Third-party mirrors (Plota, PlanWatch) — fine for a manual spot-check,
       NOT built against here. Their windows are limited (90 days) and it's
       someone else's scrape, not a production dependency.

  CRITICAL — full history, never a rolling window. A manual check nearly
  reached a wrong verdict because a default UI view showed only the last 90
  days; the real Southwark Bridge Road application is dated June 2026 for an
  SPV formed January 2025 — 17 months apart. searchVariants() below sets NO
  date-bound parameter (an unset filter, not a guessed "unlimited" override —
  guessing a specific param name that the server silently ignores would give
  false confidence). checkPlanningForAddress() instead makes this checkable:
  it unions results across every search variant (not just the first that
  works) and reports the returned date SPAN. If that span looks suspiciously
  narrow/recent for a real address, that's the signal to go inspect Idox's
  actual advanced-search form for a hidden default and fix it — not to trust
  silence.

  Structural uncertainty, not hidden: Idox's ADDRESS/KEYWORD search sometimes
  needs a server-side session, unlike the weekly list (a stateless GET).
  planning-probe.ts reports which variant — if any — actually returns a real
  results page, for BOTH sources above, before planningCheck.ts is trusted.
*/

import { looksLikeIdoxResultsPage, parseIdoxResultList, ukDateToIso, IDOX_BASE, type IdoxResultRow } from './idox.ts'
import { matchAddress } from './addressMatch.ts'
import { collectCookiePairs, detectProxyUrl, proxyDispatcher, BOT_USER_AGENT } from './netEnv.ts'
import type { Signal } from '../signal-model/types.ts'

export interface PlanningSearchVariant {
  name: string
  url: string
}

/**
 * GET-only search URL candidates, most-likely-to-work-without-a-session
 * first. Deliberately carry NO date-range parameter — omitting a filter
 * requests full history; guessing a specific "from 1990" override param
 * name risks the server silently ignoring an unrecognised parameter while
 * looking like full history was requested. checkPlanningForAddress's date-
 * span diagnostic is the real check on whether that assumption holds.
 */
export function planningSearchVariants(address: string): PlanningSearchVariant[] {
  const q = encodeURIComponent(address)
  return [
    { name: 'simpleSearchResults (GET, common Idox pattern)', url: `${IDOX_BASE}/simpleSearchResults.do?action=firstPage&searchCriteria.simpleSearchString=${q}` },
    { name: 'advancedSearchResults (GET, address field)', url: `${IDOX_BASE}/advancedSearchResults.do?action=firstPage&searchCriteria.address=${q}` },
  ]
}

export interface FetchPlanningOptions {
  /** Defaults to the honest, self-identifying bot UA. Override once
   *  planning-probe.ts has confirmed a browser UA is actually needed. */
  userAgent?: string
  /** A session cookie to replay. When omitted, checkPlanningForAddress
   *  acquires one itself via a warm-up request — pass this explicitly only
   *  to override that (e.g. from planning-probe.ts's own diagnostics). */
  cookie?: string
}

export interface PlanningPageResult {
  html: string
  /** "name=value" pairs from this response's Set-Cookie header(s) — a
   *  NetScaler persistence cookie (NSC_...) and/or JSESSIONID, if set. */
  cookies: string[]
}

async function fetchPlanningPage(url: string, opts: FetchPlanningOptions = {}): Promise<PlanningPageResult> {
  const dispatcher = proxyDispatcher()
  const headers: Record<string, string> = { 'User-Agent': opts.userAgent ?? BOT_USER_AGENT }
  if (opts.cookie) headers['Cookie'] = opts.cookie

  let res: Response
  try {
    res = await fetch(url, {
      headers,
      redirect: 'follow',
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit)
  } catch (cause) {
    throw new Error(
      'Southwark planning search request failed. If this address opens fine in a browser, the ' +
        'likely cause is NOT that the site is unreachable — check: (1) a corporate proxy the browser ' +
        `uses silently (set HTTPS_PROXY${detectProxyUrl() ? ` — one IS detected: ${detectProxyUrl()}, but the connection still failed` : ' — none is currently set'}); ` +
        '(2) a corporate TLS-inspection proxy — confirmed before for this exact host: run node WITH the ' +
        '--use-system-ca flag (Node 22.9+), which trusts the OS certificate store the same way curl/the ' +
        'browser does. If this script was already run with that flag and still fails, run ' +
        'puller/planning-probe.ts for a fresh diagnosis; ' +
        `(3) User-Agent/session requirements — also tested by the same probe. Cause: ${(cause as Error).message}`,
    )
  }
  if (!res.ok) throw new Error(`Southwark planning search ${res.status}`)
  return { html: await res.text(), cookies: collectCookiePairs(res) }
}

export async function fetchPlanningSearchHtml(url: string, opts: FetchPlanningOptions = {}): Promise<string> {
  return (await fetchPlanningPage(url, opts)).html
}

/**
 * GET the search entry page to acquire the session Idox's search flow
 * needs — confirmed via a real browser session (curl gets a JSESSIONID on
 * the very first request; the NetScaler in front adds its own persistence
 * cookie too). A stateless single GET with no cookie may not carry Idox's
 * server-side search state the way a browser's session does.
 */
export async function fetchSessionCookies(opts: FetchPlanningOptions = {}): Promise<string | undefined> {
  const { cookies } = await fetchPlanningPage(`${IDOX_BASE}/`, opts)
  return cookies.length ? cookies.join('; ') : undefined
}

// ── application-type classification (from proposal text — Idox rarely
// exposes a clean structured "type" field on the results list itself) ──────

export type ApplicationType = 'preApplication' | 'changeOfUse' | 'full' | 'listedBuilding' | 'minor' | 'treeWorks' | 'advertisement' | 'other'

const TYPE_PATTERNS: { pattern: RegExp; type: ApplicationType }[] = [
  { pattern: /\bpre[- ]?application\b/i, type: 'preApplication' },
  { pattern: /change of use/i, type: 'changeOfUse' },
  { pattern: /listed building consent/i, type: 'listedBuilding' },
  { pattern: /advertisement consent/i, type: 'advertisement' },
  // Confirmed real example: 68 Borough Road's ONLY planning record ever is
  // "Works to a Tree in a Conservation Area" — the exact false-positive-
  // avoidance case this type exists for. TPO = Tree Preservation Order.
  { pattern: /works? to a?n? ?tree|tree preservation order|\btpo\b/i, type: 'treeWorks' },
  { pattern: /full planning permission|erection of|redevelopment|demolition and/i, type: 'full' },
  { pattern: /minor material amendment|non[- ]material amendment|householder/i, type: 'minor' },
]

export function classifyApplicationType(description: string): ApplicationType {
  for (const { pattern, type } of TYPE_PATTERNS) if (pattern.test(description)) return type
  return 'other'
}

/** Relative development-signal strength — highest for a pre-app (the
 *  brief's "highest-value planning signal", when one is ever public),
 *  lowest for tree/advertisement consent (routine, not development). Used
 *  for eyeballing, not scoring — the graph engine already treats every
 *  planningApplication signal as one kinetic layer regardless of type;
 *  type differentiates within that. */
export const APPLICATION_TYPE_STRENGTH: Record<ApplicationType, number> = {
  preApplication: 5,
  changeOfUse: 4,
  full: 3,
  listedBuilding: 2,
  minor: 1,
  treeWorks: 0,
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
  /** Every variant that actually returned a real results page — plural,
   *  because results are UNIONED across all of them (see below), not just
   *  the first one that works. */
  variantsUsed: string[]
  matches: MatchedPlanningRow[]
  /** Oldest/newest date among the matches, if any have a parseable date.
   *  A narrow, suspiciously-recent span on a real address is the signal to
   *  go inspect Idox's actual form for a hidden default window — not to
   *  trust that "no date param was sent" means "full history was returned". */
  dateSpan?: { earliest: string; latest: string }
  error?: string
}

/**
 * Safe, per-address planning check. Acquires a session cookie first (unless
 * one was passed in) — confirmed necessary via a real browser session —
 * then runs EVERY search variant with it, not just the first that returns a
 * real page, unioning their rows (deduped by reference): different Idox
 * entry points can apply different defaults, so relying on only one risks
 * silently missing older records exactly the way the brief's own manual
 * check nearly did. Never throws: a failed/undiagnosable check comes back
 * `checked: false` with the error explained, so absence-because-we-
 * couldn't-check is never confused with absence-because-we-confirmed-
 * there's-nothing.
 */
export async function checkPlanningForAddress(address: string, opts: FetchPlanningOptions = {}): Promise<PlanningCheckResult> {
  const errors: string[] = []
  const variantsUsed: string[] = []
  const seen = new Set<string>()
  const rows: IdoxResultRow[] = []

  let cookie = opts.cookie
  if (cookie === undefined) {
    try {
      cookie = await fetchSessionCookies(opts)
    } catch (err) {
      errors.push(`session warm-up failed, continuing without a cookie: ${(err as Error).message}`)
    }
  }
  const variantOpts: FetchPlanningOptions = { ...opts, cookie }

  for (const variant of planningSearchVariants(address)) {
    try {
      const html = await fetchPlanningSearchHtml(variant.url, variantOpts)
      if (!looksLikeIdoxResultsPage(html)) {
        errors.push(`${variant.name}: page did not look like a real results page (session/login/error page?)`)
        continue
      }
      variantsUsed.push(variant.name)
      for (const row of parseIdoxResultList(html)) {
        const key = row.reference || `${row.address}|${row.description}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(row)
      }
    } catch (err) {
      errors.push(`${variant.name}: ${(err as Error).message}`)
    }
  }

  if (variantsUsed.length === 0) {
    return { checked: false, variantsUsed: [], matches: [], error: errors.join(' | ') }
  }

  const matches = matchPlanningRows(rows, address)
  const isoDates = matches
    .map((m) => (m.dateText ? ukDateToIso(m.dateText) : undefined))
    .filter((d): d is string => Boolean(d))
    .sort()
  const dateSpan = isoDates.length ? { earliest: isoDates[0], latest: isoDates[isoDates.length - 1] } : undefined

  return { checked: true, variantsUsed, matches, dateSpan }
}
