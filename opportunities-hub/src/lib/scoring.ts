import type { Opportunity, ScoreBreakdown } from './types'
import { ACTIVE_OPPORTUNITY_STATUSES, SCORE_CRITERIA } from './types'

/** Seven criteria at 1–5 → total out of 35. */
export function totalScore(s: ScoreBreakdown): number {
  return SCORE_CRITERIA.reduce((sum, c) => sum + s[c.key], 0)
}

export type ScoreBand = 'Low relevance' | 'Watch' | 'Research further' | 'Priority'

export const SCORE_BANDS: { band: ScoreBand; min: number; range: string; meaning: string }[] = [
  { band: 'Priority', min: 31, range: '31–35', meaning: 'Priority opportunity — partner attention this week' },
  { band: 'Research further', min: 25, range: '25–30', meaning: 'Research further — assign an owner and qualify' },
  { band: 'Watch', min: 16, range: '16–24', meaning: 'Watch — keep on the radar, low effort' },
  { band: 'Low relevance', min: 0, range: '0–15', meaning: 'Low relevance — ignore unless something changes' },
]

export function scoreBand(total: number): ScoreBand {
  for (const b of SCORE_BANDS) if (total >= b.min) return b.band
  return 'Low relevance'
}

/** The prototype is pinned to a fixed briefing week. */
export const TODAY = '2026-07-08'
export const WEEK_START = '2026-07-06'
export const REVIEW_CUTOFF = '2026-06-24'

export function isNewThisWeek(dateIso: string): boolean {
  return dateIso >= WEEK_START
}

export function needsAction(o: Opportunity): boolean {
  return ACTIVE_OPPORTUNITY_STATUSES.includes(o.status) && o.lastReviewed < REVIEW_CUTOFF
}

export function isPriority(o: Opportunity): boolean {
  return totalScore(o.scores) >= 31
}

export function byScoreDesc(a: Opportunity, b: Opportunity): number {
  return totalScore(b.scores) - totalScore(a.scores)
}

export function topRanked(list: Opportunity[], n: number): Opportunity[] {
  return [...list]
    .filter((o) => ACTIVE_OPPORTUNITY_STATUSES.includes(o.status))
    .sort(byScoreDesc)
    .slice(0, n)
}

export function countBy<T, K extends string>(list: T[], key: (item: T) => K): { label: K; count: number }[] {
  const map = new Map<K, number>()
  for (const item of list) map.set(key(item), (map.get(key(item)) ?? 0) + 1)
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

export function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatDateLong(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
