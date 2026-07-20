/*
  Runnable validation harness for the convergence logic.
  Run:  node --experimental-strip-types signal-model/validate.ts
  (Node 22.18+ strips types natively; the flag is a no-op there but harmless.)

  Inputs are deliberately SYNTHETIC (BLD-TEST-*) — this file proves the maths,
  it is not a store of real intelligence. The real validation target
  (Southwark Bridge Road) lives in ./targets.ts with cited sources.
*/

import { computeConvergence, deriveGridCells } from './convergence.ts'
import type { Opportunity, Signal } from './types.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

function sig(partial: Partial<Signal> & Pick<Signal, 'layer' | 'factType' | 'confidence' | 'observedAt'>): Signal {
  return {
    id: partial.id ?? `sig-${Math.random().toString(36).slice(2, 8)}`,
    buildingId: partial.buildingId ?? 'BLD-TEST',
    label: partial.label ?? `${partial.layer} signal`,
    value: partial.value ?? '',
    sourceUrl: partial.sourceUrl ?? 'https://example.test/record',
    retrievedAt: partial.retrievedAt ?? '2026-07-08',
    ...partial,
  }
}

const ASOF = '2026-07-08'

console.log('convergence rules')

// 1. Pressure alone is not a lead — the "too simplistic" failure mode.
{
  const c = computeConvergence([sig({ layer: 'epc', factType: 'filed', confidence: 1, observedAt: '2021-05-01' })], ASOF)
  assert('pressure-only (bad EPC) is NOT converged', c.isConverged === false, c)
  assert('pressure-only counts 1 pressure layer', c.pressureLayers === 1)
  assert('pressure-only counts 0 kinetic layers', c.kineticLayers === 0)
  assert('pressure-only has no lead time', c.leadTimeDays === undefined)
}

// 2. Kinetic alone is interesting but untargeted — also not converged.
{
  const c = computeConvergence([sig({ layer: 'companiesHouseSpv', factType: 'inferred', confidence: 0.4, observedAt: '2026-04-01' })], ASOF)
  assert('kinetic-only (new SPV) is NOT converged', c.isConverged === false, c)
  assert('kinetic-only counts 1 kinetic layer', c.kineticLayers === 1)
}

// 3. Pressure + kinetic together — the actual thesis.
{
  const c = computeConvergence(
    [
      sig({ layer: 'epc', factType: 'filed', confidence: 1, observedAt: '2021-05-01' }),
      sig({ layer: 'buildingControlDemolition', factType: 'filed', confidence: 1, observedAt: '2026-03-15' }),
    ],
    ASOF,
  )
  assert('pressure + kinetic IS converged', c.isConverged === true, c)
  assert('lead time = days from earliest kinetic to asOf', c.leadTimeDays === 115, c.leadTimeDays)
}

// 4. minConfidence surfaces the weakest contributor, never an average.
{
  const c = computeConvergence(
    [
      sig({ layer: 'epc', factType: 'filed', confidence: 1, observedAt: '2021-05-01' }),
      sig({ layer: 'landRegistryTitle', factType: 'filed', confidence: 1, observedAt: '2019-01-01' }),
      sig({ layer: 'companiesHouseSpv', factType: 'inferred', confidence: 0.4, observedAt: '2026-04-01' }),
    ],
    ASOF,
  )
  assert('minConfidence = weakest contributor (0.4), not the average', c.minConfidence === 0.4, c.minConfidence)
}

// 5. Context (press) never flips convergence — it's already public.
{
  const c = computeConvergence(
    [
      sig({ layer: 'epc', factType: 'filed', confidence: 1, observedAt: '2021-05-01' }),
      sig({ layer: 'pressReport', factType: 'filed', confidence: 1, observedAt: '2026-06-01' }),
    ],
    ASOF,
  )
  assert('pressure + press(context) is NOT converged', c.isConverged === false, c)
  assert('press does not create a kinetic layer', c.kineticLayers === 0)
  assert('press does not set lead time', c.leadTimeDays === undefined)
}

// 6. Earliest kinetic wins the lead-time calc when several are present.
{
  const c = computeConvergence(
    [
      sig({ layer: 'epc', factType: 'filed', confidence: 1, observedAt: '2020-01-01' }),
      sig({ layer: 'companiesHouseCharge', factType: 'filed', confidence: 1, observedAt: '2026-03-01' }),
      sig({ layer: 'planningApplication', factType: 'filed', confidence: 1, observedAt: '2026-05-01' }),
    ],
    ASOF,
  )
  assert('two distinct kinetic layers counted', c.kineticLayers === 2, c.kineticLayers)
  assert('lead time uses earliest kinetic (1 Mar → 129d)', c.leadTimeDays === 129, c.leadTimeDays)
}

console.log('\ngrid cells')

// 7. Grid carries provenance per layer; empty layers stay empty; strongest fact wins.
{
  const opp: Opportunity = {
    id: 'BLD-TEST-GRID',
    address: '1 Test Street',
    postcode: 'SE1 0AA',
    borough: 'Southwark',
    status: 'new',
    signals: [
      sig({ id: 's-epc', layer: 'epc', factType: 'filed', confidence: 1, observedAt: '2021-05-01', label: 'EPC rating: E' }),
      sig({ id: 's-spv-weak', layer: 'companiesHouseSpv', factType: 'inferred', confidence: 0.4, observedAt: '2026-04-01', label: 'SPV name match' }),
      sig({ id: 's-spv-strong', layer: 'companiesHouseSpv', factType: 'filed', confidence: 1, observedAt: '2026-04-02', label: 'Incorporation filed' }),
    ],
  }
  const cells = deriveGridCells(opp)
  const byLayer = Object.fromEntries(cells.map((c) => [c.layer, c]))
  assert('9 cells, one per layer', cells.length === 9, cells.length)
  assert('epc cell is filed', byLayer.epc.state === 'filed')
  assert('empty layer (voa) renders empty', byLayer.voa.state === 'empty')
  assert('empty cell has no signalId', byLayer.voa.signalId === undefined)
  assert('strongest fact wins for a layer (filed over inferred)', byLayer.companiesHouseSpv.state === 'filed', byLayer.companiesHouseSpv)
  assert('winning cell links its signal', byLayer.companiesHouseSpv.signalId === 's-spv-strong')
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
