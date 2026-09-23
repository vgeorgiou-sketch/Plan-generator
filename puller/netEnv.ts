/*
  Corporate-proxy awareness for Node fetch.

  A browser auto-detects an office/corporate HTTP proxy (via WPAD, a PAC
  file, or OS network settings) and routes through it silently. Node's
  fetch does NOT — this is a genuine, well-documented gap, not a bug in
  this codebase. If a site opens fine in a browser but Node's fetch to the
  exact same host times out or is refused, a proxy the browser is quietly
  using is the FIRST thing to check, before assuming a firewall or the
  destination site is at fault.

  Detection: the standard HTTPS_PROXY / HTTP_PROXY (and lowercase) env
  vars. Node's fetch will not read these on its own — they must be wired to
  an explicit `undici` ProxyAgent and passed as a per-request `dispatcher`.
  Deliberately NOT a global dispatcher: that would silently route every
  other fetch in this codebase (Companies House, EPC) through the same
  proxy whether or not it's needed there too.
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

// Two User-Agent strategies worth testing — some WAFs/reverse proxies treat
// a self-identifying, low-volume bot UA differently from a real browser's,
// even when nothing else about the request looks abusive.
export const BOT_USER_AGENT = 'opportunity-radar-spike/0.1 (planning-search, low-volume)'
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
