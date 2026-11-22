import { useState } from 'react'
import { Section } from '../components/Cards'
import { DownloadIcon, RefreshIcon } from '../components/Icons'
import { YouTubeLink } from '../components/YouTubeLink'
import { downloadUpdate, reloadApp } from '../lib/update'

export function Settings() {
  const [updateNote, setUpdateNote] = useState('')

  return (
    <div>
      <h1 className="page-title">Definições</h1>

      <Section title="Atualizar app" note="Sempre a versão mais recente">
        <p className="settings-note">
          As músicas e o visual chegam sozinhos, sem instalar nada. Quando houver uma versão nova
          da app — ícone, notificações, reprodução em segundo plano — baixe por aqui: o Chrome
          instala por cima e mantém os teus dados. Já não precisa de escrever o endereço.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="connect-button settings-action"
            onClick={async () => {
              setUpdateNote('A abrir o Chrome para transferir…')
              try {
                await downloadUpdate()
                setUpdateNote(
                  'O Chrome está a transferir a atualização. Quando terminar, toca na notificação para instalar por cima.',
                )
              } catch {
                setUpdateNote('Não consegui abrir o download. Tenta de novo daqui a pouco.')
              }
            }}
          >
            <DownloadIcon size={18} />
            Baixar atualização
          </button>
          <button type="button" className="ghost-button settings-action" onClick={reloadApp}>
            <RefreshIcon size={18} />
            Recarregar conteúdo
          </button>
        </div>
        {updateNote && <p className="settings-note settings-note-update">{updateNote}</p>}
      </Section>

      <Section title="Tocar por link" note="Experimental">
        <p className="settings-note">
          Cole o link de uma música do YouTube para tocar a faixa inteira. Este recurso fica
          aqui por enquanto, até decidirmos onde ele deve morar.
        </p>
        <YouTubeLink />
      </Section>

      <Section title="Sobre">
        <p className="settings-note">
          O goldenstream é uma demonstração de player de música. As faixas do catálogo são gravações
          livres do SoundHelix; as buscas usam Audius e YouTube.
        </p>
      </Section>
    </div>
  )
}
