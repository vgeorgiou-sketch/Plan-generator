'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ActivityEntry, Opportunity, RawSignal, ReviewStatus } from './types'
import { SEED_ACTIVITY, SEED_OPPORTUNITIES, SEED_SIGNALS } from './data'
import { TODAY } from './scoring'

/**
 * In-memory session store. This is the seam where Supabase lands later:
 * the actions below map one-to-one onto table writes, and the seed data
 * mirrors the intended schema.
 */
interface HubStore {
  signals: RawSignal[]
  opportunities: Opportunity[]
  activity: ActivityEntry[]
  reviewSignal: (id: string, status: ReviewStatus) => void
  /** Converts a signal into a draft opportunity; returns the new id. */
  convertSignal: (id: string) => string | undefined
  addSignal: (input: Omit<RawSignal, 'id' | 'dateFound' | 'aiStatus' | 'reviewStatus'>) => string
}

const StoreContext = createContext<HubStore | null>(null)

let nextId = 3000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [signals, setSignals] = useState<RawSignal[]>(SEED_SIGNALS)
  const [opportunities, setOpportunities] = useState<Opportunity[]>(SEED_OPPORTUNITIES)
  const [activity, setActivity] = useState<ActivityEntry[]>(SEED_ACTIVITY)

  const store = useMemo<HubStore>(() => {
    const log = (text: string, href?: string) =>
      setActivity((prev) => [{ date: TODAY, text, href }, ...prev])

    return {
      signals,
      opportunities,
      activity,
      reviewSignal: (id, status) => {
        const sig = signals.find((s) => s.id === id)
        if (!sig) return
        setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, reviewStatus: status } : s)))
        log(`Signal reviewed: ${sig.title} → ${status}.`, '/signals')
      },
      convertSignal: (id) => {
        const sig = signals.find((s) => s.id === id)
        if (!sig) return undefined
        if (sig.linkedOpportunityId) return sig.linkedOpportunityId
        const oppId = `OPP-${nextId++}`
        const draft: Opportunity = {
          id: oppId,
          name: sig.title,
          city: sig.city,
          district: sig.district,
          address: sig.district === '—' ? sig.city : `${sig.district}, ${sig.city}`,
          sector: sig.sectorGuess,
          subSector: sig.subSectorGuess,
          client: 'To be confirmed',
          sourceType: sig.sourceType,
          sourceLink: sig.sourceLink,
          reference: sig.id,
          stage: 'Newly converted — qualification pending',
          signalSummary: sig.rawSummary,
          architecturalIssue: 'To be assessed during qualification.',
          opportunityAngle: sig.aiNote,
          relevance: 'To be assessed against sector and city strategy.',
          commercialReason: 'To be assessed.',
          nextAction: 'Qualify the lead: confirm client, complete the seven-criterion scoring and assign an owner.',
          status: 'Research',
          scores: {
            sectorFit: 3,
            geographyFit: 3,
            stageTiming: 3,
            architecturalProblem: 3,
            feePotential: 3,
            relationshipRoute: 3,
            urgency: 3,
          },
          confidence: sig.confidence,
          owner: 'Unassigned',
          notes: `Converted from signal ${sig.id} on ${TODAY}. Draft scores are neutral placeholders pending review.`,
          dateAdded: TODAY,
          lastReviewed: TODAY,
          fromSignalId: sig.id,
        }
        setOpportunities((prev) => [draft, ...prev])
        setSignals((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, reviewStatus: 'Convert to opportunity', linkedOpportunityId: oppId } : s,
          ),
        )
        log(`Signal converted: ${sig.title} → draft opportunity ${oppId}.`, `/pipeline/${oppId}`)
        return oppId
      },
      addSignal: (input) => {
        const sigId = `SIG-${nextId++}`
        const created: RawSignal = {
          ...input,
          id: sigId,
          dateFound: TODAY,
          aiStatus: input.sourceType === 'Manual intelligence' ? 'Manual entry' : 'Pending',
          reviewStatus: 'Unreviewed',
        }
        setSignals((prev) => [created, ...prev])
        log(`Signal added via intake: ${created.title}.`, '/signals')
        return sigId
      },
    }
  }, [signals, opportunities, activity])

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useHub(): HubStore {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useHub must be used inside StoreProvider')
  return ctx
}
