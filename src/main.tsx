import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initClipper } from './geometry/clipperInstance'

const root = createRoot(document.getElementById('root')!)

initClipper().then(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
