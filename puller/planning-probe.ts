/*
  Planning source probe — TWO sources, checked in the brief's revised order:
    1. planning.data.gov.uk — unconfirmed whether it has application-level
       data at all (see planningDataGovUk.ts's file header).
    2. Southwark's own Idox Public Access register — the proven structural
       fallback, but with its own uncertainty (session-based address search).

  Run: node --experimental-strip-types puller/planning-probe.ts
  Nothing is parsed blindly; every variant reports status, whether the body
  looks real, how many rows parsed, their date SPAN (the full-history check),
  and a body snippet — so it can't crash and can't silently mislead.
*/

import { candidateEntityUrls } from './planningDataGovUk.ts'
import { planningSearchVariants, fetchPlanningSearchHtml } from './planning.ts'
import { looksLikeIdoxResultsPage, parseIdoxResultList, ukDateToIso } from './idox.ts'
import { BODY_SNIPPET_LEN, snippet } from './jsonResponse.ts'
import { fileURLToPath } from 'node:url'

const ADDRESSES = ['38-48 Southwark Bridge Road', '68 Borough Road']

async function probePlanningDataGovUk(): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\nSource 1: planning.data.gov.uk (national platform)\n`)
  for (const c of candidateEntityUrls()) {
    console.log(`── ${c.name}`)
    console.log(`   URL: ${c.url}`)
    console.log(`   Answers: ${c.answers}`)
    let res: Response
    try {
      res = await fetch(c.url, { headers: { Accept: 'application/json' } })
    } catch (err) {
      console.log(`   ✗ request failed: ${(err as Error).message}\n`)
      continue
    }
    const ct = res.headers.get('content-type') ?? '(none)'
    const body = await res.text().catch(() => '')
    console.log(`   status: ${res.status} · content-type: ${ct}`)
    try {
      const parsed = JSON.parse(body)
      console.log(`   ✓ JSON. Top-level: ${Array.isArray(parsed) ? `array[${parsed.length}]` : Object.keys(parsed).join(', ')}`)
    } catch {
      console.log(`   body[0..${BODY_SNIPPET_LEN}]: ${snippet(body)}`)
    }
    console.log('')
  }
}

async function probeIdoxOne(address: string): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\nSource 2: Idox Public Access — ${address}`)
  for (const variant of planningSearchVariants(address)) {
    console.log(`\n── ${variant.name}`)
    console.log(`   URL: ${variant.url}`)
    let html: string
    try {
      html = await fetchPlanningSearchHtml(variant.url)
    } catch (err) {
      console.log(`   ✗ request failed: ${(err as Error).message}`)
      continue
    }
    const looksReal = looksLikeIdoxResultsPage(html)
    console.log(`   looks like a real results page: ${looksReal ? 'YES' : 'no (session/login/error page?)'}`)
    if (!looksReal) {
      console.log(`   body[0..${BODY_SNIPPET_LEN}]: ${snippet(html)}`)
      continue
    }
    const rows = parseIdoxResultList(html)
    console.log(`   rows parsed: ${rows.length}`)
    const isoDates = rows.map((r) => (r.dateText ? ukDateToIso(r.dateText) : undefined)).filter((d): d is string => Boolean(d)).sort()
    if (isoDates.length) {
      console.log(`   date span: ${isoDates[0]} .. ${isoDates[isoDates.length - 1]}  ← if this looks suspiciously recent/narrow, check for a hidden Idox default window`)
    }
    for (const r of rows.slice(0, 8)) {
      console.log(`     · ${r.reference || '(no ref)'} | ${r.address || '(no address)'} | date: ${r.dateText ?? '(none found)'}`)
      console.log(`       ${r.description}`)
    }
  }
}

async function main() {
  console.log('Planning source probe')
  console.log('(Southwark bulk dataset page + third-party mirrors are not probed here —')
  console.log(' the former per the brief needs manual inspection; the latter are explicitly')
  console.log(' not a production dependency.)')

  await probePlanningDataGovUk()
  for (const address of ADDRESSES) await probeIdoxOne(address)

  console.log(`
──────────────────────────────────────────────────────────────
How to read this:

Source 1 (planning.data.gov.uk):
  · If "dataset list" shows nothing resembling planning applications →
    this platform likely doesn't cover live applications (matches prior
    background knowledge — it's historically spatial/policy data). Stick
    with Idox.
  · If the Southwark org-entity call returns real applications → tell me
    the field names and this REPLACES the Idox scraper per the brief.

Source 2 (Idox), for EACH address:
  · Confirm the KNOWN answers appear: 38-48 Southwark Bridge Road should
    show ref 26/00849/OBS (10 June 2026, change of use to co-living);
    68 Borough Road should show ref 23/AP/3411 (8 Dec 2023, tree works)
    and NOTHING else.
  · If the date span looks too narrow/recent for either → a hidden
    recency default is very likely; paste the output back.
  · If NEITHER variant shows "looks like a real results page: YES" →
    address search needs a session here; paste this back and I'll add
    cookie handling.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nProbe failed: ' + (err as Error).message)
    process.exit(1)
  })
}
