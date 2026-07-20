/*
  Companies House API client — the real API, not the HTML search page.
  Base: https://api.company-information.service.gov.uk
  Auth: free key from https://developer.company-information.service.gov.uk/,
        sent as HTTP Basic (key as username, blank password).

  Key is read from the CH_API_KEY environment variable. Never hard-code it.
*/

import type { ChFiling } from './leadTime.ts'

const BASE = 'https://api.company-information.service.gov.uk'

export interface CompanyHit {
  company_name: string
  company_number: string
  date_of_creation?: string
  registered_office_address?: Record<string, string>
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
    throw new Error(
      `Network request to Companies House failed for ${path}. ` +
        `This environment may block outbound egress to api.company-information.service.gov.uk — ` +
        `run where that host is reachable. Cause: ${(cause as Error).message}`,
    )
  }
  if (res.status === 401) throw new Error('Companies House returned 401 — check CH_API_KEY is valid.')
  if (res.status === 429) throw new Error('Companies House rate limit hit (429) — back off and retry.')
  if (!res.ok) throw new Error(`Companies House ${res.status} for ${path}`)
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
  const data = await chGet<{ items?: CompanyHit[] }>(`/advanced-search/companies?${q}`)
  return data.items ?? []
}

/** General company name/address search (Task 0, step 1). */
export async function searchCompanies(query: string, itemsPerPage = 20): Promise<CompanyHit[]> {
  const q = new URLSearchParams({ q: query, items_per_page: String(itemsPerPage) })
  const data = await chGet<{ items?: CompanyHit[] }>(`/search/companies?${q}`)
  return data.items ?? []
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
