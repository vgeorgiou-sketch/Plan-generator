/*
  Planning history — verification, per the brief's own test.

  Run: node --use-system-ca --env-file=.env --experimental-strip-types puller/planningCheck.ts

  Two known cases, both run. Verification is by OUTCOME (the application-type
  classification a real match reaches), not by matching one exact reference
  string — confirmed necessary live: the same real Southwark Bridge Road
  scheme surfaced under TWO different reference labels depending on the
  source — 26/00849/OBS from a third-party mirror's cross-boundary
  "Observations" entry, 26/AP/1201 from Southwark's own native register —
  because different sources can label the identical development differently.
  Requiring an exact string match would have reported a correct discriminator
  as a FAIL. The known references below are shown for transparency (and a
  bonus confirmation when they DO line up), never as the pass/fail criterion.
   1. 68 Borough Road (The Ship — pub, refurbished/reopened 2023 by True Pub
      Co; the sweep's false positive). Confirmed live: 9 records, ALL
      routine (advertising panels, a beer-garden fence, signage, tree works —
      ref 23/AP/3411 among them) — zero reaching change-of-use or stronger.
      Must NOT register as a development signal.
   2. 38-48 Southwark Bridge Road (the confirmed real case). Confirmed live,
      Southwark's own native reference: 26/AP/1201 — "change of use ... for
      co-living use, 395 co-living units" — classified changeOfUse. Must
      light the planning cell.

  The source is working correctly when the pub's matches all stay routine
  and the real case reaches a change-of-use-or-stronger record. That
  contrast IS the proof — same shape as the 489-day cross-check that proved
  the graph engine: a known outcome the code must independently arrive at.

  CRITICAL check built in: both cases require FULL HISTORY (the real
  application is well over a year after the SPV that formed it; several of
  the pub's routine records are years old). This CLI reports the returned
  date SPAN so a silently-narrow window is visible, not just assumed absent.
  This does NOT run meaningfully before planning-probe.ts has confirmed the
  search actually returns real result pages; if this reports "not found" for
  BOTH addresses, run the probe before concluding anything about either
  building.
*/

import { checkPlanningForAddress, APPLICATION_TYPE_STRENGTH } from './planning.ts'
import { SOUTHWARK_BRIDGE_ROAD_SEED as SEED } from '../signal-model/seed.ts'
import { fileURLToPath } from 'node:url'

interface VerificationCase {
  label: string
  address: string
  expectation: 'shouldStayQuiet' | 'shouldLightUp'
  /** A manually-confirmed reference for this case, shown for transparency
   *  and as a bonus cross-check — NOT the pass/fail criterion. Different
   *  sources can label the same real scheme under different reference
   *  formats (see this file's header); the actual verification is by
   *  OUTCOME (the strongest classification reached), not string equality. */
  knownReferenceExample: string
}

const CASES: VerificationCase[] = [
  {
    label: 'The Ship — false-positive check',
    address: '68 Borough Road',
    expectation: 'shouldStayQuiet',
    knownReferenceExample: '23/AP/3411',
  },
  {
    label: `${SEED.address} — confirmed real case`,
    address: SEED.address,
    expectation: 'shouldLightUp',
    knownReferenceExample: '26/AP/1201',
  },
]

async function runCase(c: VerificationCase): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\n${c.label}\n  address: ${c.address}\n  known reference example: ${c.knownReferenceExample}`)

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
    if (c.expectation === 'shouldStayQuiet') {
      console.log('\n  Zero matching applications. → PASS — correctly quiet (no records at all is at least as quiet as all-routine).')
    } else {
      console.log('\n  No matching applications found. → FAIL — expected a development-strength record here.')
      console.log('  Check address-matching, or whether a hidden recency window dropped it.')
    }
    return
  }

  console.log(`\n  ${result.matches.length} matching application(s):`)
  let strongest = result.matches[0]
  const matchesKnownExample = result.matches.some((m) => m.reference === c.knownReferenceExample)
  for (const m of result.matches) {
    const flag = m.reference === c.knownReferenceExample ? '  ← matches the known reference example' : ''
    console.log(`    · ${m.reference || '(no ref)'} [${m.applicationType}] ${m.dateText ?? '(no date)'} — ${m.description}${flag}`)
    console.log(`      ${m.detailUrl}`)
    if (APPLICATION_TYPE_STRENGTH[m.applicationType] > APPLICATION_TYPE_STRENGTH[strongest.applicationType]) strongest = m
  }

  // The pass/fail line, by OUTCOME: does the strongest match reach
  // change-of-use-or-stronger? An exact-reference match is reported as a
  // bonus, never required — see this file's header.
  const isStrong = APPLICATION_TYPE_STRENGTH[strongest.applicationType] >= APPLICATION_TYPE_STRENGTH.changeOfUse
  const bonus = matchesKnownExample ? ' (and matches the known reference example exactly)' : ''
  if (c.expectation === 'shouldStayQuiet') {
    console.log(
      `\n  → ${isStrong ? `FAIL — strongest match is ${strongest.reference || '(no ref)'} classified ${strongest.applicationType}, a development signal on an address expected to stay quiet. Investigate.` : `PASS — ${result.matches.length} record(s), strongest is ${strongest.applicationType} (routine, not development)${bonus}.`}`,
    )
  } else {
    console.log(
      `\n  → ${isStrong ? `PASS — ${strongest.reference || '(no ref)'} classified ${strongest.applicationType} (development signal)${bonus}.` : `FAIL — strongest match is only ${strongest.applicationType}; no change-of-use-or-stronger record found.`}`,
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
  console.log('The source is working correctly when the pub\'s matches all stay routine')
  console.log('and the real case reaches a change-of-use-or-stronger record. Verification')
  console.log('is by outcome (the classification reached), not one exact reference string —')
  console.log('see this file\'s header for why. If both came back empty, run planning-probe.ts first.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nPlanning check could not complete:\n  ' + (err as Error).message)
    console.error('\nNo verdict is reported because nothing was measured. (Not fabricated.)')
    process.exit(1)
  })
}
