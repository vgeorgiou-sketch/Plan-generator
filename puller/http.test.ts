/*
  Run: node --experimental-strip-types puller/http.test.ts
  Proves the failure classifier distinguishes egress denial from credential
  rejection — the whole point of the tightening.
*/

import { describeHttpFailure, describeNetworkThrow } from './http.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

const base = { service: 'Companies House', host: 'api.company-information.service.gov.uk', path: '/search/companies' }

console.log('403 attribution')
{
  const proxied = describeHttpFailure({ ...base, status: 403, proxied: true })
  assert('proxied 403 reads as egress blocked', /egress blocked/i.test(proxied), proxied)
  assert('proxied 403 says the request never reached the API', /never reached/i.test(proxied))
  assert('proxied 403 explicitly clears the credentials', /not a credentials problem/i.test(proxied))
  assert('proxied 403 does NOT blame the key', !/reject|invalid key/i.test(proxied))

  const direct = describeHttpFailure({ ...base, status: 403, proxied: false, credHint: 'Use a REST API key.' })
  assert('un-proxied 403 reads as a real Forbidden', /403 Forbidden/i.test(direct), direct)
  assert('un-proxied 403 is not called egress', !/egress blocked/i.test(direct))
}

console.log('\n401 vs 403')
{
  const unauth = describeHttpFailure({ ...base, status: 401, proxied: true, credHint: 'Use a REST API key (set CH_API_KEY).' })
  // 401 is a genuine API rejection even behind a proxy — the request DID reach the API.
  assert('401 reads as credentials rejected', /rejected the credentials/i.test(unauth), unauth)
  assert('401 is not misread as egress', !/egress blocked/i.test(unauth))
  assert('401 surfaces the credential hint', /set CH_API_KEY/i.test(unauth))
}

console.log('\nrate limit + generic')
{
  assert('429 reads as rate limit', /rate limit/i.test(describeHttpFailure({ ...base, status: 429, proxied: false })))
  const g = describeHttpFailure({ ...base, status: 500, proxied: false, body: '<html>Internal error</html>' })
  assert('unknown status includes status + body snippet', /500/.test(g) && /Internal error/.test(g), g)
}

console.log('\nnetwork throw')
{
  const proxied = describeNetworkThrow('EPC Open Data', 'epc.opendatacommunities.org', '?postcode=SE1', new Error('fetch failed'))
  // Only meaningful when a proxy is actually configured in this process env.
  assert('names the host to run against', /epc\.opendatacommunities\.org/.test(proxied))
  assert('carries the underlying cause', /fetch failed/.test(proxied))
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
