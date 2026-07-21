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
# EPC Open Data:   https://epc.opendatacommunities.org/
node --env-file=.env --experimental-strip-types puller/task0.ts   # just the lead-time validation
node --env-file=.env --experimental-strip-types puller/run.ts     # the whole spike, Tasks 1→5
```

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
| `addressMatch.ts` | 5 — fuzzy address matching | `crossReference.test.ts` ✓ |
| `crossReference.ts` | 5 — convergence join (pressure × kinetic) | `crossReference.test.ts` ✓ |
| `run.ts` | 1→5 — the whole spike, converged buildings + evidence | — (orchestration) |

```bash
node --experimental-strip-types puller/leadTime.test.ts
node --experimental-strip-types puller/crossReference.test.ts
node --experimental-strip-types puller/parsers.test.ts     # all pass, offline
```

## Needs verification against live responses

The pure parsers are tested against representative fixtures, but two sources
must be checked against their real output before the numbers are trusted:

- **EPC pagination.** `epcSearch` pulls one page; EPC uses `search-after` for
  more. Fine for the spike, widen for production.
- **Idox weekly-list HTML.** `parseWeeklyList` matches a standard Idox install;
  Southwark's markup must be confirmed. Check
  `southwark.gov.uk/download-our-planning-datasets` for bulk data first, then
  respect robots.txt and the weekly cadence.
- **VOA.** Cross-check source for the universe — confirm bulk access terms at
  voa.gov.uk before wiring it in (not built blind).

## Out of scope (per brief)

Pre-application data (needs a call to Southwark planning), the developer/PM
entity graph (phase 2, GDPR), CRM/manual-entry UI (cut — only the confirmation
ledger later), and scheduling/CI/deploy (a separate piece once the spike lands).
