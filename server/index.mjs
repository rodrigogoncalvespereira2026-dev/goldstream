import { createServer } from 'node:http'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { MongoClient } from 'mongodb'

const URI = process.env.MONGODB_URI
if (!URI) {
  console.error('Falta MONGODB_URI nas variáveis de ambiente.')
  process.exit(1)
}

const PORTA = Number(process.env.PORT) || 8787
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'rgp200903@gmail.com').trim().toLowerCase()
const DIAS_SESSAO = 365
/** Renova a sessão quando faltam menos dias do que isto. */
const RENOVAR_ANTES_MS = 30 * 24 * 60 * 60 * 1000
const LIMITE_CORPO = 2 * 1024 * 1024
const ORIGENS = (
  process.env.ORIGENS ||
  'https://goldstream-uzxb.onrender.com,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174'
)
  .split(',')
  .map((item) => item.trim().replace(/\/+$/, ''))
  .filter(Boolean)

const cliente = new MongoClient(URI, { serverSelectionTimeoutMS: 15000 })
await cliente.connect()
const db = cliente.db('goldenstream')
const contas = db.collection('contas')
const sessoes = db.collection('sessoes')

await Promise.all([
  contas.createIndex({ email: 1 }, { unique: true }),
  sessoes.createIndex({ token: 1 }, { unique: true }),
  sessoes.createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 }),
])
console.log('MongoDB ligado')

class Erro extends Error {
  constructor(estado, mensagem) {
    super(mensagem)
    this.estado = estado
  }
}

const responder = (res, estado, corpo) => {
  const texto = JSON.stringify(corpo)
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Cache-Control': 'no-store',
  })
  res.end(texto)
}

const lerCorpo = (req) =>
  new Promise((resolve, reject) => {
    let total = 0
    const partes = []
    req.on('data', (parte) => {
      total += parte.length
      if (total > LIMITE_CORPO) {
        reject(new Erro(413, 'Pedido demasiado grande.'))
        req.destroy()
        return
      }
      partes.push(parte)
    })
    req.on('end', () => {
      if (!partes.length) return resolve({})
      try {
        const valor = JSON.parse(Buffer.concat(partes).toString('utf8'))
        resolve(valor && typeof valor === 'object' ? valor : {})
      } catch {
        reject(new Erro(400, 'Pedido inválido.'))
      }
    })
    req.on('error', () => reject(new Erro(400, 'Pedido inválido.')))
  })

const salNova = () => randomBytes(16).toString('hex')

const hashSenha = (senha, sal) => scryptSync(senha, sal, 64).toString('hex')

const senhaConfere = (senha, sal, hash) => {
  const calculado = Buffer.from(hashSenha(senha, sal), 'hex')
  const guardado = Buffer.from(String(hash), 'hex')
  return calculado.length === guardado.length && timingSafeEqual(calculado, guardado)
}

const validarEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const abrirSessao = async (contaId) => {
  const token = randomBytes(32).toString('hex')
  const expiraEm = new Date(Date.now() + DIAS_SESSAO * 24 * 60 * 60 * 1000)
  await sessoes.insertOne({ token, contaId, criadaEm: new Date(), expiraEm })
  return token
}

const contaAutenticada = async (req) => {
  const cabecalho = String(req.headers.authorization || '')
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : ''
  if (!token) return null
  const sessao = await sessoes.findOne({ token })
  if (!sessao) return null
  if (sessao.expiraEm instanceof Date && sessao.expiraEm.getTime() < Date.now()) {
    await sessoes.deleteOne({ token })
    return null
  }
  // Sessão que está a ser usada não expira: cada pedido empurra a validade.
  if (
    sessao.expiraEm instanceof Date &&
    sessao.expiraEm.getTime() - Date.now() < RENOVAR_ANTES_MS
  ) {
    const expiraEm = new Date(Date.now() + DIAS_SESSAO * 24 * 60 * 60 * 1000)
    await sessoes.updateOne({ _id: sessao._id }, { $set: { expiraEm } })
  }
  const conta = await contas.findOne({ _id: sessao.contaId })
  if (!conta) {
    await sessoes.deleteOne({ token })
    return null
  }
  return { conta, token }
}

const paraPublico = (conta) => ({
  id: String(conta._id),
  nome: conta.nome,
  email: conta.email,
})

const lerJSON = (texto) => {
  if (typeof texto !== 'string') return null
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

const resumirDados = (dados) => {
  const playlists = lerJSON(dados?.['sonora:mine'] ?? null)
  const gostos = lerJSON(dados?.['sonora:liked'] ?? null)
  const stats = lerJSON(dados?.['sonora:stats'] ?? null)
  const listaPlaylists = Array.isArray(playlists) ? playlists : []
  return {
    playlists: listaPlaylists.length,
    musicas: listaPlaylists.reduce(
      (soma, item) => soma + (Array.isArray(item?.trackIds) ? item.trackIds.length : 0),
      0,
    ),
    gostos: Array.isArray(gostos) ? gostos.length : 0,
    reproducoes: Number(stats?.plays) || 0,
    segundos: Number(stats?.seconds) || 0,
  }
}

const normalizarDados = (valor) => {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const saida = {}
  Object.entries(valor).forEach(([chave, item]) => {
    if (!chave.startsWith('sonora:') || chave === 'sonora:token' || chave === 'sonora:conta') return
    if (typeof item === 'string') saida[chave] = item.slice(0, 200000)
    else if (item === null) saida[chave] = null
  })
  return saida
}

const servidor = createServer(async (req, res) => {
  const origem = String(req.headers.origin || '')
  if (origem && ORIGENS.includes(origem.replace(/\/+$/, ''))) {
    res.setHeader('Access-Control-Allow-Origin', origem)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '86400')
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', 'http://localhost')
  const rota = url.pathname.replace(/\/+$/, '') || '/'

  try {
    if (req.method === 'GET' && rota === '/api/saude') {
      const total = await contas.countDocuments()
      responder(res, 200, { ok: true, contas: total })
      return
    }

    if (req.method === 'POST' && rota === '/api/auth/registar') {
      const corpo = await lerCorpo(req)
      const nome = String(corpo.nome || '').trim().slice(0, 40)
      const email = String(corpo.email || '').trim().toLowerCase()
      const senha = String(corpo.senha || '')

      if (nome.length < 2) throw new Erro(400, 'Escreve o teu nome.')
      if (!validarEmail(email)) throw new Erro(400, 'Esse email não parece válido.')
      if (senha.length < 6) throw new Erro(400, 'A palavra-passe precisa de 6 caracteres ou mais.')

      const sal = salNova()
      const documento = {
        nome,
        email,
        sal,
        senhaHash: hashSenha(senha, sal),
        dados: normalizarDados(corpo.dados),
        criadaEm: new Date(),
        atualizadoEm: new Date(),
      }

      let inserida
      try {
        inserida = await contas.insertOne(documento)
      } catch (falha) {
        if (falha && falha.code === 11000) {
          throw new Erro(409, 'Já existe uma conta com este email. Entra nela.')
        }
        throw falha
      }

      const token = await abrirSessao(inserida.insertedId)
      responder(res, 201, {
        token,
        conta: { id: String(inserida.insertedId), nome, email },
      })
      return
    }

    if (req.method === 'POST' && rota === '/api/auth/entrar') {
      const corpo = await lerCorpo(req)
      const email = String(corpo.email || '').trim().toLowerCase()
      const senha = String(corpo.senha || '')
      const conta = await contas.findOne({ email })
      if (!conta || !senhaConfere(senha, conta.sal, conta.senhaHash)) {
        throw new Erro(401, 'Email ou palavra-passe errados.')
      }
      await contas.updateOne({ _id: conta._id }, { $set: { atualizadoEm: new Date() } })
      const token = await abrirSessao(conta._id)
      responder(res, 200, {
        token,
        conta: paraPublico(conta),
        dados: conta.dados && typeof conta.dados === 'object' ? conta.dados : {},
      })
      return
    }

    if (req.method === 'GET' && rota === '/api/auth/eu') {
      const autenticada = await contaAutenticada(req)
      if (!autenticada) throw new Erro(401, 'Sessão inválida.')
      responder(res, 200, {
        conta: paraPublico(autenticada.conta),
        dados: autenticada.conta.dados && typeof autenticada.conta.dados === 'object'
          ? autenticada.conta.dados
          : {},
      })
      return
    }

    if (req.method === 'POST' && rota === '/api/auth/sair') {
      const cabecalho = String(req.headers.authorization || '')
      const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : ''
      if (token) await sessoes.deleteOne({ token })
      responder(res, 200, { ok: true })
      return
    }

    if (req.method === 'PUT' && rota === '/api/dados') {
      const autenticada = await contaAutenticada(req)
      if (!autenticada) throw new Erro(401, 'Sessão inválida.')
      const corpo = await lerCorpo(req)
      const dados = normalizarDados(corpo.dados)
      await contas.updateOne(
        { _id: autenticada.conta._id },
        { $set: { dados, atualizadoEm: new Date() } },
      )
      responder(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && rota === '/api/admin/resumo') {
      const autenticada = await contaAutenticada(req)
      if (!autenticada) throw new Erro(401, 'Sessão inválida.')
      if (autenticada.conta.email !== ADMIN_EMAIL) throw new Erro(403, 'Sem permissão.')

      const lista = await contas
        .find({}, { projection: { nome: 1, email: 1, criadaEm: 1, dados: 1 } })
        .sort({ criadaEm: -1 })
        .toArray()

      let totalPlaylists = 0
      let totalMusicas = 0
      let totalGostos = 0
      let totalReproducoes = 0
      let totalSegundos = 0

      const contasPublicas = lista.map((item) => {
        const resumo = resumirDados(item.dados)
        totalPlaylists += resumo.playlists
        totalMusicas += resumo.musicas
        totalGostos += resumo.gostos
        totalReproducoes += resumo.reproducoes
        totalSegundos += resumo.segundos
        return {
          id: String(item._id),
          nome: item.nome,
          email: item.email,
          criadaEm: item.criadaEm instanceof Date ? item.criadaEm.toISOString() : null,
          ...resumo,
        }
      })

      responder(res, 200, {
        totalContas: lista.length,
        totalPlaylists,
        totalMusicas,
        totalGostos,
        totalReproducoes,
        totalSegundos,
        contas: contasPublicas,
      })
      return
    }

    throw new Erro(404, 'Rota não encontrada.')
  } catch (falha) {
    if (falha instanceof Erro) {
      responder(res, falha.estado, { erro: falha.message })
      return
    }
    console.error('erro inesperado:', falha)
    responder(res, 500, { erro: 'Erro no servidor. Tenta mais tarde.' })
  }
})

servidor.listen(PORTA, '0.0.0.0', () => {
  console.log(`API a ouvir na porta ${PORTA}`)
})

const fechar = async () => {
  servidor.close()
  await cliente.close().catch(() => {})
  process.exit(0)
}

process.on('SIGTERM', fechar)
process.on('SIGINT', fechar)
