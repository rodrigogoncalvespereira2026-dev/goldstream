import { lerToken, pedir } from './api'

/**
 * Letras do LRCLIB guardadas em dois sítios:
 *
 * - na conta (coleção `letras`, pela API), para abrirem logo e sobreviverem a
 *   outro telemóvel ou a uma limpeza do navegador;
 * - neste aparelho (`localStorage`), para a letra abrir mesmo sem rede.
 *
 * A cópia local não entra na sincronização de dados da conta: são megabytes
 * possíveis e já têm o seu próprio pedido à API.
 */
export type LetraGuardada = { plain: string; sync?: string } | null

type Entrada = { valor: LetraGuardada; em: number }

const KEY = 'sonora:letras'
/** Letras guardadas neste aparelho. Além disto, apaga-se a mais antiga. */
const LIMITE_LOCAL = 250

/** Chave de uma faixa na base de dados: título e artista, sem depender de maiúsculas. */
export const chaveDaFaixa = (title: string, artist: string): string =>
  `${title.trim()} | ${artist.trim()}`.toLowerCase()

const lerTudo = (): Record<string, Entrada> => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const dados = JSON.parse(raw) as unknown
    return dados && typeof dados === 'object' ? (dados as Record<string, Entrada>) : {}
  } catch {
    return {}
  }
}

const gravarTudo = (dados: Record<string, Entrada>): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(dados))
  } catch {
    /* sem espaço: a letra volta a ser pedida */
  }
}

/** Letra já guardada neste aparelho; `encontrada` distingue "não há" de "não sei". */
export const lerLetraLocal = (chave: string): { encontrada: boolean; valor: LetraGuardada } => {
  const todas = lerTudo()
  const entrada = todas[chave]
  if (!entrada || !Object.prototype.hasOwnProperty.call(entrada, 'valor')) {
    return { encontrada: false, valor: null }
  }
  return { encontrada: true, valor: entrada.valor ?? null }
}

export const guardarLetraLocal = (chave: string, valor: LetraGuardada): void => {
  const todas = lerTudo()
  todas[chave] = { valor, em: Date.now() }
  const chaves = Object.keys(todas)
  if (chaves.length > LIMITE_LOCAL) {
    chaves
      .sort((a, b) => (todas[a]?.em ?? 0) - (todas[b]?.em ?? 0))
      .slice(0, chaves.length - LIMITE_LOCAL)
      .forEach((antiga) => delete todas[antiga])
  }
  gravarTudo(todas)
}

/** Letras que a conta já conhece. Sem sessão (ou sem rede) devolve o que der. */
export async function letrasDaConta(
  chaves: string[],
): Promise<Record<string, LetraGuardada>> {
  const token = lerToken()
  if (!token || !chaves.length) return {}
  const resposta = await pedir<{ letras?: Record<string, LetraGuardada> }>('/api/letras/consultar', {
    metodo: 'POST',
    token,
    corpo: { chaves: chaves.slice(0, 20) },
  })
  const guardadas = resposta?.letras
  return guardadas && typeof guardadas === 'object' ? guardadas : {}
}

/** Envia a letra (ou a falta dela) para a conta. Falha em silêncio: é só cache. */
export async function guardarLetraNaConta(
  chave: string,
  valor: LetraGuardada,
): Promise<void> {
  const token = lerToken()
  if (!token) return
  await pedir('/api/letras', { metodo: 'PUT', token, corpo: { chave, valor } }).catch(() => {})
}
