import { useEffect, useState } from 'react'
import { ErroApi, guardarToken, lerToken, pedir } from './api'
import { lembrarConta } from './contasLembradas'

export type Account = {
  id: string
  name: string
  email: string
}

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
  'sonora:ver-video',
  'sonora:np-transparente',
  'sonora:mostrar-tiktok',
]

const CONTA = 'sonora:conta'
/** Marca de qual conta são os dados que estão neste telemóvel. */
const DONO = 'sonora:dadosDe'

const ler = (chave: string): string | null => {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

const gravar = (chave: string, valor: string | null): void => {
  try {
    if (valor === null) localStorage.removeItem(chave)
    else localStorage.setItem(chave, valor)
  } catch {
    /* ignora */
  }
}

const snapshot = (): Record<string, string | null> => {
  const data: Record<string, string | null> = {}
  DATA_KEYS.forEach((key) => {
    data[key] = ler(key)
  })
  return data
}

/** Vazio para efeitos de sincronização: sem valor, lista vazia ou objeto vazio. */
const vazio = (valor: string | null | undefined): boolean =>
  !valor || valor === '[]' || valor === '{}'

const paraConta = (conta: ContaApi): Account => ({
  id: conta.id,
  name: conta.nome,
  email: conta.email,
})

const lerContaGuardada = (): Account | null => {
  const raw = ler(CONTA)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Account>
    if (!parsed?.id || !parsed?.email) return null
    return { id: String(parsed.id), name: String(parsed.name ?? ''), email: String(parsed.email) }
  } catch {
    return null
  }
}

const guardarConta = (conta: Account | null): void => {
  gravar(CONTA, conta ? JSON.stringify(conta) : null)
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
 * Copia os dados da conta para o telemóvel. Nunca apaga o que só existe aqui:
 * se o servidor não tiver um campo e o aparelho tiver, fica o do aparelho (e é
 * enviado). Devolve `true` quando há dados locais por enviar.
 */
const hidratar = (dados: Record<string, string | null>, contaId: string): boolean => {
  const dono = ler(DONO)
  const mesmoDono = dono === contaId
  // Sem marca (primeira entrada depois da atualização) aceita-se o local; com
  // marca de outra conta, manda o servidor, para não misturar contas.
  const aceitaLocal = mesmoDono || dono === null
  let porEnviar = false

  DATA_KEYS.forEach((key) => {
    const doServidor = dados[key] ?? null
    const local = ler(key)
    let escolhido = doServidor
    if (aceitaLocal && vazio(doServidor) && !vazio(local)) {
      escolhido = local
      porEnviar = true
    }
    gravar(key, escolhido && escolhido.length ? escolhido : null)
  })

  gravar(DONO, contaId)
  return porEnviar
}

const comTempoLimite = <T>(promessa: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new ErroApi('O servidor está a demorar.', 0))
    }, ms)
    promessa.then(
      (valor) => {
        window.clearTimeout(timer)
        resolve(valor)
      },
      (falha) => {
        window.clearTimeout(timer)
        reject(falha)
      },
    )
  })

/** Envia o estado atual do app para a conta no servidor. */
export async function enviarDados(): Promise<void> {
  const token = lerToken()
  if (!token || !cached) return
  await pedir('/api/dados', {
    metodo: 'PUT',
    token,
    manter: true,
    corpo: { dados: snapshot() },
  })
}

/** Versão que não espera (usada ao esconder/fechar a app). */
export const saveAccountData = (): void => {
  void enviarDados().catch(() => {})
}

/**
 * Retoma a sessão guardada antes do primeiro ecrã. Sem rede, a app abre com o
 * que está no telemóvel e volta a tentar na próxima abertura.
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
    // A API pode estar a acordar (plano free): não vale a pena segurar o
    // arranque da app à espera. Sem resposta a tempo, abre com o telemóvel.
    const resposta = await comTempoLimite(pedir<RespostaEu>('/api/auth/eu', { token }), 4000)
    const porEnviar = hidratar(resposta.dados ?? {}, resposta.conta.id)
    guardarConta(paraConta(resposta.conta))
    // Cada abertura recorda a conta para o seletor da página de entrada.
    lembrarConta(resposta.conta)
    emit()
    if (porEnviar) await enviarDados().catch(() => {})
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
  // O primeiro registo leva o que já está neste telemóvel. Uma segunda conta no
  // mesmo aparelho começa limpa.
  const jaTinhaConta = Boolean(cached)
  const dados = jaTinhaConta ? {} : snapshot()
  // Conta nova: a opção de vídeo nasce desligada, mesmo que este telemóvel a
  // tivesse ligado noutra conta.
  dados['sonora:ver-video'] = '0'
  const resposta = await pedir<RespostaConta>('/api/auth/registar', {
    metodo: 'POST',
    corpo: { nome: input.name, email: input.email, senha: input.password, dados },
  })
  guardarToken(resposta.token)
  guardarConta(paraConta(resposta.conta))
  lembrarConta(resposta.conta)
  hidratar(jaTinhaConta ? {} : dados, resposta.conta.id)
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
  lembrarConta(resposta.conta)
  const porEnviar = hidratar(resposta.dados ?? {}, resposta.conta.id)
  emit()
  // O que só existia no telemóvel sobe agora para a conta.
  if (porEnviar) await enviarDados().catch(() => {})
  return cached ?? paraConta(resposta.conta)
}

/** Grava tudo no servidor **antes** de fechar a sessão (senão ficava só local). */
export async function signOut(): Promise<void> {
  await enviarDados().catch(() => {})
  const token = lerToken()
  if (token) await pedir('/api/auth/sair', { metodo: 'POST', token }).catch(() => {})
  guardarToken(null)
  guardarConta(null)
  emit()
}

/**
 * Sincronização automática: assim que os dados mudam (playlists, gostos,
 * estatísticas, perfil, fundo) vão para a base de dados, sem esperar que a
 * pessoa saia da app.
 */
const EVENTOS = [
  'sonora:mine',
  'sonora:stats',
  'sonora:profile',
  'sonora:background',
  'sonora:hidden',
  'sonora:ver-video',
  'sonora:np-transparente',
  'sonora:mostrar-tiktok',
]

if (typeof window !== 'undefined') {
  let timer: number | null = null
  const agendar = () => {
    if (!lerToken() || !cached) return
    if (timer !== null) return
    timer = window.setTimeout(() => {
      timer = null
      saveAccountData()
    }, 1200)
  }

  EVENTOS.forEach((nome) => window.addEventListener(nome, agendar))
  window.addEventListener('pagehide', agendar)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') agendar()
  })
  window.setInterval(agendar, 20000)
}
