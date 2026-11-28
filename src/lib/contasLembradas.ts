import { useEffect, useState } from 'react'

/**
 * Contas que já entraram neste aparelho, para a página de entrada as oferecer
 * como escolha rápida (como o seletor de contas do Google).
 *
 * Só ficam aqui contas que entraram neste aparelho — nunca a lista de contas da
 * base de dados, que exporia os emails de toda a gente.
 */
export type ContaLembrada = { id: string; nome: string; email: string; em: number }

const KEY = 'sonora:contas-lembradas'
const EVENT = 'sonora:contas-lembradas'
/** Mais do que isto seria uma lista confusa no telemóvel. */
const LIMITE = 6

export const lerContasLembradas = (): ContaLembrada[] => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const dados = JSON.parse(raw) as unknown
    if (!Array.isArray(dados)) return []
    return dados
      .filter(
        (item): item is ContaLembrada =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as ContaLembrada).id === 'string' &&
          typeof (item as ContaLembrada).email === 'string',
      )
      .map((item) => ({
        id: item.id,
        nome: typeof item.nome === 'string' ? item.nome : '',
        email: item.email,
        em: Number(item.em) || 0,
      }))
      .sort((a, b) => b.em - a.em)
      .slice(0, LIMITE)
  } catch {
    return []
  }
}

const gravar = (contas: ContaLembrada[]): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(contas.slice(0, LIMITE)))
  } catch {
    /* sem storage: a lista fica vazia */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Guarda (ou atualiza) a conta no topo da lista. */
export const lembrarConta = (conta: { id: string; nome?: string; email: string }): void => {
  if (!conta?.id || !conta.email) return
  const outras = lerContasLembradas().filter((item) => item.id !== conta.id)
  gravar([
    { id: conta.id, nome: conta.nome ?? '', email: conta.email, em: Date.now() },
    ...outras,
  ])
}

export const esquecerConta = (id: string): void => {
  gravar(lerContasLembradas().filter((item) => item.id !== id))
}

export function useContasLembradas(): ContaLembrada[] {
  const [contas, setContas] = useState<ContaLembrada[]>(lerContasLembradas)

  useEffect(() => {
    const sync = () => setContas(lerContasLembradas())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  return contas
}
