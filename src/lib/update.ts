import { Capacitor } from '@capacitor/core'

/**
 * O APK abre sempre a versão publicada na internet, por isso uma atualização
 * chega sem instalar nada de novo. Este helper força um recarregamento fresco
 * (com um parâmetro novo no URL, para o WebView não servir a página em cache).
 */
/** Endereço público do APK mais recente (o site serve o ficheiro). */
export const APK_URL = 'https://goldstream-uzxb.onrender.com/goldenstream.apk'

/**
 * Abre o download do APK mais recente. No telemóvel o Chrome trata da transferência e
 * pergunta se quer instalar por cima; no computador abre numa aba nova.
 */
export function downloadUpdate() {
  const url = `${APK_URL}?v=${Date.now()}`
  if (Capacitor.isNativePlatform()) {
    window.open(url, '_system')
    return
  }
  window.open(url, '_blank', 'noopener')
}

export function reloadApp() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('atualizar', Date.now().toString())
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}
