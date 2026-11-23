// A versão mora num sítio só: android/app/build.gradle. Este script lê-a e escreve
//   - public/versao.json  -> o que o site publica em /versao.json (versão + novidades)
//   - src/lib/versaoApp.ts -> a versão FIXADA no bundle; é a de quem está instalado
// Corre antes do build (`npm run versao`), por isso os dois nunca divergem.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function lerVersao() {
  const gradle = readFileSync(resolve(raiz, 'android/app/build.gradle'), 'utf8')
  return {
    nome: gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? '0.0',
    codigo: Number(gradle.match(/versionCode\s+(\d+)/)?.[1]) || 0,
  }
}

// Máximo de cinco linhas por versão; só texto. Sem entrada (ou sem ficheiro) fica vazio.
function novidadesDe(codigo) {
  try {
    const lista = JSON.parse(readFileSync(resolve(raiz, 'scripts/novidades.json'), 'utf8'))
    const itens = lista?.[String(codigo)]
    if (!Array.isArray(itens)) return []
    return itens
      .filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim())
      .slice(0, 5)
  } catch {
    return []
  }
}

function escrever() {
  const { nome, codigo } = lerVersao()
  const novidades = novidadesDe(codigo)

  mkdirSync(resolve(raiz, 'public'), { recursive: true })
  writeFileSync(
    resolve(raiz, 'public/versao.json'),
    `${JSON.stringify({ versao: nome, codigo, novidades }, null, 2)}\n`,
  )

  writeFileSync(
    resolve(raiz, 'src/lib/versaoApp.ts'),
    [
      '// Gerado por scripts/versao.mjs a partir de android/app/build.gradle.',
      '// Não editar à mão: corre `npm run versao`.',
      `export const VERSAO_APP = { nome: '${nome}', codigo: ${codigo} } as const`,
      '',
    ].join('\n'),
  )

  return { versao: nome, codigo, novidades }
}

// Escreve só quando é executado (`node scripts/versao.mjs`), nunca ao ser importado.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { versao, codigo, novidades } = escrever()
  console.log(`versao.json → ${versao} (código ${codigo}) · ${novidades.length} novidade(s)`)
}
