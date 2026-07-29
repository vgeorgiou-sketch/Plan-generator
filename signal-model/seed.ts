/*
  The first REAL Opportunity — 38–48 Southwark Bridge Road.

  This is the verified chain Task 0 produced; it replaces the 12 mocks, it is
  not a placeholder. Every Companies House URL below is a real, working link to
  the OC455308 record. Two source links (the planning application and the
  Building article) are marked TODO with the best real base URL — fill the
  exact deep-link when to hand; do not fabricate a precise one.

  Provenance honesty on dates: the applicant identity and the press pivot are
  filed facts, but we only have MONTH precision for their dates (April 2026 /
  June 2026). Those two carry a note; every Companies House event is day-exact.
*/

import type { Opportunity } from './types.ts'

const RETRIEVED = '2026-07-22'
const CH = 'https://find-and-update.company-information.service.gov.uk/company/OC455308'

export const SOUTHWARK_BRIDGE_ROAD_SEED: Opportunity = {
  id: 'southwark-bridge-road-38-48',
  address: '38-48 Southwark Bridge Road',
  postcode: 'SE1',
  borough: 'Southwark',
  status: 'confirmed',
  signals: [
    {
      id: 'sbr-applicant',
      buildingId: 'southwark-bridge-road-38-48',
      layer: 'planningApplicant',
      factType: 'filed',
      label: 'Applicant: Southwark Bridge Road LLP; agent DP9 for operator HUB',
      value: 'Southwark Bridge Road LLP',
      // TODO: exact Southwark Public Access application URL
      sourceUrl: 'https://planning.southwark.gov.uk/online-applications/',
      observedAt: '2026-04-01',
      retrievedAt: RETRIEVED,
      confidence: 1,
      note: 'Applicant identity filed & confirmed; application month is April 2026, exact day to confirm from Southwark Public Access.',
    },
    {
      id: 'sbr-spv',
      buildingId: 'southwark-bridge-road-38-48',
      layer: 'companiesHouseSpv',
      factType: 'filed',
      label: 'SPV incorporated: Southwark Bridge Road LLP (OC455308)',
      value: 'OC455308',
      sourceUrl: CH,
      sourceRef: 'OC455308',
      observedAt: '2025-01-28',
      retrievedAt: RETRIEVED,
      confidence: 1,
    },
    {
      id: 'sbr-psc-hub-ceased',
      buildingId: 'southwark-bridge-road-38-48',
      layer: 'companiesHousePsc',
      factType: 'filed',
      label: 'Control ceased: Hub Living Developments Limited (25–50% voting rights)',
      value: 'ceased 2025-03-18',
      sourceUrl: `${CH}/persons-with-significant-control`,
      observedAt: '2025-03-18',
      retrievedAt: RETRIEVED,
      confidence: 1,
      note: 'HUB held direct control for ~7 weeks post-incorporation before stepping back — display distinctly from an active PSC entry, not flattened into one "ownership change" label.',
    },
    {
      id: 'sbr-psc-bridges-active',
      buildingId: 'southwark-bridge-road-38-48',
      layer: 'companiesHousePsc',
      factType: 'filed',
      label: 'Active control: Bridges Property Alternatives Fund VI GP LLP (75–100% surplus assets)',
      value: 'significant-influence-or-control',
      sourceUrl: `${CH}/persons-with-significant-control`,
      observedAt: '2025-03-24',
      retrievedAt: RETRIEVED,
      confidence: 1,
      note: 'Bridges’ GP vehicle holds majority economic rights — the real controlling party, one layer behind the "Bridges Fund Management" brand name.',
    },
    {
      id: 'sbr-charge',
      buildingId: 'southwark-bridge-road-38-48',
      layer: 'companiesHouseCharge',
      factType: 'filed',
      label: 'Mortgage filed',
      value: '2025-04-01',
      sourceUrl: `${CH}/charges`,
      observedAt: '2025-04-01',
      retrievedAt: RETRIEVED,
      confidence: 1,
    },
    {
      id: 'sbr-press',
      buildingId: 'southwark-bridge-road-38-48',
      layer: 'pressReport',
      factType: 'filed',
      label: 'Building magazine reports scheme pivot to co-living, new architect',
      value: '2026-06-01',
      // TODO: exact Building magazine article URL
      sourceUrl: 'https://www.building.co.uk/',
      observedAt: '2026-06-01',
      retrievedAt: RETRIEVED,
      confidence: 1,
      note: 'Publication month June 2026; exact issue date to confirm.',
    },
  ],
}

/** The press baseline the 489-day lead time is measured against. */
export const SBR_PRESS_BASELINE = '2026-06-01'
