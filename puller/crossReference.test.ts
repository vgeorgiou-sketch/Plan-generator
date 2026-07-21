/*
  Run: node --experimental-strip-types puller/crossReference.test.ts
  Proves address matching and the convergence join, offline.
*/

import { matchAddress, parseAddress } from './addressMatch.ts'
import { assemble, convergedOnly, type KineticHit, type UniverseRecord } from './crossReference.ts'
import type { Signal } from '../signal-model/types.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

console.log('address parsing')
{
  const p = parseAddress('38–48 Southwark Bridge Road, London SE1 9BB')
  assert('extracts postcode "SE1 9BB"', p.postcode === 'SE1 9BB', p.postcode)
  assert('extracts building range "38-48"', p.buildingNumber === '38-48', p.buildingNumber)
  assert('keeps "SOUTHWARK" / "BRIDGE" as tokens', p.tokens.includes('SOUTHWARK') && p.tokens.includes('BRIDGE'), p.tokens)
}

console.log('\naddress matching')
{
  const same = matchAddress('38-48 Southwark Bridge Rd SE1 9BB', '38–48 Southwark Bridge Road, London, SE1 9BB')
  assert('same building, formatting differs → exact', same.exact === true && same.score >= 0.8, same)

  const diffPc = matchAddress('38 Southwark Bridge Road SE1 9BB', '38 Southwark Bridge Road SE1 0AA')
  assert('different postcode → hard zero', diffPc.score === 0, diffPc)

  const fuzzy = matchAddress('Southwark Bridge Road SE1 9BB', 'Bridge Road SE1 9BB')
  assert('same postcode, partial tokens → matched but not exact', fuzzy.score >= 0.7 && !fuzzy.exact, fuzzy)
}

function sig(p: Partial<Signal> & Pick<Signal, 'layer' | 'factType' | 'confidence' | 'observedAt'>): Signal {
  return {
    id: p.id ?? `s-${Math.random().toString(36).slice(2, 7)}`,
    buildingId: p.buildingId ?? '',
    label: p.label ?? p.layer,
    value: p.value ?? '',
    sourceUrl: p.sourceUrl ?? 'https://example.test',
    retrievedAt: p.retrievedAt ?? '2026-07-08',
    ...p,
  }
}

console.log('\nconvergence join')
{
  const universe: UniverseRecord[] = [
    {
      id: 'BLD-A',
      address: '38-48 Southwark Bridge Road',
      postcode: 'SE1 9BB',
      borough: 'Southwark',
      floorArea: 9200,
      pressureSignal: sig({ id: 'epc-a', layer: 'epc', factType: 'filed', confidence: 1, observedAt: '2021-05-01', label: 'EPC rating: D' }),
    },
    {
      id: 'BLD-B',
      address: '10 Blackfriars Road',
      postcode: 'SE1 8NW',
      borough: 'Southwark',
      pressureSignal: sig({ id: 'epc-b', layer: 'epc', factType: 'filed', confidence: 1, observedAt: '2020-02-01', label: 'EPC rating: C' }),
    },
  ]
  const hits: KineticHit[] = [
    // exact match to BLD-A
    { address: '38–48 Southwark Bridge Road, London SE1 9BB', signal: sig({ id: 'chg-a', layer: 'companiesHouseCharge', factType: 'filed', confidence: 1, observedAt: '2025-11-28', label: 'Charge registered' }) },
    // fuzzy match to BLD-A (no number) → should downgrade to inferred, cap 0.5
    { address: 'Southwark Bridge Road SE1 9BB', signal: sig({ id: 'spv-a', layer: 'companiesHouseSpv', factType: 'filed', confidence: 1, observedAt: '2025-10-01', label: 'New SPV' }) },
    // matches nothing (different postcode)
    { address: '99 Nowhere Lane SE99 9ZZ', signal: sig({ id: 'orphan', layer: 'buildingControlDemolition', factType: 'filed', confidence: 1, observedAt: '2026-01-01', label: 'Demolition' }) },
  ]

  const { buildings, unmatchedHits } = assemble(universe, hits, '2026-07-08')
  const a = buildings.find((b) => b.opportunity.id === 'BLD-A')!
  const b = buildings.find((b) => b.opportunity.id === 'BLD-B')!

  assert('BLD-A converged (EPC pressure + kinetic hits)', a.convergence.isConverged === true, a.convergence)
  assert('BLD-A has 2 distinct kinetic layers (charge + SPV)', a.convergence.kineticLayers === 2, a.convergence.kineticLayers)
  assert('exact charge hit kept as filed', a.opportunity.signals.find((s) => s.id === 'chg-a')?.factType === 'filed')
  const spv = a.opportunity.signals.find((s) => s.id === 'spv-a')!
  assert('fuzzy SPV hit downgraded to inferred', spv.factType === 'inferred', spv.factType)
  assert('fuzzy SPV confidence capped at 0.5', spv.confidence === 0.5, spv.confidence)
  assert('BLD-A minConfidence reflects the fuzzy hit (0.5)', a.convergence.minConfidence === 0.5, a.convergence.minConfidence)
  assert('BLD-A lead time from earliest kinetic (1 Oct 2025 → 280d)', a.convergence.leadTimeDays === 280, a.convergence.leadTimeDays)

  assert('BLD-B NOT converged (pressure only)', b.convergence.isConverged === false, b.convergence)
  assert('orphan hit is unmatched, not silently dropped', unmatchedHits.length === 1 && unmatchedHits[0].signal.id === 'orphan')

  const converged = convergedOnly(buildings)
  assert('convergedOnly returns just BLD-A', converged.length === 1 && converged[0].opportunity.id === 'BLD-A')
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
