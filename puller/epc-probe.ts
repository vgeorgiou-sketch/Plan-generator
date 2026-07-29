/*
  EPC diagnostic probe — answers "why is EPC returning HTML?"
  Run: node --env-file=.env --experimental-strip-types puller/epc-probe.ts

  Tries the request variants side by side and prints, for each: the exact URL,
  HTTP status, content-type, whether it redirected (and to where), and the
  first 500 chars of the body. Nothing is parsed as JSON unless it really is
  JSON, so this never crashes — it reports.
*/

import { buildEpcUrl, SOUTHWARK_ONS, type EpcQuery } from './epc.ts'
import { BODY_SNIPPET_LEN, looksLikeHtml, snippet } from './jsonResponse.ts'

const TOKEN = process.env.EPC_API_KEY ?? ''

interface Variant {
  name: string
  url: string
  headers: Record<string, string>
}

function variants(): Variant[] {
  const json = { Accept: 'application/json' }
  const basic = { Authorization: `Basic ${TOKEN}` }
  const bearer = { Authorization: `Bearer ${TOKEN}` }

  const q = (o: EpcQuery) => buildEpcUrl({ size: 5, ...o })

  return [
    { name: 'A. district as postcode (SE1) + Basic + Accept', url: q({ postcode: 'SE1' }), headers: { ...basic, ...json } },
    { name: 'B. FULL postcode (SE1 9BB) + Basic + Accept', url: q({ postcode: 'SE1 9BB' }), headers: { ...basic, ...json } },
    { name: 'C. local-authority (Southwark) + Basic + Accept', url: q({ localAuthority: SOUTHWARK_ONS }), headers: { ...basic, ...json } },
    { name: 'D. full postcode + Basic, NO Accept header', url: q({ postcode: 'SE1 9BB' }), headers: { ...basic } },
    { name: 'E. full postcode + Bearer + Accept (to prove Basic is right)', url: q({ postcode: 'SE1 9BB' }), headers: { ...bearer, ...json } },
    { name: 'F. full postcode + Accept, NO auth (baseline)', url: q({ postcode: 'SE1 9BB' }), headers: { ...json } },
  ]
}

async function probe(v: Variant): Promise<void> {
  console.log(`\n── ${v.name}`)
  console.log(`   URL: ${v.url}`)
  console.log(`   Headers: ${Object.keys(v.headers).join(', ')}`)
  let res: Response
  try {
    res = await fetch(v.url, { headers: v.headers, redirect: 'manual' })
  } catch (err) {
    console.log(`   ✗ connection failed: ${(err as Error).message}`)
    return
  }
  const ct = res.headers.get('content-type') ?? '(none)'
  const loc = res.headers.get('location')
  const body = await res.text().catch(() => '')
  const html = looksLikeHtml(ct, body)

  console.log(`   status: ${res.status} ${res.statusText}`)
  console.log(`   content-type: ${ct}`)
  if (loc) console.log(`   → Location: ${loc}`)
  console.log(`   body is: ${html ? 'HTML' : 'not HTML'}`)
  if (!html) {
    try {
      const j = JSON.parse(body) as { rows?: unknown[] }
      console.log(`   ✓ JSON parsed · rows: ${Array.isArray(j.rows) ? j.rows.length : '(no rows key)'}`)
    } catch {
      console.log(`   (not valid JSON either)`)
    }
  }
  console.log(`   body[0..${BODY_SNIPPET_LEN}]: ${snippet(body)}`)
}

async function main() {
  console.log('EPC probe — diagnosing the HTML-instead-of-JSON response')
  console.log(`EPC_API_KEY: ${TOKEN ? TOKEN.slice(0, 4) + '…' + TOKEN.slice(-4) + ` (len ${TOKEN.length})` : '(NOT SET)'}`)
  if (!TOKEN) {
    console.log('\nSet EPC_API_KEY in .env before probing.')
    return
  }
  for (const v of variants()) await probe(v)

  console.log(`
──────────────────────────────────────────────────────────────
How to read this:
  · If A is HTML but B/C are JSON  → "SE1" is a district, not a postcode.
    Fix: query by full postcode or by local-authority (Task 1 now does).
  · If every variant returns a sign-in page → the token isn't being accepted.
  · If F (no auth) looks the same as B → auth isn't reaching the API at all.
  · If E (Bearer) works and B (Basic) doesn't → the scheme is Bearer after all.`)
}

main().catch((err) => {
  console.error('\nProbe failed: ' + (err as Error).message)
  process.exit(1)
})
