import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isWebView } from './lib/platform'
import App from './App'
import './styles.css'
import { applyAccent, readAccent } from './lib/theme'

// A cor do tema entra antes do primeiro desenho.
applyAccent(readAccent())

// O APK abre o site dentro do WebView do Android, que não tem a GPU do Chrome:
// as manchas do fundo com blur a animar e os backdrop-filter das barras deixam
// a app a arrastar. A marca `is-webview` liga o modo leve do CSS (fim do
// styles.css). Fica no <html> para valer logo no primeiro desenho.
if (isWebView) document.documentElement.classList.add('is-webview')

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
