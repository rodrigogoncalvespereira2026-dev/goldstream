import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI no ambiente (.env).')
  process.exit(1)
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 })

try {
  await client.connect()
  const admin = client.db().admin()
  const status = await admin.serverStatus().catch(() => null)
  console.log('ligacao: ok')
  if (status?.host) console.log('servidor:', status.host)
  const bases = await admin.listDatabases()
  console.log('bases visiveis:', bases.databases.map((item) => item.name).join(', '))

  const colecao = client.db('goldenstream').collection('_teste_ligacao')
  await colecao.insertOne({ em: new Date(), nota: 'teste de ligacao' })
  const total = await colecao.countDocuments({ nota: 'teste de ligacao' })
  await colecao.deleteMany({ nota: 'teste de ligacao' })
  console.log('escrita/leitura: ok (' + total + ' documento(s))')
} catch (falha) {
  console.error('falhou:', falha instanceof Error ? falha.message : falha)
  process.exitCode = 1
} finally {
  await client.close().catch(() => {})
}
