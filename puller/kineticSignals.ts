/*
  Map Companies House hits (Tasks 2 & 3) into kinetic hits for the cross-
  reference. Pure — the fuzzy address match in crossReference decides whether
  these stay `filed` or get downgraded to `inferred` per the data model.
*/

import type { Signal } from '../signal-model/types.ts'
import type { CompanyHit, Charge } from './companiesHouse.ts'
import type { KineticHit } from './crossReference.ts'

function addressString(a?: Record<string, string>): string {
  if (!a) return ''
  return [a.premises, a.address_line_1, a.address_line_2, a.locality, a.postal_code]
    .filter(Boolean)
    .join(' ')
    .trim()
}

/**
 * A newly-incorporated SPV (Task 2). Starts as `inferred` — matching an SPV to
 * a specific building is name/address pattern-matching, not certainty, so
 * confidence ≤ 0.5 until a human confirms (per the data model).
 */
export function spvToHit(hit: CompanyHit): KineticHit {
  const address = addressString(hit.registered_office_address)
  const signal: Signal = {
    id: `spv-${hit.company_number}`,
    buildingId: '',
    layer: 'companiesHouseSpv',
    factType: 'inferred',
    label: `New SPV: ${hit.company_name}`,
    value: hit.company_number,
    sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${hit.company_number}`,
    sourceRef: hit.company_number,
    observedAt: (hit.date_of_creation ?? '').slice(0, 10) || '1970-01-01',
    retrievedAt: new Date().toISOString().slice(0, 10),
    confidence: 0.5,
    note: 'SPV→building match is inferred; confirm before acting.',
  }
  return { address, signal }
}

/**
 * A charge filed/satisfied on a known owner (Task 3). This is `filed` fact at
 * the company level — but it still has to be tied to a building by address,
 * where the cross-reference may downgrade it.
 */
export function chargeToHit(companyNumber: string, ownerAddress: string, charge: Charge): KineticHit {
  const satisfied = Boolean(charge.satisfied_on)
  const date = (charge.satisfied_on ?? charge.created_on ?? '').slice(0, 10) || '1970-01-01'
  const signal: Signal = {
    id: `charge-${companyNumber}-${charge.charge_code ?? date}`,
    buildingId: '',
    layer: 'companiesHouseCharge',
    factType: 'filed',
    label: satisfied ? `Charge satisfied (possible refinancing)` : `Charge registered`,
    value: charge.classification?.description ?? charge.status,
    sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}/charges`,
    sourceRef: charge.charge_code,
    observedAt: date,
    retrievedAt: new Date().toISOString().slice(0, 10),
    confidence: 1,
    note: satisfied ? 'Satisfied charge can indicate a refinancing event.' : undefined,
  }
  return { address: ownerAddress, signal }
}
