/*
  Run: node --experimental-strip-types puller/sweep.test.ts
  Proves the pure candidate→graph conversion, merge/dedup, sector/conversion
  tagging, and ranking — all offline against synthetic (fictional) CH-shaped
  fixtures. No network; nothing here asserts a real company exists.
*/

import { buildCandidateGraph, mergeGraphs, rankCandidates, slugify, type EnrichedCandidate } from './sweep.ts'
import { checkConversionSignal, inferSectorFromName, sectorRank } from './sector.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

console.log('slugify')
{
  assert('normalises punctuation/case to a stable id fragment', slugify('38-48 Southwark Bridge Road, SE1 9BB') === '38-48-SOUTHWARK-BRIDGE-ROAD-SE1-9BB')
  assert('two different-looking but same-address strings slugify identically', slugify('10 Blackfriars Rd, SE1') === slugify('10  BLACKFRIARS RD SE1'))
}

console.log('\nsector inference (heuristic, honestly labelled)')
{
  assert('"co-living" in the name → coLiving', inferSectorFromName('SBR CO-LIVING SPV LLP').sector === 'coLiving')
  assert('"Student" in the name → studentHousing', inferSectorFromName('Camberwell Student Residences Ltd').sector === 'studentHousing')
  assert('"Offices" in the name → commercialOffice', inferSectorFromName('Bankside Offices Propco Ltd').sector === 'commercialOffice')
  assert('no hint at all → mixedUse, not silently "office"', inferSectorFromName('Southwark Projects Fourteen LLP').sector === 'mixedUse')
  assert('every tag is explicitly heuristic, never claims confirmed', inferSectorFromName('Anything Ltd').confidence === 'heuristic')
}

console.log('\nconversion-signal detection')
{
  const officeName = inferSectorFromName('Riverside Offices SPV Ltd')
  const coLivingName = inferSectorFromName('Riverside Co-Living SPV Ltd')

  assert('no EPC match at all → unconfirmed, not a guessed false negative', checkConversionSignal(coLivingName, null).isConversion === false)
  assert('unconfirmed reason explains why', /unconfirmed/i.test(checkConversionSignal(coLivingName, null).reason))

  const priorCommercial = { isLargeCommercial: true }
  assert('prior commercial EPC + co-living name → conversion signal fires', checkConversionSignal(coLivingName, priorCommercial).isConversion === true)
  assert('prior commercial EPC + OFFICE name → no conversion (same category)', checkConversionSignal(officeName, priorCommercial).isConversion === false)

  const priorNonCommercial = { isLargeCommercial: false }
  assert('prior non-commercial EPC + co-living name → no conversion (nothing to convert FROM)', checkConversionSignal(coLivingName, priorNonCommercial).isConversion === false)
}

console.log('\nranking')
{
  assert('a conversion signal outranks plain commercial office', sectorRank('coLiving', true) < sectorRank('commercialOffice', false))
  assert('plain commercial office outranks mixed-use "wider picture"', sectorRank('commercialOffice', false) < sectorRank('mixedUse', false))
}

function mkCandidate(overrides: Partial<EnrichedCandidate['hit']> & { number: string }): EnrichedCandidate {
  return {
    hit: {
      company_name: overrides.company_name ?? 'Test SPV Ltd',
      company_number: overrides.number,
      date_of_creation: overrides.date_of_creation ?? '2026-02-01',
      address_snippet: overrides.address_snippet,
    },
    profile: { company_number: overrides.number, company_name: overrides.company_name, date_of_creation: overrides.date_of_creation },
    psc: [],
    charges: [],
    officers: [],
    filings: [],
  }
}

console.log('\nbuildCandidateGraph — conversion case (office EPC + co-living SPV)')
{
  const candidate: EnrichedCandidate = {
    ...mkCandidate({ number: '16111222', company_name: 'BANKSIDE CO-LIVING SPV LIMITED', date_of_creation: '2026-03-01' }),
    profile: {
      company_number: '16111222',
      company_name: 'BANKSIDE CO-LIVING SPV LIMITED',
      date_of_creation: '2026-03-01',
      registered_office_address: { premises: '5', address_line_1: 'Bankside Row', postal_code: 'SE1 2AA' },
    },
    psc: [
      { name: 'Riverside Capital Partners LLP', kind: 'corporate-entity-person-with-significant-control', natures_of_control: ['ownership-of-shares-75-to-100-percent'], notified_on: '2026-03-05' },
      { name: 'Jane Smith', kind: 'individual-person-with-significant-control', natures_of_control: ['voting-rights-25-to-50-percent'], notified_on: '2026-03-05' },
      { kind: 'super-secure-person' }, // no name — must be skipped, not crash
    ],
    charges: [
      { charge_code: 'C1', status: 'outstanding', created_on: '2026-03-10', classification: { description: 'A registered charge' }, persons_entitled: [{ name: 'Big Bank plc' }] },
      { charge_code: 'C2', status: 'outstanding', created_on: '2026-03-12' }, // no persons_entitled — no lender node/edge
    ],
    officers: [
      { name: 'Jane Smith', officer_role: 'director', appointed_on: '2026-03-01' },
      { name: 'Old Director', officer_role: 'director', appointed_on: '2020-01-01', resigned_on: '2025-01-01' }, // resigned — excluded
    ],
    filings: [],
  }

  const r = buildCandidateGraph(candidate, { matchedEpc: { isLargeCommercial: true } })

  assert('building node built from the registered office address', Boolean(r.graph.nodes.find((n) => n.id === r.buildingNodeId)?.label.includes('Bankside Row')))
  assert('owns edge confidence is 0.5 — registered office ≠ confirmed site', r.graph.edges.find((e) => e.type === 'owns')?.confidence === 0.5)

  const controlsEdges = r.graph.edges.filter((e) => e.type === 'controls')
  assert('2 controls edges (corporate PSC + individual PSC); the unnamed PSC is silently skipped, not crashed on', controlsEdges.length === 2, controlsEdges)
  assert('corporate PSC becomes a company node', r.graph.nodes.find((n) => n.label === 'Riverside Capital Partners LLP')?.type === 'company')
  assert('individual PSC becomes a person node', r.graph.nodes.find((n) => n.label === 'Jane Smith' && n.type === 'person') !== undefined)

  const chargeEdges = r.graph.edges.filter((e) => e.type === 'chargeHolder')
  assert('only ONE chargeHolder edge — the charge with no persons_entitled gets no lender node', chargeEdges.length === 1, chargeEdges)
  assert('lender node is "Big Bank plc"', r.graph.nodes.find((n) => n.type === 'lender')?.label === 'Big Bank plc')

  const directorEdges = r.graph.edges.filter((e) => e.type === 'directorOf')
  assert('only 1 directorOf edge — the resigned director is excluded', directorEdges.length === 1, directorEdges)

  assert('sector inferred as co-living from the name', r.sector.sector === 'coLiving')
  assert('conversion signal fires: prior commercial + co-living scheme', r.conversion.isConversion === true, r.conversion)

  assert('company node carries incorporation + 2 PSC + 2 charge signals = 5', r.graph.nodes.find((n) => n.id === r.companyNodeId)?.signals.length === 5)
}

console.log('\nbuildCandidateGraph — thin candidate (no PSC/charges/officers)')
{
  const thin = mkCandidate({ number: '16999888', company_name: 'Empty Shell Propco Ltd', address_snippet: '1 Nowhere Street, SE5 0AA' })
  const r = buildCandidateGraph(thin)
  assert('still produces a valid 2-node graph (building + company)', r.graph.nodes.length === 2, r.graph.nodes.length)
  assert('exactly 1 edge (the owns edge) — nothing fabricated for the rest', r.graph.edges.length === 1)
  assert('falls back to address_snippet when no registered_office_address on the profile', Boolean(r.graph.nodes.find((n) => n.id === r.buildingNodeId)?.label.includes('Nowhere Street')))
  assert('no matchedEpc passed → conversion stays unconfirmed, never guessed', r.conversion.isConversion === false)
}

console.log('\nmergeGraphs — shared controller across two candidates becomes one node')
{
  const a = buildCandidateGraph({
    ...mkCandidate({ number: '17000001', company_name: 'Alpha Propco Ltd' }),
    psc: [{ name: 'Shared Fund GP LLP', kind: 'corporate-entity-person-with-significant-control', notified_on: '2026-01-01' }],
  })
  const b = buildCandidateGraph({
    ...mkCandidate({ number: '17000002', company_name: 'Beta Propco Ltd' }),
    psc: [{ name: 'Shared Fund GP LLP', kind: 'corporate-entity-person-with-significant-control', notified_on: '2026-01-05' }],
  })

  const merged = mergeGraphs([a, b])
  const sharedNodes = merged.nodes.filter((n) => n.label === 'Shared Fund GP LLP')
  assert('the shared controller collapses to ONE node, not two', sharedNodes.length === 1, sharedNodes.length)
  assert('both companies still have their own edge to the shared controller', merged.edges.filter((e) => e.to === 'company:17000001' || e.to === 'company:17000002').filter((e) => e.type === 'controls').length === 2)
  assert('total node count is 4 (2 buildings + 2 companies) + 1 shared controller = 5', merged.nodes.length === 5, merged.nodes.length)
}

console.log('\nrankCandidates — conversion/commercial lead, nothing discarded')
{
  const conversionCandidate = buildCandidateGraph(
    { ...mkCandidate({ number: '18000001', company_name: 'Peckham Student Living SPV Ltd', address_snippet: '20 Peckham High St, SE15 5RS' }) },
    { matchedEpc: { isLargeCommercial: true } },
  )
  const officeCandidate = buildCandidateGraph({ ...mkCandidate({ number: '18000002', company_name: 'Camberwell Offices Ltd', address_snippet: '30 Camberwell Rd, SE5 0EG' }) })
  const wideCandidate = buildCandidateGraph({ ...mkCandidate({ number: '18000003', company_name: 'Southwark Ventures Nine LLP', address_snippet: '40 Old Kent Rd, SE1 4AA' }) })

  const ranked = rankCandidates([wideCandidate, officeCandidate, conversionCandidate], '2026-06-01')
  assert('nothing is discarded — all 3 candidates produce a ranked cluster', ranked.length === 3, ranked.length)
  assert('the conversion signal is ranked first', ranked[0].result.conversion.isConversion === true, ranked.map((r) => r.result.companyNodeId))
  assert('commercial office is ranked second', ranked[1].result.sector.sector === 'commercialOffice')
  assert('the unhinted wide/mixed-use candidate is ranked last, but STILL present', ranked[2].result.sector.sector === 'mixedUse')
}

console.log('\nplanning as the discriminator — the actual fix for the "The Ship" false positive')
{
  // Same SPV/charge/PSC shape as a real scheme, on purpose — the point is
  // that these three signals alone cannot tell a pub from a development.
  // Two DIFFERENT addresses (that's the whole point) — same activity shape.
  const sameActivity = (number: string, name: string, address: string) => mkCandidate({ number, company_name: name, address_snippet: address })

  const pubLikeCandidate: EnrichedCandidate = {
    ...sameActivity('19000001', 'BOROUGH ROAD HOSPITALITY SPV LTD', '68 Borough Road, SE1 1JX'),
    psc: [{ name: 'True Pub Holdings Ltd', kind: 'corporate-entity-person-with-significant-control', notified_on: '2023-02-01' }],
    charges: [{ charge_code: 'P1', status: 'outstanding', created_on: '2023-02-15', persons_entitled: [{ name: 'High Street Bank plc' }] }],
  }
  const noPlanning = buildCandidateGraph(pubLikeCandidate) // no matchedPlanning passed — exactly what a real check against The Ship should find

  const schemeLikeCandidate: EnrichedCandidate = {
    ...sameActivity('19000002', 'RIVERSIDE OFFICES SPV LTD', '10 Riverside Way, SE1 0AA'),
    psc: [{ name: 'Riverside Capital LLP', kind: 'corporate-entity-person-with-significant-control', notified_on: '2026-02-01' }],
    charges: [{ charge_code: 'S1', status: 'outstanding', created_on: '2026-02-15', persons_entitled: [{ name: 'Development Bank plc' }] }],
  }
  const withPlanning = buildCandidateGraph(schemeLikeCandidate, {
    matchedPlanning: [
      {
        reference: '26/AP/0900',
        address: '10 Riverside Way SE1',
        description: 'Change of use from office to residential',
        detailUrl: 'https://planning.southwark.gov.uk/x',
        dateText: '01/03/2026',
        matchScore: 0.95,
        applicationType: 'changeOfUse',
      },
    ],
  })

  assert('no planning match → owns edge stays a guess at 0.5', noPlanning.graph.edges.find((e) => e.type === 'owns')?.confidence === 0.5)
  assert('a planning match corroborates the site → owns edge rises to 0.9', withPlanning.graph.edges.find((e) => e.type === 'owns')?.confidence === 0.9)

  const buildingNoPlanning = noPlanning.graph.nodes.find((n) => n.id === noPlanning.buildingNodeId)!
  const buildingWithPlanning = withPlanning.graph.nodes.find((n) => n.id === withPlanning.buildingNodeId)!
  assert('pub-like candidate: building carries NO planningApplication signal', buildingNoPlanning.signals.every((s) => s.layer !== 'planningApplication'))
  assert('scheme-like candidate: building DOES carry a planningApplication signal', buildingWithPlanning.signals.some((s) => s.layer === 'planningApplication'))
  assert('planning signal is attached to the BUILDING, not the company', withPlanning.graph.nodes.find((n) => n.id === withPlanning.companyNodeId)!.signals.every((s) => s.layer !== 'planningApplication'))

  // The actual discrimination: run both through the same conclusion engine
  // that scored the seed. Identical SPV+charge+PSC shape; only planning differs.
  const ranked = rankCandidates([noPlanning, withPlanning], '2026-06-01')
  const pubResult = ranked.find((r) => r.result.companyNodeId === 'company:19000001')!
  const schemeResult = ranked.find((r) => r.result.companyNodeId === 'company:19000002')!
  assert(
    'the candidate WITH a planning match strictly outranks the identical one without — this is the actual fix',
    ranked.indexOf(schemeResult) < ranked.indexOf(pubResult),
    ranked.map((r) => [r.result.companyNodeId, r.conclusion.strength]),
  )
  assert('the scheme-like cluster reaches green (4 distinct kinetic layers: SPV+PSC+charge+planning)', schemeResult.conclusion.strength === 'green', schemeResult.conclusion.strength)
  assert('the pub-like cluster, with the SAME company-side activity, caps at amber with no planning', pubResult.conclusion.strength === 'amber', pubResult.conclusion.strength)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
