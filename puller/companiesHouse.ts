/*
  Companies House API client — the real API, not the HTML search page.
  Base: https://api.company-information.service.gov.uk
  Auth: free key from https://developer.company-information.service.gov.uk/,
        sent as HTTP Basic (key as username, blank password).

  Key is read from the CH_API_KEY environment variable. Never hard-code it.
*/

import type { ChFiling } from './leadTime.ts'
import { describeHttpFailure, describeNetworkThrow, isEgressProxied } from './http.ts'

const HOST = 'api.company-information.service.gov.uk'
const BASE = `https://${HOST}`
const CRED_HINT = 'Use a REST API key from an application at developer.company-information.service.gov.uk (set CH_API_KEY).'

/** Normalised company hit — the shape the rest of the puller consumes. */
export interface CompanyHit {
  company_name: string
  company_number: string
  date_of_creation?: string
  registered_office_address?: Record<string, string>
  address_snippet?: string
}

/*
  The two search endpoints return DIFFERENT shapes, which is what produced the
  "undefined" company names:
    /search/companies          → item.title           (+ address, address_snippet)
    /advanced-search/companies → item.company_name     (+ registered_office_address)
  These mappers normalise both into CompanyHit so a name is always present.
*/

interface RawSearchItem {
  title?: string
  company_number: string
  date_of_creation?: string
  address_snippet?: string
  address?: Record<string, string>
}

interface RawAdvancedItem {
  company_name?: string
  company_number: string
  date_of_creation?: string
  registered_office_address?: Record<string, string>
}

export const NAME_UNAVAILABLE = '(name unavailable)'

/** First real name among the candidates; placeholders and blanks are skipped. */
export function pickCompanyName(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const t = c?.trim()
    if (t && t !== NAME_UNAVAILABLE) return t
  }
  return NAME_UNAVAILABLE
}

/** Case/punctuation-insensitive company name key. Keeps the entity suffix
 *  (LLP vs LTD are different entities), so only true same-name matches. */
export function normaliseCompanyName(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

export function namesMatch(a?: string, b?: string): boolean {
  return Boolean(a && b) && normaliseCompanyName(a!) === normaliseCompanyName(b!)
}

/** True if `needle` appears as a contiguous run of whole tokens in `haystack`.
 *  Token-based so "HUB" matches "HUB SBR LIMITED" but not "HUBBARD LTD". */
export function nameContains(haystack: string, needle: string): boolean {
  const h = normaliseCompanyName(haystack).split(' ').filter(Boolean)
  const n = normaliseCompanyName(needle).split(' ').filter(Boolean)
  if (n.length === 0 || n.length > h.length) return false
  for (let i = 0; i + n.length <= h.length; i++) {
    if (n.every((t, j) => h[i + j] === t)) return true
  }
  return false
}

export interface ControllerMatch {
  needle: string
  named: boolean
  matchedBy: string[]
}

/** For each controller of interest, which PSC names (if any) name it. */
export function findControllers(pscNames: string[], needles: string[]): ControllerMatch[] {
  return needles.map((needle) => {
    const matchedBy = pscNames.filter((name) => nameContains(name, needle))
    return { needle, named: matchedBy.length > 0, matchedBy }
  })
}

export function fromSearchItem(i: RawSearchItem): CompanyHit {
  return {
    company_name: i.title?.trim() || NAME_UNAVAILABLE,
    company_number: i.company_number,
    date_of_creation: i.date_of_creation,
    registered_office_address: i.address,
    address_snippet: i.address_snippet,
  }
}

export function fromAdvancedItem(i: RawAdvancedItem): CompanyHit {
  return {
    company_name: i.company_name?.trim() || NAME_UNAVAILABLE,
    company_number: i.company_number,
    date_of_creation: i.date_of_creation,
    registered_office_address: i.registered_office_address,
  }
}

export interface Charge {
  charge_code?: string
  status: string // "outstanding" | "fully-satisfied" | ...
  created_on?: string
  satisfied_on?: string
  classification?: { description?: string }
}

function authHeader(): string {
  const key = process.env.CH_API_KEY
  if (!key) {
    throw new Error(
      'CH_API_KEY is not set. Get a free key at ' +
        'https://developer.company-information.service.gov.uk/ and export CH_API_KEY=… before running.',
    )
  }
  return 'Basic ' + Buffer.from(key + ':').toString('base64')
}

async function chGet<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, { headers: { Authorization: authHeader() } })
  } catch (cause) {
    throw new Error(describeNetworkThrow('Companies House', HOST, path, cause as Error))
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      describeHttpFailure({
        service: 'Companies House',
        host: HOST,
        status: res.status,
        path,
        body,
        proxied: isEgressProxied(),
        credHint: CRED_HINT,
      }),
    )
  }
  return (await res.json()) as T
}

/** Task 2 — advanced search. Run once per SIC code and merge; do not assume OR. */
export async function advancedSearch(params: {
  sicCodes?: string
  location?: string
  incorporatedFrom?: string
  incorporatedTo?: string
  companyStatus?: string
  size?: number
}): Promise<CompanyHit[]> {
  const q = new URLSearchParams()
  if (params.sicCodes) q.set('sic_codes', params.sicCodes)
  if (params.location) q.set('location', params.location)
  if (params.incorporatedFrom) q.set('incorporated_from', params.incorporatedFrom)
  if (params.incorporatedTo) q.set('incorporated_to', params.incorporatedTo)
  q.set('company_status', params.companyStatus ?? 'active')
  q.set('size', String(params.size ?? 100))
  const data = await chGet<{ items?: RawAdvancedItem[] }>(`/advanced-search/companies?${q}`)
  return (data.items ?? []).map(fromAdvancedItem)
}

/** General company name/address search (Task 0, step 1). */
export async function searchCompanies(query: string, itemsPerPage = 20): Promise<CompanyHit[]> {
  const q = new URLSearchParams({ q: query, items_per_page: String(itemsPerPage) })
  const data = await chGet<{ items?: RawSearchItem[] }>(`/search/companies?${q}`)
  return (data.items ?? []).map(fromSearchItem)
}

export interface CompanyProfile {
  company_name?: string
  company_number: string
  company_status?: string
  date_of_creation?: string
  registered_office_address?: Record<string, string>
}

/** Authoritative company record — the reliable source of the registered name. */
export async function companyProfile(companyNumber: string): Promise<CompanyProfile> {
  return chGet<CompanyProfile>(`/company/${companyNumber}`)
}

/** Task 0, step 2 — filing history for one company. */
export async function filingHistory(companyNumber: string): Promise<ChFiling[]> {
  const data = await chGet<{ items?: ChFiling[] }>(`/company/${companyNumber}/filing-history?items_per_page=100`)
  return data.items ?? []
}

/** Task 3 — charges for one company (enrichment; needs a company number first). */
export async function companyCharges(companyNumber: string): Promise<Charge[]> {
  const data = await chGet<{ items?: Charge[] }>(`/company/${companyNumber}/charges`)
  return data.items ?? []
}

export interface PscItem {
  name?: string
  kind?: string // e.g. "corporate-entity-person-with-significant-control"
  natures_of_control?: string[]
  notified_on?: string
  ceased_on?: string
}

/** Persons with significant control for a company (who ultimately controls it). */
export async function personsWithSignificantControl(companyNumber: string): Promise<PscItem[]> {
  const data = await chGet<{ items?: PscItem[] }>(
    `/company/${companyNumber}/persons-with-significant-control?items_per_page=100`,
  )
  return data.items ?? []
}
