import { Section } from '../components/Cards'
import { SettingsIcon } from '../components/Icons'
import { useAccount } from '../lib/account'
import { ADMIN_EMAIL, formatBytes, isAdmin, readAdminSnapshot } from '../lib/admin'
import { plural } from '../lib/format'
import { formatListening } from '../lib/stats'
import type { Navigate } from '../lib/nav'

const dataCurta = (value: number): string =>
  value ? new Date(value).toLocaleDateString('pt-PT') : '—'

export function Admin({ navigate }: { navigate: Navigate }) {
  const account = useAccount()

  if (!isAdmin(account)) {
    return (
      <div className="settings-page">
        <header className="settings-intro">
          <span className="settings-eyebrow">RESTRITO</span>
          <h1 className="page-title">Administração</h1>
          <p>Este painel está reservado à conta {ADMIN_EMAIL}.</p>
        </header>
        <div className="settings-grid">
          <div className="settings-card">
            <Section title="Sem acesso" note="Conta sem permissão">
              <p className="settings-note">
                Entra com a conta de administrador para ver os números da app.
              </p>
              <div className="settings-actions">
                <button
                  type="button"
                  className="ghost-button settings-action"
                  onClick={() => navigate({ type: 'settings' })}
                >
                  <SettingsIcon size={18} />
                  Voltar às definições
                </button>
              </div>
            </Section>
          </div>
        </div>
      </div>
    )
  }

  const dados = readAdminSnapshot(account)
  const media = dados.totalContas
    ? Math.round(dados.estatisticas.seconds / dados.totalContas)
    : 0

  return (
    <div className="settings-page">
      <header className="settings-intro">
        <span className="settings-eyebrow">ADMIN</span>
        <h1 className="page-title">Administração</h1>
        <p>
          Números da goldenstream neste aparelho. Só a conta {ADMIN_EMAIL} vê este painel.
        </p>
      </header>

      <p className="admin-notice">
        As contas são criadas e guardadas dentro de cada telemóvel — não há servidor. Por isso
        “contas inscritas” são as que existem <strong>neste aparelho</strong>. Para contar as
        pessoas de todos os telemóveis é preciso guardar as contas num servidor.
      </p>

      <div className="settings-grid">
        <div className="settings-card settings-card-wide">
          <Section title="Resumo" note="Neste aparelho">
            <div className="stat-grid">
              <div className="stat-card">
                <strong>{dados.totalContas}</strong>
                <span>{plural(dados.totalContas, 'conta inscrita', 'contas inscritas')}</span>
              </div>
              <div className="stat-card">
                <strong>{dados.playlists.total}</strong>
                <span>{plural(dados.playlists.total, 'playlist', 'playlists')}</span>
              </div>
              <div className="stat-card">
                <strong>{dados.playlists.musicas}</strong>
                <span>{plural(dados.playlists.musicas, 'música', 'músicas')} em playlists</span>
              </div>
              <div className="stat-card">
                <strong>{dados.gostos}</strong>
                <span>{plural(dados.gostos, 'música curtida', 'músicas curtidas')}</span>
              </div>
              <div className="stat-card">
                <strong>{dados.estatisticas.plays}</strong>
                <span>{plural(dados.estatisticas.plays, 'reprodução', 'reproduções')}</span>
              </div>
              <div className="stat-card">
                <strong>{formatListening(dados.estatisticas.seconds)}</strong>
                <span>tempo ouvido</span>
              </div>
            </div>
            {dados.playlists.maior && (
              <p className="settings-note">
                Maior playlist: <strong>{dados.playlists.maior}</strong> com{' '}
                {plural(dados.playlists.maiorMusicas, 'música', 'músicas')}. Média de{' '}
                {formatListening(media)} ouvidos por conta.
              </p>
            )}
          </Section>
        </div>

        <div className="settings-card settings-card-wide">
          <Section
            title="Contas"
            note={plural(dados.totalContas, 'conta registada', 'contas registadas')}
          >
            <div className="admin-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Criada</th>
                    <th>Gostos</th>
                    <th>Reproduções</th>
                    <th>Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.contas.map((conta) => (
                    <tr key={conta.id}>
                      <td>
                        {conta.name}
                        {conta.atual && <span className="admin-badge">sessão atual</span>}
                      </td>
                      <td>{conta.email}</td>
                      <td>{dataCurta(conta.criadaEm)}</td>
                      <td>{conta.gostos}</td>
                      <td>{conta.reproducoes}</td>
                      <td>{formatListening(conta.segundos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="settings-card">
          <Section title="Atividade" note="Ritmo de audição">
            <div className="stat-grid">
              <div className="stat-card">
                <strong>{dados.hojeMinutos}</strong>
                <span>minutos hoje</span>
              </div>
              <div className="stat-card">
                <strong>{dados.semanaMinutos}</strong>
                <span>minutos nos últimos 7 dias</span>
              </div>
              <div className="stat-card">
                <strong>{dados.sequencia}</strong>
                <span>{plural(dados.sequencia, 'dia seguido', 'dias seguidos')}</span>
              </div>
            </div>
            <p className="settings-note">
              O dia conta a partir do primeiro minuto ouvido nesse dia.
            </p>
          </Section>
        </div>

        <div className="settings-card">
          <Section title="Catálogo" note="O que a app tem">
            <div className="settings-tech-list">
              <span>
                Faixas <strong>{dados.catalogo.faixas}</strong>
              </span>
              <span>
                Álbuns <strong>{dados.catalogo.albums}</strong>
              </span>
              <span>
                Playlists <strong>{dados.catalogo.playlists}</strong>
              </span>
              <span>
                Géneros <strong>{dados.catalogo.generos}</strong>
              </span>
            </div>
          </Section>
        </div>

        <div className="settings-card settings-card-wide">
          <Section title="Mais ouvidas" note="Top 5 neste aparelho">
            {dados.topFaixas.length ? (
              <ol className="top-list">
                {dados.topFaixas.map((faixa, index) => (
                  <li key={faixa.id} className="top-row">
                    <span className="top-rank">{index + 1}</span>
                    <span className="top-text">
                      <strong>{faixa.titulo}</strong>
                      <span>{faixa.artista}</span>
                    </span>
                    <span className="top-meta">
                      {plural(faixa.reproducoes, 'reprodução', 'reproduções')}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="settings-note">Ainda não há reproduções contadas.</p>
            )}
          </Section>
        </div>

        <div className="settings-card">
          <Section title="Armazenamento" note={formatBytes(dados.armazenamento.total)}>
            <div className="admin-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Chave</th>
                    <th>Tamanho</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.armazenamento.chaves.map((item) => (
                    <tr key={item.chave}>
                      <td>{item.chave}</td>
                      <td>{formatBytes(item.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="settings-note">
              Tudo o que a app guarda fica no armazenamento local do aparelho.
            </p>
          </Section>
        </div>

        <div className="settings-card">
          <Section title="App" note="Estado da instalação">
            <div className="settings-tech-list">
              <span>
                Versão <strong>{dados.app.versao}</strong>
              </span>
              <span>
                Plataforma <strong>{dados.app.plataforma}</strong>
              </span>
              <span>
                Áudio <strong>{dados.app.motor}</strong>
              </span>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
