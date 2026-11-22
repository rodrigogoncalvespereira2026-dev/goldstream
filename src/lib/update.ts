import { Capacitor, registerPlugin } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

/** Endereço público do APK mais recente (o site serve o ficheiro). */
export const APK_URL = 'https://goldstream-uzxb.onrender.com/goldenstream.apk'

type AppUpdatePlugin = {
  openDownload(options: { url: string }): Promise<{ opened: boolean }>
}

const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate')

/**
 * Abre o download do APK mais recente. O WebView não descarrega APKs, por isso o pedido
 * passa pelo plugin nativo (Chrome do sistema) e, se ele não existir, pelo Browser.
 */
export async function downloadUpdate(): Promise<void> {
  const url = `${APK_URL}?v=${Date.now()}`

  if (Capacitor.isNativePlatform()) {
    try {
      await AppUpdate.openDownload({ url })
      return
    } catch {
      /* APK sem o plugin nativo — tenta as alternativas abaixo */
    }

    try {
      await Browser.open({ url })
      return
    } catch {
      /* sem browser disponível */
    }
  }

  window.open(url, '_blank', 'noopener')
}

/**
 * O APK abre sempre a versão publicada na internet, por isso uma atualização
 * chega sem instalar nada de novo. Este helper força um recarregamento fresco
 * (com um parâmetro novo no URL, para o WebView não servir a página em cache).
 */
export function reloadApp() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('atualizar', Date.now().toString())
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}
