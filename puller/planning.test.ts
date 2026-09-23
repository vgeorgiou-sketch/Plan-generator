/*
  Run: node --experimental-strip-types puller/planning.test.ts
  Proves the pure logic offline against the REAL, manually-verified data for
  both known cases (not fictional examples): date extraction, both confirmed
  Southwark reference formats, application-type classification, address
  matching, never fabricating a date, the real GET-form-then-POST-search
  flow (confirmed live: a cold GET straight to the results endpoint returns
  HTTP 500, reproduced identically by curl), and — critically — that
  checkPlanningForAddress unions results across every search variant rather
  than stopping at the first, which is the actual fix for the brief's
  "nearly missed it with a 90-day default" warning.
*/

import { parseIdoxResultList, parseIdoxForm, ukDateToIso, looksLikeIdoxResultsPage, IDOX_BASE } from './idox.ts'
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

console.log('\nfull-history discipline: no date-range parameter, and every variant is a form page (never a direct results URL)')
{
  const variants = planningSearchVariants()
  assert('at least one search variant exists', variants.length > 0)
  for (const v of variants) {
    assert(`"${v.name}" formUrl carries no date-bound parameter`, !/date|from=|to=/i.test(v.formUrl), v.formUrl)
    assert(`"${v.name}" formUrl is a search FORM page, not a *Results.do endpoint`, !/SearchResults/i.test(v.formUrl), v.formUrl)
    assert(`"${v.name}" names a real field to fill in`, v.fieldName.length > 0)
  }
}

console.log('\nparseIdoxForm — reads the real form instead of guessing field names or tokens')
{
  const SIMPLE_FORM_HTML = `
<html><body>
<div id="header"><form action="/online-applications/siteSearch.do" method="GET"><input type="text" name="q" /></form></div>
<form action="simpleSearchResults.do" method="POST">
  <input type="hidden" name="org.apache.struts.taglib.html.TOKEN" value="tok-simple-123" />
  <input type="text" name="searchCriteria.simpleSearchString" value="" />
  <select name="searchCriteria.resultsPerPage"><option value="10">10</option><option value="25" selected>25</option></select>
  <input type="submit" value="Search" />
</form>
</body></html>`

  const form = parseIdoxForm(SIMPLE_FORM_HTML, `${IDOX_BASE}/search.do?action=simple`, /SearchResults/i)
  assert('finds a form', form !== undefined, form)
  assert('picks the form matching the hint, not the unrelated header search box', form?.action.endsWith('/simpleSearchResults.do'), form?.action)
  assert('resolves a relative action against the base URL', form?.action === `${IDOX_BASE}/simpleSearchResults.do`, form?.action)
  assert('detects POST (case-insensitive)', form?.method === 'POST')
  assert('captures the hidden CSRF-style token field', form?.fields['org.apache.struts.taglib.html.TOKEN'] === 'tok-simple-123', form?.fields)
  assert('captures the empty text field too', form?.fields['searchCriteria.simpleSearchString'] === '', form?.fields)
  assert('a <select> contributes its SELECTED option, not the first one', form?.fields['searchCriteria.resultsPerPage'] === '25', form?.fields)
  assert('the submit button is not captured as a field', !('' in (form?.fields ?? {})) && !Object.keys(form?.fields ?? {}).includes('Search'))

  assert('falls back to the first form when the hint matches nothing', parseIdoxForm(SIMPLE_FORM_HTML, IDOX_BASE, /nope-does-not-exist/i)?.action.endsWith('/siteSearch.do'))
  assert('no <form> at all → undefined, not a crash', parseIdoxForm('<html><body>no form here</body></html>', IDOX_BASE) === undefined)
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

// Confirmed live: Idox's search flow is GET the form, then POST the query.
// These fixtures stand in for the two real form pages this codebase GETs.
const SIMPLE_FORM_HTML = `<form action="simpleSearchResults.do" method="POST"><input type="hidden" name="token" value="tok-1" /><input type="text" name="searchCriteria.simpleSearchString" value="" /></form>`
const ADVANCED_FORM_HTML = `<form action="advancedSearchResults.do" method="POST"><input type="hidden" name="token" value="tok-2" /><input type="text" name="searchCriteria.address" value="" /></form>`

function isFormRequest(url: string): 'simple' | 'advanced' | undefined {
  if (url.includes('search.do?action=simple')) return 'simple'
  if (url.includes('search.do?action=advanced')) return 'advanced'
  return undefined
}

console.log('\ncheckPlanningForAddress — unions results across ALL variants (the actual fix)')
{
  // Simulate the exact failure mode the brief warned about: variant A
  // behaves like a narrow/default view and finds nothing; variant B is the
  // one that actually has the real, older record. A naive "stop at the
  // first real page" implementation would report EMPTY here, because
  // variant A returns a legitimate (if incomplete) results page.
  const NARROW_HTML = '<ul id="searchresults"><li>Your search found no results were found</li></ul>'

  const originalFetch = globalThis.fetch
  let callCount = 0
  // @ts-expect-error — test double, not a full fetch implementation
  globalThis.fetch = async (url: string, init?: RequestInit) => {
    callCount++
    const kind = isFormRequest(url)
    if (kind === 'simple') return mockResponse(SIMPLE_FORM_HTML, { setCookies: ['JSESSIONID=SIMPLE1; Path=/'] })
    if (kind === 'advanced') return mockResponse(ADVANCED_FORM_HTML, { setCookies: ['JSESSIONID=ADV1; Path=/'] })
    // POST to a results endpoint: simple search comes back narrow, advanced finds the real record.
    const isSimplePost = url.includes('simpleSearchResults') && init?.method === 'POST'
    return mockResponse(isSimplePost ? NARROW_HTML : RESULTS_HTML)
  }

  try {
    const result = await checkPlanningForAddress('68 Borough Road')
    assert('4 requests total: (GET form + POST search) × 2 variants', callCount === 4, callCount)
    assert('both variants counted as "used" (both returned real, if different, pages)', result.variantsUsed.length === 2, result.variantsUsed)
    assert('the real record is found despite one variant returning nothing', result.matches.length === 1 && result.matches[0].reference === '23/AP/3411', result.matches)
    assert('date span is reported for the full-history sanity check', result.dateSpan?.earliest === '2023-12-08' && result.dateSpan?.latest === '2023-12-08', result.dateSpan)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\ncheckPlanningForAddress — GETs the search form, then POSTs with that session\'s cookie')
{
  // Confirmed via curl on the real machine: a cold GET straight to the
  // results endpoint returns HTTP 500, even though it sets a fresh
  // JSESSIONID. The fix is GET the form (session established there),
  // POST the query with that cookie — this proves the code actually does
  // that, not just "a cookie exists somewhere".
  const originalFetch = globalThis.fetch
  const calls: { url: string; method: string; cookie?: string; body?: string }[] = []
  // @ts-expect-error — test double
  globalThis.fetch = async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, method: init?.method ?? 'GET', cookie: headers.Cookie, body: init?.body as string | undefined })
    const kind = isFormRequest(url)
    if (kind === 'simple') return mockResponse(SIMPLE_FORM_HTML, { setCookies: ['JSESSIONID=SIMPLE1; Path=/; HttpOnly', 'NSC_mc=simple-nsc; Secure; HttpOnly'] })
    if (kind === 'advanced') return mockResponse(ADVANCED_FORM_HTML, { setCookies: ['JSESSIONID=ADV1; Path=/; HttpOnly'] })
    return mockResponse(RESULTS_HTML)
  }

  try {
    await checkPlanningForAddress('38-48 Southwark Bridge Road')
    assert('4 calls: GET form + POST search, for each of the 2 variants', calls.length === 4, calls)

    const simpleGet = calls.find((c) => c.url.includes('search.do?action=simple'))
    const simplePost = calls.find((c) => c.url.includes('simpleSearchResults'))
    assert('the simple-search form GET carries no cookie (first hit)', simpleGet?.method === 'GET' && !simpleGet.cookie, simpleGet)
    assert('the simple-search POST uses the cookie issued by ITS OWN form GET, not a shared warm-up', simplePost?.method === 'POST' && simplePost.cookie === 'JSESSIONID=SIMPLE1; NSC_mc=simple-nsc', simplePost)
    assert('the simple-search POST body carries the address in the real field name found on the form', Boolean(simplePost?.body?.includes(encodeURIComponent('38-48 Southwark Bridge Road').replace(/%20/g, '+'))) || Boolean(simplePost?.body?.includes('38-48+Southwark+Bridge+Road')), simplePost?.body)
    assert("the simple-search POST body preserves the form's own hidden token field", Boolean(simplePost?.body?.includes('token=tok-1')), simplePost?.body)
    assert('the simple-search POST targets ?action=firstPage, carried over from the confirmed-working direct GET', Boolean(simplePost?.url.includes('action=firstPage')), simplePost?.url)

    const advancedPost = calls.find((c) => c.url.includes('advancedSearchResults'))
    assert("the advanced-search POST uses ITS OWN form's cookie (ADV1), independent of the simple variant's", advancedPost?.cookie === 'JSESSIONID=ADV1', advancedPost)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\ncheckPlanningForAddress — a non-2xx response body is captured, not swallowed (Idox error pages name the problem)')
{
  const originalFetch = globalThis.fetch
  const ERROR_BODY = '<html><body><h1>Internal Server Error</h1><p>Required parameter searchCriteria.simpleSearchString is missing</p></body></html>'
  // @ts-expect-error — test double
  globalThis.fetch = async (url: string) => {
    const kind = isFormRequest(url)
    if (kind === 'simple') return mockResponse(SIMPLE_FORM_HTML, { setCookies: ['JSESSIONID=SIMPLE1; Path=/'] })
    if (kind === 'advanced') return mockResponse(ADVANCED_FORM_HTML, { setCookies: ['JSESSIONID=ADV1; Path=/'] })
    // Both results POSTs fail with a 500 carrying a diagnosable body.
    return mockResponse(ERROR_BODY, { ok: false, status: 500 })
  }

  try {
    const result = await checkPlanningForAddress('anywhere')
    assert('checked is false — a 500 on every variant is never presented as a confirmed empty result', result.checked === false)
    assert('the 500 status is named in the error', Boolean(result.error?.includes('500')), result.error)
    assert('the response BODY is captured in the error, not just the status code', Boolean(result.error?.includes('Required parameter')), result.error)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('\ncheckPlanningForAddress — a field-name mismatch is surfaced, never silently guessed')
{
  const originalFetch = globalThis.fetch
  // A form that does NOT contain the field name this codebase expects —
  // simulating Idox's real form turning out to differ from the assumption.
  const WRONG_FIELD_FORM_HTML = `<form action="simpleSearchResults.do" method="POST"><input type="text" name="someOtherFieldName" value="" /></form>`
  // @ts-expect-error — test double
  globalThis.fetch = async (url: string) => {
    const kind = isFormRequest(url)
    if (kind === 'simple') return mockResponse(WRONG_FIELD_FORM_HTML, { setCookies: ['JSESSIONID=X; Path=/'] })
    if (kind === 'advanced') return mockResponse(ADVANCED_FORM_HTML, { setCookies: ['JSESSIONID=Y; Path=/'] })
    return mockResponse(RESULTS_HTML)
  }

  try {
    const result = await checkPlanningForAddress('anywhere')
    assert('the simple-search variant fails (its assumed field name is not on the real form)', !result.variantsUsed.includes('simple search (form → POST)'), result.variantsUsed)
    assert('the mismatch names the field it looked for AND the real fields it found instead', Boolean(result.error?.includes('searchCriteria.simpleSearchString') && result.error?.includes('someOtherFieldName')), result.error)
    assert('the OTHER variant (advanced search) still succeeds independently', result.variantsUsed.includes('advanced search (form → POST)'), result.variantsUsed)
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

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
