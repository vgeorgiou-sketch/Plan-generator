/*
  Task 0 pure logic — ownership-change detection and lead-time computation.

  No network here. These functions take Companies House filing-history items
  (as returned by GET /company/{n}/filing-history) and answer: which filings
  represent an ownership/financing change, and how many days before the press
  report did the earliest one land? Fully unit-tested (./leadTime.test.ts).
*/

/** Minimal shape of a Companies House filing-history item we rely on. */
export interface ChFiling {
  transaction_id?: string
  category: string // e.g. "incorporation", "persons-with-significant-control", "mortgage", "capital", "change-of-name"
  type?: string // form type, e.g. "NEWINC", "PSC01", "MR01", "SH01"
  date: string // YYYY-MM-DD, the filing date
  description?: string
}

/**
 * Categories that reflect a change of ownership, control or financing —
 * the kinetic events the brief calls out (fresh SPV, PSC change, new charge,
 * share/capital change, or a rename on acquisition).
 */
export const OWNERSHIP_CHANGE_CATEGORIES = new Set<string>([
  'incorporation',
  'persons-with-significant-control',
  'mortgage',
  'capital',
  'change-of-name',
])

/**
 * For an LLP, a change of member IS a change of ownership (filed under the
 * `officers` category). For a Ltd, an `officers` filing is a director change,
 * which is NOT ownership — so this only counts when isLLP is set.
 */
const LLP_OWNERSHIP_CATEGORIES = new Set<string>(['officers'])

/** LLP company numbers are prefixed OC (E&W), SO (Scotland) or NC (NI). */
export function isLLPNumber(companyNumber: string): boolean {
  return /^(OC|SO|NC)\d+$/i.test(companyNumber.trim())
}

export function isOwnershipChange(filing: ChFiling, opts?: { isLLP?: boolean }): boolean {
  if (OWNERSHIP_CHANGE_CATEGORIES.has(filing.category)) return true
  if (opts?.isLLP && LLP_OWNERSHIP_CATEGORIES.has(filing.category)) return true
  return false
}

function toUtcDays(iso: string): number {
  const t = Date.parse(iso.length === 7 ? iso + '-01' : iso + 'T00:00:00Z')
  if (Number.isNaN(t)) throw new Error(`Unparseable date: ${iso}`)
  return Math.floor(t / 86_400_000)
}

export function leadTimeDays(filingDate: string, pressDate: string): number {
  return toUtcDays(pressDate) - toUtcDays(filingDate)
}

export interface LeadTimeResult {
  /** Earliest ownership-change filing inside the window, or null if none. */
  drivingFiling: ChFiling | null
  leadTimeDays: number | null
  /** All ownership-change filings found, oldest first — for the analyst to eyeball. */
  candidates: ChFiling[]
}

/**
 * Pick the earliest ownership-change filing within `windowDays` before the
 * press date, and compute the lead time. Filings after the press date, or
 * older than the window, are ignored for the headline but still returned
 * as candidates.
 */
export function summariseLeadTime(
  filings: ChFiling[],
  pressDate: string,
  windowDays = 730,
  opts?: { isLLP?: boolean },
): LeadTimeResult {
  const pressDays = toUtcDays(pressDate)
  const candidates = filings
    .filter((f) => isOwnershipChange(f, opts))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  const inWindow = candidates.filter((f) => {
    const d = toUtcDays(f.date)
    return d <= pressDays && pressDays - d <= windowDays
  })

  const drivingFiling = inWindow[0] ?? null
  return {
    drivingFiling,
    leadTimeDays: drivingFiling ? pressDays - toUtcDays(drivingFiling.date) : null,
    candidates,
  }
}
