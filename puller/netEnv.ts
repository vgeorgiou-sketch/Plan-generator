/*
  Network-environment awareness for Node fetch: corporate proxies AND
  TLS-handshake quirks that a browser papers over silently but Node's
  OpenSSL-based fetch does not.

  PROXY: a browser auto-detects an office/corporate HTTP proxy (via WPAD, a
  PAC file, or OS network settings) and routes through it silently. Node's
  fetch does NOT — a genuine, well-documented gap, not a bug in this
  codebase. Detection: the standard HTTPS_PROXY / HTTP_PROXY (and
  lowercase) env vars, wired to an explicit `undici` ProxyAgent and passed
  as a per-request `dispatcher`. Deliberately NOT a global dispatcher: that
  would silently route every other fetch in this codebase (Companies
  House, EPC) through the same proxy whether or not it's needed there too.

  TLS: confirmed via a live curl diagnosis against Southwark's actual
  planning site — the network and proxy are NOT the issue for this host;
  curl (using Windows' Schannel TLS backend) succeeds after recovering from
  a "failed to decrypt data, need more data" handshake hiccup, which is a
  documented interop pattern between certain TLS clients and a Citrix
  NetScaler in front of the origin (identified via the `X-Via-NSCOPI`
  header and an `NSC_` cookie). Node/undici uses OpenSSL, not Schannel, and
  does not have the same silent-recovery behaviour, so the handshake simply
  fails there. resolveWorkingTlsAgent() tries a ranked list of SAFE TLS
  adjustments (version, cipher/security-level, session tickets, ALPN) and
  auto-adopts whichever one actually completes a handshake — caching the
  result per host so this only probes once. The certificate-bypass variant
  is diagnostic-only and is NEVER auto-adopted (see its own comment below).
*/

import { Agent, ProxyAgent } from 'undici'
import { constants as tlsConstants } from 'node:crypto'

export function detectProxyUrl(): string | undefined {
  return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || undefined
}

let cached: { url: string; agent: ProxyAgent } | undefined

/** A reusable ProxyAgent for the detected proxy, or undefined if none is set. */
export function proxyDispatcher(): ProxyAgent | undefined {
  const url = detectProxyUrl()
  if (!url) return undefined
  if (cached?.url !== url) cached = { url, agent: new ProxyAgent(url) }
  return cached.agent
}

// Two User-Agent strategies worth testing — some WAFs/reverse proxies treat
// a self-identifying, low-volume bot UA differently from a real browser's,
// even when nothing else about the request looks abusive.
export const BOT_USER_AGENT = 'opportunity-radar-spike/0.1 (planning-search, low-volume)'
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export interface TlsVariant {
  name: string
  /** undici Agent `connect` options (~ node:tls.connect options). Omit to
   *  leave Node/undici's TLS defaults untouched. */
  connect?: Record<string, unknown>
  /** Trades away real security — kept for DIAGNOSIS only (does the failure
   *  disappear if certificate checking is skipped, confirming it's a cert
   *  issue rather than a protocol one?). Never auto-adopted; if this is
   *  the only variant that works, the fix is the correct CA, not this. */
  insecure?: boolean
}

/**
 * Ranked by how likely each is to fix a NetScaler TLS 1.3 interop bug
 * WITHOUT weakening security — this is a documented, common pattern across
 * languages/clients (Java, Python, Node) hitting NetScaler VIPs with a
 * modern, strict OpenSSL-based TLS stack that a legacy-tolerant client
 * (like Schannel's own recovery path) papers over.
 */
export const TLS_VARIANTS: TlsVariant[] = [
  { name: 'default (Node/undici untouched)' },
  { name: 'force TLS 1.2 only (sidesteps a buggy NetScaler TLS 1.3 path)', connect: { maxVersion: 'TLSv1.2' } },
  { name: 'disable session tickets (SSL_OP_NO_TICKET)', connect: { secureOptions: tlsConstants.SSL_OP_NO_TICKET } },
  {
    name: 'TLS 1.2 + relaxed OpenSSL security level (older cipher/DH support)',
    connect: { minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2', ciphers: 'DEFAULT:@SECLEVEL=1' },
  },
  { name: 'force ALPN to HTTP/1.1 (avoid a buggy h2 termination path)', connect: { ALPNProtocols: ['http/1.1'] } },
  {
    name: '[DIAGNOSTIC ONLY — never auto-adopted] skip certificate verification',
    connect: { rejectUnauthorized: false },
    insecure: true,
  },
]

let resolvedTls: { host: string; agent: Agent | undefined } | undefined

/**
 * Try each SAFE TLS variant against `probeUrl` (a lightweight HEAD) until
 * one completes a handshake, caching the winner per host. Returns undefined
 * if the untouched default already works, or if nothing safe does —
 * callers fall through to Node's default dispatcher either way, so this
 * never makes things worse, only sometimes better.
 */
export async function resolveWorkingTlsAgent(probeUrl: string): Promise<Agent | undefined> {
  const host = new URL(probeUrl).host
  if (resolvedTls?.host === host) return resolvedTls.agent

  for (const variant of TLS_VARIANTS) {
    if (variant.insecure) continue // never tried here — see planning-probe.ts for the diagnostic-only check
    const agent = variant.connect ? new Agent({ connect: variant.connect }) : undefined
    try {
      const res = await fetch(probeUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': BOT_USER_AGENT },
        ...(agent ? { dispatcher: agent } : {}),
      } as RequestInit)
      if (res.body) await res.body.cancel().catch(() => {})
      resolvedTls = { host, agent }
      return agent
    } catch {
      continue // this variant didn't complete a handshake either — try the next
    }
  }
  resolvedTls = { host, agent: undefined }
  return undefined
}

/** Every "name=value" pair from the response's Set-Cookie header(s),
 *  joined for replay as a request Cookie header. Uses getSetCookie() (not
 *  the lossy, comma-joined get('set-cookie')) so a NetScaler persistence
 *  cookie (NSC_...) alongside a JSESSIONID are both captured, not just one. */
export function collectCookiePairs(res: Response): string[] {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  return raw.map((c) => c.split(';')[0].trim()).filter(Boolean)
}
