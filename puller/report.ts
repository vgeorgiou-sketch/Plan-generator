/*
  Reporting helpers — pure. Deliberately NO single collapsed score; the
  headline is the convergence shape, not "31/35".
*/

import type { ConvergenceResult } from '../signal-model/types.ts'

export function scoreBandLine(c: ConvergenceResult): string {
  const lead = c.leadTimeDays !== undefined ? `${c.leadTimeDays}d lead` : 'no lead time'
  return (
    `${c.isConverged ? 'CONVERGED' : 'not converged'} · ` +
    `${c.pressureLayers} pressure + ${c.kineticLayers} kinetic · ` +
    `weakest signal ${c.minConfidence} · ${lead}`
  )
}
