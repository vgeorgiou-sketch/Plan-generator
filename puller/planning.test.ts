/*
  Run: node --experimental-strip-types puller/planning.test.ts
  Proves the pure logic offline against the REAL, manually-verified data for
  both known cases (not fictional examples): date extraction, both confirmed
  Southwark reference formats, application-type classification, address
  matching, never fabricating a date, and — critically — that
  checkPlanningForAddress unions results across every search variant rather
  than stopping at the first, which is the actual fix for the brief's
  "nearly missed it with a 90-day default" warning.
*/

import { parseIdoxResultList, ukDateToIso, looksLikeIdoxResultsPage } from './idox.ts'
import {
  checkPlanningForAddress,
  classifyApplicationType,
  matchPlanningRows,
  planningSearchVariants,
  planningSignalForBuilding,
  APPLICATION_TYPE_STRENGTH,
  type MatchedPlanningRow,
} from './planning.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

// Every checkPlanningForAddress test below mocks globalThis.fetch and counts
// calls. planning.ts falls back to resolveWorkingTlsAgent() — which makes
// its OWN real fetch calls to probe TLS variants — whenever no proxy is
// configured. Whether that's true depends on the AMBIENT environment the
// test happens to run in (this very sandbox has one set), which would make
// call-count assertions flake by machine. Pin it: force a (fake, unused —
// fetch is fully mocked below, so nothing ever really connects through it)
// proxy so proxyDispatcher() always short-circuits resolveDispatcher(),
// keeping call counts deterministic regardless of the ambient environment.
const savedProxyEnv = { HTTPS_PROXY: process.env.HTTPS_PROXY, https_proxy: process.env.https_proxy }
process.env.HTTPS_PROXY = 'http://test-proxy.invalid:0'
delete process.env.https_proxy

// The REAL, manually-verified records for both known cases (not fictional).
// Southwark Bridge Road: ref 26/00849/OBS, 10 June 2026, change of use to
// co-living. The Ship: ref 23/AP/3411, 8 Dec 2023, tree works — its ONLY
// planning record ever. Markup shape must be re-checked against Southwark's
// live HTML before being trusted (see planning-probe.ts).
const RESULTS_HTML = `
<ul id="searchresults">
  <li class="searchresult">
    <a href="/online-applications/applicationDetails.do?keyVal=SBR2026">26/00849/OBS | Partial demolition, extension and change of use of existing building for co-living use</a>
    <p class="address">38-48 Southwark Bridge Road, London, SE1 9BB</p>
    <p class="metaInfo">Registered Date: 10/06/2026 | Status: Pending</p>
  </li>
  <li class="searchresult">
    <a href="/online-applications/applicationDetails.do?keyVal=SHIP2023">23/AP/3411 | Works to a Tree in a Conservation Area</a>
    <p class="address">68 Borough Road, London, SE1 1JX</p>
    <p class="metaInfo">Registered Date: 08/12/2023 | Status: Approved</p>
  </li>
  <li class="searchresult">
    <a href="/online-applications/applicationDetails.do?keyVal=NODATE1">99/XX/9999 | Application with unparseable metaInfo</a>
    <p class="address">1 Nowhere Street, SE1 0AA</p>
  </li>
</ul>`

console.log('Idox date extraction + BOTH confirmed reference formats')
{
  assert('UK date "10/06/2026" → ISO "2026-06-10"', ukDateToIso('10/06/2026') === '2026-06-10')
  assert('garbage does not parse to a fake date', ukDateToIso('not a date') === undefined)
  assert('looksLikeIdoxResultsPage recognises the results markup', looksLikeIdoxResultsPage(RESULTS_HTML))
  assert('a "no results" page also counts as a real (empty) results page', looksLikeIdoxResultsPage('<p>Your search found no results were found</p>'))
  assert('a login/session page does NOT look like a results page', !looksLikeIdoxResultsPage('<html><body>Please log in to continue</body></html>'))

  const rows = parseIdoxResultList(RESULTS_HTML)
  assert('parses all 3 rows', rows.length === 3, rows.length)
  assert('extracts the real reference 26/00849/OBS (YY/NNNNN/XXX shape)', rows[0].reference === '26/00849/OBS', rows[0].reference)
  assert('extracts the real reference 23/AP/3411 (YY/AP/NNNN shape)', rows[1].reference === '23/AP/3411', rows[1].reference)
  assert('extracts the metaInfo date for the real SBR row', rows[0].dateText === '10/06/2026', rows[0].dateText)
  assert('row with no metaInfo has no dateText, not a guessed one', rows[2].dateText === undefined)
}

console.log('\napplication-type classification')
{
  assert(
    'the REAL SBR description → changeOfUse',
    classifyApplicationType('Partial demolition, extension and change of use of existing building for co-living use') === 'changeOfUse',
  )
  assert('the REAL Ship description → treeWorks, not "other"', classifyApplicationType('Works to a Tree in a Conservation Area') === 'treeWorks')
  assert('"TPO" also classifies as treeWorks', classifyApplicationType('Application for a Tree Preservation Order') === 'treeWorks')
  assert('"advertisement consent" → advertisement', classifyApplicationType('Advertisement consent for signage') === 'advertisement')
  assert('"pre-application" → preApplication', classifyApplicationType('Pre-application enquiry for redevelopment') === 'preApplication')
  assert('"erection of" → full', classifyApplicationType('Erection of a part 6/8 storey building') === 'full')
  assert('"householder" → minor', classifyApplicationType('Householder application for a rear extension') === 'minor')
  assert('unmatched text → other, not a false positive', classifyApplicationType('Discharge of condition 4') === 'other')
  assert(
    'ranking: pre-app > change of use > tree works ≈ advertisement (routine, not development)',
    APPLICATION_TYPE_STRENGTH.preApplication > APPLICATION_TYPE_STRENGTH.changeOfUse &&
      APPLICATION_TYPE_STRENGTH.changeOfUse > APPLICATION_TYPE_STRENGTH.treeWorks &&
      APPLICATION_TYPE_STRENGTH.treeWorks === APPLICATION_TYPE_STRENGTH.advertisement,
  )
}

console.log('\naddress matching — the discriminator, reproducing the manually-confirmed answers')
{
  const rows = parseIdoxResultList(RESULTS_HTML)

  const sbrMatches = matchPlanningRows(rows, '38-48 Southwark Bridge Road SE1')
  assert('SBR address matches ONLY its own record (26/00849/OBS), not the pub\'s', sbrMatches.length === 1 && sbrMatches[0].reference === '26/00849/OBS', sbrMatches)
  assert('matched row is classified changeOfUse — must light the planning cell', sbrMatches[0].applicationType === 'changeOfUse')

  const shipMatches = matchPlanningRows(rows, '68 Borough Road SE1')
  assert('The Ship matches ONLY its own record (23/AP/3411), not SBR\'s', shipMatches.length === 1 && shipMatches[0].reference === '23/AP/3411', shipMatches)
  assert('the pub\'s only-ever record classifies as treeWorks — must NOT register as development', shipMatches[0].applicationType === 'treeWorks')
  assert(
    'the discriminator is reproduced: SBR\'s real record outranks the pub\'s real record in development-signal strength',
    APPLICATION_TYPE_STRENGTH[sbrMatches[0].applicationType] > APPLICATION_TYPE_STRENGTH[shipMatches[0].applicationType],
  )
}

console.log('\nsignal building — never fabricates a date')
{
  const rows = parseIdoxResultList(RESULTS_HTML)
  const withDate = matchPlanningRows(rows, '38-48 Southwark Bridge Road SE1')[0]
  const sig = planningSignalForBuilding(withDate, 'test-building')
  assert('produces a filed planningApplication signal when a real date is present', sig?.layer === 'planningApplication' && sig.factType === 'filed', sig)
  assert('observedAt is the REAL parsed ISO date (2026-06-10), not today\'s date or a placeholder', sig?.observedAt === '2026-06-10', sig?.observedAt)
  assert('sourceRef carries the real reference', sig?.sourceRef === '26/00849/OBS')
  assert('note records the classified type transparently', Boolean(sig?.note?.includes('changeOfUse')))

  const noDateRow: MatchedPlanningRow = { reference: '99/XX/9999', address: '1 Nowhere Street SE1', description: 'no date row', detailUrl: 'u', matchScore: 1, applicationType: 'other' }
  const noSig = planningSignalForBuilding(noDateRow, 'test-building')
  assert('a row with no parseable date produces NO signal — refuses to fabricate observedAt', noSig === null, noSig)
}

console.log('\nfull-history discipline: no date-range parameter is ever sent')
{
  const variants = planningSearchVariants('38-48 Southwark Bridge Road')
  assert('at least one search variant exists', variants.length > 0)
  for (const v of variants) {
    assert(`"${v.name}" carries no date-bound parameter`, !/date|from=|to=/i.test(v.url), v.url)
  }
}

/** A minimally-real mock Response — has the `.headers.getSetCookie()` shape
 *  fetchPlanningPage actually calls, so a test double can't silently pass by
 *  omitting a method the real code depends on. */
function mockResponse(body: string, opts: { ok?: boolean; status?: number; setCookies?: string[] } = {}): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    text: async () => body,
    headers: { getSetCookie: () => opts.setCookies ?? [] },
  } as unknown as Response
}

const WARMUP_URL_SUFFIX = '/online-applications/'

console.log('\ncheckPlanningForAddress — unions results across ALL variants (the actual fix)')
{
  // Simulate the exact failure mode the brief warned about: variant A
  // behaves like a narrow/default view and finds nothing; variant B is the
  // one that actually has the real, older record. A naive "stop at the
  // first real page" implementation would report EMPTY here, because
  // variant A returns a legitimate (if incomplete) results page.
  const NARROW_HTML = '<ul id="searchresults"><li>Your search found no results were found</li></ul>'
  const FULL_HTML = RESULTS_HTML

  const originalFetch = globalThis.fetch
  let callCount = 0
  // @ts-expect-error — test double, not a full fetch implementation
  globalThis.fetch = async (url: string) => {
    callCount++
    if (url.endsWith(WARMUP_URL_SUFFIX)) return mockResponse('<html>warm-up page</html>', { setCookies: ['JSESSIONID=ABC123; Path=/'] })
    const isNarrowVariant = url.includes('simpleSearchResults')
    return mockResponse(isNarrowVariant ? NARROW_HTML : FULL_HTML)
  }

  try {
    const result = await checkPlanningForAddress('68 Borough Road')
    assert('warm-up + both variants were called (3 total)', callCount === 3, callCount)
    assert('both variants counted as "used" (both returned real, if different, pages)', result.variantsUsed.length === 2, result.variantsUsed)
    assert('the real record is found despite one variant returning nothing', result.matches.length === 1 && result.matches[0].reference === '23/AP/3411', result.matches)
    assert('date span is reported for the full-history sanity check', result.dateSpan?.earliest === '2023-12-08' && result.dateSpan?.latest === '2023-12-08', result.dateSpan)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\ncheckPlanningForAddress — acquires a session cookie and threads it into every variant')
{
  // Confirmed via a real browser session: the site sets JSESSIONID (and,
  // behind the NetScaler, its own persistence cookie) on the very first
  // request. Both must be captured (getSetCookie, not the lossy get()) and
  // replayed on every subsequent search request.
  const originalFetch = globalThis.fetch
  const capturedHeaders: Record<string, string>[] = []
  // @ts-expect-error — test double
  globalThis.fetch = async (url: string, init?: RequestInit) => {
    capturedHeaders.push({ ...(init?.headers as Record<string, string>) })
    if (url.endsWith(WARMUP_URL_SUFFIX)) {
      return mockResponse('<html>warm-up page</html>', { setCookies: ['JSESSIONID=ABC123; Path=/; HttpOnly', 'NSC_mc=xyz789; Secure; HttpOnly'] })
    }
    return mockResponse(RESULTS_HTML)
  }

  try {
    await checkPlanningForAddress('68 Borough Road')
    assert('exactly 3 requests: 1 warm-up + 2 variants', capturedHeaders.length === 3, capturedHeaders.length)
    assert('the warm-up request itself carries no cookie yet', !('Cookie' in capturedHeaders[0]), capturedHeaders[0])
    const variantHeaders = capturedHeaders.slice(1)
    assert(
      'BOTH cookies (JSESSIONID + the NetScaler NSC_ persistence cookie) are threaded into every variant request',
      variantHeaders.every((h) => h.Cookie === 'JSESSIONID=ABC123; NSC_mc=xyz789'),
      variantHeaders,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\ncheckPlanningForAddress — genuinely inconclusive is never reported as "confirmed empty"')
{
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => mockResponse('', { ok: false, status: 403 })

  try {
    const result = await checkPlanningForAddress('anywhere')
    assert('checked is false when every variant fails', result.checked === false)
    assert('matches is empty but NOT presented as a confirmed finding', result.matches.length === 0 && result.checked === false)
    assert('error explains what happened', Boolean(result.error && result.error.length > 0), result.error)
  } finally {
    globalThis.fetch = originalFetch
  }
}

if (savedProxyEnv.HTTPS_PROXY === undefined) delete process.env.HTTPS_PROXY
else process.env.HTTPS_PROXY = savedProxyEnv.HTTPS_PROXY
if (savedProxyEnv.https_proxy !== undefined) process.env.https_proxy = savedProxyEnv.https_proxy

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
