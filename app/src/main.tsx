import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Router } from 'wouter'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)
