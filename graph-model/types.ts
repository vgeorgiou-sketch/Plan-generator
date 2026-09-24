/*
  Graph Matrix — the link graph ("the brain").

  Stop treating buildings as flat, isolated cards. Model evidence as a graph
  of public entities (buildings, companies, people, lenders, developers)
  connected by cited edges (owns, controls, directorOf, chargeHolder,
  sharesAddress, priorOwner, operates). The intelligence is in the edges, not
  the nodes — every edge cites the filing that proves it, so a line between
  two nodes is never a guess.

  Naming note: the brief's `Signal_Strength` is renamed `SignalStrength` here
  for consistency with this codebase's camelCase/PascalCase type names
  (FactType, LayerCategory, etc.) — same three values, same semantics.

  This module is framework-agnostic TypeScript (Node puller + frontend), like
  ../signal-model. It builds ON TOP of signal-model: a GraphNode carries
  Signal[] (../signal-model/types.ts) exactly as an Opportunity does, so every
  existing convergence/grid-cell rule still applies to a node's own evidence.
*/

import type { Signal } from '../signal-model/types.ts'

export type NodeType = 'building' | 'company' | 'person' | 'lender' | 'developer'

export interface GraphNode {
  id: string
  type: NodeType
  label: string // public name — company name, director name, building address
  signals: Signal[] // signals attached directly to this node (per signal-model)
  sourceUrl?: string // where this node's identity was confirmed
}

export type EdgeType =
  | 'owns' // company → building
  | 'controls' // company/person → company (from PSC)
  | 'directorOf' // person → company (from officer list)
  | 'chargeHolder' // lender → company (from charges register)
  | 'sharesAddress' // company ↔ company (same registered office)
  | 'priorOwner' // company → building (previous proprietor)
  | 'operates' // developer → building (from planning applicant/agent)

export interface GraphEdge {
  from: string // node id
  to: string // node id
  type: EdgeType
  sourceUrl: string // the filing that establishes this link
  observedAt: string // when the linking event happened
  confidence: number // 1.0 filed, lower if derived/inferred
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type SignalStrength = 'red' | 'amber' | 'green'
// green  = system believes a scheme/decision is imminent — many independent dots connected
// amber  = warming — a real signal cluster forming, not yet conclusive
// red    = watch — a single or early signal, on the radar, not actionable yet

export interface PublicContact {
  name: string
  role: string // "Director of owning SPV", "Developer", "Charge holder (lender)"
  sourceUrl: string
}

export interface Conclusion {
  strength: SignalStrength
  headline: string // plain English: "The system believes X is being repositioned off-market."
  reasoning: string // "why this fired" — names the dots that connected, in prose
  evidence: GraphEdge[] // the citing edges, each linking to its source filing
  publicContacts: PublicContact[] // public names only — for a human to judge "do we know them?"
  leadTimeDays?: number // how early vs. the first public/press mention, if known
  advice: string // "here's what I'd do"
}

export interface Cluster {
  /** The building this cluster is anchored to. */
  buildingId: string
  buildingLabel: string
  /** Every node reachable from the building through the edge graph (undirected). */
  nodeIds: string[]
  nodes: GraphNode[]
  /** Every edge with both endpoints inside this cluster. */
  edges: GraphEdge[]
}

export function findNode(graph: Graph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id)
}
