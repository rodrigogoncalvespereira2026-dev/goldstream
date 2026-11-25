/**
 * Endereço da API. Em produção aponta para o serviço Node do Render; em
 * desenvolvimento para a API local. Pode ser trocado com VITE_API_URL.
 */
const PADRAO = import.meta.env.DEV
  ? 'http://127.0.0.1:8787'
  : 'https://goldenstream-api.onrender.com'

export const API_URL: string = (
  (import.meta.env.VITE_API_URL as string | undefined) || PADRAO
).replace(/\/+$/, '')

const TOKEN_KEY = 'sonora:token'

export const lerToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export const guardarToken = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage indisponível */
  }
}

export class ErroApi extends Error {
  estado: number

  constructor(mensagem: string, estado = 0) {
    super(mensagem)
    this.name = 'ErroApi'
    this.estado = estado
  }
}

type Opcoes = {
  metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  corpo?: unknown
  token?: string | null
  /** Mantém o pedido vivo quando a página fecha (gravações ao sair). */
  manter?: boolean
}

export async function pedir<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', corpo, token, manter } = opcoes
  let resposta: Response
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      keepalive: manter,
    })
  } catch {
    throw new ErroApi('Sem ligação ao servidor. Verifica a internet e tenta de novo.', 0)
  }

  const texto = await resposta.text().catch(() => '')
  let dados: unknown = null
  if (texto) {
    try {
      dados = JSON.parse(texto) as unknown
    } catch {
      dados = null
    }
  }

  if (!resposta.ok) {
    const mensagem =
      dados && typeof dados === 'object' && typeof (dados as { erro?: unknown }).erro === 'string'
        ? String((dados as { erro: string }).erro)
        : 'Não consegui falar com o servidor. Tenta mais tarde.'
    throw new ErroApi(mensagem, resposta.status)
  }

  return dados as T
}
