import { useState } from 'react'
import { useYouTubeKey } from '../lib/youtube'

export function YouTubeConnect() {
  const [key, saveKey] = useYouTubeKey()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  if (key && !editing) {
    return (
      <div className="key-row">
        <span className="key-dot" aria-hidden="true" />
        <span>YouTube conectado — as músicas tocam inteiras no player do YouTube.</span>
        <button type="button" className="text-button" onClick={() => setEditing(true)}>
          Trocar chave
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            saveKey('')
            setDraft('')
            setEditing(false)
          }}
        >
          Desconectar
        </button>
      </div>
    )
  }

  return (
    <div className="connect-card">
      <div className="connect-card-head">
        <span className="connect-badge">YouTube</span>
        <h3>Toque músicas completas de qualquer artista</h3>
      </div>
      <p className="connect-sub">
        O app usa a API oficial do YouTube com uma chave gratuita sua. A chave fica salva apenas
        neste navegador.
      </p>

      <ol className="connect-steps">
        <li>
          Abra o{' '}
          <a
            href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            Google Cloud
          </a>{' '}
          e ative a <strong>YouTube Data API v3</strong> (basta um projeto novo).
        </li>
        <li>
          Em <strong>Credenciais → Criar credenciais → Chave de API</strong>, copie a chave gerada.
        </li>
        <li>Cole a chave abaixo. A cota gratuita cobre cerca de 100 buscas por dia.</li>
      </ol>

      <form
        className="connect-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim()) return
          saveKey(draft)
          setDraft('')
          setEditing(false)
        }}
      >
        <input
          type="password"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Cole sua chave da API do YouTube"
          aria-label="Chave da API do YouTube"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="connect-button" disabled={!draft.trim()}>
          Salvar chave
        </button>
        {editing && (
          <button type="button" className="text-button" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        )}
      </form>
    </div>
  )
}
