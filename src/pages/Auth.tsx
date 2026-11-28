import { useRef, useState, type FormEvent } from 'react'
import { signIn, signUp } from '../lib/account'
import { LogoMark } from '../components/Icons'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Erros = { nome?: string; email?: string; senha?: string }

export function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [busy, setBusy] = useState(false)
  const nomeRef = useRef<HTMLInputElement | null>(null)
  const emailRef = useRef<HTMLInputElement | null>(null)
  const senhaRef = useRef<HTMLInputElement | null>(null)

  /** Mensagens em português junto do campo, em vez do aviso do navegador. */
  const validar = (): Erros => {
    const novos: Erros = {}
    if (mode === 'up' && !name.trim()) novos.nome = 'Diz como queres ser chamado.'
    const emailLimpo = email.trim()
    if (!emailLimpo) novos.email = 'Falta o email.'
    else if (!EMAIL.test(emailLimpo)) novos.email = 'Este email não parece válido.'
    if (!password) novos.senha = 'Falta a palavra-passe.'
    else if (mode === 'up' && password.length < 6) {
      novos.senha = 'A palavra-passe precisa de 6 caracteres, no mínimo.'
    }
    return novos
  }

  const limparErro = (campo: keyof Erros) => {
    setErros((atual) => (atual[campo] ? { ...atual, [campo]: undefined } : atual))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const novos = validar()
    setErros(novos)
    setError('')
    if (novos.nome || novos.email || novos.senha) {
      const primeiro = novos.nome ? nomeRef : novos.email ? emailRef : senhaRef
      primeiro.current?.focus()
      return
    }
    setBusy(true)
    try {
      if (mode === 'up') await signUp({ name: name.trim(), email: email.trim(), password })
      else await signIn({ email: email.trim(), password })
      // A app reabre já com os dados desta conta.
      window.location.reload()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Não consegui entrar. Tenta de novo.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-scene" aria-hidden="true">
        <span className="auth-blob a" />
        <span className="auth-blob b" />
      </div>

      {/* noValidate: os avisos são os nossos, em português e junto do campo. */}
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-brand">
          <LogoMark size={34} />
          <span>goldenstream</span>
        </div>

        <h1 className="auth-title">
          {mode === 'up' ? 'Cria a tua conta' : 'Entra na tua conta'}
        </h1>
        <p className="auth-note">
          {mode === 'up'
            ? 'Assim as tuas músicas, gostos e estatísticas ficam na tua conta — e abrem em qualquer telemóvel.'
            : 'Usa o email e a palavra-passe com que criaste a conta.'}
        </p>

        {mode === 'up' && (
          <label className="auth-field">
            <span>Nome</span>
            <span className="auth-input-wrap">
              <input
                ref={nomeRef}
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  limparErro('nome')
                }}
                placeholder="Como queres ser chamado"
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                maxLength={40}
                aria-invalid={Boolean(erros.nome)}
                aria-describedby={erros.nome ? 'erro-nome' : undefined}
              />
            </span>
            {erros.nome && (
              <small className="auth-field-error" id="erro-nome">
                {erros.nome}
              </small>
            )}
          </label>
        )}

        <label className="auth-field">
          <span>Email</span>
          <span className="auth-input-wrap">
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                limparErro('email')
              }}
              placeholder="tu@exemplo.com"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              aria-invalid={Boolean(erros.email)}
              aria-describedby={erros.email ? 'erro-email' : undefined}
            />
          </span>
          {erros.email && (
            <small className="auth-field-error" id="erro-email">
              {erros.email}
            </small>
          )}
        </label>

        <label className="auth-field">
          <span>Palavra-passe</span>
          <span className="auth-input-wrap has-eye">
            <input
              ref={senhaRef}
              type={mostrarSenha ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                limparErro('senha')
              }}
              placeholder={mode === 'up' ? 'Pelo menos 6 caracteres' : 'A tua palavra-passe'}
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              aria-invalid={Boolean(erros.senha)}
              aria-describedby={erros.senha ? 'erro-senha' : undefined}
            />
            <button
              type="button"
              className="auth-eye"
              onClick={() => setMostrarSenha((atual) => !atual)}
              aria-pressed={mostrarSenha}
              aria-label={mostrarSenha ? 'Esconder a palavra-passe' : 'Mostrar a palavra-passe'}
            >
              {mostrarSenha ? 'Ocultar' : 'Ver'}
            </button>
          </span>
          {erros.senha && (
            <small className="auth-field-error" id="erro-senha">
              {erros.senha}
            </small>
          )}
        </label>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="auth-submit"
          disabled={busy}
          aria-busy={busy}
        >
          {busy
            ? mode === 'up'
              ? 'A criar conta…'
              : 'A entrar…'
            : mode === 'up'
              ? 'Criar conta'
              : 'Entrar'}
        </button>

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(mode === 'up' ? 'in' : 'up')
            setError('')
            setErros({})
            setMostrarSenha(false)
          }}
        >
          {mode === 'up' ? 'Já tenho conta — entrar' : 'Ainda não tenho conta — criar agora'}
        </button>

        <p className="auth-foot">
          A conta fica guardada no servidor da goldenstream. Os dados locais do telemóvel são copiados para ela no primeiro registo.
        </p>
      </form>
    </div>
  )
}
