import { Section } from '../components/Cards'
import { RefreshIcon } from '../components/Icons'
import { YouTubeLink } from '../components/YouTubeLink'
import { reloadApp } from '../lib/update'

export function Settings() {
  return (
    <div>
      <h1 className="page-title">Definições</h1>

      <Section title="Atualizar app" note="Sempre a versão mais recente">
        <p className="settings-note">
          O Sonora abre direto a versão publicada online, por isso as novidades chegam sozinhas,
          sem instalar um ficheiro novo. Se algo ainda aparecer como antes, toque no botão para
          recarregar.
        </p>
        <button type="button" className="connect-button settings-action" onClick={reloadApp}>
          <RefreshIcon size={18} />
          Atualizar agora
        </button>
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
          Sonora é uma demonstração de player de música. As faixas do catálogo são gravações
          livres do SoundHelix; as buscas usam Audius e YouTube.
        </p>
      </Section>
    </div>
  )
}
