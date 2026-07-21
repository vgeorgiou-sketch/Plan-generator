/*
  Task 1 — EPC universe (pressure layer). EPC Open Data API.
  Base: https://epc.opendatacommunities.org/api/v1/non-domestic/search
  Auth: free registration → HTTP Basic base64(email:api-key).
  Env: EPC_EMAIL, EPC_API_KEY.

  The network call is thin; normaliseEpcRow is pure and unit-tested.
  VOA cross-check is a separate source — confirm bulk access terms at
  voa.gov.uk before building against it (not done blind here).
*/

import type { Signal } from '../signal-model/types.ts'
import type { UniverseRecord } from './crossReference.ts'
import { describeHttpFailure, describeNetworkThrow, isEgressProxied } from './http.ts'

const HOST = 'epc.opendatacommunities.org'
const BASE = `https://${HOST}/api/v1/non-domestic/search`
const CRED_HINT = 'Register free at epc.opendatacommunities.org and set EPC_EMAIL and EPC_API_KEY.'

export interface EpcRow {
  'lmk-key'?: string
  'building-reference-number'?: string
  address?: string
  postcode?: string
  'property-type'?: string
  'asset-rating'?: string
  'asset-rating-band'?: string
  'total-floor-area'?: string
  'lodgement-date'?: string
}

function authHeader(): string {
  const email = process.env.EPC_EMAIL
  const key = process.env.EPC_API_KEY
  if (!email || !key) {
    throw new Error(
      'EPC_EMAIL and EPC_API_KEY must be set. Register free at ' +
        'https://epc.opendatacommunities.org/ and export both before running.',
    )
  }
  return 'Basic ' + Buffer.from(`${email}:${key}`).toString('base64')
}

/** One EPC certificate → a UniverseRecord carrying a filed `epc` pressure signal. */
export function normaliseEpcRow(row: EpcRow, borough: string): UniverseRecord | null {
  const postcode = row.postcode?.trim()
  const address = row.address?.trim()
  if (!address || !postcode) return null

  const floorArea = row['total-floor-area'] ? Number(row['total-floor-area']) : undefined
  const band = row['asset-rating-band'] ?? row['asset-rating'] ?? '?'
  const observedAt = (row['lodgement-date'] ?? '').slice(0, 10) || '1970-01-01'
  const ref = row['building-reference-number'] ?? row['lmk-key'] ?? ''

  const pressureSignal: Signal = {
    id: `epc-${ref || postcode}-${observedAt}`,
    buildingId: '', // set by the caller once the building id is known
    layer: 'epc',
    factType: 'filed',
    label: `EPC rating: ${band}`,
    value: band,
    sourceUrl: row['lmk-key']
      ? `https://find-energy-certificate.service.gov.uk/energy-certificate/${row['lmk-key']}`
      : 'https://find-energy-certificate.service.gov.uk/',
    sourceRef: ref || undefined,
    observedAt,
    retrievedAt: new Date().toISOString().slice(0, 10),
    confidence: 1,
  }

  const id = `EPC-${(ref || `${postcode}-${address}`).replace(/[^A-Za-z0-9]+/g, '-').slice(0, 48)}`
  pressureSignal.buildingId = id
  return { id, address, postcode, borough, floorArea, pressureSignal }
}

/** Is this a large office/commercial building worth watching? */
export function isLargeCommercial(row: EpcRow, minFloorArea = 1000): boolean {
  const area = row['total-floor-area'] ? Number(row['total-floor-area']) : 0
  const type = (row['property-type'] ?? '').toLowerCase()
  const commercial = /office|commercial|retail|mixed/.test(type) || type === ''
  return area >= minFloorArea && commercial
}

export async function epcSearch(postcode: string, size = 100): Promise<EpcRow[]> {
  const q = new URLSearchParams({ postcode, size: String(size) })
  let res: Response
  try {
    res = await fetch(`${BASE}?${q}`, { headers: { Authorization: authHeader(), Accept: 'application/json' } })
  } catch (cause) {
    throw new Error(describeNetworkThrow('EPC Open Data', HOST, `?postcode=${postcode}`, cause as Error))
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      describeHttpFailure({
        service: 'EPC Open Data',
        host: HOST,
        status: res.status,
        path: `?postcode=${postcode}`,
        body,
        proxied: isEgressProxied(),
        credHint: CRED_HINT,
      }),
    )
  }
  const data = (await res.json()) as { rows?: EpcRow[] }
  return data.rows ?? []
}
