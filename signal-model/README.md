# Signal data model

One model, built on **provenance and convergence** — not additive scores. It
replaces the two conflicting scoring systems:

- `src/radar/model.ts` — 6 criteria × 5 = 30 cap
- `opportunities-hub/src/lib/scoring.ts` — 7 criteria × 5 = 35 cap

Core rule: **every number on screen must trace to a specific source record.**
If a field can't cite where it came from, it doesn't go on the card.

## Files

| File | What it is |
|------|-----------|
| `types.ts` | `Signal`, `Opportunity`, `GridCell`, `ConfirmationEntry`, layer categories. No stored score field; no `aiStatus`/mocked-category field. |
| `convergence.ts` | `computeConvergence`, `deriveGridCells`. Score is computed at query/render time, so it's always explainable. |
| `validate.ts` | Runnable proof of the rules (synthetic inputs) + the confirmed seed. |
| `targets.ts` | The Southwark Bridge Road target — confirmed applicant + company number (OC455308). |
| `seed.ts` | The first REAL Opportunity (38–48 Southwark Bridge Road), from the verified Task 0 chain. Replaces the mocks, not a placeholder. |

## Layers (11)

Pressure: `epc`, `landRegistryTitle`. Kinetic: `companiesHouseSpv`,
`companiesHouseCharge`, `companiesHousePsc`, `planningApplication`,
`buildingControlDemolition`. Context: `voa`, `landRegistryOwnership`,
`planningApplicant`, `pressReport`.

`companiesHousePsc` (control changes) is kinetic — as kinetic as a charge.
`planningApplicant` is context: it's the anchor fact (how you found the
building), not itself a leading indicator.

## Run the checks

```bash
node --experimental-strip-types signal-model/validate.ts   # 20 assertions, all pass
```

## The convergence rule

`isConverged` is true only when **≥1 pressure layer AND ≥1 kinetic layer** fired:

- **Pressure** (standing condition): `epc`, `landRegistryTitle`. Bad EPC alone is *not* a lead — that's the "too simplistic" failure mode we're removing.
- **Kinetic** (a change happening): `companiesHouseSpv`, `companiesHouseCharge`, `planningApplication`, `buildingControlDemolition`. Interesting alone, but untargeted without knowing *why that building*.
- **Context** (informative, never counts toward convergence): `voa`, `landRegistryOwnership`, `pressReport`. Press is already public — it can't be the edge.

`minConfidence` surfaces the **weakest contributing signal**, never an average — a card built on four strong facts and one guess must show the guess. And there is deliberately **no single number** that collapses this back to "31/35"; sort and filter by `kineticLayers` or `isConverged` instead.

## Migration status

**Done.** `src/radar/model.ts` (additive scoring) is archived, the 12 mock
opportunities are deleted, and the app renders `seed.ts` through
`src/radar/SignalGrid.tsx` — genuinely empty cells for layers not yet pulled,
no padding. See `../puller` for why the puller can't run live in this
environment (egress). `../graph-model` builds the link-graph/conclusion layer
on top of this model.
