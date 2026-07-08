import type { Opportunity, ScoreBreakdown } from './types'
import { ACTIVE_STATUSES, SCORE_CRITERIA } from './types'

/**
 * Score bands. The brief's interpretation table implies a scale beyond 30,
 * but six criteria at 1–5 cap at 30 — so the bands are rescaled to the
 * 6–30 range while keeping the four-tier reading:
 * Low relevance → Watch → Research further → Priority opportunity.
 */
export type ScoreBand = 'Low relevance' | 'Watch' | 'Research further' | 'Priority'

export const SCORE_BANDS: { band: ScoreBand; min: number; max: number; range: string }[] = [
  { band: 'Priority', min: 27, max: 30, range: '27–30' },
  { band: 'Research further', min: 23, max: 26, range: '23–26' },
  { band: 'Watch', min: 16, max: 22, range: '16–22' },
  { band: 'Low relevance', min: 0, max: 15, range: '≤ 15' },
]

export function totalScore(s: ScoreBreakdown): number {
  return SCORE_CRITERIA.reduce((sum, c) => sum + s[c.key], 0)
}

export function scoreBand(total: number): ScoreBand {
  for (const b of SCORE_BANDS) if (total >= b.min) return b.band
  return 'Low relevance'
}

export function confidenceLabel(pct: number): string {
  if (pct >= 75) return 'High'
  if (pct >= 50) return 'Medium'
  return 'Low'
}

/** Monday of the current briefing week (the prototype is pinned to w/c 6 July 2026). */
export const WEEK_START = '2026-07-06'
export const TODAY = '2026-07-08'
/** A lead is stale when its last review predates this. */
export const REVIEW_CUTOFF = '2026-06-24'

export function isNewThisWeek(o: Opportunity): boolean {
  return o.dateAdded >= WEEK_START
}

export function needsReview(o: Opportunity): boolean {
  return ACTIVE_STATUSES.includes(o.status) && o.lastReviewed < REVIEW_CUTOFF
}

export function isPriority(o: Opportunity): boolean {
  return totalScore(o.scores) >= 27
}

export function byScoreDesc(a: Opportunity, b: Opportunity): number {
  return totalScore(b.scores) - totalScore(a.scores)
}

export function topRanked(list: Opportunity[], n: number): Opportunity[] {
  return [...list]
    .filter((o) => ACTIVE_STATUSES.includes(o.status))
    .sort(byScoreDesc)
    .slice(0, n)
}

export function countBy<K extends string>(
  list: Opportunity[],
  key: (o: Opportunity) => K,
): { label: K; count: number }[] {
  const map = new Map<K, number>()
  for (const o of list) map.set(key(o), (map.get(key(o)) ?? 0) + 1)
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
