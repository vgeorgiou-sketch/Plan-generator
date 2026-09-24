/*
  Run: node --experimental-strip-types puller/netEnv.test.ts
  Proves proxy-env detection, the --use-system-ca flag check, and cookie
  extraction offline — the env vars are read correctly, hasUseSystemCaFlag()
  reports the CURRENT process's flags accurately, and cookie extraction
  correctly separates multiple Set-Cookie headers (a NetScaler persistence
  cookie alongside a JSESSIONID) rather than losing one to a naive
  comma-join.
*/

import { collectCookiePairs, detectProxyUrl, hasUseSystemCaFlag } from './netEnv.ts'

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

console.log('\nhasUseSystemCaFlag — reports the CURRENT process accurately')
{
  const savedNodeOptions = process.env.NODE_OPTIONS
  try {
    const actuallyPassed = process.execArgv.includes('--use-system-ca')
    delete process.env.NODE_OPTIONS
    assert(
      `matches whether THIS run was started with --use-system-ca (it was${actuallyPassed ? '' : ' not'})`,
      hasUseSystemCaFlag() === actuallyPassed,
      { execArgv: process.execArgv },
    )

    process.env.NODE_OPTIONS = '--use-system-ca'
    assert('also true when set via NODE_OPTIONS', hasUseSystemCaFlag() === true)

    process.env.NODE_OPTIONS = '--max-old-space-size=4096'
    assert('an unrelated NODE_OPTIONS value does not false-positive', hasUseSystemCaFlag() === actuallyPassed)
  } finally {
    if (savedNodeOptions === undefined) delete process.env.NODE_OPTIONS
    else process.env.NODE_OPTIONS = savedNodeOptions
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
