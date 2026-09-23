/*
  Run: node --experimental-strip-types puller/netEnv.test.ts
  Proves proxy-env detection, TLS-variant auto-resolution, and cookie
  extraction offline — the env vars are read correctly, the resolver tries
  variants in order and caches per host, the insecure variant is NEVER
  attempted automatically, and cookie extraction correctly separates
  multiple Set-Cookie headers (a NetScaler persistence cookie alongside a
  JSESSIONID) rather than losing one to a naive comma-join.
*/

import { collectCookiePairs, detectProxyUrl, resolveWorkingTlsAgent, TLS_VARIANTS } from './netEnv.ts'

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

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
