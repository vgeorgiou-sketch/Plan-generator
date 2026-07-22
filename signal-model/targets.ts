/*
  Real validation target — Southwark Bridge Road (Task 0 of the puller brief).

  This is deliberately NOT a list of fabricated Signals. Every Signal demands
  precise, cited provenance (observedAt, sourceUrl); the facts below are only
  known at the granularity the public record and the trade-press report give
  us. The puller's job (see ../puller) is to resolve the owning entity's
  Companies House filing history into a properly dated Signal and compute the
  real lead time. Until it runs where egress + a key exist, the lead time is
  unknown — not estimated, not mocked.
*/

export interface KnownEvent {
  what: string
  /** Granularity we actually have — year or month, never a fake precise day. */
  when: string
  citation: string
  /** What still has to be pulled to turn this into a dated Signal. */
  resolvesTo?: string
}

export interface ValidationTarget {
  address: string
  postcode: string
  borough: string
  claim: string
  /**
   * Confirmed applicant entity, from the Southwark planning application. When
   * set, Task 0 ties the headline lead-time to THIS entity by exact-name match,
   * not to whichever candidate happens to have the longest lead.
   */
  applicant?: string
  /** Assumed press publication date for the lead-time baseline — adjust to the exact issue date when known. */
  pressBaseline: string
  /** Search terms for the Companies House puller (Task 0, step 1). */
  companiesHouseSearch: string[]
  knownEvents: KnownEvent[]
}

export const SOUTHWARK_BRIDGE_ROAD: ValidationTarget = {
  address: '38–48 Southwark Bridge Road',
  postcode: 'SE1',
  borough: 'Southwark',
  claim:
    'Public records revealed the ownership + use change before it appeared in trade press. ' +
    'Measure: press date − earliest ownership-change filing date = lead time in days.',
  applicant: 'Southwark Bridge Road LLP', // confirmed applicant on the Southwark planning application
  pressBaseline: '2026-06-01', // Building magazine, June 2026 — refine to the exact issue date
  companiesHouseSearch: [
    'Southwark Bridge Road LLP', // the confirmed applicant — search this exact name first
  ],
  knownEvents: [
    {
      what: 'Office scheme approved (owner: UBS Asset Management; architect: Lifschutz Davidson Sandilands)',
      when: '2023',
      citation: 'Building magazine, June 2026 (retrospective); confirm via Southwark planning register',
      resolvesTo: 'planningApplication signal — pull application ref + decision date from Southwark Public Access',
    },
    {
      what: 'Resubmitted under new ownership, new architect (Morris + Co), use switched to co-living',
      when: '2026-04',
      citation: 'Building magazine, June 2026; applicant confirmed as Southwark Bridge Road LLP on the Southwark planning application',
      resolvesTo: 'planningApplication signal — pull resubmission ref + validation date',
    },
    {
      what: 'Ownership-change filing of Southwark Bridge Road LLP (PSC / member change / charge)',
      when: 'to be read from the LLP filing history',
      citation: 'Companies House filing history for Southwark Bridge Road LLP',
      resolvesTo: 'companiesHouseSpv/charge signal — the driver of the lead-time claim',
    },
  ],
}
