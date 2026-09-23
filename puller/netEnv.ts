/*
  Network-environment awareness for Node fetch: corporate proxies AND
  TLS-trust quirks that a browser papers over silently but Node's
  OpenSSL-based fetch does not.

  PROXY: a browser auto-detects an office/corporate HTTP proxy (via WPAD, a
  PAC file, or OS network settings) and routes through it silently. Node's
  fetch does NOT — a genuine, well-documented gap, not a bug in this
  codebase. Detection: the standard HTTPS_PROXY / HTTP_PROXY (and
  lowercase) env vars, wired to an explicit `undici` ProxyAgent and passed
  as a per-request `dispatcher`. Deliberately NOT a global dispatcher: that
  would silently route every other fetch in this codebase (Companies
  House, EPC) through the same proxy whether or not it's needed there too.

  TLS — REVISED DIAGNOSIS, from a second round of live curl testing: the
  first theory (a NetScaler TLS-1.3 handshake bug) does NOT hold — ALL SIX
  TLS_VARIANTS below failed on the user's machine, including the
  certificate-bypass one, which should sidestep a pure TLS-protocol/cipher
  incompatibility. What's still true: curl succeeds directly on the same
  machine. The revised, better-fitting explanation: a corporate
  TLS-inspection proxy re-signs HTTPS traffic with an internal root CA.
  Windows/curl (Schannel, backed by the Windows certificate store) trusts
  that root because IT admins install it there; Node bundles its own
  OpenSSL-based CA store and does NOT trust it, so every connection to an
  inspected host fails certificate verification — which also explains why
  planning.data.gov.uk (likely on the inspection bypass list) works fine
  while planning.southwark.gov.uk doesn't. (Caveat, not swept under the
  rug: rejectUnauthorized:false failing too is a LITTLE surprising if this
  is purely a cert-trust problem, since disabling verification should let
  any CA through — worth keeping in mind if the fixes below also come back
  negative; that would point at something the inspection proxy does beyond
  certificate validation, e.g. resetting connections by TLS fingerprint.)

  The real fix is trusting the corporate root, not a protocol/cipher
  adjustment. Three ways, weakest-coupling first:
    1. Point PLANNING_CA_CERT_PATH (or the Node-standard NODE_EXTRA_CA_CERTS)
       at the exported corporate root cert (PEM). readCorporateCaVariant()
       picks this up automatically, in-process, per request — no relaunch,
       no global trust-store change, only this host's dispatcher is
       affected. This is what resolveWorkingTlsAgent() tries FIRST.
    2. Run node with --use-system-ca (Node 22.9+) so Node trusts the whole
       Windows cert store, same as curl. This is a boot-time flag, so it
       can't be applied from inside an already-running process — see
       planning-probe.ts's probeUseSystemCaFlag(), which spawns a child
       process to test it.
    3. Set NODE_EXTRA_CA_CERTS before starting node (a Node-native env var,
       read once at boot) — equivalent in effect to option 1 but applies to
       every TLS connection Node makes, not just this codebase's.
  See puller/README.md for how to export the corporate root cert on
  Windows. TLS_VARIANTS (protocol/cipher/session adjustments) are kept as a
  secondary fallback — ruled out for THIS failure, but a real fix for a
  differently-broken host — and the certificate-bypass variant among them
  remains diagnostic-only and is NEVER auto-adopted (see its own comment).
*/

import { Agent, ProxyAgent } from 'undici'
import { constants as tlsConstants } from 'node:crypto'
import { rootCertificates } from 'node:tls'
import { readFileSync } from 'node:fs'

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

/** Env var this codebase reads first for an exported corporate root CA
 *  (PEM). Falls back to Node's own NODE_EXTRA_CA_CERTS convention so a var
 *  already set for that purpose is picked up without duplicating it. */
export const CORPORATE_CA_CERT_PATH_ENV = 'PLANNING_CA_CERT_PATH'

/**
 * If a corporate root CA cert is configured (via PLANNING_CA_CERT_PATH or
 * NODE_EXTRA_CA_CERTS), build a TlsVariant that trusts Node's normal root
 * store PLUS that cert — the direct fix for a TLS-inspection proxy whose
 * re-signed certs Windows/curl trust (via the OS store) but Node's bundled
 * OpenSSL store does not. Returns undefined (skip, don't attempt) if no
 * path is configured or the file can't be read — this must never be the
 * variant that silently "succeeds" by doing nothing.
 */
export function readCorporateCaVariant(): TlsVariant | undefined {
  const path = process.env[CORPORATE_CA_CERT_PATH_ENV] || process.env.NODE_EXTRA_CA_CERTS
  if (!path) return undefined
  let pem: string
  try {
    pem = readFileSync(path, 'utf8')
  } catch (err) {
    console.error(`${CORPORATE_CA_CERT_PATH_ENV}/NODE_EXTRA_CA_CERTS set to "${path}" but could not be read: ${(err as Error).message}`)
    return undefined
  }
  return { name: `corporate root CA appended, from ${path}`, connect: { ca: [...rootCertificates, pem] } }
}

/** All TLS variants worth trying, in priority order: the corporate-CA fix
 *  first (if configured — it's the confirmed-likely cause), then the
 *  protocol/cipher fallbacks, ending with the diagnostic-only insecure one. */
export function allTlsVariants(): TlsVariant[] {
  const corporate = readCorporateCaVariant()
  return corporate ? [corporate, ...TLS_VARIANTS] : TLS_VARIANTS
}

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

  for (const variant of allTlsVariants()) {
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
