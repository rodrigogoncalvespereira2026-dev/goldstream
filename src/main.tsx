import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyAccent, readAccent } from './lib/theme'

// A cor do tema entra antes do primeiro desenho.
applyAccent(readAccent())

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
