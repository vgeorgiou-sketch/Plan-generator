/*
  Run: node --experimental-strip-types graph-model/validate.ts
  Proves cluster detection, scoring, and the conclusion engine — both against
  synthetic inputs (the mechanism) and the real, confirmed Southwark Bridge
  Road cluster (the reference case).
*/

import { buildConclusion, extractPublicContacts, scoreCluster, strengthFromScore } from './conclusion.ts'
import { detectClusters } from './cluster.ts'
import { SBR_ANALYSIS_ASOF, SBR_DISCLOSURE_DATE, SOUTHWARK_BRIDGE_ROAD_GRAPH } from './seed.ts'
import type { Graph } from './types.ts'
import type { Signal as ModelSignal } from '../signal-model/types.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

function sig(p: Partial<ModelSignal> & Pick<ModelSignal, 'layer' | 'factType' | 'confidence' | 'observedAt'>): ModelSignal {
  return {
    id: p.id ?? `s-${Math.random().toString(36).slice(2, 8)}`,
    buildingId: p.buildingId ?? 'b',
    label: p.label ?? p.layer,
    value: p.value ?? '',
    sourceUrl: p.sourceUrl ?? 'https://example.test',
    retrievedAt: p.retrievedAt ?? '2026-01-01',
    ...p,
  }
}

console.log('cluster detection — synthetic graph')
{
  const g: Graph = {
    nodes: [
      { id: 'b1', type: 'building', label: 'Building One', signals: [] },
      { id: 'c1', type: 'company', label: 'Co One', signals: [] },
      { id: 'p1', type: 'person', label: 'Person One', signals: [] },
      { id: 'b2', type: 'building', label: 'Building Two (isolated)', signals: [] }, // no edges at all
    ],
    edges: [
      { from: 'c1', to: 'b1', type: 'owns', sourceUrl: 'u', observedAt: '2026-01-01', confidence: 1 },
      { from: 'p1', to: 'c1', type: 'directorOf', sourceUrl: 'u', observedAt: '2026-01-01', confidence: 1 },
    ],
  }
  const clusters = detectClusters(g)
  assert('one cluster per building node', clusters.length === 2, clusters.length)

  const c1 = clusters.find((c) => c.buildingId === 'b1')!
  assert('b1 cluster reaches the director through the company (2 hops)', c1.nodeIds.includes('p1'), c1.nodeIds)
  assert('b1 cluster has all 3 connected nodes', c1.nodeIds.length === 3, c1.nodeIds)
  assert('b1 cluster carries both edges', c1.edges.length === 2)

  const c2 = clusters.find((c) => c.buildingId === 'b2')!
  assert('an isolated building is still a valid (weak) cluster of itself', c2.nodeIds.length === 1 && c2.edges.length === 0, c2)
}

console.log('\nscoring thresholds (brief\'s own worked examples)')
{
  const mkCluster = (layers: string[], asOfDistanceDays: number[]) => ({
    buildingId: 'b',
    buildingLabel: 'Test Building',
    nodeIds: ['b'],
    nodes: [
      {
        id: 'b',
        type: 'building' as const,
        label: 'Test Building',
        signals: layers.map((layer, i) =>
          sig({
            layer: layer as ModelSignal['layer'],
            factType: 'filed',
            confidence: 1,
            observedAt: `2026-01-${String(1 + (asOfDistanceDays[i] ?? 0)).padStart(2, '0')}`,
          }),
        ),
      },
    ],
    edges: [],
  })

  // "One SPV incorporation alone = red."
  const oneOnly = mkCluster(['companiesHouseSpv'], [0])
  const s1 = scoreCluster(oneOnly, '2026-01-01')
  assert('1 distinct layer → red', strengthFromScore(s1) === 'red', s1)

  // "SPV + charge + PSC change = amber."
  const three = mkCluster(['companiesHouseSpv', 'companiesHouseCharge', 'companiesHousePsc'], [0, 0, 0])
  const s3 = scoreCluster(three, '2026-01-01')
  assert('3 distinct layers, all filed & recent → amber', strengthFromScore(s3) === 'amber', s3)

  // "SPV + charge + PSC + prior-owner distress + no planning yet = green."
  const four = mkCluster(
    ['companiesHouseSpv', 'companiesHouseCharge', 'companiesHousePsc', 'landRegistryTitle'],
    [0, 0, 0, 0],
  )
  const s4 = scoreCluster(four, '2026-01-01')
  assert('4 distinct layers, all filed & recent → green', strengthFromScore(s4) === 'green', s4)

  // context layers (planningApplicant, pressReport) never move the needle on their own.
  const contextOnly = mkCluster(['planningApplicant', 'pressReport'], [0, 0])
  const sc = scoreCluster(contextOnly, '2026-01-01')
  assert('context-only layers score as zero distinct (scorable) layers', sc.distinctLayers === 0, sc)
  assert('context-only cluster is red', strengthFromScore(sc) === 'red')

  // Recency downgrade: same 4 layers, but all a year stale relative to asOf.
  const staleFour = {
    ...four,
    nodes: [{ ...four.nodes[0], signals: four.nodes[0].signals.map((s) => ({ ...s, observedAt: '2024-01-01' })) }],
  }
  const sStale = scoreCluster(staleFour, '2026-01-01')
  assert('stale cluster has zero recent signals', sStale.recentSignalCount === 0, sStale)
  assert('staleness downgrades green → amber, never silently stays green', strengthFromScore(sStale) === 'amber', sStale)

  // Confidence cap: 4 layers, recent, but one signal is a weak inferred guess.
  const weakFour = {
    ...four,
    nodes: [{ ...four.nodes[0], signals: four.nodes[0].signals.map((s, i) => (i === 0 ? { ...s, confidence: 0.4, factType: 'inferred' as const } : s)) }],
  }
  const sWeak = scoreCluster(weakFour, '2026-01-01')
  assert('minConfidence reflects the weak link, not an average', sWeak.minConfidence === 0.4, sWeak.minConfidence)
  assert('a weak link caps green at amber — never averaged away', strengthFromScore(sWeak) === 'amber', sWeak)
}

console.log('\npublic contacts extraction')
{
  const g: Graph = {
    nodes: [
      { id: 'bld', type: 'building', label: 'The Building', signals: [] },
      { id: 'co', type: 'company', label: 'Owning Co Ltd', signals: [] },
      { id: 'dir', type: 'person', label: 'Jane Director', signals: [] },
      { id: 'lender', type: 'lender', label: 'Big Bank plc', signals: [] },
    ],
    edges: [
      { from: 'co', to: 'bld', type: 'owns', sourceUrl: 'u1', observedAt: '2026-01-01', confidence: 1 },
      { from: 'dir', to: 'co', type: 'directorOf', sourceUrl: 'u2', observedAt: '2026-01-02', confidence: 1 },
      { from: 'lender', to: 'co', type: 'chargeHolder', sourceUrl: 'u3', observedAt: '2026-01-03', confidence: 1 },
    ],
  }
  const clusters = detectClusters(g)
  const contacts = extractPublicContacts(clusters[0])
  assert('3 public contacts, one per non-building edge', contacts.length === 3, contacts)
  assert('owning company role names the building', contacts.find((c) => c.name === 'Owning Co Ltd')?.role === 'Owning entity of The Building', contacts)
  assert('director role names the company', contacts.find((c) => c.name === 'Jane Director')?.role === 'Director of Owning Co Ltd')
  assert('lender role names the company, tagged as lender', Boolean(contacts.find((c) => c.name === 'Big Bank plc')?.role.includes('lender')))
  assert('every contact carries its citing sourceUrl', contacts.every((c) => c.sourceUrl.startsWith('u')))
}

console.log('\nconfirmed cluster — 38–48 Southwark Bridge Road (real, not synthetic)')
{
  const clusters = detectClusters(SOUTHWARK_BRIDGE_ROAD_GRAPH)
  assert('exactly one building in the seed graph → one cluster', clusters.length === 1, clusters.length)

  const cluster = clusters[0]
  assert('cluster reaches all 5 nodes (building, SPV, 2 controllers, operator)', cluster.nodeIds.length === 5, cluster.nodeIds)
  assert('cluster carries all 4 cited edges', cluster.edges.length === 4, cluster.edges.length)
  assert('every edge cites a real, working-shaped Companies House or planning URL', cluster.edges.every((e) => e.sourceUrl.startsWith('https://')))

  const score = scoreCluster(cluster, SBR_ANALYSIS_ASOF)
  assert('3 distinct scorable layers (SPV + PSC + charge) — matches the brief\'s own amber example exactly', score.distinctLayers === 3, score)
  assert('nothing stale as of the analysis date (all 4 kinetic signals within 6 months)', score.recentSignalCount === 4, score)
  assert('minConfidence 1.0 — every contributing seed fact is filed', score.minConfidence === 1)

  const strength = strengthFromScore(score)
  assert('renders amber, as the spec calls for ("green/amber")', strength === 'amber', strength)

  const conclusion = buildConclusion(cluster, { asOf: SBR_ANALYSIS_ASOF, pressDate: SBR_DISCLOSURE_DATE })
  assert('headline names the real building address', conclusion.headline.includes('38-48 Southwark Bridge Road'), conclusion.headline)
  assert('reasoning cites the SPV incorporation by date', /28\/01\/2025/.test(conclusion.reasoning), conclusion.reasoning)
  assert('reasoning cites the mortgage', /Mortgage filed/.test(conclusion.reasoning), conclusion.reasoning)
  assert('evidence is exactly the cluster\'s 4 edges', conclusion.evidence.length === 4)
  assert('4 public contacts: OC455308, Hub Living, Bridges GP, HUB operator', conclusion.publicContacts.length === 4, conclusion.publicContacts)
  assert(
    'public contacts are entity-level only — no individual director names yet (officers() not pulled for this building)',
    conclusion.publicContacts.every((c) => !/\bMr\b|\bMs\b|\bMrs\b/.test(c.name)),
  )
  assert(
    'lead time matches the already-proven Task 0 headline number exactly: 489 days',
    conclusion.leadTimeDays === 489,
    conclusion.leadTimeDays,
  )
  assert('advice is non-empty and strength-appropriate for amber (watch, not yet actionable alone)', /not yet actionable/i.test(conclusion.advice), conclusion.advice)

  // The natural throughline: once Task 1's EPC pressure signal lands on this
  // building, distinctLayers becomes 4 → green. Proven here with a synthetic
  // addition, not asserted against the real (still-pending) seed.
  const withEpc: typeof cluster = {
    ...cluster,
    nodes: cluster.nodes.map((n) =>
      n.id === cluster.buildingId
        ? { ...n, signals: [...n.signals, sig({ layer: 'epc', factType: 'filed', confidence: 1, observedAt: SBR_ANALYSIS_ASOF })] }
        : n,
    ),
  }
  const scoreWithEpc = scoreCluster(withEpc, SBR_ANALYSIS_ASOF)
  assert('adding the pending EPC pressure signal → 4 distinct layers', scoreWithEpc.distinctLayers === 4, scoreWithEpc)
  assert('…which flips the verdict to green, once Task 1 lands', strengthFromScore(scoreWithEpc) === 'green', scoreWithEpc)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
