/*
  Run: node --experimental-strip-types puller/planning.test.ts
  Proves the pure logic offline: Idox date extraction, application-type
  classification, address matching, and — critically — that a row with no
  parseable date NEVER becomes a signal with a fabricated date.
*/

import { parseIdoxResultList, ukDateToIso, looksLikeIdoxResultsPage } from './idox.ts'
import {
  classifyApplicationType,
  matchPlanningRows,
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

// Representative Idox search-results markup, WITH a metaInfo date line —
// the two verification addresses from the brief. Must be re-checked against
// Southwark's live HTML before being trusted (see planning-probe.ts).
const RESULTS_HTML = `
<ul id="searchresults">
  <li class="searchresult">
    <a href="/online-applications/applicationDetails.do?keyVal=XYZ789">26/AP/0611 | Change of use from office (B1) to co-living, associated alterations</a>
    <p class="address">38-48 Southwark Bridge Road, London, SE1 9BB</p>
    <p class="metaInfo">Registered Date: 03/04/2026 | Status: Pending</p>
  </li>
  <li class="searchresult">
    <a href="/online-applications/applicationDetails.do?keyVal=ABC123">23/AP/0102 | Advertisement consent for illuminated pub signage</a>
    <p class="address">68 Borough Road, London, SE1 1JX</p>
    <p class="metaInfo">Registered Date: 14/01/2023 | Status: Approved</p>
  </li>
  <li class="searchresult">
    <a href="/online-applications/applicationDetails.do?keyVal=NODATE1">99/XX/9999 | Application with unparseable metaInfo</a>
    <p class="address">1 Nowhere Street, SE1 0AA</p>
  </li>
</ul>`

console.log('Idox date extraction')
{
  assert('UK date "03/04/2026" → ISO "2026-04-03"', ukDateToIso('03/04/2026') === '2026-04-03')
  assert('garbage does not parse to a fake date', ukDateToIso('not a date') === undefined)
  assert('looksLikeIdoxResultsPage recognises the results markup', looksLikeIdoxResultsPage(RESULTS_HTML))
  assert('a "no results" page also counts as a real (empty) results page', looksLikeIdoxResultsPage('<p>Your search found no results were found</p>'))
  assert('a login/session page does NOT look like a results page', !looksLikeIdoxResultsPage('<html><body>Please log in to continue</body></html>'))

  const rows = parseIdoxResultList(RESULTS_HTML)
  assert('parses all 3 rows', rows.length === 3, rows.length)
  assert('extracts the metaInfo date for row 1', rows[0].dateText === '03/04/2026', rows[0].dateText)
  assert('row with no metaInfo has no dateText, not a guessed one', rows[2].dateText === undefined)
}

console.log('\napplication-type classification')
{
  assert('"change of use" → changeOfUse', classifyApplicationType('Change of use from office to co-living') === 'changeOfUse')
  assert('"advertisement consent" → advertisement', classifyApplicationType('Advertisement consent for signage') === 'advertisement')
  assert('"pre-application" → preApplication', classifyApplicationType('Pre-application enquiry for redevelopment') === 'preApplication')
  assert('"erection of" → full', classifyApplicationType('Erection of a part 6/8 storey building') === 'full')
  assert('"householder" → minor', classifyApplicationType('Householder application for a rear extension') === 'minor')
  assert('unmatched text → other, not a false positive', classifyApplicationType('Discharge of condition 4') === 'other')
  assert('pre-app ranks above a change of use, which ranks above advertisement', APPLICATION_TYPE_STRENGTH.preApplication > APPLICATION_TYPE_STRENGTH.changeOfUse && APPLICATION_TYPE_STRENGTH.changeOfUse > APPLICATION_TYPE_STRENGTH.advertisement)
}

console.log('\naddress matching — the discriminator in action')
{
  const rows = parseIdoxResultList(RESULTS_HTML)

  const sbrMatches = matchPlanningRows(rows, '38-48 Southwark Bridge Road SE1')
  assert('SBR address matches its own change-of-use row, not the pub\'s', sbrMatches.length === 1 && sbrMatches[0].reference === '26/AP/0611', sbrMatches)
  assert('matched row is classified changeOfUse — the real discriminator signal', sbrMatches[0].applicationType === 'changeOfUse')

  const shipMatches = matchPlanningRows(rows, '68 Borough Road SE1')
  assert('The Ship matches its own row, not SBR\'s', shipMatches.length === 1 && shipMatches[0].reference === '23/AP/0102', shipMatches)
  assert('the pub\'s only match is advertisement consent — weak, not a development signal', shipMatches[0].applicationType === 'advertisement')
  assert(
    'the discriminator works: SBR\'s match outranks the pub\'s in development-signal strength',
    APPLICATION_TYPE_STRENGTH[sbrMatches[0].applicationType] > APPLICATION_TYPE_STRENGTH[shipMatches[0].applicationType],
  )
}

console.log('\nsignal building — never fabricates a date')
{
  const rows = parseIdoxResultList(RESULTS_HTML)
  const withDate = matchPlanningRows(rows, '38-48 Southwark Bridge Road SE1')[0]
  const sig = planningSignalForBuilding(withDate, 'test-building')
  assert('produces a filed planningApplication signal when a real date is present', sig?.layer === 'planningApplication' && sig.factType === 'filed', sig)
  assert('observedAt is the parsed ISO date, not today\'s date or a placeholder', sig?.observedAt === '2026-04-03', sig?.observedAt)
  assert('note records the classified type transparently', Boolean(sig?.note?.includes('changeOfUse')))

  const noDateRow: MatchedPlanningRow = { reference: '99/XX/9999', address: '1 Nowhere Street SE1', description: 'no date row', detailUrl: 'u', matchScore: 1, applicationType: 'other' }
  const noSig = planningSignalForBuilding(noDateRow, 'test-building')
  assert('a row with no parseable date produces NO signal — refuses to fabricate observedAt', noSig === null, noSig)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
