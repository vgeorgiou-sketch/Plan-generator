import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import RadarApp from './radar/RadarApp'

// This branch hosts the Opportunity Radar dashboard prototype.
// The floorplate core-comparison tool remains in src/ (see App.tsx);
// swap the import back to restore it.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RadarApp />
  </StrictMode>,
)
