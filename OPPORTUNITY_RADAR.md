# Opportunity Radar — dashboard concept

An architectural opportunity intelligence tool for a senior London practice:
it converts market signals — planning applications, amendments, refusals,
stalled schemes, RFPs, awards, regeneration prospectuses, market and manual
research — into actionable opportunity cards, scored and ranked for
work-winning decisions.

**Pilot scope:** London · office retrofit/repositioning and PBSA/living.
The data model treats sectors as an open list so further sectors slot in
without redesign.

A working prototype ships in this branch (`src/radar/`, React + TypeScript +
Vite; `npm install && npm run dev`). Twelve fictional but realistic sample
opportunities populate every screen.

---

## 1. Main dashboard layout

Left rail navigation (Dashboard / Opportunities / Weekly digest / Location
view, then a separate **Signal sources** group for Pre-RFP signals and the
RFP monitor — the grouping itself communicates that RFPs are one source
among nine, not the system).

The dashboard answers "what needs attention this week" in one pass, top to
bottom:

1. **Four stat tiles** — total opportunities, new this week, priority
   (27–30), needing review. The two attention tiles carry a heavier left
   rule; no traffic-light colour.
2. **Left column (wide):** Top 5 ranked opportunities (name, sector, score,
   band, next action — each row opens the detail card) → recommended next
   actions (numbered, drawn from the highest-ranked leads plus overdue
   reviews) → recent activity log.
3. **Right column (narrow):** sector split, borough split, source split,
   status summary — thin horizontal bar rows, every bar direct-labelled with
   its count.

## 2. Opportunity list layout

One filter row above the table (never per-column widgets): search, sector,
borough, source type, stage, status, score band, owner, with a clear-all
link and a live result count. The table shows project/site, sector chip,
borough, client/applicant, source, stage, **score + band chip**,
**confidence meter (separate)**, status, and next action (with owner and
date-added as a sub-line). Rows sort by score and click through to the
detail card.

## 3. Opportunity detail card layout

Designed to be read by a principal in under a minute, in this order:

- **Header** — reference, name, address, chips (sector, status, band,
  source, stage).
- **Score block** — the six criteria as 1–5 cell rows beside the total
  (`27 of 30 — Priority`), with **confidence shown separately below a rule**,
  explicitly labelled "scored separately" so it can never read as part of
  the score.
- **The decision trail** — five numbered entries answering the five
  questions every lead must answer: 01 The signal · 02 Why it matters ·
  03 Architectural problem · 04 Relevance to practice · 05 Next action
  (bolded — it is the point of the card).
- **AI-assisted brief** — bordered block, headed "Drafted from the source
  below — verify before acting": executive summary, classification, likely
  issue, commercial relevance, recommended action, confidence note, and a
  **false-positive risk** line set in stronger ink so the caveat cannot be
  skimmed past. The AI never introduces facts; everything traces to the
  source link in the meta grid.
- **Meta grid** — client, borough, source link, planning/tender reference,
  owner, date added, last reviewed — then free notes.

## 4. Weekly digest layout

A single narrow column that reads as a briefing document, not a dashboard:
top 5 · new this week · needing review · sector movement (short written
commentary per sector — the analyst layer over the numbers) · notable RFPs ·
notable pre-RFP signals · recommended actions. A **Copy as text** button
emits the whole digest as plain text for pasting into the internal Monday
update.

## 5. Visual hierarchy

- **Ink weight, not colour, carries priority.** Score bands are a
  solid-dark chip (Priority), outlined (Research further), muted (Watch),
  dashed (Low) — legible in greyscale and to every colour-vision type.
- **Colour is reserved for data identity**: blue = office retrofit,
  green = PBSA/living (a validated categorical pair, ΔE 73.6 under CVD
  simulation), and a single sequential blue ramp on the borough map.
  Chrome, statuses and RFP classifications stay neutral.
- Paper-toned surfaces (`#f4f4f1` page, `#fcfcfb` cards), hairline rules,
  near-black ink, one sans (Geist) throughout, uppercase tracked
  micro-labels for section titles. No gradients, no icons beyond the
  radar mark, no illustration.
- Every chart is a direct-labelled bar row or a labelled tile — values are
  always readable without hover.

## 6. Components

Stat tile · sector chip (dot + label) · status chip (neutral) · score-band
chip (ink-weight scale) · score pill (`27/30`) · six-criteria cell rows ·
confidence meter (thin track + %) · bar row (label / thin bar / count) ·
numbered action list · activity line list · filter row · detail slide-over ·
signal card · classification chip · schematic borough tile grid (London
Squared-style SVG, labelled "not to geography") · callout rule.

## 7. Sample data

Twelve opportunities — six per sector — covering planning signal, amendment,
refusal, stalled scheme, asset repositioning, office-to-living, PBSA
feasibility, regeneration prospectus, RFP, framework, award, market,
internal-relationship and manual-research signals. Each carries the full
field set, a six-criterion score, a separate confidence score, and a
complete AI brief. The RFP monitor adds four watch-only rows so all six
classifications (bid now / watch buyer / framework route / competitor
intelligence / too late / not relevant) appear with usage definitions.

**Scoring note:** the brief's interpretation table tops out at "31+"
but six criteria at 1–5 cap at 30. The prototype rescales the four bands to
the real range — ≤15 low relevance · 16–22 watch · 23–26 research further ·
**27–30 priority** — keeping the intended four-tier reading.

## 8. Making it credible to senior architecture leadership

1. **Every card ends in a decision.** The five-question trail and a named
   next action with an owner mean the dashboard reads as judgement support,
   not data display.
2. **Evidence discipline.** Nothing exists without a source link and
   reference; the AI brief is visibly subordinate to the source and states
   its own false-positive risk. Understating automation buys trust that
   overclaiming destroys.
3. **Confidence never inflates score.** Separating "how good is this
   opportunity" from "how sure are we" mirrors how principals already think
   about leads, and protects the ranking from wishful research.
4. **Pre-RFP first.** The RFP monitor explicitly frames tenders as the
   late, crowded end of the funnel; the signal monitor (refusals, stalled
   schemes, repositionings) is where the practice's design expertise is the
   differentiator — that framing is the work-winning argument.
5. **A review cadence built in.** "Needing review" is a first-class metric;
   stale leads are pushed to progress-or-Dormant at the Monday meeting, so
   the radar never silts up like a CRM.
6. **The digest is the product for partners.** Most senior readers will
   meet the tool as the weekly briefing; it is designed to be copied into
   an internal update verbatim.
7. **Visual restraint as positioning.** Paper tones, hairlines and typographic
   hierarchy signal "practice research document", not "sales software" —
   the tool should look like something the practice itself would design.
