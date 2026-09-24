# Southwark kinetic signal puller — spike

**Objective:** prove or kill this claim — *public records reveal a building
undergoing ownership, financing, or demolition change in Southwark before that
change is visible in trade press or on the planning register.* One genuine,
checkable hit is success. Zero hits is a valid, cheap kill.

This is a spike, not the production pipeline. No scheduling, retries, or UI.

## ⚠️ Cannot run in the Claude Code web environment

This environment's network policy allows only package registries + Anthropic.
Companies House, EPC and Southwark Idox are **denied at the proxy** (403 on
CONNECT — verified), and no API keys are present. So the live pulls cannot
execute here, and **no lead-time number can be produced in this environment.**

Run it on a machine with open egress and free keys (copy `.env.example` → `.env`
and fill in, or export directly):

```bash
# Companies House: https://developer.company-information.service.gov.uk/
# EPC Open Data:   https://get-energy-performance-data.communities.gov.uk/
node --use-system-ca --env-file=.env --experimental-strip-types puller/task0.ts          # the lead-time validation (489 days)
node --use-system-ca --env-file=.env --experimental-strip-types puller/task1.ts          # EPC pressure signal for the seed building
node --use-system-ca --env-file=.env --experimental-strip-types puller/planning-probe.ts # RUN THIS FIRST — does Idox address search even work here?
node --use-system-ca --env-file=.env --experimental-strip-types puller/planningCheck.ts  # planning history verification (the pub vs. the real case)
node --env-file=.env         --experimental-strip-types puller/sweepDiscover.ts          # Part 1, stage 1 — discovery (Companies House only)
node --use-system-ca --env-file=.env --experimental-strip-types puller/sweepEnrich.ts    # Part 1, stage 2 — planning, one candidate at a time
node --use-system-ca --env-file=.env --experimental-strip-types puller/run.ts            # the whole spike, Tasks 1→5
```

**Part 1 is two separate stages, not one script — `sweep.ts` no longer runs
anything itself.** It one-shot-ran discovery, enrichment AND planning in a
single loop, and that's what caused two live failures in sequence: firing
~20 planning checks back-to-back tripped Southwark's rate limit, and once
that was paced out, a shared/pooled connection let cross-candidate session
state bleed (both fully diagnosed in `planning.ts`'s file header). Splitting
into `sweepDiscover.ts` (Companies House only — no rate-limit/session issue
observed there) and `sweepEnrich.ts` (planning, one candidate at a time,
resumable) stops the burst at its source instead of patching around it
again. Run `sweepDiscover.ts` first — it writes every enriched candidate to
`sweep-candidates.json` — then `sweepEnrich.ts` against that file; if it's
interrupted, re-run the same command and it picks up exactly where it left
off (see the Part 1 section below for the full mechanics).

**`--use-system-ca` (Node 22.9+) — required on a corporate network with TLS
inspection, confirmed live**: `planning.southwark.gov.uk` sits behind a
proxy that re-signs HTTPS with an internal root CA; Windows trusts it (so
curl and the browser work), but Node's own bundled OpenSSL CA store
doesn't, so every plain `fetch` to that host fails at the TLS handshake
with no HTTP response at all. `--use-system-ca` makes Node trust the OS
cert store too, which fixed it — confirmed via `planning-probe.ts` showing
`default (Node/undici untouched) — CONNECTED, HTTP 200` once the flag was
added. It's harmless to always include, even off that network: it only
*adds* trust, it doesn't remove any of Node's bundled roots.

`planning-probe.ts` and `planningCheck.ts` need no key (Southwark's planning
search is unauthenticated) — just egress to `planning.southwark.gov.uk`.

`.env` is gitignored and does not survive a fresh container — recreate it
from `.env.example` with real keys each time you work in a new sandbox.

Without keys or egress every CLI **fails loudly and prints no number** — a
fabricated result is worse than no answer, and is the exact failure this whole
model exists to prevent. (`--env-file` needs Node ≥ 20; otherwise `export` the vars.)

## What's built

Every pure core is **unit-tested here, offline**; the network layers are thin
and run where egress exists.

| File | Task | Tested |
|------|------|--------|
| `leadTime.ts` | 0 — ownership-change classification + lead-time maths | `leadTime.test.ts` ✓ |
| `companiesHouse.ts` | 0/2/3 — real API client (search, advanced-search, filing-history, charges) | — (network) |
| `task0.ts` | 0 — Southwark Bridge Road lead-time CLI | — (orchestration) |
| `epc.ts` | 1 — EPC universe client + `normaliseEpcRow` / `isLargeCommercial` | `parsers.test.ts` ✓ |
| `spvScan.ts` | 2 — new-SPV scan across real-estate SIC codes | — (orchestration) |
| `kineticSignals.ts` | 2/3 — CH hits → kinetic signals (SPV `inferred`, charge `filed`) | `parsers.test.ts` ✓ |
| `southwarkDemolition.ts` | 4 — Idox weekly-list fetch + `parseWeeklyList` | `parsers.test.ts` ✓ |
| `addressMatch.ts` | 5 — fuzzy address matching (postcode + district aware) | `crossReference.test.ts` ✓ |
| `crossReference.ts` | 5 — convergence join (pressure × kinetic) | `crossReference.test.ts` ✓ |
| `run.ts` | 1→5 — the whole spike, converged buildings + evidence | — (orchestration) |
| `http.ts` / `jsonResponse.ts` | Attributes a 403 to egress vs. real auth rejection; diagnoses an HTML-instead-of-JSON response instead of crashing | `http.test.ts` / `jsonResponse.test.ts` ✓ |
| `sector.ts` | Part 1 — heuristic sector/conversion tagging from company name + matched prior EPC use | `sweep.test.ts` ✓ |
| `sweep.ts` | Part 1's shared, tested logic ONLY — candidate→graph conversion, merge/dedup-by-building, ranking. No longer runnable directly; see `sweepDiscover.ts`/`sweepEnrich.ts` | `sweep.test.ts` ✓ |
| `sweepDiscover.ts` | Part 1, stage 1 — structured Southwark discovery (SIC × location × date) + full Companies House enrichment (PSC/charges/officers/filings) per hit, writes a JSON file | — (no planning, so no rate-limit/isolation risk to test) |
| `sweepEnrich.ts` | Part 1, stage 2 — reads that file, runs `checkPlanningForAddress` ONE candidate at a time (paced, resumable), writes results back after every candidate, then prints the ranked report | `sweepEnrich.test.ts` ✓ |
| `idox.ts` | Shared Idox Public Access result-list parser (`<li class="searchresult">`) and form parser (`parseIdoxForm` — action/method/fields from real HTML) — used by both `southwarkDemolition.ts` and `planning.ts` | `planning.test.ts` ✓ |
| `planning.ts` | The discriminator: `planningApplication` signal source (Idox, full-history, GET-form-then-POST-search — a cold GET 500s). Application-type classification, address matching, never fabricates a date, unions results across every search variant | `planning.test.ts` ✓ |
| `planningDataGovUk.ts` | Probe-only client for `planning.data.gov.uk` — unconfirmed whether it covers application-level data | — (probe) |
| `netEnv.ts` | Corporate-proxy detection (`HTTPS_PROXY`/`HTTP_PROXY`) via an `undici` `ProxyAgent`, applied per-request. Needs `undici` (added as a real dependency) | `netEnv.test.ts` ✓ |

```bash
node --experimental-strip-types puller/leadTime.test.ts
node --experimental-strip-types puller/crossReference.test.ts
node --experimental-strip-types puller/parsers.test.ts
node --experimental-strip-types puller/sweep.test.ts
node --experimental-strip-types puller/planning.test.ts    # all pass, offline
node --experimental-strip-types graph-model/validate.ts    # 39 assertions incl. the planning-flips-amber-to-green proof
```

Every CLI file (`task0.ts`, `task1.ts`, `run.ts`, `sweepDiscover.ts`,
`sweepEnrich.ts`, `epc-probe.ts`) guards its `main()` behind
`process.argv[1] === fileURLToPath(import.meta.url)` — importing one for its
pure, tested functions (as `task1.test.ts` and `sweep.test.ts` do) must
never also fire a live network call as a side effect. `sweep.ts` itself
carries the same guard even though it has no `main()` anymore — running it
directly just prints where the two real stages live, rather than either
doing nothing silently or attempting the one-shot burst this whole split
exists to stop.

## Needs verification against live responses

The pure parsers are tested against representative fixtures, but sources
must be checked against their real output before the numbers are trusted:

- **EPC pagination.** `epcSearch` pulls one page; EPC uses `search-after` for
  more. Fine for the spike, widen for production.
- **Idox weekly-list HTML** and **Idox planning search HTML** (`southwarkDemolition.ts`
  / `planning.ts`, sharing `idox.ts`'s parser) match a standard Idox install;
  Southwark's actual markup must be confirmed — run `planning-probe.ts` first.
  Respect robots.txt and reasonable request rates either way.
- **VOA.** Cross-check source for the universe — confirm bulk access terms at
  voa.gov.uk before wiring it in (not built blind).

## Planning history — the discriminator (new)

Why: the wider sweep surfaced a real false positive at 68 Borough Road — The
Ship, a pub whose SPV/charge/PSC activity was ordinary business structuring,
not a development scheme. Those three signals alone can't tell a pub from a
scheme; planning history can. See `planning.ts`'s file header for the full
reasoning and `graph-model/conclusion.ts`'s scoring rule.

**Source, revised preference order after manual investigation found better
options — all attempted live via `WebFetch` from the sandbox that wrote
this, ALL egress-blocked** (`planning.data.gov.uk`, bare `www.gov.uk`, and
`planning.southwark.gov.uk` all returned `EGRESS_BLOCKED`, not "doesn't exist"):

1. `planning.data.gov.uk` (national Planning Data Platform, MHCLG) —
   **unconfirmed** whether it covers application-level records at all
   (`planningDataGovUk.ts`). Background knowledge, not verified live: this
   platform has historically been spatial/policy data (conservation areas,
   article 4 directions, listed buildings), not a live application register
   — real reason to doubt it, separate from just "couldn't check." Built as
   a **probe only** (`planning-probe.ts`'s first section) — not load-bearing
   until a live run confirms it one way or the other.
2. **What's actually built and working**: Southwark's own Idox Public
   Access register (`planning.ts`), full history, no date window — parsing
   the same `<li class="searchresult">` markup already used (structurally)
   for the weekly list, now shared via `idox.ts`.
3. Third-party mirrors (Plota, PlanWatch) — spot-check only, deliberately
   not built against (their windows are 90 days; someone else's scrape
   isn't a production dependency).

**"It opens in my browser but Node can't reach it" — root-caused and FIXED
via live testing on the user's own machine, not guessed.** Candidate causes
checked, in order: (1) An office HTTP proxy a browser auto-detects
(WPAD/PAC/OS settings) but Node's `fetch` doesn't — `netEnv.ts` detects
`HTTPS_PROXY`/`HTTP_PROXY` (and lowercase) and wires an explicit `undici`
`ProxyAgent` per request (deliberately not global — it shouldn't silently
reroute the Companies House/EPC clients too), applied automatically
whenever the env var is set. Not the cause here (`curl -v` succeeded
directly), but the detection stays — a real fix for a different office
network. (2) A first look at `curl -v`'s output suggested a
TLS-negotiation incompatibility with a Citrix NetScaler in front of the
origin — **ruled out** after testing six protocol/cipher variants live and
every one still failing, including a certificate-bypass variant that
should sidestep a pure protocol mismatch. (3) **Confirmed cause**: a
corporate TLS-inspection proxy re-signs HTTPS with an internal root CA.
Windows/curl (Schannel, backed by the Windows certificate store) trusts
that root because IT installs it there; Node bundles its own OpenSSL-based
CA store and does not, so the handshake fails certificate verification for
every inspected host — consistent with `planning.data.gov.uk` working
(likely on the inspection bypass list) while `planning.southwark.gov.uk`
didn't.

**Confirmed fix**: running node with **`--use-system-ca`** (Node 22.9+)
makes Node trust the OS certificate store too, the same way curl does —
proven live: `planning-probe.ts` went from a connection-level failure to
`default (Node/undici untouched) — CONNECTED, HTTP 200` once the flag was
added. It's now baked into every run command in this README (see the top
of this file) — it's harmless to always include, even off a network that
needs it, since it only *adds* trust rather than removing any of Node's
bundled roots. It's a boot-time flag, so it can't be applied to an
already-running process; `hasUseSystemCaFlag()` (`netEnv.ts`) only reports
whether the CURRENT process has it, and `planning-probe.ts` warns early if
it's missing rather than failing opaquely mid-request.

(Two protocol/cipher-based workarounds and a per-request corporate-CA-cert
option were built and tested along the way, before this simpler,
confirmed fix was found — removed once `--use-system-ca` proved sufficient,
to keep this codebase's actual complexity matched to the actual cause.)

**A second, separate live finding once the connection itself was fixed**:
with `--use-system-ca` connecting, search requests still came back HTTP
500 — and curl reproduced the identical 500, confirming it's the request
shape, not Node. A cold GET straight to a results endpoint
(`simpleSearchResults.do?action=firstPage&searchCriteria...=...`) 500s
even though the response sets a fresh `JSESSIONID`. This is Idox's classic
pattern: the results endpoint needs a session **and** a POST, not a
stateless GET. `checkPlanningForAddress` (`planning.ts`) now does, per
search variant: (1) GET the search FORM page (`search.do?action=simple` /
`action=advanced`) — its `Set-Cookie` response is the session; (2) parse
the real `<form>` out of that HTML (`idox.ts`'s `parseIdoxForm` — action
URL, method, and every field including hidden session/CSRF tokens, read
from the live markup rather than guessed); (3) POST the query with that
session's cookie attached, using the form's own fields and only
overriding the one this search cares about. `?action=firstPage` is kept on
the submit URL — real evidence from the previously-working (now 500ing
without a session) direct GET, not a fresh guess. If a variant's assumed
field name isn't actually on the real form, or a request comes back
non-2xx, the error names exactly that — the real field names found, or the
response body (`snippet()`, capped) — since Idox's error pages tend to
name the exact problem; this is proven in `planning.test.ts` with mocked
forms and a mocked 500. A per-variant failure is surfaced in
`PlanningCheckResult.error` even when a DIFFERENT variant succeeds, so a
real problem with one entry point is never silently absorbed into an
overall "it worked."

`planning-probe.ts` reports proxy detection, whether `--use-system-ca` was
passed to the current process, a direct connectivity check against the
real host, then runs the real `checkPlanningForAddress` against both known
addresses. This sandbox's own network policy blocks the host outright
regardless of any flag, so a run here only proves the code doesn't crash
and fails gracefully with a descriptive error — it cannot confirm
connectivity, the form-page markup, or the field names against the real
site. That confirmation can only come from running `planning-probe.ts` on
the actual office machine that reproduced both issues.

**CRITICAL — full history, never a rolling window.** A manual check nearly
reached a wrong verdict on a default 90-day view; the real Southwark Bridge
Road application is 17 months after the SPV that formed it. `planning.ts`'s
search variants carry NO date-bound parameter anywhere in the flow
(omission requests full history; guessing a specific override param name
that the server silently ignores would be false confidence, not a fix).
Confirmed live at this stage: preserving the search form's own fields
verbatim (needed to carry a hidden session/CSRF token through the POST)
could ALSO silently replay a default recency window if Idox pre-fills one
as a hidden/defaulted field — the brief's original 90-day trap again,
through a different door. `runSearchVariant` now strips any field whose
name looks date-range-shaped before submitting, rather than trusting it's
already blank — proven in `planning.test.ts` with a form fixture carrying
a pre-filled `searchCriteria.dateReceivedFrom`. `checkPlanningForAddress`
goes further still: it unions results across **every** search variant
instead of stopping at the first that returns a page, and reports the
returned date **span** — proven with a mocked fetch where one variant
returns nothing and the other has the real, 3-year-old record; the union
still finds it.

**Two more live findings, once real applications started coming back**
(2 for Southwark Bridge Road, with real proposal text — the flow above is
confirmed working end to end) — neither guessed, both fixed against a
mocked reproduction of the actual gap:
- **Every result showed `(no ref)`/`(no date)`.** `idox.ts`'s row parser
  only ever searched the anchor text and the address line for a reference,
  and only three date-label wordings — too narrow for the real markup,
  where a reference can sit in a separate metaInfo line or only in the
  anchor's `title` tooltip. `parseIdoxResultList` now searches the WHOLE
  row's text (plus the title attribute) for a reference, `DATE_LABELS` was
  broadened (word-order variants like "Received Date:"), and a last-resort
  fallback takes the one obvious UK-date-shaped token on the row when no
  known label matches — a real date that was on the page, not a fabricated
  one, still never a placeholder or today's date.
- **Southwark Bridge Road returned signage/façade applications but not the
  co-living scheme; the pub returned zero.** Root cause in
  `addressMatch.ts`'s `tokenOverlap`: it divided shared tokens by
  `max(query, candidate)` instead of the query's own token count, which
  penalised a real row for carrying MORE text than a minimal query address
  (a site/business-name prefix like "The Ship, 68 Borough Road" against a
  bare "68 Borough Road" query — exactly what this codebase's own callers
  pass, no postcode included). Fixed to divide by the query's length: does
  the query's address show up in the candidate, not "how symmetric are
  these two strings." `planning.ts`'s `matchPlanningRows` also gained a
  second, deliberately loose pass (`mentionsTargetStreet`): a row counts as
  a match if its address OR description plainly contains the target's
  street token(s) and building number as substrings, even when
  `matchAddress`'s structured score doesn't clear threshold — covering a
  cross-boundary "Observations to Other Authorities" entry that may be
  indexed under an address field that doesn't read as a site address at
  all, while the real street is plainly named in the description. Both
  fixes proven in `planning.test.ts`/`crossReference.test.ts` — including a
  case proving loosening still correctly excludes a genuinely unrelated
  street, not "matches everything." With these fixed, the discriminator
  confirmed live: Southwark's own register returns the real co-living
  scheme under ref **26/AP/1201** — "change of use ... for co-living use,
  395 co-living units" — classified `changeOfUse`; the pub returns 9
  records, all routine (advertising panels, a beer-garden fence, signage),
  zero reaching `changeOfUse` or stronger.

**Verification is by OUTCOME, not by matching one exact reference
string — a real finding, not a design choice made in advance.** An earlier
round's manually-confirmed answer for Southwark Bridge Road was
`26/00849/OBS`, sourced from a third-party mirror (Plota) — which turned
out to be that mirror's own label for a cross-boundary "Observations"
entry, not Southwark's native reference. The SAME real scheme surfaces
under Southwark's own register as `26/AP/1201`. Requiring an exact string
match would have reported a correctly-working discriminator as a FAIL,
just because two different sources label the identical development
differently. `planningCheck.ts`/`planning-probe.ts` now verify by the
classification the strongest match reaches, showing a known reference
example for transparency (and a bonus confirmation line when it does line
up) rather than requiring it:
- 68 Borough Road (The Ship): 9 real records, ALL routine — advertising
  panels, a beer-garden fence, signage, tree works (ref **23/AP/3411**
  among them) — zero reaching `changeOfUse` or stronger. Must NOT register
  as a development signal.
- 38–48 Southwark Bridge Road: Southwark's own native reference
  **26/AP/1201**, 10 June 2026, "Change of use ... for co-living use, 395
  co-living units". Must classify as `changeOfUse` and light the planning
  cell.

Both outcomes are real, given, and reproduced in `planning.test.ts` — the
same proof pattern as the 489-day cross-check: a known answer the code must
independently arrive at, not a synthetic example. (The related
cross-boundary consultation to Tower Hamlets, `PA/26/00989/NC`, is noted but
out of scope for this increment — a future neighbouring-authority signal path.)

**Never fabricated**: `planningSignalForBuilding` refuses to emit a signal
when no date can be parsed from the result row — proven in `planning.test.ts`.
An `observedAt` on a `planningApplication` signal is always a real, parsed
date or the signal doesn't exist.

**Wired into Part 1**: each candidate gets a per-address planning check
(failure-isolated — one candidate's planning-search failure never kills the
rest), attached to the **building** node (planning is filed against the
site, not the company — the one signal source in this codebase that isn't
company-scoped). A matched planning application also raises the tentative
`owns` edge confidence from 0.5 to 0.9, since it corroborates the
registered office as a real site — directly addressing the standing rule
("match the real site, not a registered office"). Ranking was also fixed
while wiring this in: candidates now sort by conclusion **strength** within
their sector tier, not just sector — previously two same-sector candidates
had no strength-based ordering at all, which undercut the whole point.

**Three live failures in sequence, running planning for ~20 candidates —
each fix genuinely fixed its own problem and each surfaced the next one
underneath, until the actual fix turned out to be architectural, not
another patch:**

1. **Firing ~20 planning checks back-to-back tripped Southwark's rate
   limit** — HTTP 429 from roughly the 7th candidate onward, which the
   code treated the same as any other failure ("inconclusive", move on).
   Wrong specifically for this signal: planning is the decisive
   discriminator, so silently under-checking most of a sweep
   undiscriminates the WHOLE ranking. Two fixes: pacing planning checks
   3–5s apart (now in `sweepEnrich.ts`, see below) as the primary fix, plus
   `fetchPlanningPage` (`planning.ts`) retrying a 429 with backoff
   (honouring `Retry-After` when sent, else exponential backoff capped at
   `rateLimitConfig.maxDelayMs`) as the safety net for whatever still slips
   through. A *persistent* 429 (past `rateLimitConfig.maxRetries`) still
   surfaces as a real, explained failure naming the cause explicitly —
   never silently "confirmed empty." Proven in `planning.test.ts` with a
   429-then-succeeds case and a persistent-429 case, retry delays collapsed
   to near-zero so the tests stay fast.
2. **Once that pacing landed (zero 429s), every candidate then failed with
   "page did not look like a real results page"** — while the IDENTICAL
   `checkPlanningForAddress` path kept working for a single address
   (`planningCheck.ts`). Root cause: `fetchPlanningPage` used Node's
   shared/global connection pool, so a kept-alive socket to
   `planning.southwark.gov.uk` could get reused across candidates.
   Southwark's NetScaler can pin session state to a specific backend by
   connection stickiness, independent of the `Cookie` header sent
   correctly on every request — one candidate's check could land on a
   connection whose backend still thought a DIFFERENT candidate's session
   was live. Fix: `checkPlanningForAddress` creates a brand-new, single-use
   `undici` dispatcher (`createSessionDispatcher`) for EVERY call, used for
   every request that one address's check makes, then closed when the call
   finishes — no socket can ever cross between candidates. The "not a real
   results page" error also now captures a body snippet (the same
   discipline as the 500/429 cases), so a genuine login/session page and
   some other non-results response are distinguishable from the error text
   alone next time.
3. **That isolation fix immediately broke the TLS fix**: every request
   started failing "fetch failed" again, despite `--use-system-ca` being
   set. A fresh, explicitly-constructed `undici` `Agent` doesn't reliably
   inherit `--use-system-ca`'s effect the way the process's own default
   dispatcher does — the two fixes were fighting each other. Rather than
   patch around that interaction again, `createSessionDispatcher` now
   builds its own trust store explicitly, via `node:tls`'s
   `getCACertificates('system')` (Node 22.9+, the same release that shipped
   `--use-system-ca`) combined with the bundled Mozilla list. This reads
   the OS trust store directly and works whether or not `--use-system-ca`
   was passed (confirmed: identical cert count either way) — so each
   per-call dispatcher is self-sufficient for both isolation and TLS trust,
   and the two concerns can't fight again.

All three proven in `planning.test.ts`: the dispatcher-identity test
(capturing the actual object passed to `fetch()` across two separate calls
and asserting they're never the same instance) and a `systemTrustedCaCerts`
test (returns a non-empty list of real-looking PEM certs).

**Given three live failures from one "run 20 in a loop" design, the actual
fix was architectural: split Part 1 into two separate stages** rather than
patch the same loop a fourth time.
- `sweepDiscover.ts` — Companies House discovery (SIC × Southwark × recent
  incorporation) and full per-candidate enrichment (PSC/charges/officers/
  filings). This API has shown neither a rate-limit nor a session-isolation
  issue, so it still runs as a straightforward burst. Writes every
  candidate to a JSON file (`sweep-candidates.json` by default).
- `sweepEnrich.ts` — reads that file and, for each candidate without a
  `planning` result yet, calls `checkPlanningForAddress` — the exact same
  proven, isolated path `planningCheck.ts` already uses for one address —
  paced 3–5s apart, and **rewrites the file after every candidate**. Kill
  it at any point and re-run the same command: records that already have a
  `planning` field are never touched again, so it resumes exactly where it
  left off instead of re-risking a rate limit on work already done. The
  resumable core (`runEnrichmentPass`) is factored out and proven offline
  in `sweepEnrich.test.ts` with a fake planning check — no network needed
  to trust the resume/skip/one-failure-never-stops-the-rest behaviour.
  Once every candidate has a result, it builds the same ranked report
  `sweep.ts` used to print inline.
- `sweep.ts` keeps only the shared, tested logic both stages import
  (`buildCandidateGraph`, `mergeGraphs`, `rankCandidates`, `enrichCandidate`,
  `candidateAddress`) — running it directly now just prints where the two
  real stages live.

**Dedupe: two different companies can share one registered office** (a
formation agent, an accountant's address — confirmed live: 68 Borough Road
and the M7 Blue Fin building each printed twice). `mergeGraphs`/
`detectClusters` already collapse them into ONE cluster at the graph level
(same address → same `buildingNodeId` → same node ids), but `rankCandidates`
used to still emit one output row per *originating candidate* rather than
per building, so the identical address printed once per company registered
there. Fixed to dedupe by `buildingNodeId`, keeping whichever candidate
ranks best for that building — proven in `sweep.test.ts` with two
synthetic companies sharing "68 Borough Road" reducing to exactly one
ranked row, alongside a genuinely different address staying present (dedup
is per-building, not over-aggressive).

## Part 1 — the wider sweep, and its own honest gaps

Part 1 (`sweepDiscover.ts` + `sweepEnrich.ts`, sharing logic from `sweep.ts`
— see above for why it's two stages, not one) extends Task 0 from one
hand-fed building to structured discovery: SIC codes × Southwark ×
rolling-12-month incorporation, each hit fully enriched and built as a
`../graph-model` cluster with a traffic-light conclusion. Standing rule,
enforced in code, not just documented: it never calls `searchCompanies()`
(free-text search) — only the structured `advancedSearch()` filters. See
`sweepDiscover.ts`'s own file header for the distinction between that and
the "HUB Accountants" keyword-guessing failure Task 0 already outlawed —
this isn't a loophole around the same rule.

What's a genuine heuristic here, clearly labelled as such (never asserted as
filed fact): a candidate's **sector** tag comes from its company name (SIC
codes are too coarse to say office vs. student vs. co-living), and its
tentative **building** address is its registered office — not a confirmed
site address until a planning application corroborates it (reflected as a
0.5-confidence `owns` edge, weaker than the seed's own 0.9).

## Out of scope (per brief)

CRM/manual-entry UI (cut — only the confirmation ledger later), and
scheduling/CI/deploy (a separate piece once the spike lands). The
developer/PM entity graph itself is now built — see `../graph-model` — but
wiring it to internal/CRM contact matching stays out of scope, per the
brief: surface public names only, so a human judges "do we know them?";
that matching is a later phase with its own compliance question.
Pre-application data is now attempted (`planning.ts` classifies a
`preApplication` type and flags it as the highest-value signal), but is
honestly expected to almost always come back empty — most councils,
Southwark included, keep pre-app records confidential, so its absence here
is normal, not a bug. EPC/Gazette/other new sources stay out per the
brief's own rule: prove one increment before adding the next.
