/*
  HTTP failure diagnostics — pure, unit-tested (http.test.ts).

  The point: a 403 from a sandbox egress gateway is NOT the same as an API
  rejecting your key, and the message must not conflate them. When a network
  proxy is configured, a refused connection or a gateway 403 means the request
  never reached the API — so it can't be a credential problem.
*/

export function isEgressProxied(): boolean {
  return Boolean(
    process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy,
  )
}

export interface HttpFailure {
  service: string // e.g. "Companies House"
  host: string // e.g. "api.company-information.service.gov.uk"
  status: number
  path: string
  body?: string
  proxied: boolean
  credHint?: string // service-specific "check these credentials" note
}

function snippet(body?: string): string {
  const s = (body ?? '').replace(/\s+/g, ' ').trim()
  return s ? ` Response: ${s.slice(0, 120)}` : ''
}

/** Turn a non-OK HTTP response into a message that names the real cause. */
export function describeHttpFailure(f: HttpFailure): string {
  if (f.status === 401) {
    return `${f.service} rejected the credentials (401 Unauthorized). ${f.credHint ?? 'Check the API key.'}`
  }
  if (f.status === 429) {
    return `${f.service} rate limit hit (429) — back off and retry.`
  }
  if (f.status === 403) {
    if (f.proxied) {
      return (
        `Egress blocked: this environment's network proxy refused the connection to ${f.host} ` +
        `(HTTP 403 at the gateway). The request never reached ${f.service}, so this is NOT a ` +
        `credentials problem — run where ${f.host} is reachable (e.g. your local machine).`
      )
    }
    return `${f.service} returned 403 Forbidden — the credentials may lack permission for this resource. ${f.credHint ?? ''}`.trim()
  }
  return `${f.service} error ${f.status} for ${f.path}.${snippet(f.body)}`
}

/** Turn a thrown fetch (connection never established) into a message. */
export function describeNetworkThrow(service: string, host: string, path: string, cause: Error): string {
  const proxied = isEgressProxied()
  return (
    `Could not reach ${service} at ${host}${path} — ` +
    `${proxied ? "the environment's network proxy blocked the connection" : 'network error'}. ` +
    `Run where ${host} is reachable. Cause: ${cause.message}`
  )
}
