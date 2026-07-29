# Opportunities Hub

AI-assisted opportunity intelligence for an architecture practice. The system
gathers market noise (planning data, RFPs, awards, articles, prospectuses,
imports), classifies it, and lets a human reviewer decide which items become
real, scored opportunities.

**The core distinction the whole UI enforces:**
a **raw signal** is unreviewed market information; an **opportunity** is a
reviewed, qualified lead. Nothing reaches the pipeline without a human
decision.

```
raw signal → AI triage → human review → converted opportunity → weekly digest
```

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

Next.js (App Router) · React 19 · TypeScript · Tailwind CSS 4. No API keys,
no auth, no live integrations — the MVP runs on seeded sample data
(20 fictional signals, 12 fictional opportunities across London, Birmingham,
Manchester and Bristol).

## What works now

- **Dashboard** — counts, signal→opportunity funnel strip, sector/city/source
  splits, top 5 by score, opportunities needing action, activity log.
- **Raw signals inbox** — filterable table; click a row for the review panel
  (raw summary, mocked AI triage block, source link) and decide:
  **convert / watch / flag / ignore**. Decisions update the store live.
- **Convert** creates a draft lead card with neutral placeholder scores —
  scoring happens on the opportunity, not the signal.
- **Opportunities pipeline** — searchable, filterable by city, sector,
  sub-sector, source, status, score band, confidence and owner.
- **Opportunity detail** — seven-criterion score block (total /35) with
  confidence shown separately, then the six-question decision trail:
  signal → why it matters → architectural opportunity → relevance →
  commercial reason to care → next action.
- **Weekly digest** — leadership briefing with a *Copy as text* export.
- **Data intake** — working pasted-URL and manual-note routes (they create
  inbox rows); CSV upload and the five automated feeds are labelled
  placeholders.
- **Settings / scoring** — the full model on one page: criteria, bands,
  confidence scale, sectors, sub-sectors, cities, source types, statuses.

## Scoring model

Seven criteria at 1–5 (sector fit, geography fit, stage timing, architectural
problem, fee potential, relationship route, urgency) → total out of 35.
Bands: **0–15** low relevance · **16–24** watch · **25–30** research further ·
**31+** priority. Confidence (1 weak → 5 source-backed) is displayed beside
every score and never adds to it.

## Where the integrations land later

- `src/lib/types.ts` is the schema — `RawSignal` and `Opportunity` map
  one-to-one onto the intended Supabase tables; enums become lookup tables.
- `src/lib/store.tsx` is the seam: `reviewSignal`, `convertSignal` and
  `addSignal` become server actions writing to Supabase.
- `src/lib/data.ts` seed rows become the initial migration fixtures.
- AI triage is mocked (`aiStatus`, `aiNote`, sector/sub-sector guesses,
  confidence); a real classifier fills the same fields, and the UI already
  labels them as machine output to verify against the source.
- Each intake feed writes rows into the same inbox + triage pipeline — no
  per-source workflows.
