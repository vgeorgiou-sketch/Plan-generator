/*
  Planning history — verification, per the brief's own test.

  Run: node --use-system-ca --env-file=.env --experimental-strip-types puller/planningCheck.ts

  Two known cases, both run — and both manually confirmed already against
  the full-history register, so this CLI's job is to reproduce EXACT known
  answers, not just "found something plausible":
   1. 68 Borough Road (The Ship — pub, refurbished/reopened 2023 by True Pub
      Co; the sweep's false positive). Confirmed answer: ONE application ever,
      ref 23/AP/3411, dated 8 Dec 2023, "Works to a Tree in a Conservation
      Area" — a tree-pruning consent, not development. Must NOT register as
      a development signal.
   2. 38-48 Southwark Bridge Road (the confirmed real case). Confirmed answer:
      a MAJOR application, ref 26/00849/OBS, dated 10 June 2026, "Partial
      demolition, extension and change of use of existing building for
      co-living use" (plus a related cross-boundary consultation to Tower
      Hamlets, PA/26/00989/NC — out of scope for this increment). Must light
      the planning cell.

  The source is working correctly when the pub's ONLY record is the tree
  consent and the real case shows the change-of-use demolition. That
  contrast IS the proof — same shape as the 489-day cross-check that proved
  the graph engine: a known answer the code must independently arrive at.

  CRITICAL check built in: both cases require FULL HISTORY (the real
  application is 17 months after the SPV that formed it; the pub's tree
  consent is ~3 years old). This CLI reports the returned date SPAN so a
  silently-narrow window is visible, not just assumed absent. This does NOT
  run meaningfully before planning-probe.ts has confirmed the search
  actually returns real result pages; if this reports "not found" for BOTH
  addresses, run the probe before concluding anything about either building.
*/

import { checkPlanningForAddress, APPLICATION_TYPE_STRENGTH } from './planning.ts'
import { SOUTHWARK_BRIDGE_ROAD_SEED as SEED } from '../signal-model/seed.ts'
import { fileURLToPath } from 'node:url'

interface VerificationCase {
  label: string
  address: string
  expectation: 'shouldStayQuiet' | 'shouldLightUp'
  /** The manually-confirmed reference this case should reproduce exactly. */
  knownReference: string
}

const CASES: VerificationCase[] = [
  {
    label: 'The Ship — false-positive check',
    address: '68 Borough Road',
    expectation: 'shouldStayQuiet',
    knownReference: '23/AP/3411',
  },
  {
    label: `${SEED.address} — confirmed real case`,
    address: SEED.address,
    expectation: 'shouldLightUp',
    knownReference: '26/00849/OBS',
  },
]

async function runCase(c: VerificationCase): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\n${c.label}\n  address: ${c.address}\n  known answer: ${c.knownReference}`)

  const result = await checkPlanningForAddress(c.address)

  if (!result.checked) {
    console.log(`\n  ⚠ COULD NOT CHECK — ${result.error}`)
    console.log('  This is NOT the same as "confirmed no application". Run planning-probe.ts first.')
    return
  }

  console.log(`  (searched via: ${result.variantsUsed.join(' + ')})`)
  if (result.dateSpan) {
    console.log(`  date span of matches: ${result.dateSpan.earliest} .. ${result.dateSpan.latest}`)
  }
  if (result.error) {
    console.log(`  ⚠ one or more variants failed alongside the successful one(s) — ${result.error}`)
  }

  if (result.matches.length === 0) {
    console.log(`\n  No matching applications found. → FAIL — the known answer (${c.knownReference}) was not reproduced.`)
    console.log('  Check address-matching, or whether a hidden recency window dropped it.')
    return
  }

  console.log(`\n  ${result.matches.length} matching application(s):`)
  let strongest = result.matches[0]
  const foundKnown = result.matches.some((m) => m.reference === c.knownReference)
  for (const m of result.matches) {
    const flag = m.reference === c.knownReference ? '  ← the manually-confirmed answer' : ''
    console.log(`    · ${m.reference || '(no ref)'} [${m.applicationType}] ${m.dateText ?? '(no date)'} — ${m.description}${flag}`)
    console.log(`      ${m.detailUrl}`)
    if (APPLICATION_TYPE_STRENGTH[m.applicationType] > APPLICATION_TYPE_STRENGTH[strongest.applicationType]) strongest = m
  }

  const isStrong = APPLICATION_TYPE_STRENGTH[strongest.applicationType] >= APPLICATION_TYPE_STRENGTH.changeOfUse
  if (!foundKnown) {
    console.log(`\n  → FAIL — the known reference ${c.knownReference} was not among the matches. Investigate before trusting this run.`)
  } else if (c.expectation === 'shouldStayQuiet') {
    console.log(
      `\n  → ${isStrong ? `SURPRISE — ${c.knownReference} classified as ${strongest.applicationType}, stronger than expected (tree works). Check the classifier.` : `PASS — ${c.knownReference} found and correctly classified as ${strongest.applicationType} (routine, not development).`}`,
    )
  } else {
    console.log(
      `\n  → ${isStrong ? `PASS — ${c.knownReference} found and correctly classified as ${strongest.applicationType} (development signal).` : `SURPRISE — ${c.knownReference} found but classified as ${strongest.applicationType}, weaker than expected (change-of-use/demolition). Check the classifier.`}`,
    )
  }
}

async function main() {
  console.log('Planning history verification — the pub vs. the real case\n')
  console.log('Source, revised preference order:')
  console.log('  1. planning.data.gov.uk — unconfirmed from this sandbox (egress-blocked); run planning-probe.ts.')
  console.log('  2. Idox Public Access (Southwark\'s own register) — what this CLI actually runs.')
  console.log('  3. Third-party mirrors — spot-check only, not built against.')

  for (const c of CASES) await runCase(c)

  console.log(`\n${'═'.repeat(70)}`)
  console.log('The source is working correctly when the pub\'s ONLY record is the tree')
  console.log('consent (23/AP/3411) and the real case shows the change-of-use demolition')
  console.log('(26/00849/OBS). If both came back empty, run planning-probe.ts first.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nPlanning check could not complete:\n  ' + (err as Error).message)
    console.error('\nNo verdict is reported because nothing was measured. (Not fabricated.)')
    process.exit(1)
  })
}
