/*
  Planning source probe.

  Root-caused via a live curl diagnosis against the real site (not guessed):
  the network and machine are fine — curl succeeds, gets a 200 and a
  JSESSIONID cookie. Node's fetch fails with a connection-level error
  because of a TLS-negotiation incompatibility between Node/undici's
  OpenSSL-based stack and a Citrix NetScaler in front of the origin
  (X-Via-NSCOPI header, NSC_ cookie) — curl's Windows Schannel backend
  silently recovers from the same handshake hiccup ("failed to decrypt
  data, need more data"); OpenSSL does not. See netEnv.ts's file header.

  This probe:
    1. Checks planning.data.gov.uk (unrelated to the TLS issue below).
    2. Reports proxy detection (kept — a real fix for a DIFFERENT office,
       even though it wasn't this one's actual cause).
    3. Runs every TLS_VARIANT (including the insecure, certificate-bypass
       one — diagnostic ONLY, clearly marked, never auto-adopted) against
       the bare host and reports which one(s) actually complete a
       handshake — this is the direct answer to "which TLS config
       connects", not a guess.
    4. User-Agent sensitivity, using whichever dispatcher won step 3.
    5. Runs the REAL checkPlanningForAddress (which now auto-resolves
       proxy/TLS and acquires + threads the session cookie — see
       planning.ts) against both known addresses and checks for the exact
       manually-confirmed reference.

  Run: node --experimental-strip-types puller/planning-probe.ts
  Needs no API key. Nothing here is parsed blindly or trusted silently.
*/

import { candidateEntityUrls } from './planningDataGovUk.ts'
import { checkPlanningForAddress } from './planning.ts'
import { detectProxyUrl, TLS_VARIANTS, BOT_USER_AGENT, BROWSER_USER_AGENT } from './netEnv.ts'
import { BODY_SNIPPET_LEN, snippet } from './jsonResponse.ts'
import { IDOX_BASE } from './idox.ts'
import { fileURLToPath } from 'node:url'
import { Agent } from 'undici'

const ADDRESSES = ['38-48 Southwark Bridge Road', '68 Borough Road']
const KNOWN_REFS: Record<string, string> = { '38-48 Southwark Bridge Road': '26/00849/OBS', '68 Borough Road': '23/AP/3411' }
const PROBE_TARGET = `${IDOX_BASE}/`

async function probePlanningDataGovUk(): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\nSource: planning.data.gov.uk (national platform — unrelated to the TLS issue below)\n`)
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

interface TlsProbeResult {
  name: string
  agent?: Agent
  connected: boolean
  status?: number
  error?: string
}

/** Test EVERY variant (including the insecure one) independently — this
 *  duplicates resolveWorkingTlsAgent's list deliberately, so the probe can
 *  report ALL outcomes for transparency, not just the first winner. */
async function probeTlsVariants(): Promise<TlsProbeResult[]> {
  console.log(`\n${'═'.repeat(70)}\nTLS variants against ${PROBE_TARGET}\n`)
  const results: TlsProbeResult[] = []
  for (const variant of TLS_VARIANTS) {
    const label = variant.insecure ? `${variant.name}` : variant.name
    const agent = variant.connect ? new Agent({ connect: variant.connect }) : undefined
    try {
      const res = await fetch(PROBE_TARGET, {
        method: 'HEAD',
        headers: { 'User-Agent': BOT_USER_AGENT },
        ...(agent ? { dispatcher: agent } : {}),
      } as RequestInit)
      console.log(`  ✓ CONNECTED — ${label} (HTTP ${res.status})`)
      results.push({ name: variant.name, agent, connected: true, status: res.status })
      if (res.body) await res.body.cancel().catch(() => {})
    } catch (err) {
      console.log(`  ✗ failed     — ${label}: ${(err as Error).message}`)
      results.push({ name: variant.name, agent, connected: false, error: (err as Error).message })
    }
  }
  return results
}

async function probeUserAgent(dispatcher: Agent | undefined): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\nUser-Agent sensitivity (using whichever TLS variant connected above)\n`)
  for (const [label, ua] of [['Bot UA', BOT_USER_AGENT] as const, ['Browser UA', BROWSER_USER_AGENT] as const]) {
    try {
      const res = await fetch(PROBE_TARGET, {
        method: 'HEAD',
        headers: { 'User-Agent': ua },
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit)
      console.log(`  ${label}: HTTP ${res.status}`)
      if (res.body) await res.body.cancel().catch(() => {})
    } catch (err) {
      console.log(`  ${label}: ✗ ${(err as Error).message}`)
    }
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
  console.log(proxyUrl ? `HTTPS_PROXY detected: ${proxyUrl} (applied automatically by planning.ts)` : 'No HTTPS_PROXY/HTTP_PROXY set — not needed for the TLS issue this probe diagnosed, but keep in mind for other networks.')

  const tlsResults = await probeTlsVariants()
  const winner = tlsResults.find((r) => r.connected && !r.name.startsWith('[DIAGNOSTIC'))
  const insecureOnly = !winner && tlsResults.find((r) => r.connected)

  if (winner) {
    console.log(`\n→ CONFIRMED: "${winner.name}" connects. resolveWorkingTlsAgent() will find and use this automatically — no config needed.`)
  } else if (insecureOnly) {
    console.log('\n→ Only the certificate-bypass variant connected. This means the failure is a CERTIFICATE problem,')
    console.log('  not a protocol/cipher one — do NOT ship rejectUnauthorized:false. Paste this output back so the')
    console.log('  real fix (adding the correct CA, or checking for an intercepting corporate root cert) can be found.')
  } else {
    console.log('\n→ Nothing connected, including the diagnostic-only variant. This is not the TLS issue previously')
    console.log('  diagnosed for this host — paste this full output back for a fresh diagnosis.')
  }

  await probeUserAgent(winner?.agent)

  console.log(`\n${'═'.repeat(70)}\nRunning the real check (auto TLS/proxy/session) against both known cases:`)
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
