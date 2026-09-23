/*
  Run: node --experimental-strip-types puller/netEnv.test.ts
  Proves proxy-env detection offline — the env vars are read correctly and
  in the right precedence, without touching the network.
*/

import { detectProxyUrl } from './netEnv.ts'

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

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
