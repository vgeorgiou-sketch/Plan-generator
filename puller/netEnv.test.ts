/*
  Run: node --experimental-strip-types puller/netEnv.test.ts
  Proves proxy-env detection, TLS-variant auto-resolution (including the
  corporate-CA-cert fix, tried first when configured), and cookie
  extraction offline — the env vars are read correctly, the resolver tries
  variants in order and caches per host, the insecure variant is NEVER
  attempted automatically, and cookie extraction correctly separates
  multiple Set-Cookie headers (a NetScaler persistence cookie alongside a
  JSESSIONID) rather than losing one to a naive comma-join.
*/

import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  allTlsVariants,
  collectCookiePairs,
  CORPORATE_CA_CERT_PATH_ENV,
  detectProxyUrl,
  readCorporateCaVariant,
  resolveWorkingTlsAgent,
  TLS_VARIANTS,
} from './netEnv.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

const ENV_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] as const
const saved: Record<string, string | undefined> = {}
for (const k of ENV_KEYS) saved[k] = process.env[k]
function clearAll() {
  for (const k of ENV_KEYS) delete process.env[k]
}

// The sandbox this runs in sets NODE_EXTRA_CA_CERTS for its own agent
// proxy, and a real office run would set PLANNING_CA_CERT_PATH — both
// would otherwise make the corporate-CA variant appear unpredictably in
// the resolver tests below. Pin both to a known state, restore at the end.
const CA_ENV_KEYS = [CORPORATE_CA_CERT_PATH_ENV, 'NODE_EXTRA_CA_CERTS'] as const
const savedCaEnv: Record<string, string | undefined> = {}
for (const k of CA_ENV_KEYS) savedCaEnv[k] = process.env[k]
function clearCaEnv() {
  for (const k of CA_ENV_KEYS) delete process.env[k]
}
clearCaEnv()

console.log('proxy env detection')
try {
  clearAll()
  assert('no env vars set → undefined, not a guessed default', detectProxyUrl() === undefined)

  clearAll()
  process.env.HTTPS_PROXY = 'http://proxy.office.local:8080'
  assert('HTTPS_PROXY is read', detectProxyUrl() === 'http://proxy.office.local:8080')

  clearAll()
  process.env.https_proxy = 'http://lowercase.local:8080'
  assert('lowercase https_proxy is also read (curl/wget convention)', detectProxyUrl() === 'http://lowercase.local:8080')

  clearAll()
  process.env.HTTP_PROXY = 'http://fallback.local:3128'
  assert('HTTP_PROXY works when HTTPS_PROXY is absent', detectProxyUrl() === 'http://fallback.local:3128')

  clearAll()
  process.env.HTTPS_PROXY = 'http://preferred.local:8080'
  process.env.HTTP_PROXY = 'http://other.local:3128'
  assert('HTTPS_PROXY takes precedence over HTTP_PROXY when both are set', detectProxyUrl() === 'http://preferred.local:8080')
} finally {
  clearAll()
  for (const k of ENV_KEYS) if (saved[k] !== undefined) process.env[k] = saved[k]
}

console.log('\nTLS_VARIANTS shape')
{
  const insecure = TLS_VARIANTS.filter((v) => v.insecure)
  assert('exactly one variant is flagged insecure', insecure.length === 1, insecure)
  assert('the insecure variant is the certificate-bypass one', insecure[0]?.connect?.rejectUnauthorized === false, insecure[0])
  assert('at least one safe variant forces TLS 1.2 (the documented NetScaler fix)', TLS_VARIANTS.some((v) => !v.insecure && v.connect?.maxVersion === 'TLSv1.2'))
}

console.log('\nreadCorporateCaVariant / allTlsVariants — the corporate-CA fix, tried first when configured')
{
  assert('no PLANNING_CA_CERT_PATH or NODE_EXTRA_CA_CERTS set → undefined, not a guessed default', readCorporateCaVariant() === undefined)
  assert('allTlsVariants() falls back to TLS_VARIANTS unchanged when unconfigured', allTlsVariants() === TLS_VARIANTS)

  process.env[CORPORATE_CA_CERT_PATH_ENV] = '/definitely/does/not/exist.pem'
  assert('an unreadable cert path is skipped, not silently "succeeding"', readCorporateCaVariant() === undefined)
  clearCaEnv()

  const certPath = join(tmpdir(), `netEnv-test-corporate-ca-${process.pid}.pem`)
  const FAKE_PEM = '-----BEGIN CERTIFICATE-----\nFAKEFAKEFAKE\n-----END CERTIFICATE-----\n'
  writeFileSync(certPath, FAKE_PEM)
  try {
    process.env[CORPORATE_CA_CERT_PATH_ENV] = certPath
    const variant = readCorporateCaVariant()
    assert('a readable cert path produces a variant', variant !== undefined, variant)
    assert('the variant is not flagged insecure', variant?.insecure !== true)
    assert('ca includes both the standard root store and the corporate cert', Array.isArray(variant?.connect?.ca) && (variant!.connect!.ca as string[]).includes(FAKE_PEM))

    const all = allTlsVariants()
    assert('allTlsVariants() puts the corporate-CA variant FIRST', all[0]?.name === variant?.name && !all[0]?.insecure)
    assert('the rest of TLS_VARIANTS still follows, in order', JSON.stringify(all.slice(1)) === JSON.stringify(TLS_VARIANTS))

    clearCaEnv()
    process.env.NODE_EXTRA_CA_CERTS = certPath
    assert('NODE_EXTRA_CA_CERTS is honoured as a fallback to the dedicated env var', readCorporateCaVariant() !== undefined)
  } finally {
    clearCaEnv()
    unlinkSync(certPath)
  }
}

console.log('\nresolveWorkingTlsAgent — tries variants until one connects, NEVER the insecure one')
{
  const originalFetch = globalThis.fetch
  let callCount = 0
  // Every SAFE variant "fails" (simulating a handshake error); if the
  // insecure variant were ever tried, this mock would still throw for it
  // too (it isn't special-cased to succeed), so a false pass is impossible.
  globalThis.fetch = async () => {
    callCount++
    throw new Error('simulated: failed to decrypt data, need more data')
  }

  try {
    const agent = await resolveWorkingTlsAgent('https://never-connects.invalid.test/')
    assert('returns undefined when nothing works', agent === undefined)
    assert('tried exactly the SAFE variants (5), never the 6th insecure one', callCount === TLS_VARIANTS.filter((v) => !v.insecure).length, callCount)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\nresolveWorkingTlsAgent — adopts the first variant that connects, and caches per host')
{
  const originalFetch = globalThis.fetch
  let callCount = 0
  const WINNING_ATTEMPT = 2 // simulate: default fails, "force TLS 1.2" succeeds
  globalThis.fetch = async () => {
    callCount++
    if (callCount < WINNING_ATTEMPT) throw new Error('simulated handshake failure')
    return { body: null } as unknown as Response
  }

  try {
    const agent = await resolveWorkingTlsAgent('https://sometimes-connects.invalid.test/')
    assert('returns a real Agent once one variant succeeds', agent !== undefined, agent)
    assert('stopped trying once one worked (did not exhaust all variants)', callCount === WINNING_ATTEMPT, callCount)

    const before = callCount
    const cached = await resolveWorkingTlsAgent('https://sometimes-connects.invalid.test/')
    assert('a second call for the SAME host reuses the cached result — no new fetch calls', callCount === before, { before, after: callCount })
    assert('the cached agent is the same instance', cached === agent)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\nresolveWorkingTlsAgent — tries the corporate-CA variant FIRST when configured')
{
  const certPath = join(tmpdir(), `netEnv-test-resolve-corporate-ca-${process.pid}.pem`)
  writeFileSync(certPath, '-----BEGIN CERTIFICATE-----\nFAKEFAKEFAKE\n-----END CERTIFICATE-----\n')
  const originalFetch = globalThis.fetch
  let callCount = 0
  globalThis.fetch = async () => {
    callCount++
    return { body: null } as unknown as Response // the very first attempt "succeeds"
  }

  try {
    process.env[CORPORATE_CA_CERT_PATH_ENV] = certPath
    const agent = await resolveWorkingTlsAgent('https://corporate-ca-first.invalid.test/')
    assert('connects on the first attempt — the corporate-CA variant, not a protocol fallback', callCount === 1, callCount)
    assert('returns a real Agent (not the untouched-default undefined)', agent !== undefined)
  } finally {
    globalThis.fetch = originalFetch
    clearCaEnv()
    unlinkSync(certPath)
  }
}

console.log('\ncollectCookiePairs — separates multiple Set-Cookie headers (NetScaler persistence + JSESSIONID)')
{
  const withCookies = {
    headers: { getSetCookie: () => ['JSESSIONID=ABC123; Path=/online-applications/; HttpOnly', 'NSC_mc=xyz789; path=/; Secure; HttpOnly'] },
  } as unknown as Response
  assert(
    'both name=value pairs are extracted, attributes (Path/Secure/HttpOnly) stripped',
    JSON.stringify(collectCookiePairs(withCookies)) === JSON.stringify(['JSESSIONID=ABC123', 'NSC_mc=xyz789']),
    collectCookiePairs(withCookies),
  )

  const noCookies = { headers: { getSetCookie: () => [] } } as unknown as Response
  assert('no Set-Cookie header at all → empty array, not a crash', collectCookiePairs(noCookies).length === 0)

  const noMethodAtAll = { headers: {} } as unknown as Response
  assert('a Headers-like object with no getSetCookie at all → empty array, not a crash', collectCookiePairs(noMethodAtAll).length === 0)
}

for (const k of CA_ENV_KEYS) if (savedCaEnv[k] !== undefined) process.env[k] = savedCaEnv[k]

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
