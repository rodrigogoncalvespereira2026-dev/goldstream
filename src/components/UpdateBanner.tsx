import { useEffect, useState } from 'react'
import {
  haVersaoNova,
  instalarAtualizacao,
  isAppEmpacotada,
  versaoInstalada,
  versaoPublicada,
  type VersaoPublicada,
} from '../lib/update'

/**
 * Aviso de versão nova, só dentro do APK: o site é sempre o que está no servidor,
 * por isso não faz sentido comparar a versão consigo própria no navegador.
 */
export function UpdateBanner() {
  const [nova, setNova] = useState<VersaoPublicada | null>(null)
  const [fechado, setFechado] = useState(false)
  const [aInstalar, setAInstalar] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!isAppEmpacotada()) return
    let vivo = true
    void versaoPublicada().then((publicada) => {
      if (vivo && haVersaoNova(publicada)) setNova(publicada)
    })
    return () => {
      vivo = false
    }
  }, [])

  if (!nova || fechado) return null

  const instalar = async () => {
    if (aInstalar) return
    setErro('')
    setAInstalar(true)
    try {
      await instalarAtualizacao()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não consegui atualizar agora.')
    } finally {
      setAInstalar(false)
    }
  }

  return (
    <aside className="update-banner" role="status">
      <button
        type="button"
        className="update-banner-close"
        aria-label="Fechar"
        onClick={() => setFechado(true)}
      >
        ×
      </button>
      <p className="update-banner-eyebrow">Versão {nova.versao} disponível</p>
      <p className="update-banner-copy">
        {nova.novidades.length > 0
          ? `Está na ${versaoInstalada().nome}. O que muda:`
          : `Está na ${versaoInstalada().nome}.`}
      </p>
      {nova.novidades.length > 0 && (
        <ul className="update-banner-list">
          {nova.novidades.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <div className="update-banner-actions">
        <button
          type="button"
          className="connect-button"
          onClick={instalar}
          disabled={aInstalar}
        >
          {aInstalar ? 'A instalar…' : 'Atualizar'}
        </button>
        <button type="button" className="ghost-button" onClick={() => setFechado(true)}>
          Agora não
        </button>
      </div>
      {erro && <p className="update-banner-error">{erro}</p>}
    </aside>
  )
}
