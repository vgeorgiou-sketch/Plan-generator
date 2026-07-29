/*
  Robust JSON reading + diagnosis of non-JSON responses. Pure and unit-tested.

  An API that answers HTML to a JSON request is telling you something — a login
  page, a redirect, a WAF challenge, a 404, or a wrong endpoint. Crashing on
  `JSON.parse` throws that information away. These helpers keep the status,
  content-type and a body snippet, and name the most likely cause.
*/

export interface ResponseFacts {
  url: string
  status: number
  contentType: string
  body: string
  redirected?: boolean
  finalUrl?: string
  location?: string | null
}

export const BODY_SNIPPET_LEN = 500

export function snippet(body: string, len = BODY_SNIPPET_LEN): string {
  const s = body.replace(/\s+/g, ' ').trim()
  return s.length > len ? s.slice(0, len) + '…' : s
}

export function looksLikeHtml(contentType: string, body: string): boolean {
  if (/text\/html/i.test(contentType)) return true
  return /^\s*(<!doctype html|<html)/i.test(body)
}

/** Name the most likely cause of a non-JSON response, with the evidence. */
export function diagnoseNonJson(f: ResponseFacts): string {
  const head = `HTTP ${f.status}${f.contentType ? ` · content-type: ${f.contentType}` : ''}`
  const where = f.redirected && f.finalUrl && f.finalUrl !== f.url ? `\n  Redirected to: ${f.finalUrl}` : ''
  const loc = f.location ? `\n  Location header: ${f.location}` : ''
  const bodyLine = `\n  Body (first ${BODY_SNIPPET_LEN}): ${snippet(f.body)}`

  let cause: string
  if (f.status >= 300 && f.status < 400) {
    cause =
      'The API redirected instead of answering. A redirect to a sign-in page almost always means the ' +
      'Authorization header was missing, malformed, or rejected.'
  } else if (f.status === 401 || f.status === 403) {
    cause = looksLikeHtml(f.contentType, f.body)
      ? 'Auth was rejected and the service returned its HTML error/sign-in page rather than a JSON error.'
      : 'Auth was rejected.'
  } else if (f.status === 404) {
    cause = 'Endpoint not found — check the API path (the HTML is probably the site 404 page).'
  } else if (looksLikeHtml(f.contentType, f.body)) {
    cause =
      /sign in|log in|login|password/i.test(f.body)
        ? 'Got a sign-in page — the request was treated as unauthenticated.'
        : /captcha|cloudflare|attention required/i.test(f.body)
          ? 'Got a WAF/anti-bot challenge page rather than the API.'
          : 'Got an HTML page where JSON was expected — likely a wrong endpoint, or the request was ' +
            'not recognised as an API call (bad parameter values can trigger the HTML error page).'
  } else {
    cause = 'Response was not valid JSON.'
  }

  return `EPC returned a non-JSON response.\n  ${head}${where}${loc}\n  Likely cause: ${cause}${bodyLine}`
}

/**
 * Read a fetch Response as JSON, or throw a diagnostic Error that preserves the
 * status, content-type and body snippet. Never throws a bare parse error.
 */
export async function readJsonOrDiagnose<T>(res: Response, requestUrl: string): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''
  const body = await res.text()

  if (!looksLikeHtml(contentType, body) && /json/i.test(contentType)) {
    try {
      return JSON.parse(body) as T
    } catch {
      // fall through to diagnosis with the real body
    }
  }

  // Content-type may be absent/wrong but the body still be JSON — try once.
  if (!looksLikeHtml(contentType, body)) {
    try {
      return JSON.parse(body) as T
    } catch {
      /* diagnose below */
    }
  }

  throw new Error(
    diagnoseNonJson({
      url: requestUrl,
      status: res.status,
      contentType,
      body,
      redirected: res.redirected,
      finalUrl: res.url,
      location: res.headers.get('location'),
    }),
  )
}
