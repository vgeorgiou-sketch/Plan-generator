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

Run it on a machine with open egress and a free key:

```bash
# free key: https://developer.company-information.service.gov.uk/
export CH_API_KEY=your-key-here
node --experimental-strip-types puller/task0.ts
```

Without a key or egress the CLI **fails loudly and prints no number** — a
fabricated lead time is worse than no answer, and is the exact failure this
whole model exists to prevent.

## What's built (and tested here)

| File | Status |
|------|--------|
| `leadTime.ts` | Pure logic: ownership-change classification + lead-time maths. **Unit-tested** (`leadTime.test.ts`, all pass) — no network needed. |
| `companiesHouse.ts` | Real API client: search, advanced-search (Task 2), filing-history (Task 0), charges (Task 3). Key from `CH_API_KEY`, HTTP Basic. |
| `task0.ts` | Task 0 end-to-end CLI. Finds candidate SPVs → filing history → earliest ownership-change filing → lead time vs the June 2026 press baseline. |

```bash
node --experimental-strip-types puller/leadTime.test.ts   # all pass, offline
```

## Deliberately NOT built blind

Building an untested scraper against a live source I can't reach would produce
code I can't stand behind — the opposite of what this model values. These need
live iteration against real responses and should be built where egress exists:

- **Task 1 — EPC/VOA universe.** EPC Open Data needs its own key + real
  response shapes; VOA bulk access terms need confirming at voa.gov.uk first.
- **Task 4 — Southwark demolition notices.** Idox Public Access has no API;
  check `southwark.gov.uk/download-our-planning-datasets` for bulk data before
  scraping the Weekly List HTML. Respect robots.txt; weekly cadence only.

Task 2 (new SPVs) and Task 3 (charges) are wired in `companiesHouse.ts`
(`advancedSearch`, `companyCharges`) but not yet orchestrated into a scan —
that's the next step once Task 0 proves the mechanism on real data.

## Out of scope (per brief)

Pre-application data (needs a call to Southwark planning), the developer/PM
entity graph (phase 2, GDPR), CRM/manual-entry UI (cut — only the confirmation
ledger later), and scheduling/CI/deploy (a separate piece once the spike lands).
