import { Capacitor, registerPlugin } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { VERSAO_APP } from './versaoApp'

/** O site (estático) serve o APK e a versão publicada; não há servidor próprio. */
const SITE = 'https://goldstream-uzxb.onrender.com'
export const APK_URL = `${SITE}/goldstream.apk`
export const VERSAO_URL = `${SITE}/versao.json`
export { VERSAO_APP }

export type VersaoPublicada = {
  versao: string
  codigo: number
  novidades: string[]
}

type AppUpdatePlugin = {
  openDownload(options: { url: string }): Promise<{ opened: boolean }>
  instalar(options: { url: string }): Promise<{ caminho: string }>
}

const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate')

/**
 * Pergunta ao site qual é a versão publicada. Sem rede não há aviso: devolve null e a
 * app segue como está. Compara-se o `codigo` (número), nunca o texto da versão.
 */
export async function versaoPublicada(): Promise<VersaoPublicada | null> {
  try {
    // `?v=` e `no-store`: um proxy ou o WebView não podem servir a resposta antiga.
    const resposta = await fetch(`${VERSAO_URL}?v=${Date.now()}`, { cache: 'no-store' })
    if (!resposta.ok) return null
    const dados = (await resposta.json()) as {
      versao?: unknown
      codigo?: unknown
      novidades?: unknown
    }
    const codigo = Number(dados?.codigo)
    if (!Number.isFinite(codigo)) return null
    const lista = Array.isArray(dados.novidades) ? dados.novidades : []
    return {
      versao: String(dados?.versao ?? codigo),
      codigo,
      novidades: lista.filter((item): item is string => typeof item === 'string').slice(0, 3),
    }
  } catch {
    return null
  }
}

/** Há versão nova quando o código publicado é maior do que o do APK instalado. */
export function haVersaoNova(publicada: VersaoPublicada | null): publicada is VersaoPublicada {
  return Boolean(publicada && publicada.codigo > VERSAO_APP.codigo)
}

/**
 * Instala a versão publicada. Dentro do APK, o download e a abertura do instalador
 * são feitos pelo plugin nativo: o WebView não escreve ficheiros nem instala nada.
 */
export async function instalarAtualizacao(): Promise<void> {
  const url = `${APK_URL}?v=${Date.now()}`
  if (!Capacitor.isNativePlatform()) {
    window.open(url, '_blank', 'noopener')
    return
  }
  try {
    await AppUpdate.instalar({ url })
  } catch (falha) {
    const mensagem = falha instanceof Error ? falha.message : String(falha)
    // APK de antes deste mecanismo (só tinha openDownload): instala pelo Chrome.
    if (/not implemented|não está implementado/i.test(mensagem)) {
      await downloadUpdate()
      return
    }
    throw falha
  }
}

/**
 * Abre o download do APK no navegador do sistema. Alternativa quando o instalador
 * não pode arrancar (por exemplo, o APK instalado ainda não tem o plugin novo).
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
