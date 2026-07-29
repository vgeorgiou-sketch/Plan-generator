/*
  Task 1 — EPC pressure layer, built against the NEW EPC service:

    Base:     https://get-energy-performance-data.communities.gov.uk
    Endpoint: GET /api/non-domestic/search        (no /v1/ — that was the old API)
    Params:   council[]=Southwark   (council NAME, not the old ONS code)
              address=38-48+Southwark+Bridge+Road   (partial or full)
              postcode=SE1 9BB      (full postcode)
              efficiency_rating[]=A..G
    The old `local-authority` param is gone.

  AUTH: not yet confirmed. The OpenAPI spec
  (https://get-energy-performance-data.communities.gov.uk/api-documentation/index.html)
  returns 403 to this environment, so the scheme could not be read. The old
  service called its token a "Bearer token" but required `Authorization: Basic
  <token>`, so guessing is unsafe. The scheme is therefore CONFIGURABLE via
  EPC_AUTH_SCHEME (bearer | basic), defaulting to bearer for the new service.
  `epc-probe.ts` tries both and reports which one the API accepts.

  RESPONSE SHAPE: also unread. Row extraction and field reads are deliberately
  tolerant (several plausible container keys and field-name conventions), and
  the probe dumps the raw first row so the exact shape can be pinned.
*/

import type { Signal } from '../signal-model/types.ts'
import type { UniverseRecord } from './crossReference.ts'
import { describeHttpFailure, describeNetworkThrow, isEgressProxied } from './http.ts'
import { diagnoseNonJson, looksLikeHtml, readJsonOrDiagnose } from './jsonResponse.ts'

export const HOST = 'get-energy-performance-data.communities.gov.uk'
export const BASE = `https://${HOST}/api/non-domestic/search`
const CRED_HINT = 'Set EPC_API_KEY (and optionally EPC_AUTH_SCHEME=bearer|basic) for the new EPC service.'

/** Raw row — field names unconfirmed, so reads go through readField(). */
export type EpcRow = Record<string, unknown>

export type AuthScheme = 'bearer' | 'basic'

export function authScheme(): AuthScheme {
  const s = (process.env.EPC_AUTH_SCHEME ?? 'bearer').toLowerCase()
  return s === 'basic' ? 'basic' : 'bearer'
}

export function authHeader(scheme: AuthScheme = authScheme()): string {
  const token = process.env.EPC_API_KEY
  if (!token) {
    throw new Error(
      'EPC_API_KEY must be set to the token from ' +
        'https://get-energy-performance-data.communities.gov.uk/. ' +
        'Set EPC_AUTH_SCHEME=basic if the API rejects Bearer (run puller/epc-probe.ts to find out).',
    )
  }
  return scheme === 'basic' ? `Basic ${token}` : `Bearer ${token}`
}

export interface EpcQuery {
  /** Council NAME, e.g. "Southwark" (repeatable as council[]). */
  councils?: string[]
  /** Partial or full address, e.g. "38-48 Southwark Bridge Road". */
  address?: string
  /** Full postcode, e.g. "SE1 9BB". */
  postcode?: string
  /** Efficiency bands A–G (repeatable as efficiency_rating[]). */
  efficiencyRatings?: string[]
  size?: number
  page?: number
}

export function buildEpcUrl(q: EpcQuery): string {
  const p = new URLSearchParams()
  for (const c of q.councils ?? []) p.append('council[]', c)
  for (const r of q.efficiencyRatings ?? []) p.append('efficiency_rating[]', r)
  if (q.address) p.set('address', q.address)
  if (q.postcode) p.set('postcode', q.postcode)
  if (q.size !== undefined) p.set('size', String(q.size))
  if (q.page !== undefined) p.set('page', String(q.page))
  const qs = p.toString()
  return qs ? `${BASE}?${qs}` : BASE
}

/** Pull rows out of whatever container the API uses. */
export function extractRows(payload: unknown): EpcRow[] {
  if (Array.isArray(payload)) return payload as EpcRow[]
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>
    for (const key of ['rows', 'data', 'results', 'items', 'records']) {
      const v = o[key]
      if (Array.isArray(v)) return v as EpcRow[]
      // one level of nesting, e.g. { data: { rows: [...] } }
      if (v && typeof v === 'object') {
        const inner = extractRows(v)
        if (inner.length) return inner
      }
    }
  }
  return []
}

/** Read the first present field among candidate names (hyphen/snake/camel). */
export function readField(row: EpcRow, ...names: string[]): string | undefined {
  for (const n of names) {
    const variants = [n, n.replace(/-/g, '_'), n.replace(/_/g, '-'), toCamel(n)]
    for (const v of variants) {
      const val = row[v]
      if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim()
    }
  }
  return undefined
}

function toCamel(s: string): string {
  return s.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
}

export const FIELD = {
  address: ['address', 'address1', 'address-1', 'full-address'],
  postcode: ['postcode', 'post-code'],
  floorArea: ['total-floor-area', 'floor-area', 'total_floor_area'],
  ratingBand: ['asset-rating-band', 'efficiency-rating', 'current-energy-rating', 'energy-rating'],
  ratingValue: ['asset-rating', 'energy-efficiency-rating'],
  lodgementDate: ['lodgement-date', 'inspection-date', 'lodgement-datetime', 'date'],
  certId: ['lmk-key', 'certificate-number', 'certificate-hash', 'id', 'uprn'],
  buildingRef: ['building-reference-number', 'uprn', 'bref'],
  propertyType: ['property-type', 'building-type', 'transaction-type'],
} as const

export function rowAddress(row: EpcRow): string {
  const a = readField(row, ...FIELD.address) ?? ''
  const pc = readField(row, ...FIELD.postcode) ?? ''
  return `${a} ${pc}`.trim()
}

export function rowFloorArea(row: EpcRow): number | undefined {
  const raw = readField(row, ...FIELD.floorArea)
  if (!raw) return undefined
  const n = Number(raw.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

export function certificateUrl(row: EpcRow): string {
  const id = readField(row, ...FIELD.certId)
  return id
    ? `https://${HOST}/energy-certificate/${encodeURIComponent(id)}`
    : `https://${HOST}/`
}

/** A filed `epc` PRESSURE signal attached to an existing building. */
export function epcSignalForBuilding(row: EpcRow, buildingId: string): Signal {
  const band = readField(row, ...FIELD.ratingBand) ?? readField(row, ...FIELD.ratingValue) ?? '?'
  const observedAt = (readField(row, ...FIELD.lodgementDate) ?? '').slice(0, 10) || '1970-01-01'
  const ref = readField(row, ...FIELD.buildingRef) ?? readField(row, ...FIELD.certId)
  return {
    id: `epc-${buildingId}`,
    buildingId,
    layer: 'epc',
    factType: 'filed',
    label: `EPC rating: ${band}`,
    value: band,
    sourceUrl: certificateUrl(row),
    sourceRef: ref,
    observedAt,
    retrievedAt: new Date().toISOString().slice(0, 10),
    confidence: 1,
  }
}

/** One EPC certificate → a standalone UniverseRecord (its own building). */
export function normaliseEpcRow(row: EpcRow, borough: string): UniverseRecord | null {
  const address = readField(row, ...FIELD.address)
  const postcode = readField(row, ...FIELD.postcode)
  if (!address || !postcode) return null
  const id = `EPC-${(readField(row, ...FIELD.certId) ?? `${postcode}-${address}`)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .slice(0, 48)}`
  const signal = epcSignalForBuilding(row, id)
  return { id, address, postcode, borough, floorArea: rowFloorArea(row), pressureSignal: signal }
}

/** Is this a large office/commercial building worth watching? */
export function isLargeCommercial(row: EpcRow, minFloorArea = 1000): boolean {
  const area = rowFloorArea(row) ?? 0
  const type = (readField(row, ...FIELD.propertyType) ?? '').toLowerCase()
  const commercial = type === '' || /office|commercial|retail|mixed|industrial/.test(type)
  return area >= minFloorArea && commercial
}

/** One request. Returns rows, or throws a diagnostic (never a bare parse error). */
export async function epcQuery(q: EpcQuery, scheme: AuthScheme = authScheme()): Promise<EpcRow[]> {
  const url = buildEpcUrl(q)
  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: authHeader(scheme), Accept: 'application/json' } })
  } catch (cause) {
    throw new Error(describeNetworkThrow('EPC (new service)', HOST, url.replace(BASE, ''), cause as Error))
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
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
    const authNote =
      res.status === 401 || res.status === 403
        ? ` (tried Authorization: ${scheme === 'basic' ? 'Basic' : 'Bearer'} — try EPC_AUTH_SCHEME=${scheme === 'basic' ? 'bearer' : 'basic'}, or run puller/epc-probe.ts)`
        : ''
    throw new Error(
      describeHttpFailure({
        service: 'EPC (new service)',
        host: HOST,
        status: res.status,
        path: url.replace(BASE, ''),
        body,
        proxied: isEgressProxied(),
        credHint: CRED_HINT + authNote,
      }),
    )
  }

  const payload = await readJsonOrDiagnose<unknown>(res, url)
  return extractRows(payload)
}

/** Search by address — the precise route for a known building. */
export async function epcByAddress(address: string, size = 50): Promise<EpcRow[]> {
  return epcQuery({ address, size })
}

/** Sweep a council by NAME, e.g. "Southwark". */
export async function epcByCouncil(council = 'Southwark', size = 1000): Promise<EpcRow[]> {
  return epcQuery({ councils: [council], size })
}

/** Search by full postcode. */
export async function epcByPostcode(postcode: string, size = 100): Promise<EpcRow[]> {
  return epcQuery({ postcode, size })
}
