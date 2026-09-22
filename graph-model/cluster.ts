/*
  Cluster detection — dots connect themselves.

  A cluster is the connected subgraph reachable from one building node,
  walking edges in either direction (an SPV owns a building, but control
  flows the other way — direction shouldn't stop us finding the web). We
  don't hand-write per-pattern rules; connectivity through the graph is the
  only detector. The Southwark Bridge Road case should fall out of this
  naturally: building ← owns ← SPV ← controls ← Bridges GP / Hub Living,
  building ← operates ← HUB — one connected component, one cluster.
*/

import type { Cluster, Graph, GraphEdge, GraphNode } from './types.ts'

function buildAdjacency(edges: GraphEdge[]): Map<string, GraphEdge[]> {
  const adj = new Map<string, GraphEdge[]>()
  const add = (id: string, e: GraphEdge) => {
    if (!adj.has(id)) adj.set(id, [])
    adj.get(id)!.push(e)
  }
  for (const e of edges) {
    add(e.from, e)
    add(e.to, e)
  }
  return adj
}

/** BFS from `startId` over the undirected edge graph; returns reachable node ids + traversed edges. */
function connectedComponent(startId: string, adjacency: Map<string, GraphEdge[]>): { nodeIds: Set<string>; edges: GraphEdge[] } {
  const visited = new Set<string>([startId])
  const edgesInComponent = new Set<GraphEdge>()
  const queue = [startId]
  while (queue.length) {
    const id = queue.shift()!
    for (const e of adjacency.get(id) ?? []) {
      edgesInComponent.add(e)
      const other = e.from === id ? e.to : e.from
      if (!visited.has(other)) {
        visited.add(other)
        queue.push(other)
      }
    }
  }
  return { nodeIds: visited, edges: [...edgesInComponent] }
}

/** One cluster per building node, built from everything connected to it. A
 *  building with zero edges still produces a cluster of just itself — an
 *  isolated building is a valid (weak) cluster, not an error. */
export function detectClusters(graph: Graph): Cluster[] {
  const adjacency = buildAdjacency(graph.edges)
  const byId = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]))

  return graph.nodes
    .filter((n) => n.type === 'building')
    .map((building) => {
      const { nodeIds, edges } = connectedComponent(building.id, adjacency)
      const nodes = [...nodeIds]
        .map((id) => byId.get(id))
        .filter((n): n is GraphNode => n !== undefined)
      return {
        buildingId: building.id,
        buildingLabel: building.label,
        nodeIds: [...nodeIds],
        nodes,
        edges: edges.sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
      }
    })
}

/** All signals attached to any node in the cluster, oldest first. This is
 *  where a cluster's "distinct layers" and "recency" get read from — a
 *  node's own Signal[] (per signal-model), not just the edges linking it. */
export function clusterSignals(cluster: Cluster) {
  return cluster.nodes
    .flatMap((n) => n.signals)
    .slice()
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
}
