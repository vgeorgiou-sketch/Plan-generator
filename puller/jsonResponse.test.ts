/*
  Run: node --experimental-strip-types puller/jsonResponse.test.ts
  Proves non-JSON responses are diagnosed, never crash a parse, and that the
  status + body snippet survive into the error message.
*/

import { diagnoseNonJson, looksLikeHtml, readJsonOrDiagnose, snippet } from './jsonResponse.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

const HTML = '<!DOCTYPE html><html><head><title>Sign in</title></head><body><form>Please log in with your password</form></body></html>'

console.log('HTML detection')
{
  assert('detects by content-type', looksLikeHtml('text/html; charset=utf-8', ''))
  assert('detects by <!DOCTYPE body even with wrong content-type', looksLikeHtml('application/json', HTML))
  assert('JSON body is not HTML', !looksLikeHtml('application/json', '{"rows":[]}'))
}

console.log('\ndiagnosis names the cause and keeps the evidence')
{
  const signin = diagnoseNonJson({ url: 'https://epc/api', status: 200, contentType: 'text/html', body: HTML })
  assert('sign-in page identified', /sign-in page/i.test(signin), signin)
  assert('status preserved', /HTTP 200/.test(signin))
  assert('content-type preserved', /text\/html/.test(signin))
  assert('body snippet included', /DOCTYPE html/i.test(signin))

  const redirect = diagnoseNonJson({ url: 'https://epc/api', status: 302, contentType: 'text/html', body: HTML, location: '/login' })
  assert('redirect identified as auth-shaped', /redirected/i.test(redirect) && /sign-in/i.test(redirect), redirect)
  assert('Location header surfaced', /Location header: \/login/.test(redirect))

  const notFound = diagnoseNonJson({ url: 'https://epc/api/wrong', status: 404, contentType: 'text/html', body: '<!DOCTYPE html><html>404</html>' })
  assert('404 identified as wrong endpoint', /Endpoint not found/i.test(notFound), notFound)

  const badParam = diagnoseNonJson({ url: 'https://epc/api', status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html><body>Error page</body></html>' })
  assert('generic HTML flags bad params / wrong endpoint', /wrong endpoint|bad parameter/i.test(badParam), badParam)
}

console.log('\nsnippet')
{
  assert('truncates to 500 chars with ellipsis', snippet('x'.repeat(900)).length === 501)
  assert('collapses whitespace', snippet('a\n\n  b') === 'a b')
}

console.log('\nreadJsonOrDiagnose never throws a bare parse error')
{
  const mk = (body: string, ct: string, status = 200): Response =>
    ({
      status,
      redirected: false,
      url: 'https://epc/api',
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? ct : null) },
      text: async () => body,
    }) as unknown as Response

  const ok = await readJsonOrDiagnose<{ rows: number[] }>(mk('{"rows":[1,2]}', 'application/json'), 'u')
  assert('parses real JSON', ok.rows.length === 2)

  const noCt = await readJsonOrDiagnose<{ rows: number[] }>(mk('{"rows":[1]}', ''), 'u')
  assert('parses JSON even with a missing content-type', noCt.rows.length === 1)

  let msg = ''
  try {
    await readJsonOrDiagnose(mk(HTML, 'text/html'), 'u')
  } catch (e) {
    msg = (e as Error).message
  }
  assert('HTML throws a diagnostic, not a SyntaxError', /non-JSON response/i.test(msg) && !/Unexpected token/.test(msg), msg.slice(0, 80))
  assert('diagnostic carries the body snippet', /DOCTYPE/i.test(msg))
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
