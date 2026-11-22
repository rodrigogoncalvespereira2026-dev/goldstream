import { useState } from 'react'
import { setConsentPreferences, useConsentPreferences } from '../lib/analytics'

export function PrivacyConsent() {
  const consent = useConsentPreferences()
  const [customizing, setCustomizing] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [retargeting, setRetargeting] = useState(false)

  if (consent !== null) return null

  return (
    <aside className="privacy-consent" aria-labelledby="privacy-consent-title">
      <p className="privacy-consent-eyebrow">Privacidade</p>
      <h2 id="privacy-consent-title">Tu escolhes os dados opcionais</h2>
      <p className="privacy-consent-copy">
        Escolhe separadamente analytics e publicidade personalizada. Analytics só disponibiliza
        eventos gerais de navegação e reprodução; retargeting só disponibiliza IDs de pixels quando
        existirem na configuração. Não incluímos pesquisas, nomes de músicas nem dados da conta.
      </p>
      {customizing && (
        <div className="privacy-consent-options">
          <label className="privacy-consent-option">
            <input
              type="checkbox"
              checked={analytics}
              onChange={(event) => setAnalytics(event.target.checked)}
            />
            <span>
              <strong>Analytics</strong>
              <small>Eventos genéricos de navegação e pedidos de reprodução.</small>
            </span>
          </label>
          <label className="privacy-consent-option">
            <input
              type="checkbox"
              checked={retargeting}
              onChange={(event) => setRetargeting(event.target.checked)}
            />
            <span>
              <strong>Retargeting</strong>
              <small>Disponibilizar IDs de pixels a integrações de publicidade.</small>
            </span>
          </label>
        </div>
      )}
      <div className="privacy-consent-actions">
        {!customizing ? (
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setConsentPreferences({ analytics: false, retargeting: false })}
            >
              Só essenciais
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setCustomizing(true)}
            >
              Personalizar
            </button>
            <button
              type="button"
              className="connect-button"
              onClick={() => setConsentPreferences({ analytics: true, retargeting: true })}
            >
              Aceitar opcionais
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setCustomizing(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="connect-button"
              onClick={() => setConsentPreferences({ analytics, retargeting })}
            >
              Guardar escolhas
            </button>
          </>
        )}
      </div>
      <p className="privacy-consent-footnote">
        Podes alterar esta escolha a qualquer momento em Definições → Privacidade e dados.
      </p>
    </aside>
  )
}