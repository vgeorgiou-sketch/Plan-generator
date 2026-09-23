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

  CONFIRMED live (curl reproduces the identical failure, so it's the
  request shape, not Node/TLS): a cold GET straight to a results endpoint
  (e.g. simpleSearchResults.do?action=firstPage&searchCriteria...=...)
  returns HTTP 500, even though the response sets a fresh JSESSIONID.
  Classic Idox pattern — the results endpoint needs a session AND a POST:
  (1) GET the search FORM page first (search.do?action=simple /
  action=advanced) to establish a session; (2) POST the search, with that
  session's cookie attached and the form's OWN fields (idox.ts's
  parseIdoxForm reads them from the real HTML — hidden tokens included —
  rather than guessing a field shape). Never crashes silently past a
  non-2xx: the response body is captured and surfaced in the error, since
  Idox's error pages tend to name the exact problem.

  CONFIRMED live at sweep scale: firing 20 planning checks back-to-back
  (sweep.ts, one per candidate) tripped Southwark's rate limit — HTTP 429
  from roughly the 7th candidate onward, which the code then treated the
  same as any other failure: "inconclusive", move on. That's wrong for
  THIS signal specifically — planning is the decisive discriminator (see
  this file's own opening paragraph), so silently under-checking most of a
  sweep would undiscriminate the whole ranking, not just leave one gap.
  fetchPlanningPage below now retries a 429 with backoff (honouring a
  Retry-After header when the server sends one) instead of surfacing it as
  an ordinary error on the first hit — a persistent 429 still eventually
  surfaces as a real, explained failure after rateLimitConfig.maxRetries,
  never silently swallowed. sweep.ts also paces its own calls (3-5s apart)
  so a burst doesn't trip the limit in the first place — the retry here is
  the safety net, not the primary fix.

  CONFIRMED live once the pacing fix above landed (zero 429s): every
  candidate's planning check then failed with "page did not look like a
  real results page" — while the IDENTICAL checkPlanningForAddress path
  kept working perfectly for a single address (planningCheck.ts). The
  difference is the loop, not the code: fetchPlanningPage used Node's
  shared/global connection pool, so a kept-alive TCP socket to
  planning.southwark.gov.uk could get reused across candidates. Southwark's
  NetScaler can pin session state to a specific backend via connection
  stickiness, independent of whatever Cookie header this codebase sends
  correctly on every request — one candidate's check could land on a
  connection whose backend still thought a DIFFERENT candidate's session
  was live, and hand back a login/session page instead of real results.
  checkPlanningForAddress now creates a brand-new, single-use dispatcher
  per call (createSessionDispatcher) — never the shared pool — so no
  socket from one address's check can ever be reused by another's,
  matching planningCheck.ts's per-address isolation exactly rather than
  incidentally.

  CONFIRMED live immediately after THAT fix landed: the isolation fix broke
  the TLS fix. A fresh, explicitly-constructed undici Agent does NOT
  reliably inherit --use-system-ca's effect the way the process's own
  default dispatcher does — every request failed "fetch failed" again,
  despite the flag being set, because createSessionDispatcher's new Agent
  was (re)creating its own TLS trust context that never consulted the OS
  store the boot flag was supposed to add. Rather than depend on a
  boot-time flag two independent fixes could keep fighting over,
  createSessionDispatcher now builds the CA list itself, explicitly, via
  node:tls's getCACertificates('system') (Node 22.9+, the same release
  that shipped --use-system-ca) combined with the bundled Mozilla list —
  this reads the OS trust store directly and works whether or not
  --use-system-ca was passed, so isolation and TLS trust can no longer
  fight: each per-call dispatcher is self-sufficient for both.
*/

import { looksLikeIdoxResultsPage, parseIdoxResultList, parseIdoxForm, ukDateToIso, IDOX_BASE, type IdoxResultRow } from './idox.ts'
import { matchAddress, parseAddress, type ParsedAddress } from './addressMatch.ts'
import { collectCookiePairs, detectProxyUrl, proxyDispatcher, sleep, BOT_USER_AGENT } from './netEnv.ts'
import { snippet } from './jsonResponse.ts'
import { Agent, ProxyAgent, type Dispatcher } from 'undici'
import { getCACertificates, rootCertificates } from 'node:tls'
import type { Signal } from '../signal-model/types.ts'

export interface PlanningSearchVariant {
  name: string
  /** The search FORM page to GET first — its cookie response is the
   *  session the subsequent POST needs. */
  formUrl: string
  /** The field on that form to set with the address/keyword query. Must
   *  exist among the form's real fields (checked, not assumed) — if it
   *  doesn't, that's a genuine anomaly worth surfacing, not something to
   *  silently patch over with a guessed name. */
  fieldName: string
}

/**
 * Both of Idox's search entry points — simple (free-text) and advanced
 * (address field) — as form pages to GET first, never as a direct results
 * URL. Deliberately carry NO date-range parameter anywhere in this flow:
 * omitting a filter requests full history; guessing a specific "from 1990"
 * override param name risks the server silently ignoring an unrecognised
 * parameter while looking like full history was requested.
 * checkPlanningForAddress's date-span diagnostic is the real check on
 * whether that assumption holds.
 */
export function planningSearchVariants(): PlanningSearchVariant[] {
  return [
    { name: 'simple search (form → POST)', formUrl: `${IDOX_BASE}/search.do?action=simple`, fieldName: 'searchCriteria.simpleSearchString' },
    { name: 'advanced search (form → POST)', formUrl: `${IDOX_BASE}/search.do?action=advanced`, fieldName: 'searchCriteria.address' },
  ]
}

export interface FetchPlanningOptions {
  /** Defaults to the honest, self-identifying bot UA. Override once
   *  planning-probe.ts has confirmed a browser UA is actually needed. */
  userAgent?: string
  /** A session cookie to replay. When omitted, each search variant
   *  acquires its own via the form-page GET — pass this explicitly only to
   *  override that (e.g. from planning-probe.ts's own diagnostics). */
  cookie?: string
}

interface PlanningRequestInit extends FetchPlanningOptions {
  method?: 'GET' | 'POST'
  body?: string
  /** Overrides netEnv.ts's shared proxyDispatcher() for this request.
   *  checkPlanningForAddress always sets this to a fresh, single-use
   *  dispatcher (see createSessionDispatcher) so one address's requests
   *  never share a connection with another's. */
  dispatcher?: Dispatcher
}

export interface PlanningPageResult {
  html: string
  /** "name=value" pairs from this response's Set-Cookie header(s) — a
   *  NetScaler persistence cookie (NSC_...) and/or JSESSIONID, if set. */
  cookies: string[]
}

/** Mutable on purpose (not `const` values) — planning.test.ts sets
 *  `baseDelayMs`/`maxDelayMs` near-zero so retry tests don't actually wait
 *  real seconds, while production keeps sensible real backoff. */
export const rateLimitConfig = { baseDelayMs: 5000, maxDelayMs: 60_000, maxRetries: 4 }

/** Retry-After is usually a plain integer number of seconds on this kind of
 *  rate limit; the (rarer) HTTP-date form is left unhandled — falls through
 *  to the exponential-backoff default rather than guessing a parse. */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
}

async function fetchPlanningPage(url: string, opts: PlanningRequestInit = {}): Promise<PlanningPageResult> {
  const dispatcher = opts.dispatcher ?? proxyDispatcher()
  const headers: Record<string, string> = { 'User-Agent': opts.userAgent ?? BOT_USER_AGENT }
  if (opts.cookie) headers['Cookie'] = opts.cookie
  if (opts.body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded'

  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body,
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
          `(3) form/session requirements — this flow already GETs the search form first, see this file's ` +
          `header. Cause: ${(cause as Error).message}`,
      )
    }

    if (res.status === 429) {
      if (res.body) await res.body.cancel().catch(() => {})
      if (attempt >= rateLimitConfig.maxRetries) {
        throw new Error(
          `Southwark planning ${opts.method ?? 'GET'} ${url} → HTTP 429 (rate limited), still after ` +
            `${attempt + 1} attempts. Planning is the decisive discriminator, so this is surfaced as a ` +
            'real failure rather than silently skipped — space calls out further or reduce concurrency.',
        )
      }
      const backoffMs = parseRetryAfterMs(res.headers.get('Retry-After')) ?? Math.min(rateLimitConfig.baseDelayMs * 2 ** attempt, rateLimitConfig.maxDelayMs)
      await sleep(backoffMs)
      continue
    }

    const html = await res.text()
    if (!res.ok) {
      throw new Error(
        `Southwark planning ${opts.method ?? 'GET'} ${url} → HTTP ${res.status}. Idox error pages often ` +
          `name the exact problem — body: ${snippet(html)}`,
      )
    }
    return { html, cookies: collectCookiePairs(res) }
  }
}

function withQueryParam(url: string, key: string, value: string): string {
  const u = new URL(url)
  u.searchParams.set(key, value)
  return u.toString()
}

/**
 * GET the search form, then POST the query with that session's cookie —
 * the confirmed-live two-step flow (see this file's header). Uses the
 * form's OWN action URL, method and fields (idox.ts's parseIdoxForm reads
 * them from the real HTML — hidden session/CSRF tokens included — rather
 * than guessing), overriding only the one field this search cares about.
 * `?action=firstPage` is appended to the submit URL: the query-string
 * action Idox's Struts-style dispatch used on the (previously working, now
 * 500ing without a session) direct GET, kept because it's real evidence of
 * what the results endpoint expects, not a fresh guess.
 */
async function runSearchVariant(variant: PlanningSearchVariant, address: string, opts: PlanningRequestInit): Promise<string> {
  const formPage = await fetchPlanningPage(variant.formUrl, opts)
  const cookie = formPage.cookies.length ? formPage.cookies.join('; ') : opts.cookie

  const form = parseIdoxForm(formPage.html, variant.formUrl, /SearchResults/i)
  if (!form) throw new Error(`no <form> found on the search page (${variant.formUrl}) — Idox's page structure may have changed`)
  if (!(variant.fieldName in form.fields)) {
    throw new Error(
      `search form at ${variant.formUrl} has no field named "${variant.fieldName}" — real fields found: ` +
        `${Object.keys(form.fields).join(', ') || '(none)'}. The field-name assumption needs checking against the live form.`,
    )
  }

  const fields = new URLSearchParams(form.fields)
  // Preserving the form's OWN fields verbatim is how a hidden session/CSRF
  // token survives the round trip — but Idox's form can ALSO carry a
  // pre-filled default recency window (e.g. searchCriteria.dateReceivedFrom/
  // To) as a hidden or defaulted field. Blindly replaying that would
  // silently reintroduce the brief's original "90-day default" trap through
  // a different door. Full history means clearing anything date-range-
  // shaped, not trusting that it's already blank.
  for (const key of [...fields.keys()]) {
    if (/date/i.test(key)) fields.delete(key)
  }
  fields.set(variant.fieldName, address)
  const submitUrl = withQueryParam(form.action, 'action', 'firstPage')

  const resultPage =
    form.method === 'POST'
      ? await fetchPlanningPage(submitUrl, { ...opts, cookie, method: 'POST', body: fields.toString() })
      : await fetchPlanningPage(`${submitUrl}&${fields.toString()}`, { ...opts, cookie, method: 'GET' })

  return resultPage.html
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
 * Does the target's street name(s) and building number turn up — as plain
 * substrings, not a structured comparison — anywhere in a row's address OR
 * description? A deliberately loose second pass alongside matchAddress's
 * score: confirmed live that some real records (a cross-boundary
 * "Observations to Other Authorities" entry, in particular) can be indexed
 * under an address field that doesn't structurally line up the way a
 * straightforward site address does, while still plainly mentioning the
 * street in the free text somewhere. Requiring ALL of the target's tokens
 * (not just one) keeps this from matching on a single common word shared
 * by an unrelated street of the same name pattern.
 */
function mentionsTargetStreet(row: IdoxResultRow, target: ParsedAddress): boolean {
  if (!target.tokens.length) return false
  const haystack = `${row.address} ${row.description}`.toUpperCase()
  if (!target.tokens.every((t) => haystack.includes(t))) return false
  if (target.buildingNumber && !haystack.includes(target.buildingNumber)) return false
  return true
}

/**
 * Rows whose ADDRESS actually matches the target site — Idox's own search
 * can be loose (partial street/keyword matches). Standing rule: match the
 * real site, not a registered office — this is exactly the corroboration
 * the sweep's registered-office-guessed buildings need.
 *
 * Deliberately loose on purpose, confirmed necessary live: the structured
 * matchAddress score alone missed real, known-correct records (a query
 * address with no postcode, scored against a row whose address carries an
 * extra site/business-name prefix, understated the match). A row counts as
 * a match if EITHER matchAddress clears the threshold OR its address/
 * description plainly mentions the target's street name(s) and number
 * (mentionsTargetStreet) — never the reverse, so this only ever loosens,
 * it doesn't relax the postcode-conflict hard-zero guard inside
 * matchAddress itself.
 */
export function matchPlanningRows(rows: IdoxResultRow[], targetAddress: string, threshold = 0.5): MatchedPlanningRow[] {
  const target = parseAddress(targetAddress)
  return rows
    .map((r) => ({ ...r, matchScore: matchAddress(targetAddress, r.address).score, applicationType: classifyApplicationType(r.description) }))
    .filter((r) => r.matchScore >= threshold || mentionsTargetStreet(r, target))
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
  /** Present when `checked: false` (every variant failed — this is why),
   *  but ALSO present when `checked: true` if at least one variant still
   *  failed alongside a successful one: a real per-variant problem (a
   *  field-name mismatch, a 500 with a diagnosable body) should never be
   *  silently absorbed just because a different variant happened to work. */
  error?: string
}

/**
 * The OS trust store PLUS Node's own bundled (Mozilla) roots, fetched
 * explicitly. Confirmed live: a fresh, per-call undici Agent does not
 * reliably pick up --use-system-ca's effect the way the process's default
 * dispatcher does, so isolation (createSessionDispatcher) and TLS trust
 * (--use-system-ca) ended up fighting each other. tls.getCACertificates
 * ('system') reads the OS store directly and works whether or not
 * --use-system-ca was passed (confirmed: returns the same certs either
 * way) — passing it explicitly makes each dispatcher self-sufficient
 * instead of depending on ambient process state a fresh Agent might not
 * inherit. Falls back to the bundled list alone on a Node too old to have
 * getCACertificates (added alongside --use-system-ca, so this should be
 * rare in practice).
 */
export function systemTrustedCaCerts(): (string | Buffer)[] {
  try {
    return [...getCACertificates('system'), ...getCACertificates('bundled')]
  } catch {
    return [...rootCertificates]
  }
}

/**
 * A brand-new, single-use dispatcher for one checkPlanningForAddress call —
 * never Node's shared/global connection pool. See this file's header for
 * why: a pooled keep-alive socket to planning.southwark.gov.uk let a
 * NetScaler pin session state to a specific backend by connection
 * stickiness, independent of the Cookie header this codebase sends
 * correctly on every request. `connections: 1` guarantees this instance
 * can never even internally reuse a stale socket across the couple of
 * requests one address check makes. Explicitly trusts the OS store (see
 * systemTrustedCaCerts) so this isolation doesn't reintroduce the
 * corporate-TLS-inspection failure --use-system-ca fixed. When a corporate
 * proxy is configured, a fresh ProxyAgent is used instead of netEnv.ts's
 * shared/cached one, for the same isolation reason, with the same explicit
 * trust store applied to the tunnelled connection (`requestTls`).
 */
function createSessionDispatcher(): Dispatcher {
  const proxyUrl = detectProxyUrl()
  const ca = systemTrustedCaCerts()
  return proxyUrl ? new ProxyAgent({ uri: proxyUrl, requestTls: { ca } }) : new Agent({ connections: 1, pipelining: 0, connect: { ca } })
}

/**
 * Safe, per-address planning check. Each search variant establishes its
 * own session (GET the form, POST the query with that session's cookie —
 * see runSearchVariant) and runs EVERY variant, not just the first that
 * returns a real page, unioning their rows (deduped by reference):
 * different Idox entry points can apply different defaults, so relying on
 * only one risks silently missing older records exactly the way the
 * brief's own manual check nearly did. Never throws: a failed/undiagnosable
 * check comes back `checked: false` with the error explained (including
 * the response body on a non-2xx — see runSearchVariant/fetchPlanningPage —
 * since Idox's error pages tend to name the exact problem), so absence-
 * because-we-couldn't-check is never confused with absence-because-we-
 * confirmed-there's-nothing. The whole call uses ONE dedicated dispatcher
 * (see createSessionDispatcher) — isolated from every other address's
 * check, including ones running earlier in the same process (e.g.
 * sweep.ts's loop over candidates).
 */
export async function checkPlanningForAddress(address: string, opts: FetchPlanningOptions = {}): Promise<PlanningCheckResult> {
  const errors: string[] = []
  const variantsUsed: string[] = []
  const seen = new Set<string>()
  const rows: IdoxResultRow[] = []
  const dispatcher = createSessionDispatcher()
  const sessionOpts: PlanningRequestInit = { ...opts, dispatcher }

  try {
    for (const variant of planningSearchVariants()) {
      try {
        const html = await runSearchVariant(variant, address, sessionOpts)
        if (!looksLikeIdoxResultsPage(html)) {
          errors.push(`${variant.name}: page did not look like a real results page after the form→POST flow (session/login/error page?) — body: ${snippet(html)}`)
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
  } finally {
    await dispatcher.close().catch(() => {})
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

  return { checked: true, variantsUsed, matches, dateSpan, ...(errors.length ? { error: errors.join(' | ') } : {}) }
}
