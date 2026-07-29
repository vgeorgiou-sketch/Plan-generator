/*
  Address matching — pure, no network.

  Joining kinetic hits (SPVs, charges, demolition notices) to the pressure
  universe (EPC/VOA buildings) is fuzzy by nature: a Companies House
  registered office rarely reads identically to an EPC address string. This
  keeps the fuzziness explicit and scored, so the caller can decide what
  becomes a `filed` vs `inferred` fact per the data model.
*/

const UK_POSTCODE = /([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})/i

export interface ParsedAddress {
  raw: string
  postcode?: string // normalised full "OUT IN" when present
  district?: string // outward code only, e.g. "SE1" — present even for district-level addresses
  buildingNumber?: string // leading street number, e.g. "38" or "38-48"
  tokens: string[] // significant words, upper-cased, de-noised
}

const NOISE = new Set([
  'FLAT', 'UNIT', 'FLOOR', 'GROUND', 'THE', 'AND', 'OF', 'LTD', 'LIMITED',
  'HOUSE', 'BUILDING', 'LONDON', 'STREET', 'ST', 'ROAD', 'RD', 'LANE',
  'AVENUE', 'AVE', 'SUITE', 'C/O',
])

/** A bare outward code (district) like SE1, EC4V — the first half of a postcode. */
const OUTWARD_CODE = /^[A-Z]{1,2}\d[A-Z\d]?$/

export function parseAddress(raw: string): ParsedAddress {
  const upper = raw.toUpperCase()
  const pcMatch = upper.match(UK_POSTCODE)
  const postcode = pcMatch ? `${pcMatch[1]} ${pcMatch[2]}`.replace(/\s+/g, ' ').trim() : undefined

  // building number: a leading number, possibly a range like 38-48 or 38–48
  const numMatch = upper.match(/\b(\d+[A-Z]?(?:\s*[-–]\s*\d+[A-Z]?)?)\b/)
  const buildingNumber = numMatch ? numMatch[1].replace(/\s*[-–]\s*/, '-') : undefined

  const withoutPc = postcode ? upper.replace(UK_POSTCODE, ' ') : upper
  const rawTokens = withoutPc
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  // district = outward code. From a full postcode when present, else a bare
  // outward token (a district-only address like "…Southwark Bridge Road SE1").
  const district = postcode ? postcode.split(' ')[0] : rawTokens.find((t) => OUTWARD_CODE.test(t))

  const tokens = rawTokens.filter(
    (t) => t.length > 1 && !NOISE.has(t) && !/^\d+$/.test(t) && t !== district,
  )

  return { raw, postcode, district, buildingNumber, tokens }
}

function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setB = new Set(b)
  const shared = a.filter((t) => setB.has(t)).length
  return shared / Math.max(a.length, b.length)
}

export interface MatchResult {
  score: number // 0–1
  /** True when postcode AND building number agree — safe to treat as `filed`. */
  exact: boolean
}

/**
 * Score how likely two address strings refer to the same building.
 * Conflicting full postcodes — or conflicting districts — are a hard zero;
 * never merge across areas. A full-postcode match scores higher than a
 * district-only match, but a district match still lets a confident
 * number + street match clear threshold (needed when one side has only a
 * district, e.g. an EPC row vs a district-level seed address).
 */
export function matchAddress(a: string, b: string): MatchResult {
  const pa = parseAddress(a)
  const pb = parseAddress(b)

  if (pa.postcode && pb.postcode && pa.postcode !== pb.postcode) return { score: 0, exact: false }
  if (pa.district && pb.district && pa.district !== pb.district) return { score: 0, exact: false }

  let score = 0
  const fullPostcodeMatch = Boolean(pa.postcode && pb.postcode && pa.postcode === pb.postcode)
  const districtMatch = Boolean(pa.district && pb.district && pa.district === pb.district)
  if (fullPostcodeMatch) score += 0.6
  else if (districtMatch) score += 0.45

  const numsAgree = pa.buildingNumber !== undefined && pa.buildingNumber === pb.buildingNumber
  if (numsAgree) score += 0.25

  score += 0.4 * tokenOverlap(pa.tokens, pb.tokens)

  score = Math.min(1, score)
  // "exact" (safe to treat as filed) still requires a FULL postcode + number.
  return { score, exact: Boolean(fullPostcodeMatch && numsAgree) }
}

/** Best match for `needle` among `haystack`, above `threshold` (default 0.7). */
export function bestMatch<T>(
  needle: string,
  haystack: T[],
  addressOf: (item: T) => string,
  threshold = 0.7,
): { item: T; result: MatchResult } | null {
  let best: { item: T; result: MatchResult } | null = null
  for (const item of haystack) {
    const result = matchAddress(needle, addressOf(item))
    if (result.score >= threshold && (!best || result.score > best.result.score)) {
      best = { item, result }
    }
  }
  return best
}
