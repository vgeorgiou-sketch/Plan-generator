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
  postcode?: string // normalised "OUT IN"
  buildingNumber?: string // leading street number, e.g. "38" or "38-48"
  tokens: string[] // significant words, upper-cased, de-noised
}

const NOISE = new Set([
  'FLAT', 'UNIT', 'FLOOR', 'GROUND', 'THE', 'AND', 'OF', 'LTD', 'LIMITED',
  'HOUSE', 'BUILDING', 'LONDON', 'STREET', 'ST', 'ROAD', 'RD', 'LANE',
  'AVENUE', 'AVE', 'SUITE', 'C/O',
])

export function parseAddress(raw: string): ParsedAddress {
  const upper = raw.toUpperCase()
  const pcMatch = upper.match(UK_POSTCODE)
  const postcode = pcMatch ? `${pcMatch[1]} ${pcMatch[2]}`.replace(/\s+/g, ' ').trim() : undefined

  // building number: a leading number, possibly a range like 38-48 or 38–48
  const numMatch = upper.match(/\b(\d+[A-Z]?(?:\s*[-–]\s*\d+[A-Z]?)?)\b/)
  const buildingNumber = numMatch ? numMatch[1].replace(/\s*[-–]\s*/, '-') : undefined

  const withoutPc = postcode ? upper.replace(UK_POSTCODE, ' ') : upper
  const tokens = withoutPc
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NOISE.has(t) && !/^\d+$/.test(t))

  return { raw, postcode, buildingNumber, tokens }
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
 * Different known postcodes are a hard zero — never merge across postcodes.
 */
export function matchAddress(a: string, b: string): MatchResult {
  const pa = parseAddress(a)
  const pb = parseAddress(b)

  if (pa.postcode && pb.postcode && pa.postcode !== pb.postcode) {
    return { score: 0, exact: false }
  }

  let score = 0
  const samePostcode = pa.postcode && pb.postcode && pa.postcode === pb.postcode
  if (samePostcode) score += 0.6

  const numsAgree =
    pa.buildingNumber !== undefined && pa.buildingNumber === pb.buildingNumber
  if (numsAgree) score += 0.25

  score += 0.4 * tokenOverlap(pa.tokens, pb.tokens)

  score = Math.min(1, score)
  return { score, exact: Boolean(samePostcode && numsAgree) }
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
