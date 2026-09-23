/*
  Network-environment awareness for Node fetch: corporate proxies AND a
  corporate TLS-inspection proxy that a browser papers over silently but
  Node's OpenSSL-based fetch does not.

  PROXY: a browser auto-detects an office/corporate HTTP proxy (via WPAD, a
  PAC file, or OS network settings) and routes through it silently. Node's
  fetch does NOT — a genuine, well-documented gap, not a bug in this
  codebase. Detection: the standard HTTPS_PROXY / HTTP_PROXY (and
  lowercase) env vars, wired to an explicit `undici` ProxyAgent and passed
  as a per-request `dispatcher`. Deliberately NOT a global dispatcher: that
  would silently route every other fetch in this codebase (Companies
  House, EPC) through the same proxy whether or not it's needed there too.

  TLS — CONFIRMED via live testing on the actual office machine, across two
  rounds: a bare curl succeeds against planning.southwark.gov.uk while
  Node's fetch fails at the connection level with no HTTP response at all.
  The first theory (a Citrix NetScaler TLS-1.3 handshake bug) didn't hold —
  every protocol/cipher adjustment tried, including a certificate-bypass
  variant, still failed. The actual cause: a corporate TLS-inspection proxy
  re-signs HTTPS with an internal root CA. Windows/curl (Schannel, backed
  by the Windows certificate store) trusts that root because IT installs
  it there; Node bundles its own OpenSSL-based CA store and does not.

  CONFIRMED FIX: running node with `--use-system-ca` (Node 22.9+) makes
  Node trust the OS certificate store too, the same way curl does — proven
  live via planning-probe.ts, which showed the untouched default connect
  successfully (HTTP 200) once that flag was added. This is a boot-time
  flag, not something this module can apply to an already-running process
  — see puller/README.md for the run commands, all of which now carry it.
  hasUseSystemCaFlag() below only reports whether the CURRENT process was
  started with it, so callers can warn early instead of failing opaquely
  mid-request.
*/

import { ProxyAgent } from 'undici'

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

export const BOT_USER_AGENT = 'opportunity-radar-spike/0.1 (planning-search, low-volume)'

/** Whether THIS process was started with --use-system-ca — the confirmed
 *  fix for the corporate TLS-inspection proxy in front of Southwark's
 *  planning site (see file header). Can only report on the current
 *  process; the flag itself is boot-time and can't be applied after the
 *  fact — see puller/README.md's run commands. */
export function hasUseSystemCaFlag(): boolean {
  return process.execArgv.includes('--use-system-ca') || (process.env.NODE_OPTIONS ?? '').includes('--use-system-ca')
}

/** Every "name=value" pair from the response's Set-Cookie header(s),
 *  joined for replay as a request Cookie header. Uses getSetCookie() (not
 *  the lossy, comma-joined get('set-cookie')) so a NetScaler persistence
 *  cookie (NSC_...) alongside a JSESSIONID are both captured, not just one. */
export function collectCookiePairs(res: Response): string[] {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  return raw.map((c) => c.split(';')[0].trim()).filter(Boolean)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
