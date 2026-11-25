import { useEffect, useState } from 'react'
import { Section } from '../components/Cards'
import { SettingsIcon } from '../components/Icons'
import { useAccount } from '../lib/account'
import { lerToken } from '../lib/api'
import {
  ADMIN_EMAIL,
  formatBytes,
  isAdmin,
  lerResumoServidor,
  readAdminSnapshot,
  type ResumoServidor,
} from '../lib/admin'
import { plural } from '../lib/format'
import { formatListening } from '../lib/stats'
import type { Navigate } from '../lib/nav'

const dataCurta = (valor: string | null): string => {
  if (!valor) return '—'
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-PT')
}

export function Admin({ navigate }: { navigate: Navigate }) {
  const account = useAccount()
  const permitido = isAdmin(account)
  const [servidor, setServidor] = useState<ResumoServidor | null>(null)
  const [erro, setErro] = useState('')
  const [aCarregar, setACarregar] = useState(true)

  useEffect(() => {
    if (!permitido) {
      setACarregar(false)
      return
    }
    const token = lerToken()
    if (!token) {
      setErro('Sessão inválida. Volta a entrar na conta.')
      setACarregar(false)
      return
    }
    let vivo = true
    lerResumoServidor(token)
      .then((dados) => {
        if (!vivo) return
        setServidor(dados)
        setErro('')
      })
      .catch((falha) => {
        if (!vivo) return
        setErro(
          falha instanceof Error ? falha.message : 'Não consegui ler a base de dados.',
        )
      })
      .finally(() => {
        if (vivo) setACarregar(false)
      })
    return () => {
      vivo = false
    }
  }, [permitido])

  if (!permitido) {
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

  const local = readAdminSnapshot()

  return (
    <div className="settings-page">
      <header className="settings-intro">
        <span className="settings-eyebrow">ADMIN</span>
        <h1 className="page-title">Administração</h1>
        <p>
          Números da goldenstream em todos os telemóveis. Só a conta {ADMIN_EMAIL} vê este painel.
        </p>
      </header>

      {aCarregar && <p className="admin-notice">A ler a base de dados…</p>}

      {erro && !aCarregar && (
        <p className="admin-notice">
          <strong>Sem dados do servidor.</strong> {erro}
        </p>
      )}

      <div className="settings-grid">
        {servidor && (
          <>
            <div className="settings-card settings-card-wide">
              <Section title="Base de dados" note="Todas as contas">
                <div className="stat-grid">
                  <div className="stat-card">
                    <strong>{servidor.totalContas}</strong>
                    <span>
                      {plural(servidor.totalContas, 'conta inscrita', 'contas inscritas')}
                    </span>
                  </div>
                  <div className="stat-card">
                    <strong>{servidor.totalPlaylists}</strong>
                    <span>{plural(servidor.totalPlaylists, 'playlist', 'playlists')}</span>
                  </div>
                  <div className="stat-card">
                    <strong>{servidor.totalMusicas}</strong>
                    <span>{plural(servidor.totalMusicas, 'música', 'músicas')} em playlists</span>
                  </div>
                  <div className="stat-card">
                    <strong>{servidor.totalGostos}</strong>
                    <span>{plural(servidor.totalGostos, 'música curtida', 'músicas curtidas')}</span>
                  </div>
                  <div className="stat-card">
                    <strong>{servidor.totalReproducoes}</strong>
                    <span>{plural(servidor.totalReproducoes, 'reprodução', 'reproduções')}</span>
                  </div>
                  <div className="stat-card">
                    <strong>{formatListening(servidor.totalSegundos)}</strong>
                    <span>tempo ouvido</span>
                  </div>
                </div>
                <p className="settings-note">
                  Os números de cada conta atualizam-se quando essa pessoa usa a app.
                </p>
              </Section>
            </div>

            <div className="settings-card settings-card-wide">
              <Section
                title="Contas"
                note={plural(servidor.totalContas, 'conta registada', 'contas registadas')}
              >
                <div className="admin-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th>Criada</th>
                        <th>Playlists</th>
                        <th>Gostos</th>
                        <th>Reproduções</th>
                        <th>Tempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servidor.contas.map((conta) => (
                        <tr key={conta.id}>
                          <td>
                            {conta.nome}
                            {account && conta.id === account.id && (
                              <span className="admin-badge">sessão atual</span>
                            )}
                          </td>
                          <td>{conta.email}</td>
                          <td>{dataCurta(conta.criadaEm)}</td>
                          <td>{conta.playlists}</td>
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
          </>
        )}

        <div className="settings-card">
          <Section title="Neste aparelho" note="Atividade">
            <div className="stat-grid">
              <div className="stat-card">
                <strong>{local.hojeMinutos}</strong>
                <span>minutos hoje</span>
              </div>
              <div className="stat-card">
                <strong>{local.semanaMinutos}</strong>
                <span>minutos nos últimos 7 dias</span>
              </div>
              <div className="stat-card">
                <strong>{local.sequencia}</strong>
                <span>{plural(local.sequencia, 'dia seguido', 'dias seguidos')}</span>
              </div>
            </div>
            <p className="settings-note">
              Playlists aqui: {local.playlists.total} · gostos: {local.gostos} ·{' '}
              {formatListening(local.estatisticas.seconds)} ouvidos.
            </p>
          </Section>
        </div>

        <div className="settings-card">
          <Section title="Catálogo" note="O que a app tem">
            <div className="settings-tech-list">
              <span>
                Faixas <strong>{local.catalogo.faixas}</strong>
              </span>
              <span>
                Álbuns <strong>{local.catalogo.albums}</strong>
              </span>
              <span>
                Playlists <strong>{local.catalogo.playlists}</strong>
              </span>
              <span>
                Géneros <strong>{local.catalogo.generos}</strong>
              </span>
            </div>
          </Section>
        </div>

        <div className="settings-card settings-card-wide">
          <Section title="Mais ouvidas" note="Top 5 neste aparelho">
            {local.topFaixas.length ? (
              <ol className="top-list">
                {local.topFaixas.map((faixa, index) => (
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
          <Section title="Armazenamento" note={formatBytes(local.armazenamento.total)}>
            <div className="admin-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Chave</th>
                    <th>Tamanho</th>
                  </tr>
                </thead>
                <tbody>
                  {local.armazenamento.chaves.map((item) => (
                    <tr key={item.chave}>
                      <td>{item.chave}</td>
                      <td>{formatBytes(item.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="settings-note">
              Cache local do aparelho; os dados da conta ficam também na base de dados.
            </p>
          </Section>
        </div>

        <div className="settings-card">
          <Section title="App" note="Estado da instalação">
            <div className="settings-tech-list">
              <span>
                Versão <strong>{local.app.versao}</strong>
              </span>
              <span>
                Plataforma <strong>{local.app.plataforma}</strong>
              </span>
              <span>
                Áudio <strong>{local.app.motor}</strong>
              </span>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
