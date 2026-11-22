import { useEffect, useState } from 'react'

export type Account = {
  id: string
  name: string
  email: string
}

type StoredAccount = Account & {
  salt: string
  hash: string
  /** Dados da app pertencentes a esta conta (copiados do storage ao sair). */
  data: Record<string, string | null>
  createdAt: number
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
]

const ACCOUNTS = 'sonora:accounts'
const SESSION = 'sonora:session'

const readAccounts = (): StoredAccount[] => {
  try {
    const raw = localStorage.getItem(ACCOUNTS)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as StoredAccount[]) : []
  } catch {
    return []
  }
}

const writeAccounts = (accounts: StoredAccount[]): void => {
  try {
    localStorage.setItem(ACCOUNTS, JSON.stringify(accounts))
  } catch {
    /* storage indisponível */
  }
}

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

const toPublic = (account: StoredAccount): Account => ({
  id: account.id,
  name: account.name,
  email: account.email,
})

const hashPassword = async (password: string, salt: string): Promise<string> => {
  const bytes = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const newSalt = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const readSession = (): Account | null => {
  try {
    const id = localStorage.getItem(SESSION)
    if (!id) return null
    const account = readAccounts().find((item) => item.id === id)
    return account ? toPublic(account) : null
  } catch {
    return null
  }
}

const listeners = new Set<() => void>()
let cached = readSession()

const emit = (): void => {
  cached = readSession()
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

/** Guarda o estado atual do app dentro da conta aberta. */
export const saveAccountData = (): void => {
  const account = readSession()
  if (!account) return
  const accounts = readAccounts()
  const index = accounts.findIndex((item) => item.id === account.id)
  if (index < 0) return
  accounts[index] = { ...accounts[index], data: snapshot() }
  writeAccounts(accounts)
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const fail = (message: string): Error => new Error(message)

export async function signUp(input: {
  name: string
  email: string
  password: string
}): Promise<Account> {
  const name = input.name.trim()
  const email = normalizeEmail(input.email)
  const password = input.password

  if (name.length < 2) throw fail('Escreve o teu nome.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Esse email não parece válido.')
  if (password.length < 6) throw fail('A palavra-passe precisa de 6 caracteres ou mais.')

  const accounts = readAccounts()
  if (accounts.some((item) => item.email === email)) {
    throw fail('Já existe uma conta com este email. Entra nela.')
  }

  const salt = newSalt()
  const hash = await hashPassword(password, salt)
  const account: StoredAccount = {
    id: `acc_${Date.now().toString(36)}_${newSalt().slice(0, 6)}`,
    name,
    email,
    salt,
    hash,
    // A primeira conta fica com o que já está neste telemóvel.
    data: accounts.length ? {} : snapshot(),
    createdAt: Date.now(),
  }

  writeAccounts([...accounts, account])
  // Conta nova num telemóvel que já tinha outra: começa limpa.
  if (accounts.length) hydrate({})
  localStorage.setItem(SESSION, account.id)
  emit()
  return toPublic(account)
}

export async function signIn(input: { email: string; password: string }): Promise<Account> {
  const email = normalizeEmail(input.email)
  const accounts = readAccounts()
  const account = accounts.find((item) => item.email === email)
  if (!account) throw fail('Não encontrei essa conta. Cria uma nova.')

  const hash = await hashPassword(input.password, account.salt)
  if (hash !== account.hash) throw fail('Palavra-passe errada.')

  // Fecha a conta anterior (se houver) antes de abrir esta.
  saveAccountData()
  hydrate(account.data)
  localStorage.setItem(SESSION, account.id)
  emit()
  return toPublic(account)
}

export function signOut(): void {
  saveAccountData()
  try {
    localStorage.removeItem(SESSION)
  } catch {
    /* ignora */
  }
  emit()
}

export function hasAccounts(): boolean {
  return readAccounts().length > 0
}
