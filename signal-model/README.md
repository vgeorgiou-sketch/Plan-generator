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
| `validate.ts` | Runnable proof of the rules (synthetic inputs). |
| `targets.ts` | The one real validation target (Southwark Bridge Road), cited facts only — no invented dates. |

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

**Not yet done — awaiting go-ahead, because it breaks the live demo (PR #1, shared artifact).** The spec's migration notes call for:

1. Delete/archive one of the two scoring systems (don't merge — incompatible assumptions).
2. Remove the mocked 12 opportunities and `aiStatus: 'Auto-classified'`; ship an empty state until a real puller lands data.

This module is added **alongside** the existing apps so nothing presentable breaks before there's real data to replace it with. See `../puller` for why the puller can't run in this environment yet.
