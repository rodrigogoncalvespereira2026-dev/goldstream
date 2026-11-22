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
