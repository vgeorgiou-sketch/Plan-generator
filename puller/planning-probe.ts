/*
  Planning source probe.

  Root-caused via TWO rounds of live testing on the user's actual office
  machine (never guessed from here):
    Round 1 (curl): the network and machine are fine — curl succeeds, gets
      a 200 and a JSESSIONID cookie. Node's fetch fails at the connection
      level. Curl's Windows Schannel backend showed "failed to decrypt
      data, need more data" but recovered; this first looked like a
      NetScaler TLS-1.3 interop bug (X-Via-NSCOPI header, NSC_ cookie).
    Round 2 (all six TLS_VARIANTS tested, including cert-bypass): ALL SIX
      failed on the real machine, which rules out a pure protocol/cipher
      fix — rejectUnauthorized:false should sidestep a protocol mismatch,
      so something else is going on. Revised diagnosis: a corporate
      TLS-inspection proxy re-signs HTTPS with an internal root CA that
      Windows/curl (Schannel, backed by the OS cert store) trusts but
      Node's bundled OpenSSL CA store does not — also explaining why
      planning.data.gov.uk (likely on the inspection bypass list) worked
      while planning.southwark.gov.uk didn't. See netEnv.ts's file header
      for the full reasoning, including the honest caveat about what the
      cert-bypass failure doesn't fully explain.

  This probe:
    1. Checks planning.data.gov.uk (background signal only, not the fix).
    2. Reports proxy detection (kept — a real fix for a DIFFERENT office,
       even though it wasn't this one's actual cause).
    3. Runs every TLS variant (via allTlsVariants() — the corporate-CA-cert
       fix FIRST if PLANNING_CA_CERT_PATH/NODE_EXTRA_CA_CERTS is set, then
       the protocol/cipher fallbacks, including the insecure,
       certificate-bypass one — diagnostic ONLY, clearly marked, never
       auto-adopted) against the bare host and reports which one(s)
       actually complete a handshake — direct evidence, not a guess.
    4. Tests --use-system-ca (Node 22.9+) in a CHILD process, since that's
       a boot-time flag this already-running process can't apply to
       itself — the direct answer to "does trusting the whole Windows
       cert store fix it" without requiring an exported cert file first.
    5. User-Agent sensitivity, using whichever dispatcher won step 3.
    6. Runs the REAL checkPlanningForAddress (which now auto-resolves
       proxy/TLS — corporate-CA-cert fix included — and acquires + threads
       the session cookie — see planning.ts) against both known addresses
       and checks for the exact manually-confirmed reference.

  Run: node --experimental-strip-types puller/planning-probe.ts
  For step 3's corporate-CA fix to be tested, export the corporate root
  cert (see puller/README.md) and set PLANNING_CA_CERT_PATH first.
  Needs no API key. Nothing here is parsed blindly or trusted silently.
*/

import { candidateEntityUrls } from './planningDataGovUk.ts'
import { checkPlanningForAddress } from './planning.ts'
import { allTlsVariants, detectProxyUrl, BOT_USER_AGENT, BROWSER_USER_AGENT } from './netEnv.ts'
import { BODY_SNIPPET_LEN, snippet } from './jsonResponse.ts'
import { IDOX_BASE } from './idox.ts'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from 'undici'

const execFileAsync = promisify(execFile)

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

/** Test EVERY variant (including the insecure one, and the corporate-CA
 *  fix if configured) independently — this duplicates resolveWorkingTlsAgent's
 *  list deliberately, so the probe can report ALL outcomes for
 *  transparency, not just the first winner. */
async function probeTlsVariants(): Promise<TlsProbeResult[]> {
  const variants = allTlsVariants()
  console.log(`\n${'═'.repeat(70)}\nTLS variants against ${PROBE_TARGET}\n`)
  if (!variants.some((v) => v.name.startsWith('corporate root CA'))) {
    console.log('  (no PLANNING_CA_CERT_PATH/NODE_EXTRA_CA_CERTS set — the corporate-CA fix is not being tested here;')
    console.log('   see puller/README.md for how to export the corporate root cert, then set PLANNING_CA_CERT_PATH.)\n')
  }
  const results: TlsProbeResult[] = []
  for (const variant of variants) {
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

const USE_SYSTEM_CA_FLAG = '--use-system-ca'

/**
 * --use-system-ca is a boot-time Node flag (makes Node trust the OS cert
 * store, same as curl's Schannel backend on Windows) — this process is
 * already running without it, so the only honest way to test it is to
 * spawn a fresh child process WITH it and see if that one connects where
 * this process's default (and every TLS_VARIANT) failed.
 */
async function probeUseSystemCaFlag(target: string): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\n--use-system-ca (Node 22.9+) — tested in a child process, a boot-time flag\n`)

  if (!process.allowedNodeEnvironmentFlags.has(USE_SYSTEM_CA_FLAG)) {
    console.log(`  ✗ this Node version (${process.version}) does not recognise ${USE_SYSTEM_CA_FLAG} — need 22.9+. Skipped.`)
    return
  }

  const scriptPath = join(tmpdir(), `planning-probe-use-system-ca-${process.pid}.mjs`)
  writeFileSync(
    scriptPath,
    [
      'const target = process.argv[2]',
      'try {',
      "  const res = await fetch(target, { method: 'HEAD' })",
      "  process.stdout.write('CONNECTED:' + res.status)",
      '} catch (err) {',
      "  process.stdout.write('FAILED:' + err.message)",
      '}',
    ].join('\n'),
  )
  try {
    const { stdout } = await execFileAsync('node', [USE_SYSTEM_CA_FLAG, scriptPath, target], { timeout: 15_000 })
    if (stdout.startsWith('CONNECTED:')) {
      console.log(`  ✓ CONNECTED — HTTP ${stdout.slice('CONNECTED:'.length)}`)
      console.log(`  → CONFIRMED: running with ${USE_SYSTEM_CA_FLAG} fixes this. Simplest option if you don't want to`)
      console.log('    export a cert file — but it trusts the WHOLE Windows store, not just this one root, and only')
      console.log('    applies while you remember to pass the flag (or set NODE_OPTIONS=--use-system-ca).')
    } else {
      console.log(`  ✗ failed — ${stdout || '(no output)'}`)
      console.log('  → --use-system-ca alone did not fix it here. Note this child process did NOT go through this')
      console.log('    codebase\'s proxy handling — if a proxy is also required on this network, that alone could')
      console.log('    explain this failure independent of the CA-trust question.')
    }
  } catch (err) {
    console.log(`  ✗ child process failed: ${(err as Error).message}`)
  } finally {
    unlinkSync(scriptPath)
  }
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

  if (winner?.name.startsWith('corporate root CA')) {
    console.log(`\n→ CONFIRMED: the corporate-CA-cert fix connects. Keep PLANNING_CA_CERT_PATH (or NODE_EXTRA_CA_CERTS)`)
    console.log('  set whenever you run this — resolveWorkingTlsAgent() then finds and uses it automatically.')
  } else if (winner) {
    console.log(`\n→ CONFIRMED: "${winner.name}" connects. resolveWorkingTlsAgent() will find and use this automatically — no config needed.`)
  } else if (insecureOnly) {
    console.log('\n→ Only the certificate-bypass variant connected, and no corporate-CA-cert was configured to test.')
    console.log('  This points strongly at a certificate-trust problem (an inspection proxy re-signing with an')
    console.log('  internal CA) rather than a protocol/cipher one — do NOT ship rejectUnauthorized:false. Export the')
    console.log('  corporate root cert (see puller/README.md), set PLANNING_CA_CERT_PATH, and re-run this probe.')
  } else {
    console.log('\n→ Nothing connected, not even the diagnostic-only certificate-bypass variant. That rules out a')
    console.log('  simple cert-trust problem too — check whether --use-system-ca (below) fixes it, since that trusts')
    console.log('  the OS store directly rather than an explicitly-appended cert.')
  }

  await probeUseSystemCaFlag(PROBE_TARGET)
  await probeUserAgent(winner?.agent)

  console.log(`\n${'═'.repeat(70)}\nRunning the real check (auto TLS/proxy/session) against both known cases:`)
  for (const address of ADDRESSES) await probeKnownCase(address)

  console.log(`\n${'═'.repeat(70)}`)
  console.log('Both known cases pass when the known reference is FOUND: 26/00849/OBS for')
  console.log('Southwark Bridge Road, 23/AP/3411 for 68 Borough Road. If they now pass,')
  console.log('planning.ts is confirmed working end to end — sweep.ts and planningCheck.ts')
  console.log('use the exact same checkPlanningForAddress path, so they benefit too.')
  console.log('\nIf nothing above passes: the corporate-CA-cert fix (PLANNING_CA_CERT_PATH) and --use-system-ca')
  console.log('are the two live candidates for a TLS-inspection-proxy cause — see puller/README.md for how to')
  console.log('export the corporate root cert on Windows if you have not tried that yet.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nProbe failed: ' + (err as Error).message)
    process.exit(1)
  })
}
