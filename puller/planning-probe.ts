/*
  Planning source probe — a diagnostic FUNNEL, not a flat variant list.

  Built to answer a specific real report: "the site opens fine in my office
  browser, but this script gets blocked." That's not a firewall — a browser
  auto-detects an office HTTP proxy (WPAD/PAC/OS settings); Node's fetch does
  not. Two independent, testable causes, checked in order:

    1. CONNECTIVITY — does Node even reach the host, direct vs. via a
       detected HTTPS_PROXY? (netEnv.ts wires the proxy automatically when
       set; this section proves whether one is needed AND whether it's
       actually configured.)
    2. USER-AGENT — once connectivity works, does Idox (or something in
       front of it) respond differently to a self-identifying bot UA vs. a
       real browser UA?
    3. SESSION/COOKIE — does the actual address search need a session
       cookie from a warm-up request, unlike the weekly list's stateless GET?

  Each section only runs if the previous one found a working combination —
  no point testing UA sensitivity against a host we can't reach at all.
  Finishes by running the two known cases with whatever combination worked,
  reporting whether the manually-confirmed references actually appear:
  23/AP/3411 (68 Borough Road) and 26/00849/OBS (38-48 Southwark Bridge Road).

  Run: node --experimental-strip-types puller/planning-probe.ts
  Needs no API key (Southwark's planning search is unauthenticated) — just
  egress, possibly through a proxy. Also checks planning.data.gov.uk first,
  unrelated to any of this (see planningDataGovUk.ts).

  Nothing here is parsed blindly or trusted silently — every result reports
  status/body evidence, so it can't crash and can't quietly mislead.
*/

import { candidateEntityUrls } from './planningDataGovUk.ts'
import { planningSearchVariants, matchPlanningRows } from './planning.ts'
import { looksLikeIdoxResultsPage, parseIdoxResultList, ukDateToIso, IDOX_BASE } from './idox.ts'
import { detectProxyUrl, proxyDispatcher, BOT_USER_AGENT, BROWSER_USER_AGENT } from './netEnv.ts'
import { BODY_SNIPPET_LEN, snippet } from './jsonResponse.ts'
import { fileURLToPath } from 'node:url'

const ADDRESSES = ['38-48 Southwark Bridge Road', '68 Borough Road']
const KNOWN_REFS: Record<string, string> = { '38-48 Southwark Bridge Road': '26/00849/OBS', '68 Borough Road': '23/AP/3411' }

interface RawResult {
  ok: boolean
  status?: number
  setCookie?: string
  body?: string
  error?: string
}

async function rawFetch(url: string, opts: { useProxy: boolean; userAgent: string; cookie?: string }): Promise<RawResult> {
  const dispatcher = opts.useProxy ? proxyDispatcher() : undefined
  const headers: Record<string, string> = { 'User-Agent': opts.userAgent }
  if (opts.cookie) headers['Cookie'] = opts.cookie
  try {
    const res = await fetch(url, { headers, redirect: 'follow', ...(dispatcher ? { dispatcher } : {}) } as RequestInit)
    return { ok: res.ok, status: res.status, setCookie: res.headers.get('set-cookie') ?? undefined, body: await res.text().catch(() => '') }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function probePlanningDataGovUk(): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\nSource: planning.data.gov.uk (national platform — unrelated to the funnel below)\n`)
  for (const c of candidateEntityUrls()) {
    console.log(`── ${c.name}\n   URL: ${c.url}\n   Answers: ${c.answers}`)
    const r = await rawFetch(c.url, { useProxy: true, userAgent: BOT_USER_AGENT })
    if (r.error) {
      console.log(`   ✗ request failed: ${r.error}\n`)
      continue
    }
    console.log(`   status: ${r.status}`)
    try {
      const parsed = JSON.parse(r.body ?? '')
      console.log(`   ✓ JSON. Top-level: ${Array.isArray(parsed) ? `array[${parsed.length}]` : Object.keys(parsed).join(', ')}`)
    } catch {
      console.log(`   body[0..${BODY_SNIPPET_LEN}]: ${snippet(r.body ?? '')}`)
    }
    console.log('')
  }
}

/** Section 1: does Node reach Idox at all — direct, or only via a proxy? */
async function probeConnectivity(): Promise<{ useProxy: boolean } | null> {
  console.log(`\n${'═'.repeat(70)}\nSection 1 — connectivity: direct vs. proxy\n`)
  const proxyUrl = detectProxyUrl()
  console.log(`HTTPS_PROXY / https_proxy detected: ${proxyUrl ?? '(none — if your browser uses one, this script cannot find it automatically; set HTTPS_PROXY and re-run)'}`)

  const target = `${IDOX_BASE}/`
  const direct = await rawFetch(target, { useProxy: false, userAgent: BOT_USER_AGENT })
  console.log(`\nDirect (no proxy): ${direct.error ? `✗ ${direct.error}` : `✓ HTTP ${direct.status}`}`)

  let viaProxy: RawResult | null = null
  if (proxyUrl) {
    viaProxy = await rawFetch(target, { useProxy: true, userAgent: BOT_USER_AGENT })
    console.log(`Via detected proxy:  ${viaProxy.error ? `✗ ${viaProxy.error}` : `✓ HTTP ${viaProxy.status}`}`)
  } else {
    console.log('Via proxy:           (skipped — no HTTPS_PROXY set to test)')
  }

  if (!direct.error) {
    console.log('\n→ Direct connection reaches the host. A proxy is likely NOT the cause here — proceeding without one.')
    return { useProxy: false }
  }
  if (viaProxy && !viaProxy.error) {
    console.log('\n→ CONFIRMED: direct connection fails, but the detected proxy reaches the host.')
    console.log('  This IS cause (1) — Node needs HTTPS_PROXY set explicitly. Keep it set for real runs.')
    return { useProxy: true }
  }
  console.log('\n→ Neither direct nor (if tested) proxied connections reached the host.')
  if (!proxyUrl) {
    console.log('  No proxy was configured to test. Find your office proxy URL (Windows: Settings → Network')
    console.log('  → Proxy, or ask IT / check `netsh winhttp show proxy`) and set HTTPS_PROXY=http://host:port,')
    console.log('  then re-run this probe.')
  } else {
    console.log('  The detected proxy did not help either — this may be a genuine firewall block, or the')
    console.log('  proxy URL/credentials are wrong. Not a User-Agent or session issue if connectivity itself fails.')
  }
  return null
}

/** Section 2: once connectivity works, does User-Agent change the response? */
async function probeUserAgent(useProxy: boolean): Promise<string> {
  console.log(`\n${'═'.repeat(70)}\nSection 2 — User-Agent sensitivity\n`)
  const target = `${IDOX_BASE}/`
  const bot = await rawFetch(target, { useProxy, userAgent: BOT_USER_AGENT })
  const browser = await rawFetch(target, { useProxy, userAgent: BROWSER_USER_AGENT })

  console.log(`Bot UA     ("${BOT_USER_AGENT}"):\n  ${bot.error ? `✗ ${bot.error}` : `HTTP ${bot.status}, ${bot.body?.length ?? 0} bytes`}`)
  console.log(`Browser UA ("${BROWSER_USER_AGENT.slice(0, 40)}…"):\n  ${browser.error ? `✗ ${browser.error}` : `HTTP ${browser.status}, ${browser.body?.length ?? 0} bytes`}`)

  const botLooksReal = Boolean(bot.body && looksLikeIdoxResultsPage(bot.body)) || bot.status === 200
  const browserLooksReal = Boolean(browser.body && looksLikeIdoxResultsPage(browser.body)) || browser.status === 200

  if (botLooksReal && !browserLooksReal) {
    console.log('\n→ Bot UA works, browser UA does not (unusual, but going with what works) — using BOT UA.')
    return BOT_USER_AGENT
  }
  if (browserLooksReal && !botLooksReal) {
    console.log('\n→ CONFIRMED: browser UA works where the bot UA does not. This IS cause (2) — Idox (or')
    console.log('  something in front of it) is UA-sniffing. Using a realistic browser UA from here.')
    return BROWSER_USER_AGENT
  }
  console.log('\n→ No clear difference from User-Agent alone. Defaulting to the honest bot UA and moving on')
  console.log('  to the session/cookie test — the real discriminator may be there instead.')
  return BOT_USER_AGENT
}

/** Section 3, per address: does the search need a session cookie? */
async function probeAddress(address: string, useProxy: boolean, userAgent: string): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\nSection 3 — ${address}\n`)
  const knownRef = KNOWN_REFS[address]

  for (const variant of planningSearchVariants(address)) {
    console.log(`\n── ${variant.name} — WITHOUT a session cookie`)
    const noCookie = await rawFetch(variant.url, { useProxy, userAgent })
    await reportVariantResult(noCookie, address, knownRef)

    console.log(`\n── ${variant.name} — WITH a warm-up session cookie`)
    const warmup = await rawFetch(`${IDOX_BASE}/search.do?action=simple`, { useProxy, userAgent })
    if (warmup.setCookie) {
      console.log(`   warm-up set-cookie: ${warmup.setCookie.slice(0, 80)}${warmup.setCookie.length > 80 ? '…' : ''}`)
      const withCookie = await rawFetch(variant.url, { useProxy, userAgent, cookie: warmup.setCookie })
      await reportVariantResult(withCookie, address, knownRef)
    } else {
      console.log('   warm-up request set no cookie at all — session handling is likely not the issue here.')
    }
  }
}

async function reportVariantResult(r: RawResult, address: string, knownRef: string): Promise<void> {
  if (r.error) {
    console.log(`   ✗ request failed: ${r.error}`)
    return
  }
  console.log(`   status: ${r.status}`)
  const looksReal = Boolean(r.body && looksLikeIdoxResultsPage(r.body))
  console.log(`   looks like a real results page: ${looksReal ? 'YES' : 'no (session/login/error page?)'}`)
  if (!looksReal) {
    console.log(`   body[0..${BODY_SNIPPET_LEN}]: ${snippet(r.body ?? '')}`)
    return
  }
  const rows = parseIdoxResultList(r.body ?? '')
  const matches = matchPlanningRows(rows, address)
  console.log(`   rows parsed: ${rows.length} · matched to this address: ${matches.length}`)
  const isoDates = rows.map((row) => (row.dateText ? ukDateToIso(row.dateText) : undefined)).filter((d): d is string => Boolean(d)).sort()
  if (isoDates.length) console.log(`   date span: ${isoDates[0]} .. ${isoDates[isoDates.length - 1]}`)
  const foundKnown = matches.some((m) => m.reference === knownRef)
  console.log(`   ${foundKnown ? '✓' : '✗'} manually-confirmed reference ${knownRef}: ${foundKnown ? 'FOUND' : 'not found'}`)
  for (const m of matches.slice(0, 5)) console.log(`     · ${m.reference || '(no ref)'} | ${m.dateText ?? '(no date)'} | ${m.description}`)
}

async function main() {
  await probePlanningDataGovUk()

  const connectivity = await probeConnectivity()
  if (!connectivity) {
    console.log(`\n${'═'.repeat(70)}\nStopping here — fix connectivity (Section 1) before UA/session tests mean anything.`)
    return
  }

  const userAgent = await probeUserAgent(connectivity.useProxy)

  for (const address of ADDRESSES) await probeAddress(address, connectivity.useProxy, userAgent)

  console.log(`
${'═'.repeat(70)}
Summary of what worked:
  proxy needed:   ${connectivity.useProxy ? 'YES — keep HTTPS_PROXY set' : 'no'}
  user-agent:     ${userAgent === BROWSER_USER_AGENT ? 'browser UA required' : 'bot UA fine'}
  session cookie: see the "WITH a warm-up session cookie" results above, per variant

Both known cases pass when a variant above shows the manually-confirmed
reference FOUND: 26/00849/OBS for Southwark Bridge Road, 23/AP/3411 for
68 Borough Road. Paste this output back and I'll wire the winning
combination into checkPlanningForAddress as the real default.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nProbe failed: ' + (err as Error).message)
    process.exit(1)
  })
}
