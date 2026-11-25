import { useEffect, useState } from 'react'
import { ErroApi, guardarToken, lerToken, pedir } from './api'

export type Account = {
  id: string
  name: string
  email: string
}

/** Conta como a API a devolve. */
type ContaApi = {
  id: string
  nome: string
  email: string
}

type RespostaConta = {
  token: string
  conta: ContaApi
  dados?: Record<string, string | null>
}

type RespostaEu = {
  conta: ContaApi
  dados: Record<string, string | null>
}

/** Chaves do app que pertencem à conta. */
const DATA_KEYS = [
  'sonora:liked',
  'sonora:recent',
  'sonora:tracks',
  'sonora:volume',
  'sonora:profile',
  'sonora:stats',
  'sonora:background',
  'sonora:player',
  'sonora:mine',
]

const CONTA = 'sonora:conta'

const snapshot = (): Record<string, string | null> => {
  const data: Record<string, string | null> = {}
  DATA_KEYS.forEach((key) => {
    try {
      data[key] = localStorage.getItem(key)
    } catch {
      data[key] = null
    }
  })
  return data
}

const hydrate = (data: Record<string, string | null>): void => {
  DATA_KEYS.forEach((key) => {
    try {
      const value = data[key]
      if (typeof value === 'string') localStorage.setItem(key, value)
      else localStorage.removeItem(key)
    } catch {
      /* ignora */
    }
  })
}

const paraConta = (conta: ContaApi): Account => ({
  id: conta.id,
  name: conta.nome,
  email: conta.email,
})

const lerContaGuardada = (): Account | null => {
  try {
    const raw = localStorage.getItem(CONTA)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Account>
    if (!parsed?.id || !parsed?.email) return null
    return {
      id: String(parsed.id),
      name: String(parsed.name ?? ''),
      email: String(parsed.email),
    }
  } catch {
    return null
  }
}

const guardarConta = (conta: Account | null): void => {
  try {
    if (conta) localStorage.setItem(CONTA, JSON.stringify(conta))
    else localStorage.removeItem(CONTA)
  } catch {
    /* ignora */
  }
}

const listeners = new Set<() => void>()
let cached = lerContaGuardada()

const emit = (): void => {
  cached = lerContaGuardada()
  listeners.forEach((listener) => listener())
}

export const currentAccount = (): Account | null => cached

export const useAccount = (): Account | null => {
  const [account, setAccount] = useState<Account | null>(cached)

  useEffect(() => {
    const sync = () => setAccount(cached)
    listeners.add(sync)
    sync()
    return () => {
      listeners.delete(sync)
    }
  }, [])

  return account
}

/**
 * Envia o estado atual do app para a conta no servidor. É chamado ao sair, ao
 * esconder a app e de minuto a minuto; falhar não deve quebrar a experiência,
 * por isso o erro é ignorado (a próxima gravação volta a tentar).
 */
export const saveAccountData = (): void => {
  const token = lerToken()
  if (!token || !cached) return
  void pedir('/api/dados', {
    metodo: 'PUT',
    token,
    manter: true,
    corpo: { dados: snapshot() },
  }).catch(() => {})
}

/**
 * Retoma a sessão guardada: confirma o token no servidor e traz os dados da
 * conta antes de a app desenhar o primeiro ecrã. Sem rede, a app abre com o
 * que está no telemóvel e tenta de novo na próxima abertura.
 */
export async function restaurarSessao(): Promise<void> {
  const token = lerToken()
  if (!token) {
    if (cached) {
      guardarConta(null)
      cached = null
    }
    return
  }
  if (!cached) return
  try {
    const resposta = await pedir<RespostaEu>('/api/auth/eu', { token })
    hydrate(resposta.dados ?? {})
    guardarConta(paraConta(resposta.conta))
    emit()
  } catch (falha) {
    if (falha instanceof ErroApi && falha.estado === 401) {
      guardarToken(null)
      guardarConta(null)
      emit()
    }
  }
}

export async function signUp(input: {
  name: string
  email: string
  password: string
}): Promise<Account> {
  // O primeiro registo leva o que já está neste telemóvel (playlists, gostos,
  // estatísticas). Contas seguintes no mesmo aparelho começam limpas.
  const jaTinhaConta = Boolean(cached)
  const dados = jaTinhaConta ? {} : snapshot()
  const resposta = await pedir<RespostaConta>('/api/auth/registar', {
    metodo: 'POST',
    corpo: { nome: input.name, email: input.email, senha: input.password, dados },
  })
  guardarToken(resposta.token)
  guardarConta(paraConta(resposta.conta))
  if (jaTinhaConta) hydrate({})
  emit()
  return cached ?? paraConta(resposta.conta)
}

export async function signIn(input: { email: string; password: string }): Promise<Account> {
  const resposta = await pedir<RespostaConta>('/api/auth/entrar', {
    metodo: 'POST',
    corpo: { email: input.email, senha: input.password },
  })
  guardarToken(resposta.token)
  guardarConta(paraConta(resposta.conta))
  if (resposta.dados) hydrate(resposta.dados)
  emit()
  return cached ?? paraConta(resposta.conta)
}

export function signOut(): void {
  saveAccountData()
  const token = lerToken()
  if (token) {
    void pedir('/api/auth/sair', { metodo: 'POST', token }).catch(() => {})
  }
  guardarToken(null)
  guardarConta(null)
  emit()
}
