# Graph Matrix Engine — the link graph ("the brain")

Builds on `../signal-model` (provenance/convergence) and the proven Task 0
chain. Stops treating buildings as flat cards; models public entities
(buildings, companies, people, lenders, developers) as a graph, connected by
**cited** edges. The intelligence is in the edges, not the nodes.

Read alongside `../signal-model/README.md`. This is the substance/logic half
of the showcase build — a separate brief covers the visual redesign.

## Files

| File | What it is |
|------|-----------|
| `types.ts` | `GraphNode`, `GraphEdge`, `Graph`, `Cluster`, `Conclusion`, `SignalStrength`, `PublicContact`. |
| `cluster.ts` | `detectClusters` — connected-component detection anchored at building nodes. No hand-written per-pattern rules; connectivity through cited edges is the only detector. |
| `conclusion.ts` | The traffic-light scoring + prose engine: `scoreCluster`, `strengthFromScore`, `extractPublicContacts`, `buildConclusion`. |
| `seed.ts` | The real 38–48 Southwark Bridge Road cluster, built FROM `../signal-model/seed.ts` (single source of truth — no re-typed dates/URLs). |
| `validate.ts` | 39 assertions: synthetic mechanism proofs + the real seed cluster, including a cross-check that the independently-computed lead time (489 days) matches the already-proven Task 0 number exactly, and that a planning-application signal is an INDEPENDENT second path to green (not just EPC). |
| `render.ts` | Minimal plain-text render (`node --experimental-strip-types graph-model/render.ts`). No visual design here — that's a separate pass. |

## Run the checks

```bash
node --experimental-strip-types graph-model/validate.ts   # 39 assertions, all pass
node --experimental-strip-types graph-model/render.ts     # see the real cluster's conclusion
```

## The scoring rule

Traffic light, not binary converged/not. `distinctLayers` counts only
**scorable** signal layers — `kinetic` + `pressure` per `../signal-model`'s own
`LAYER_CATEGORY` — attached to any node in the cluster. `context` layers
(the planning applicant anchor, a press report) corroborate but never move
the needle, same exclusion `../signal-model/convergence.ts` already applies.

- `distinctLayers >= 4` → green (base)
- `distinctLayers 2–3` → amber (base)
- `distinctLayers <= 1` → red
- Nothing **recent** (within ~6 months of `asOf`) → downgrade one notch, even off a high layer count.
- `minConfidence < 0.6` → cap at amber. A weak link never buys a green.

**`asOf` is not the press/disclosure date.** It's "how fresh is this to
someone using the tool right now." Scoring recency against a later press
date would call fresh, pre-disclosure signals "stale" once they're public —
exactly backwards for a tool whose value is catching things early. See
`conclusion.ts`'s file header and `seed.ts`'s `SBR_ANALYSIS_ASOF` for the
worked example (analysis date ≠ press date ≠ lead-time calculation date —
all three are distinct and none may be silently substituted for another).

## What the confirmed seed proves

38–48 Southwark Bridge Road, built as a graph: SPV (OC455308) ← controls ←
Hub Living Developments Limited (ceased) / Bridges Property Alternatives
Fund VI GP LLP (active); SPV → owns → building; HUB → operates → building.
3 distinct scorable layers (SPV + PSC + charge) → **amber**, exactly the
brief's own worked example. **Two independent paths to green**, both proven
with a synthetic addition in `validate.ts` (neither asserted against data we
don't actually have yet): the still-pending EPC pressure signal (Task 1), or
the still-pending planning-application signal (`../puller/planningCheck.ts`
— the 2026 co-living resubmission). Either alone is a 4th distinct kinetic/
pressure layer. This is also the exact mechanism that discriminates a real
scheme from ordinary commerce: see `../puller/planning.ts`'s file header for
why the wider sweep needed this — a pub (The Ship, 68 Borough Road) produces
the identical SPV+charge+PSC shape and caps at amber with no planning signal
to push it further.

4 public contacts surface (all entity-level: the SPV, both PSC controllers,
the operator). **No individual director names yet** — that needs
`companyHouse.ts`'s `officers()` pulled for this specific company, which
Task 0 never ran. Part 1 (the wider sweep, see `../puller/sweep.ts`) does
pull officers for its own candidates, but hasn't been backfilled onto this
already-confirmed building — a clearly labelled gap, not a silent one.

## What isn't asserted (honesty over completeness)

- **No `chargeHolder` edge** on the seed: the mortgage signal doesn't name a
  lender (Companies House's charges *list* endpoint gives dates/status, not
  always the chargee's name). The charge still counts as a node-level signal
  toward scoring — it just isn't drawn as a lender edge without a name to cite.
- **No `priorOwner` edge** for UBS Asset Management: named only in
  `../signal-model/targets.ts`'s `knownEvents`, itself flagged there as
  unconfirmed. Not yet a filed Signal, so not yet a graph edge.
- **No identity merge** between "HUB (operator, per planning application)"
  and "Hub Living Developments Limited" (per the PSC register) — plausibly
  the same organisation, but that specific identity match isn't itself
  confirmed by a filed source, so they're kept as two separate nodes with no
  edge asserting they're one. Let a human eyeball it — that's the brief's
  own design principle for public contacts.

## Part 1 — the wider sweep

`../puller/sweep.ts` extends the proven Task 0 path from one hand-fed
building to a structured discovery sweep: real-estate SIC codes × Southwark
postcodes × rolling-12-month incorporation, each hit fully enriched (PSC,
charges, filing history, officers) and run through this same cluster/
conclusion engine. See its own file header for what's genuinely discovery
(structured filtering — not the keyword-guessing failure mode Task 0 already
outlawed) versus what's an explicitly-flagged heuristic (sector tagging from
company name; a registered office address standing in for a site address
until a planning application confirms it).
