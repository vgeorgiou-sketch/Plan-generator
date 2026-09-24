/*
  planning.data.gov.uk — the national Planning Data Platform (MHCLG).

  UNCONFIRMED whether it exposes APPLICATION-level records (individual live
  planning applications with proposal text, dates, references) at all, as
  opposed to the spatial/policy datasets (conservation areas, article 4
  directions, listed buildings, brownfield land) this platform has
  historically been built around. That distinction matters: policy/spatial
  data would NOT answer "does 38-48 Southwark Bridge Road have a planning
  application on record" the way this signal source needs.

  This sandbox could not check either way: planning.data.gov.uk, and even
  bare www.gov.uk, are egress-blocked here — same wall as every council site
  attempted for this and earlier signal sources. So this file is a PROBE,
  not a proven client. Treat candidateEntityUrls() as informed guesses at
  the platform's own documented `entity.json` convention, not confirmed
  endpoints — planning-probe.ts reports what's actually there.

  If a live run confirms application-level coverage for Southwark, this
  REPLACES planning.ts's Idox scraper per the brief's own instruction
  ("if it does, this is the robust structured source"). Until then, planning.ts
  (Idox) is the real, working, tested path — do not treat this file as load-
  bearing.
*/

export const PLANNING_DATA_HOST = 'www.planning.data.gov.uk'
const BASE = `https://${PLANNING_DATA_HOST}`

/** Southwark, per the brief's own manual investigation — not independently confirmed here. */
export const SOUTHWARK_ORG_ENTITY = 329
export const SOUTHWARK_LPA_CODE = 'E60000198'

export interface CandidateUrl {
  name: string
  url: string
  /** What a match here would tell us, so a probe result is self-explanatory. */
  answers: string
}

export function candidateEntityUrls(): CandidateUrl[] {
  return [
    {
      name: 'dataset list',
      url: `${BASE}/dataset.json`,
      answers: 'Whether a dataset resembling "planning-application" (vs. only spatial/policy datasets) exists at all.',
    },
    {
      name: 'entity.json filtered by Southwark org-entity',
      url: `${BASE}/entity.json?organisation-entity=${SOUTHWARK_ORG_ENTITY}&limit=10`,
      answers: 'What datasets/typologies actually exist FOR Southwark, and their field shape.',
    },
    {
      name: 'entity.json guessing a planning-application dataset',
      url: `${BASE}/entity.json?dataset=planning-application&organisation-entity=${SOUTHWARK_ORG_ENTITY}&limit=10`,
      answers: 'The direct guess — if this 404s/empties out, the dataset name differs or does not exist.',
    },
  ]
}
