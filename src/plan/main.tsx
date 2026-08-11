import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PlanExplorer from './PlanExplorer'
import data from './opportunities.json'
import type { PlanData } from './types'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlanExplorer data={data as PlanData} />
  </StrictMode>,
)
