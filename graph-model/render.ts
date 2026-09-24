/*
  Minimal render — plain text, no visual design. The look is a separate pass
  (per the build brief: "Render minimally for now"); this just proves the
  brain's output is legible before anyone designs a UI around it.

  Run: node --experimental-strip-types graph-model/render.ts
*/

import { buildConclusion } from './conclusion.ts'
import { detectClusters } from './cluster.ts'
import { SBR_ANALYSIS_ASOF, SBR_DISCLOSURE_DATE, SOUTHWARK_BRIDGE_ROAD_GRAPH } from './seed.ts'
import type { Conclusion } from './types.ts'

function renderConclusion(c: Conclusion): string {
  const lines: string[] = []
  lines.push(`[${c.strength.toUpperCase()}]  ${c.headline}`)
  lines.push('')
  lines.push(c.reasoning)
  lines.push('')
  lines.push(`Evidence (${c.evidence.length} cited link${c.evidence.length === 1 ? '' : 's'}):`)
  for (const e of c.evidence) {
    lines.push(`  ${e.observedAt}  ${e.type.padEnd(12)} confidence ${e.confidence.toFixed(2)}  ${e.sourceUrl}`)
  }
  lines.push('')
  lines.push(`Public contacts (${c.publicContacts.length}) — for a human to judge "do we know them?":`)
  for (const p of c.publicContacts) {
    lines.push(`  ${p.name} — ${p.role}`)
    lines.push(`    ${p.sourceUrl}`)
  }
  if (c.leadTimeDays !== undefined) {
    lines.push('')
    lines.push(`Lead time vs. disclosure: ${c.leadTimeDays} days`)
  }
  lines.push('')
  lines.push(`Advice: ${c.advice}`)
  return lines.join('\n')
}

function main() {
  const clusters = detectClusters(SOUTHWARK_BRIDGE_ROAD_GRAPH)
  console.log(`Graph Matrix Engine — ${clusters.length} cluster${clusters.length === 1 ? '' : 's'}\n`)
  for (const cluster of clusters) {
    const conclusion = buildConclusion(cluster, { asOf: SBR_ANALYSIS_ASOF, pressDate: SBR_DISCLOSURE_DATE })
    console.log('═'.repeat(70))
    console.log(renderConclusion(conclusion))
    console.log('')
  }
}

main()
