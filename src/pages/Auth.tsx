import { useState, type FormEvent } from 'react'
import { signIn, signUp } from '../lib/account'
import { LogoMark } from '../components/Icons'

export function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'up') await signUp({ name, email, password })
      else await signIn({ email, password })
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

      <form className="auth-card" onSubmit={submit}>
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
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Como queres ser chamado"
              autoComplete="name"
              maxLength={40}
              required
            />
          </label>
        )}

        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@exemplo.com"
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>

        <label className="auth-field">
          <span>Palavra-passe</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'up' ? 'Pelo menos 6 caracteres' : 'A tua palavra-passe'}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
        </label>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? 'A entrar…' : mode === 'up' ? 'Criar conta' : 'Entrar'}
        </button>

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(mode === 'up' ? 'in' : 'up')
            setError('')
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
