import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Reconhecimento de fala do browser (Web Speech API). Não existe em todos os
 * WebViews: onde não houver, o botão do microfone nem aparece.
 */
type ResultadoVoz = { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }
type ErroVoz = { error?: string }

type Reconhecimento = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: ResultadoVoz) => void) | null
  onerror: ((event: ErroVoz) => void) | null
  onend: (() => void) | null
}

type ConstrutorVoz = new () => Reconhecimento

const construtor = (): ConstrutorVoz | null => {
  if (typeof window === 'undefined') return null
  const janela = window as unknown as {
    SpeechRecognition?: ConstrutorVoz
    webkitSpeechRecognition?: ConstrutorVoz
  }
  return janela.SpeechRecognition ?? janela.webkitSpeechRecognition ?? null
}

/** Este browser sabe ouvir voz humana? */
export const vozDisponivel = (): boolean => Boolean(construtor())

const motivo = (codigo: string): string => {
  if (codigo === 'not-allowed' || codigo === 'service-not-allowed') {
    return 'Sem acesso ao microfone — escreve o nome da música'
  }
  if (codigo === 'no-speech') return 'Não ouvi nada — fala outra vez'
  if (codigo === 'audio-capture') return 'Não há microfone neste aparelho'
  return 'Não consegui ouvir — escreve o nome da música'
}

/**
 * Botão de voz da pesquisa: o que for dito vai para a busca. O aviso (quando
 * falha) aparece no próprio campo e desaparece sozinho.
 */
export function useEscuta(aoOuvir: (texto: string) => void) {
  const [aOuvir, setAOuvir] = useState(false)
  const [aviso, setAviso] = useState('')
  const reconhecimento = useRef<Reconhecimento | null>(null)
  const temporizador = useRef<number | null>(null)

  const limparTemporizador = () => {
    if (temporizador.current) {
      window.clearTimeout(temporizador.current)
      temporizador.current = null
    }
  }

  const avisar = useCallback((texto: string) => {
    setAviso(texto)
    limparTemporizador()
    temporizador.current = window.setTimeout(() => setAviso(''), 4000)
  }, [])

  const parar = useCallback(() => {
    reconhecimento.current?.stop()
    reconhecimento.current = null
    setAOuvir(false)
  }, [])

  useEffect(
    () => () => {
      reconhecimento.current?.abort()
      reconhecimento.current = null
      limparTemporizador()
    },
    [],
  )

  const alternar = useCallback(() => {
    if (reconhecimento.current) {
      parar()
      return
    }

    const Construtor = construtor()
    if (!Construtor) {
      avisar('Este aparelho não ouve voz')
      return
    }

    const r = new Construtor()
    r.lang = 'pt-PT'
    r.continuous = false
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (event) => {
      const texto = event.results?.[0]?.[0]?.transcript?.trim() ?? ''
      if (texto) aoOuvir(texto)
      else avisar('Não ouvi nada — fala outra vez')
    }
    r.onerror = (event) => avisar(motivo(event.error ?? ''))
    r.onend = () => {
      reconhecimento.current = null
      setAOuvir(false)
    }

    try {
      r.start()
      reconhecimento.current = r
      setAviso('')
      setAOuvir(true)
    } catch {
      avisar('Não consegui ouvir — escreve o nome da música')
    }
  }, [aoOuvir, avisar, parar])

  return { disponivel: vozDisponivel(), aOuvir, aviso, alternar }
}
