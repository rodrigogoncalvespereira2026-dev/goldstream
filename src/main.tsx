import { StrictMode } from 'react'
import { Capacitor } from '@capacitor/core'
import { createRoot } from 'react-dom/client'
import { isWebView } from './lib/platform'
import App from './App'
import './styles.css'
import { applyAccent, readAccent } from './lib/theme'
import { restaurarSessao } from './lib/account'

// A cor do tema entra antes do primeiro desenho.
applyAccent(readAccent())

// O APK abre o site dentro do WebView do Android, que não tem a GPU do Chrome:
// as manchas do fundo com blur a animar e os backdrop-filter das barras deixam
// a app a arrastar. A marca `is-webview` liga o modo leve do CSS (fim do
// styles.css). Fica no <html> para valer logo no primeiro desenho.
if (isWebView) document.documentElement.classList.add('is-webview')

// Fora do APK oficial (conversores site → APK, browser) a página começa por
// baixo da barra de estado e não por trás dela: o recuo do topo não deve contar,
// mesmo que o WebView o reporte. O APK oficial desenha por trás e mantém-no.
if (isWebView && !Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('no-safe-top')
}

const encontrado = document.getElementById('root')
if (!encontrado) throw new Error('Elemento #root não encontrado')
const container: HTMLElement = encontrado

function arrancar() {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// A sessão é confirmada no servidor (e os dados da conta carregados) antes do
// primeiro desenho, senão a app abria com os dados de outra conta durante um
// instante. Sem rede, abre com o que está guardado no telemóvel.
void restaurarSessao().finally(arrancar)
