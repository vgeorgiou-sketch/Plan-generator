/*
  Planning search probe — settles whether Idox's address search actually
  works GET-only (like the weekly list) or needs a server-side session.

  Run: node --experimental-strip-types puller/planning-probe.ts
  Nothing is parsed blindly; every variant reports status, whether the body
  looks like a real results page, how many rows parsed, and a body snippet —
  so it can't crash and can't silently mislead.
*/

import { planningSearchVariants, fetchPlanningSearchHtml } from './planning.ts'
import { looksLikeIdoxResultsPage, parseIdoxResultList } from './idox.ts'
import { BODY_SNIPPET_LEN, snippet } from './jsonResponse.ts'
import { fileURLToPath } from 'node:url'

const ADDRESSES = ['38-48 Southwark Bridge Road', '68 Borough Road']

async function probeOne(address: string): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\n${address}`)
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
    if (looksReal) {
      const rows = parseIdoxResultList(html)
      console.log(`   rows parsed: ${rows.length}`)
      for (const r of rows.slice(0, 5)) {
        console.log(`     · ${r.reference || '(no ref)'} | ${r.address || '(no address)'} | date: ${r.dateText ?? '(none found)'}`)
      }
    } else {
      console.log(`   body[0..${BODY_SNIPPET_LEN}]: ${snippet(html)}`)
    }
  }
}

async function main() {
  console.log('Planning search probe — Idox Public Access address search')
  console.log('(Southwark bulk dataset + Planning London Datahub were checked first and are')
  console.log(' unreachable from the sandbox that wrote this — check those manually too.)')
  for (const address of ADDRESSES) await probeOne(address)

  console.log(`
──────────────────────────────────────────────────────────────
How to read this:
  · If EITHER variant shows "looks like a real results page: YES" with rows
    for BOTH addresses → planning.ts's parser is usable as-is; run planningCheck.ts.
  · If it says "no (session/login/error page?)" for every variant → Idox
    needs a session for address search here; the weekly-list's stateless GET
    trick doesn't extend to this endpoint. Paste this output back and I'll
    add session/cookie handling.
  · If rows parse but dateText is "(none found)" for real rows → the
    metaInfo date-label wording differs from what idox.ts expects; paste one
    full <li class="searchresult"> block back and I'll fix the pattern.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nProbe failed: ' + (err as Error).message)
    process.exit(1)
  })
}
