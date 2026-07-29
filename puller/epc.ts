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
import { diagnoseNonJson, looksLikeHtml, readJsonOrDiagnose } from './jsonResponse.ts'

const HOST = 'epc.opendatacommunities.org'
const BASE = `https://${HOST}/api/v1/non-domestic/search`
const CRED_HINT =
  'Set EPC_API_KEY to the pre-encoded token from epc.opendatacommunities.org (sent as `Authorization: Basic <token>`).'

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
  // EPC calls it a "Bearer token" but it is used as Authorization: Basic
  // <token> — the token is already pre-encoded, so we send it verbatim (not
  // Bearer, and NOT a Basic header built from a separate email:key pair).
  const token = process.env.EPC_API_KEY
  if (!token) {
    throw new Error(
      'EPC_API_KEY must be set to the pre-encoded EPC token from ' +
        'https://epc.opendatacommunities.org/ (sent as `Authorization: Basic <token>`).',
    )
  }
  return 'Basic ' + token
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

/** A filed `epc` PRESSURE signal for a specific building id (e.g. the seed).
 *  Unlike normaliseEpcRow (which mints its own building), this attaches the
 *  EPC fact to an existing Opportunity so it becomes that card's pressure layer. */
export function epcSignalForBuilding(row: EpcRow, buildingId: string): Signal {
  const band = row['asset-rating-band'] ?? row['asset-rating'] ?? '?'
  const observedAt = (row['lodgement-date'] ?? '').slice(0, 10) || '1970-01-01'
  const ref = row['building-reference-number'] ?? row['lmk-key'] ?? ''
  return {
    id: `epc-${buildingId}`,
    buildingId,
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
}

/** Is this a large office/commercial building worth watching? */
export function isLargeCommercial(row: EpcRow, minFloorArea = 1000): boolean {
  const area = row['total-floor-area'] ? Number(row['total-floor-area']) : 0
  const type = (row['property-type'] ?? '').toLowerCase()
  const commercial = /office|commercial|retail|mixed/.test(type) || type === ''
  return area >= minFloorArea && commercial
}

/** ONS code for Southwark — EPC's `local-authority` filter takes these. */
export const SOUTHWARK_ONS = 'E09000028'

export interface EpcQuery {
  /** Full postcode ("SE1 9BB"). A bare district ("SE1") is not a valid value. */
  postcode?: string
  /** ONS local-authority code, e.g. E09000028 for Southwark. */
  localAuthority?: string
  size?: number
}

export function buildEpcUrl(q: EpcQuery): string {
  const params = new URLSearchParams()
  if (q.postcode) params.set('postcode', q.postcode)
  if (q.localAuthority) params.set('local-authority', q.localAuthority)
  params.set('size', String(q.size ?? 100))
  return `${BASE}?${params}`
}

/** One raw EPC request, returning the parsed rows or a diagnostic error. */
export async function epcQuery(q: EpcQuery): Promise<EpcRow[]> {
  const url = buildEpcUrl(q)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    })
  } catch (cause) {
    throw new Error(describeNetworkThrow('EPC Open Data', HOST, url.replace(BASE, ''), cause as Error))
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Prefer the richer non-JSON diagnosis when the error page is HTML.
    if (looksLikeHtml(res.headers.get('content-type') ?? '', body)) {
      throw new Error(
        diagnoseNonJson({
          url,
          status: res.status,
          contentType: res.headers.get('content-type') ?? '',
          body,
          redirected: res.redirected,
          finalUrl: res.url,
          location: res.headers.get('location'),
        }),
      )
    }
    throw new Error(
      describeHttpFailure({
        service: 'EPC Open Data',
        host: HOST,
        status: res.status,
        path: url.replace(BASE, ''),
        body,
        proxied: isEgressProxied(),
        credHint: CRED_HINT,
      }),
    )
  }

  // 200 but possibly HTML — never crash on JSON.parse.
  const data = await readJsonOrDiagnose<{ rows?: EpcRow[] }>(res, url)
  return data.rows ?? []
}

/** Back-compat helper: search by full postcode. */
export async function epcSearch(postcode: string, size = 100): Promise<EpcRow[]> {
  return epcQuery({ postcode, size })
}

/** Pull a whole local authority (the right way to sweep a borough). */
export async function epcByLocalAuthority(onsCode = SOUTHWARK_ONS, size = 100): Promise<EpcRow[]> {
  return epcQuery({ localAuthority: onsCode, size })
}
