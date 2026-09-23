/*
  Planning source probe.

  Root-caused via live testing on the user's actual office machine (never
  guessed from here): curl succeeds against planning.southwark.gov.uk,
  Node's fetch fails at the connection level. It first looked like a
  Citrix NetScaler TLS-negotiation bug, but every protocol/cipher
  adjustment tried — including a certificate-bypass variant that should
  sidestep a pure protocol mismatch — still failed. The real cause: a
  corporate TLS-inspection proxy re-signs HTTPS with an internal root CA
  that Windows/curl trust (via the OS certificate store) but Node's
  bundled OpenSSL CA store does not.

  CONFIRMED FIX: running node with --use-system-ca (Node 22.9+) makes Node
  trust the OS store too — proven live, this probe's connectivity check
  went from failing to "CONNECTED, HTTP 200" once the flag was added. See
  puller/README.md's run commands, which all carry it now. See netEnv.ts's
  file header for the full diagnostic history.

  This probe:
    1. Checks planning.data.gov.uk (background signal only).
    2. Reports proxy detection (a real fix for a DIFFERENT office network).
    3. Warns if THIS process was started WITHOUT --use-system-ca (it can't
       apply a boot-time flag to itself, only report whether it's missing).
    4. Runs the REAL checkPlanningForAddress (proxy-aware, acquires +
       threads the session cookie — see planning.ts) against both known
       addresses and checks for the exact manually-confirmed reference.

  Run: node --use-system-ca --experimental-strip-types puller/planning-probe.ts
  Needs no API key. Nothing here is parsed blindly or trusted silently.
*/

import { candidateEntityUrls } from './planningDataGovUk.ts'
import { checkPlanningForAddress } from './planning.ts'
import { detectProxyUrl, hasUseSystemCaFlag } from './netEnv.ts'
import { BODY_SNIPPET_LEN, snippet } from './jsonResponse.ts'
import { IDOX_BASE } from './idox.ts'
import { fileURLToPath } from 'node:url'

const ADDRESSES = ['38-48 Southwark Bridge Road', '68 Borough Road']
const KNOWN_REFS: Record<string, string> = { '38-48 Southwark Bridge Road': '26/00849/OBS', '68 Borough Road': '23/AP/3411' }
const PROBE_TARGET = `${IDOX_BASE}/`

async function probePlanningDataGovUk(): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\nSource: planning.data.gov.uk (national platform — background signal only)\n`)
  for (const c of candidateEntityUrls()) {
    console.log(`── ${c.name}\n   URL: ${c.url}\n   Answers: ${c.answers}`)
    try {
      const res = await fetch(c.url, { headers: { Accept: 'application/json' } })
      const body = await res.text().catch(() => '')
      console.log(`   status: ${res.status}`)
      try {
        const parsed = JSON.parse(body)
        console.log(`   ✓ JSON. Top-level: ${Array.isArray(parsed) ? `array[${parsed.length}]` : Object.keys(parsed).join(', ')}`)
      } catch {
        console.log(`   body[0..${BODY_SNIPPET_LEN}]: ${snippet(body)}`)
      }
    } catch (err) {
      console.log(`   ✗ request failed: ${(err as Error).message}`)
    }
    console.log('')
  }
}

/**
 * A direct connectivity check against the real host — the same signal
 * "default (Node/undici untouched) — CONNECTED, HTTP 200" that confirmed
 * --use-system-ca as the fix. If this fails and the flag is missing,
 * that's almost certainly why; if it fails WITH the flag present, this is
 * a fresh diagnosis, not the corporate-TLS-inspection issue already found.
 */
async function probeConnectivity(): Promise<boolean> {
  console.log(`\n${'═'.repeat(70)}\nDirect connectivity to ${PROBE_TARGET}\n`)
  try {
    const res = await fetch(PROBE_TARGET, { method: 'HEAD' })
    console.log(`  ✓ CONNECTED — HTTP ${res.status}`)
    if (res.body) await res.body.cancel().catch(() => {})
    return true
  } catch (err) {
    console.log(`  ✗ failed — ${(err as Error).message}`)
    return false
  }
}

async function probeKnownCase(address: string): Promise<void> {
  const knownRef = KNOWN_REFS[address]
  console.log(`\n${'═'.repeat(70)}\n${address} — known answer: ${knownRef}\n`)
  const result = await checkPlanningForAddress(address)

  if (!result.checked) {
    console.log(`⚠ COULD NOT CHECK — ${result.error}`)
    return
  }
  console.log(`(searched via: ${result.variantsUsed.join(' + ')})`)
  if (result.dateSpan) console.log(`date span: ${result.dateSpan.earliest} .. ${result.dateSpan.latest}`)

  const found = result.matches.find((m) => m.reference === knownRef)
  console.log(`${result.matches.length} matching application(s):`)
  for (const m of result.matches) {
    console.log(`  · ${m.reference || '(no ref)'} [${m.applicationType}] ${m.dateText ?? '(no date)'} — ${m.description}${m === found ? '  ← known answer' : ''}`)
  }
  console.log(found ? `\n→ PASS — ${knownRef} found and correctly classified as ${found.applicationType}.` : `\n→ FAIL — ${knownRef} was not among the matches.`)
}

async function main() {
  await probePlanningDataGovUk()

  console.log(`\n${'═'.repeat(70)}\nProxy detection\n`)
  const proxyUrl = detectProxyUrl()
  console.log(proxyUrl ? `HTTPS_PROXY detected: ${proxyUrl} (applied automatically by planning.ts)` : 'No HTTPS_PROXY/HTTP_PROXY set.')

  console.log(`\n${'═'.repeat(70)}\n--use-system-ca (Node 22.9+) — the confirmed fix for this network\n`)
  if (hasUseSystemCaFlag()) {
    console.log('  ✓ this process was started with --use-system-ca.')
  } else {
    console.log(`  ✗ this process was NOT started with --use-system-ca (running Node ${process.version}).`)
    console.log('    On a corporate network with TLS inspection, Node needs to trust the OS certificate')
    console.log('    store the same way curl/the browser does. Re-run with the flag — see puller/README.md.')
  }

  const connected = await probeConnectivity()
  if (!connected && !hasUseSystemCaFlag()) {
    console.log('\n→ Connectivity failed and --use-system-ca was missing — almost certainly the same corporate')
    console.log('  TLS-inspection cause already confirmed. Re-run with --use-system-ca.')
  } else if (!connected) {
    console.log('\n→ Connectivity failed even WITH --use-system-ca. This is NOT the issue already diagnosed —')
    console.log('  paste this output back for a fresh diagnosis.')
  }

  console.log(`\n${'═'.repeat(70)}\nRunning the real check (auto proxy + session) against both known cases:`)
  for (const address of ADDRESSES) await probeKnownCase(address)

  console.log(`\n${'═'.repeat(70)}`)
  console.log('Both known cases pass when the known reference is FOUND: 26/00849/OBS for')
  console.log('Southwark Bridge Road, 23/AP/3411 for 68 Borough Road. If they now pass,')
  console.log('planning.ts is confirmed working end to end — sweep.ts and planningCheck.ts')
  console.log('use the exact same checkPlanningForAddress path, so they benefit too.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nProbe failed: ' + (err as Error).message)
    process.exit(1)
  })
}
