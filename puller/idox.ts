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

const DATE_LABELS = [/Registered(?:\s*Date)?:?\s*([\d/]{6,10})/i, /Valid(?:ation)? ?Date:?\s*([\d/]{6,10})/i, /Received:?\s*([\d/]{6,10})/i]

function extractDateText(block: string): string | undefined {
  const plain = stripTags(block)
  for (const pattern of DATE_LABELS) {
    const m = plain.match(pattern)
    if (m) return m[1]
  }
  return undefined
}

/** UK "DD/MM/YYYY" (Idox's usual date format) → ISO "YYYY-MM-DD", or
 *  undefined if it doesn't parse — never guess a date shape. */
export function ukDateToIso(s: string): string | undefined {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return undefined
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Parse a list-style Idox results page into rows. */
export function parseIdoxResultList(html: string, base = IDOX_BASE): IdoxResultRow[] {
  const rows: IdoxResultRow[] = []
  const blocks = html.match(/<li[^>]*class="[^"]*searchresult[^"]*"[\s\S]*?<\/li>/gi) ?? []
  for (const block of blocks) {
    const anchor = block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!anchor) continue
    const href = anchor[1].replace(/&amp;/g, '&')
    const description = stripTags(anchor[2])
    const addrMatch = block.match(/<p[^>]*class="[^"]*address[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    const address = addrMatch ? stripTags(addrMatch[1]) : ''
    const refMatch = (description + ' ' + address).match(/\b\d{2}\/[A-Z]{2}\/\d{3,5}\b/)
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
