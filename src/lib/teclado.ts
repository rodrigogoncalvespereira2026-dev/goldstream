const CAMPOS = 'input, textarea, select, [contenteditable="true"]'

/** Momento em que um campo de texto ganhou foco (o browser também rola para
 *  o mostrar, e esse scroll não pode fechar o teclado que acabou de abrir). */
let ultimoFoco = 0

/** Fecha o teclado do telemóvel tirando o foco ao campo de texto ativo. */
export function fecharTeclado() {
  const ativo = document.activeElement
  if (ativo instanceof HTMLElement && ativo.matches(CAMPOS)) ativo.blur()
}

/**
 * Fecha o teclado sempre que a página rola — com os resultados à frente o
 * teclado só tapava a lista. Devolve a função que desliga a vigilância.
 */
export function vigiarTeclado(): () => void {
  const aoFocar = (event: Event) => {
    const alvo = event.target
    if (alvo instanceof HTMLElement && alvo.matches(CAMPOS)) ultimoFoco = Date.now()
  }
  const aoRolar = () => {
    if (Date.now() - ultimoFoco < 600) return
    fecharTeclado()
  }

  document.addEventListener('focusin', aoFocar)
  document.addEventListener('scroll', aoRolar, { capture: true, passive: true })

  return () => {
    document.removeEventListener('focusin', aoFocar)
    document.removeEventListener('scroll', aoRolar, { capture: true })
  }
}
