import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Section } from '../components/Cards'
import { DownloadIcon, RefreshIcon, SparkleIcon, UserIcon } from '../components/Icons'
import { NativeDebugLog } from '../components/NativeDebugLog'
import { YouTubeLink } from '../components/YouTubeLink'
import { BACKGROUNDS, useBackground } from '../lib/backgrounds'
import {
  downloadUpdate,
  haVersaoNova,
  instalarAtualizacao,
  reloadApp,
  versaoConhecida,
  versaoInstalada,
  versaoPublicada,
} from '../lib/update'
import { saveAccountData, signOut, useAccount } from '../lib/account'
import { ADMIN_EMAIL, isAdmin } from '../lib/admin'
import { setConsentPreferences, useConsentPreferences } from '../lib/analytics'
import type { Navigate } from '../lib/nav'

export function Settings({ navigate }: { navigate: Navigate }) {
  const [updateNote, setUpdateNote] = useState('')
  const [background] = useBackground()
  const currentBackground = BACKGROUNDS.find((item) => item.id === background)
  const account = useAccount()
  const consent = useConsentPreferences()
  const consentLabel = consent
    ? `Analytics ${consent.analytics ? 'permitido' : 'recusado'} · Retargeting ${consent.retargeting ? 'permitido' : 'recusado'}`
    : 'Ainda não escolhido'

  return (
    <div className="settings-page">
      <header className="settings-intro">
        <span className="settings-eyebrow">GOLDENSTREAM</span>
        <h1 className="page-title">Definições</h1>
        <p>Personaliza a app, gere a tua conta e escolhe como os teus dados são usados.</p>
      </header>

      <div className="settings-grid">
        <div className="settings-card">
          <Section title="Conta" note={account?.email ?? 'Sessão aberta'}>
            <p className="settings-note">
              {account
                ? `Olá, ${account.name}. Os teus gostos, playlists e preferências ficam na tua conta, guardada na base de dados da goldenstream.`
                : 'Sem sessão aberta.'}
            </p>
            <div className="settings-actions">
              <button
                type="button"
                className="ghost-button settings-action"
                onClick={() => {
                  saveAccountData()
                  signOut()
                  window.location.reload()
                }}
              >
                Terminar sessão
              </button>
            </div>
          </Section>
        </div>

        {isAdmin(account) && (
          <div className="settings-card">
            <Section title="Administração" note="Acesso restrito">
              <p className="settings-note">
                Números da app, só para a conta {ADMIN_EMAIL}.
              </p>
              <div className="settings-actions">
                <button
                  type="button"
                  className="connect-button settings-action"
                  onClick={() => navigate({ type: 'admin' })}
                >
                  <UserIcon size={18} />
                  Abrir painel admin
                </button>
              </div>
            </Section>
          </div>
        )}
        <div className="settings-card">
          <Section title="Aparência" note="Personalização">
            <p className="settings-note">
              Escolhe um cenário e ajusta as cores da goldenstream.
            </p>
            <div className="settings-actions">
              <button
                type="button"
                className="connect-button settings-action"
                onClick={() => navigate({ type: 'backgrounds' })}
              >
                <SparkleIcon size={18} />
                Fundos da tela
              </button>
              <button
                type="button"
                className="ghost-button settings-action"
                onClick={() => navigate({ type: 'colors' })}
              >
                Cores do tema
              </button>
            </div>
            {currentBackground && (
              <p className="settings-current-value">Fundo atual: {currentBackground.name}</p>
            )}
          </Section>
        </div>

        <div className="settings-card">
          <Section title="Atualizar app" note="Manutenção">
            <p className="settings-note">
              Atualiza a instalação ou recarrega o catálogo. Os teus dados locais são preservados.
            </p>
            <div className="settings-actions">
              <button
                type="button"
                className="connect-button settings-action"
                onClick={async () => {
                  setUpdateNote('A procurar atualização…')
                  const publicada = await versaoPublicada()
                  if (!publicada) {
                    setUpdateNote(`Sem ligação ao servidor. Está na versão ${versaoInstalada().nome}.`)
                    return
                  }
                  const versaoServidor = publicada.versao
                  if (!haVersaoNova(publicada)) {
                    // Sem a ponte nativa (APK antigo) não se sabe a versão instalada:
                    // dizer "já tem a mais recente" seria mentira.
                    setUpdateNote(
                      versaoConhecida()
                        ? `Já tem a ${versaoInstalada().nome}, que é a mais recente.`
                        : `Não consigo confirmar a versão instalada neste aparelho. A mais recente é a ${versaoServidor} — usa "Baixar o APK" para a instalar.`,
                    )
                    return
                  }
                  setUpdateNote(`A instalar a ${publicada.versao}…`)
                  try {
                    await instalarAtualizacao()
                    setUpdateNote('Instalador aberto. Confirma a instalação para terminar.')
                  } catch (falha) {
                    setUpdateNote(
                      falha instanceof Error ? falha.message : 'Não consegui atualizar agora.',
                    )
                  }
                }}
              >
                <DownloadIcon size={18} />
                Verificar atualização
              </button>
              <button
                type="button"
                className="ghost-button settings-action"
                onClick={async () => {
                  setUpdateNote('A abrir o download do APK…')
                  try {
                    await downloadUpdate()
                    setUpdateNote(
                      'Download iniciado. Quando terminar, abre a notificação para instalar.',
                    )
                  } catch {
                    setUpdateNote('Não consegui abrir o download. Tenta de novo daqui a pouco.')
                  }
                }}
              >
                <DownloadIcon size={18} />
                Baixar o APK
              </button>
              <button type="button" className="ghost-button settings-action" onClick={reloadApp}>
                <RefreshIcon size={18} />
                Recarregar conteúdo
              </button>
            </div>
            {updateNote && <p className="settings-note-update">{updateNote}</p>}
          </Section>
        </div>

        <div className="settings-card settings-card-wide">
          <Section title="Privacidade e dados" note={consentLabel}>
            <p className="settings-note">
              Estas opções são opcionais e ficam guardadas neste dispositivo. Analytics partilha
              apenas eventos gerais; retargeting disponibiliza IDs de pixels quando configurados.
              A app não envia pesquisas, nomes de músicas, dados da conta ou localização e ainda
              não tem GTM nem pixels configurados.
            </p>
            <div className="privacy-settings-options">
              <label className="privacy-settings-option">
                <input
                  type="checkbox"
                  checked={consent?.analytics ?? false}
                  onChange={(event) =>
                    setConsentPreferences({
                      analytics: event.target.checked,
                      retargeting: consent?.retargeting ?? false,
                    })
                  }
                />
                <span>
                  <strong>Analytics de utilização</strong>
                  <small>Tipo de página e pedidos de reprodução, sem identificar faixas.</small>
                </span>
              </label>
              <label className="privacy-settings-option">
                <input
                  type="checkbox"
                  checked={consent?.retargeting ?? false}
                  onChange={(event) =>
                    setConsentPreferences({
                      analytics: consent?.analytics ?? false,
                      retargeting: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Retargeting e pixels</strong>
                  <small>Permite usar IDs de publicidade configurados para a app.</small>
                </span>
              </label>
            </div>
          </Section>
        </div>

        <div className="settings-card">
          <Section title="Tocar por link" note="Experimental">
            <p className="settings-note">
              Cola um link do YouTube para ouvir a faixa completa.
            </p>
            <YouTubeLink />
          </Section>
        </div>

        {Capacitor.isNativePlatform() && (
          <div className="settings-card settings-card-wide">
            <Section title="Registo do player" note="Diagnóstico no telemóvel">
              <p className="settings-note">
                O que o motor nativo está a fazer: estado, tempo, duração e erros de cada troca de
                faixa. É apagado ao fechar a app.
              </p>
              <NativeDebugLog />
            </Section>
          </div>
        )}

        <div className="settings-card">
          <Section title="Sobre" note="Informação da app">
            <p className="settings-note">
              A goldenstream é uma demonstração de player. O catálogo usa faixas livres do
              SoundHelix; as pesquisas consultam Audius e YouTube.
            </p>
            <div className="settings-tech-list">
              <span>Versão <strong>{versaoInstalada().nome}</strong></span>
              <span>Áudio <strong>{Capacitor.isPluginAvailable('NativeAudio') ? 'Nativo' : 'Navegador'}</strong></span>
              <span>YouTube <strong>{Capacitor.isPluginAvailable('YouTubeAudio') ? 'Nativo' : 'Indisponível'}</strong></span>
              <span>Atualização <strong>{Capacitor.isPluginAvailable('AppUpdate') ? 'Nativa' : 'Indisponível'}</strong></span>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
