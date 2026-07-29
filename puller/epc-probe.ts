/*
  EPC probe (new service) — settles two unknowns the OpenAPI spec couldn't
  answer from here (it returns 403 to this environment):
    1. auth scheme — Bearer vs Basic
    2. response shape — container key + row field names

  Run: node --env-file=.env --experimental-strip-types puller/epc-probe.ts
  Nothing is parsed blindly; every variant reports status, content-type,
  redirect target and a body snippet, so it can't crash.
*/

import { BASE, buildEpcUrl, extractRows, HOST, type EpcQuery } from './epc.ts'
import { BODY_SNIPPET_LEN, looksLikeHtml, snippet } from './jsonResponse.ts'

const TOKEN = process.env.EPC_API_KEY ?? ''
const ADDRESS = '38-48 Southwark Bridge Road'

interface Variant {
  name: string
  url: string
  headers: Record<string, string>
}

function variants(): Variant[] {
  const json = { Accept: 'application/json' }
  const q = (o: EpcQuery) => buildEpcUrl({ size: 5, ...o })
  const addr = q({ address: ADDRESS })

  return [
    { name: 'A. address + Bearer', url: addr, headers: { Authorization: `Bearer ${TOKEN}`, ...json } },
    { name: 'B. address + Basic', url: addr, headers: { Authorization: `Basic ${TOKEN}`, ...json } },
    { name: 'C. address + x-api-key header', url: addr, headers: { 'x-api-key': TOKEN, ...json } },
    { name: 'D. address + NO auth (baseline — is the API even open?)', url: addr, headers: { ...json } },
    { name: 'E. council[]=Southwark + best-guess Bearer', url: q({ councils: ['Southwark'] }), headers: { Authorization: `Bearer ${TOKEN}`, ...json } },
    { name: 'F. postcode=SE1 9BB + Bearer', url: q({ postcode: 'SE1 9BB' }), headers: { Authorization: `Bearer ${TOKEN}`, ...json } },
  ]
}

async function probe(v: Variant): Promise<boolean> {
  console.log(`\n── ${v.name}`)
  console.log(`   URL: ${v.url}`)
  console.log(`   Auth header: ${Object.keys(v.headers).filter((h) => h !== 'Accept').join(', ') || '(none)'}`)
  let res: Response
  try {
    res = await fetch(v.url, { headers: v.headers, redirect: 'manual' })
  } catch (err) {
    console.log(`   ✗ connection failed: ${(err as Error).message}`)
    return false
  }
  const ct = res.headers.get('content-type') ?? '(none)'
  const loc = res.headers.get('location')
  const body = await res.text().catch(() => '')
  const html = looksLikeHtml(ct, body)

  console.log(`   status: ${res.status} ${res.statusText} · content-type: ${ct}`)
  if (loc) console.log(`   → Location: ${loc}`)

  if (!html) {
    try {
      const parsed: unknown = JSON.parse(body)
      const rows = extractRows(parsed)
      const topKeys =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? Object.keys(parsed as Record<string, unknown>).join(', ')
          : '(array)'
      console.log(`   ✓ JSON · top-level keys: ${topKeys} · rows found: ${rows.length}`)
      if (rows.length) {
        console.log(`   row[0] field names: ${Object.keys(rows[0]).join(', ')}`)
        console.log(`   row[0]: ${JSON.stringify(rows[0]).slice(0, BODY_SNIPPET_LEN)}`)
      }
      return true
    } catch {
      console.log(`   (not valid JSON)`)
    }
  }
  console.log(`   body[0..${BODY_SNIPPET_LEN}]: ${snippet(body)}`)
  return false
}

async function main() {
  console.log('EPC probe — new service')
  console.log(`Host: ${HOST}`)
  console.log(`Endpoint: ${BASE}`)
  console.log(`EPC_API_KEY: ${TOKEN ? `${TOKEN.slice(0, 4)}…${TOKEN.slice(-4)} (len ${TOKEN.length})` : '(NOT SET)'}`)
  if (!TOKEN) {
    console.log('\nSet EPC_API_KEY in .env before probing.')
    return
  }

  const worked: string[] = []
  for (const v of variants()) if (await probe(v)) worked.push(v.name)

  console.log(`
──────────────────────────────────────────────────────────────
Variants that returned JSON: ${worked.length ? worked.join(' | ') : 'NONE'}

How to read this:
  · If A works and B doesn't → the new service is Bearer. Leave EPC_AUTH_SCHEME unset.
  · If B works and A doesn't → set EPC_AUTH_SCHEME=basic in .env (as the old API needed).
  · If C works → the API uses an x-api-key header; tell me and I'll wire that scheme.
  · If D (no auth) works → the endpoint is open; auth is optional for search.
  · Paste the "row[0] field names" line back and I'll pin epc.ts's field
    mapping to the real shape instead of the tolerant guesses.`)
}

main().catch((err) => {
  console.error('\nProbe failed: ' + (err as Error).message)
  process.exit(1)
})
