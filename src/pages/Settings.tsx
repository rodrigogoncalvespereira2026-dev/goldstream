import { Section } from '../components/Cards'
import { YouTubeLink } from '../components/YouTubeLink'

export function Settings() {
  return (
    <div>
      <h1 className="page-title">Definições</h1>

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
