/*
  Shared Idox Public Access parsing.

  Southwark's planning site (planning.southwark.gov.uk/online-applications)
  runs a standard Idox Public Access install. Its result-list HTML
  (<li class="searchresult">…) is the SAME markup convention across every
  list-style page on the site — the Building Control weekly list
  (southwarkDemolition.ts) and a planning application search (planning.ts)
  both render through it. One parser, shared, instead of two near-copies.

  Tolerant by design — Idox markup varies between installs and versions, so
  this must be checked against Southwark's live HTML before being trusted.
  See planning-probe.ts / epc-probe.ts for the same "probe before trusting"
  discipline applied to a different source.
*/

export const IDOX_BASE = 'https://planning.southwark.gov.uk/online-applications'

export interface IdoxResultRow {
  reference: string
  address: string
  description: string
  detailUrl: string
  /** Raw date text from a metaInfo line ("Registered:", "Valid Date:", etc.),
   *  if the result page includes one — NOT always present. Never invent a
   *  date when this is undefined; see planning.ts's signal builder. */
  dateText?: string
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

// Confirmed live: real result rows carry a date, just not always under one
// of the label wordings first assumed — broadened to the common Idox
// variants (label-before-value, "Date X" word order, with/without colon).
const DATE_LABELS = [
  /Registered(?:\s*Date)?:?\s*([\d/]{6,10})/i,
  /Valid(?:ation)?(?:\s*Date)?:?\s*([\d/]{6,10})/i,
  /Received(?:\s*Date)?:?\s*([\d/]{6,10})/i,
  /Date\s*Received:?\s*([\d/]{6,10})/i,
  /Application\s*Received:?\s*([\d/]{6,10})/i,
]

function extractDateText(block: string): string | undefined {
  const plain = stripTags(block)
  for (const pattern of DATE_LABELS) {
    const m = plain.match(pattern)
    if (m) return m[1]
  }
  // Last resort, not a fabrication: a short result-list row rarely carries
  // more than one date. If none of the known labels matched — Idox's exact
  // wording varies between installs — but there's still one obvious
  // UK-date-shaped token in the row, it's almost certainly the real one;
  // extend DATE_LABELS above instead of relying on this once the real
  // label wording is confirmed.
  const anyDate = plain.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)
  return anyDate ? anyDate[0] : undefined
}

/** UK "DD/MM/YYYY" (Idox's usual date format) → ISO "YYYY-MM-DD", or
 *  undefined if it doesn't parse — never guess a date shape. */
export function ukDateToIso(s: string): string | undefined {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return undefined
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Southwark reference formats CONFIRMED real (not guessed): "23/AP/3411"
// (YY/AP/NNNN — the common full-application shape) and "26/00849/OBS"
// (YY/NNNNN/XXX — seen on the real Southwark Bridge Road record). Two
// distinct shapes on the same council's records, so both are matched.
const REFERENCE = /\b\d{2}\/(?:[A-Z]{2}\/\d{3,5}|\d{4,6}\/[A-Z]{2,4})\b/

/** Parse a list-style Idox results page into rows. */
export function parseIdoxResultList(html: string, base = IDOX_BASE): IdoxResultRow[] {
  const rows: IdoxResultRow[] = []
  const blocks = html.match(/<li[^>]*class="[^"]*searchresult[^"]*"[\s\S]*?<\/li>/gi) ?? []
  for (const block of blocks) {
    const anchor = block.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i)
    if (!anchor) continue
    const anchorAttrs = anchor[1]
    const href = (anchorAttrs.match(/href=["']([^"']+)["']/i)?.[1] ?? '').replace(/&amp;/g, '&')
    if (!href) continue
    const titleAttr = anchorAttrs.match(/title=["']([^"']*)["']/i)?.[1]
    const description = stripTags(anchor[2])
    const addrMatch = block.match(/<p[^>]*class="[^"]*address[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    const address = addrMatch ? stripTags(addrMatch[1]) : ''
    // Confirmed live: the reference isn't always inside the anchor text or
    // address line — it can sit in a separate metaInfo element, or only in
    // the anchor's title tooltip. Search the WHOLE row (every text node,
    // plus the title attribute) rather than just those two fields.
    const refSearchText = stripTags(block) + (titleAttr ? ' ' + decodeEntities(titleAttr) : '')
    const refMatch = refSearchText.match(REFERENCE)
    rows.push({
      reference: refMatch ? refMatch[0] : '',
      address,
      description,
      detailUrl: href.startsWith('http') ? href : `${base}/${href.replace(/^\//, '')}`,
      dateText: extractDateText(block),
    })
  }
  return rows
}

/** Does this page look like a real Idox result-list page at all — as
 *  opposed to a session-expired, login, or generic error page? A "no
 *  results" page is still a REAL results page (zero rows is meaningful),
 *  which is why this checks for the phrase too, not just the list markup. */
export function looksLikeIdoxResultsPage(html: string): boolean {
  return /class="searchresult"|no\s+results\s+were\s+found|your\s+search\s+found/i.test(html)
}

export interface ParsedIdoxForm {
  action: string
  method: 'GET' | 'POST'
  /** Every name → value pair the form actually carries (hidden fields
   *  included) — read from the real HTML, never guessed. A search flow
   *  replays these as-is and only overrides the one field it cares about,
   *  so a session/CSRF token Idox embeds in the form survives the round
   *  trip untouched. */
  fields: Record<string, string>
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/**
 * Parse a <form> out of an Idox page: its action URL, method, and every
 * field it carries. Confirmed necessary live: a cold GET straight to a
 * results endpoint returns HTTP 500 (reproduced identically by curl, so
 * it's the request shape, not a network/TLS issue) — Idox's classic
 * pattern is GET the search form to establish a session, then POST the
 * search with that session's cookie. Picks the first <form> whose action
 * matches `actionHint` (to skip an unrelated header/site-search form on
 * the same page), or the first form on the page if none match.
 */
export function parseIdoxForm(html: string, base: string, actionHint?: RegExp): ParsedIdoxForm | undefined {
  const forms = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) ?? []
  if (!forms.length) return undefined
  const picked = (actionHint ? forms.find((f) => actionHint.test(f)) : undefined) ?? forms[0]

  const actionMatch = picked.match(/<form\b[^>]*\baction=["']([^"']*)["']/i)
  const methodMatch = picked.match(/<form\b[^>]*\bmethod=["']([^"']*)["']/i)
  const action = new URL(actionMatch ? decodeEntities(actionMatch[1]) : '', base).toString()
  const method: 'GET' | 'POST' = /post/i.test(methodMatch?.[1] ?? '') ? 'POST' : 'GET'

  const fields: Record<string, string> = {}

  const inputRe = /<input\b([^>]*)\/?>/gi
  let m: RegExpExecArray | null
  while ((m = inputRe.exec(picked))) {
    const attrs = m[1]
    const name = attrs.match(/\bname=["']([^"']+)["']/i)?.[1]
    if (!name) continue
    const type = (attrs.match(/\btype=["']([^"']+)["']/i)?.[1] ?? 'text').toLowerCase()
    if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) continue
    if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(attrs)) continue
    const value = attrs.match(/\bvalue=["']([^"']*)["']/i)?.[1]
    fields[name] = value !== undefined ? decodeEntities(value) : ''
  }

  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi
  while ((m = selectRe.exec(picked))) {
    const name = m[1].match(/\bname=["']([^"']+)["']/i)?.[1]
    if (!name) continue
    const optionRe = /<option\b([^>]*)>/gi
    let om: RegExpExecArray | null
    let chosen: string | undefined
    let first: string | undefined
    while ((om = optionRe.exec(m[2]))) {
      const val = decodeEntities(om[1].match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? '')
      if (first === undefined) first = val
      if (/\bselected\b/i.test(om[1])) chosen = val
    }
    fields[name] = chosen ?? first ?? ''
  }

  return { action, method, fields }
}
