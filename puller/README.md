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
node --use-system-ca --env-file=.env --experimental-strip-types puller/sweep.ts          # Part 1 — the wider Southwark sweep, as a graph
node --use-system-ca --env-file=.env --experimental-strip-types puller/run.ts            # the whole spike, Tasks 1→5
```

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
| `sweep.ts` | Part 1 — structured Southwark discovery (SIC × location × date), full enrichment (PSC/charges/officers/filings) per hit, built as a `../graph-model` cluster | `sweep.test.ts` ✓ |
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

Every CLI file (`task0.ts`, `task1.ts`, `run.ts`, `sweep.ts`, `epc-probe.ts`)
guards its `main()` behind `process.argv[1] === fileURLToPath(import.meta.url)`
— importing one for its pure, tested functions (as `task1.test.ts` and
`sweep.test.ts` do) must never also fire a live network call as a side effect.

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
`checkPlanningForAddress` goes further: it unions results across **every**
search variant instead of stopping at the first that returns a page, and
reports the returned date **span** — proven in `planning.test.ts` with a
mocked fetch where one variant returns nothing and the other has the real,
3-year-old record; the union still finds it.

**Verification, per the brief — reproducing exact manually-confirmed
answers, not just "found something plausible"**: `planningCheck.ts` runs
both known cases and checks for the EXACT reference:
- 68 Borough Road (The Ship): ref **23/AP/3411**, 8 Dec 2023, "Works to a
  Tree in a Conservation Area" — its only planning record ever. Must
  classify as `treeWorks`, ranked with advertisement consent, NOT development.
- 38–48 Southwark Bridge Road: ref **26/00849/OBS**, 10 June 2026, "Partial
  demolition, extension and change of use of existing building for
  co-living use". Must classify as `changeOfUse` and light the planning cell.

Both references are real, given, and reproduced exactly in `planning.test.ts`
— the same proof pattern as the 489-day cross-check: a known answer the code
must independently arrive at, not a synthetic example. (The related
cross-boundary consultation to Tower Hamlets, `PA/26/00989/NC`, is noted but
out of scope for this increment — a future neighbouring-authority signal path.)

**Never fabricated**: `planningSignalForBuilding` refuses to emit a signal
when no date can be parsed from the result row — proven in `planning.test.ts`.
An `observedAt` on a `planningApplication` signal is always a real, parsed
date or the signal doesn't exist.

**Wired into `sweep.ts`**: each candidate now gets a per-address planning
check (failure-isolated — one candidate's planning-search failure never
kills the sweep), attached to the **building** node (planning is filed
against the site, not the company — the one signal source in this codebase
that isn't company-scoped). A matched planning application also raises the
tentative `owns` edge confidence from 0.5 to 0.9, since it corroborates the
registered office as a real site — directly addressing the standing rule
("match the real site, not a registered office"). Ranking was also fixed
while wiring this in: candidates now sort by conclusion **strength** within
their sector tier, not just sector — previously two same-sector candidates
had no strength-based ordering at all, which undercut the whole point.

## Part 1 — the wider sweep, and its own honest gaps

`sweep.ts` extends Task 0 from one hand-fed building to structured discovery:
SIC codes × Southwark × rolling-12-month incorporation, each hit fully
enriched and built as a `../graph-model` cluster with a traffic-light
conclusion. Standing rule, enforced in code, not just documented: it never
calls `searchCompanies()` (free-text search) — only the structured
`advancedSearch()` filters. See `sweep.ts`'s own file header for the
distinction between that and the "HUB Accountants" keyword-guessing failure
Task 0 already outlawed — this isn't a loophole around the same rule.

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
