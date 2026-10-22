import { mkdirSync } from 'node:fs'
import path from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

const dataDir = path.resolve('.data/postgres')
mkdirSync(dataDir, { recursive: true })

const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'coroinha',
  password: 'coroinha',
  port: 5433,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
})

try {
  await postgres.initialise()
} catch {
  // O diretório já foi inicializado em uma execução anterior.
}

await postgres.start()

for (const name of ['coroinha', 'coroinha_test']) {
  try {
    await postgres.createDatabase(name)
  } catch {
    // O banco já existe.
  }
}

console.log('PostgreSQL local disponível em postgresql://coroinha:coroinha@127.0.0.1:5433/coroinha')

const stop = async () => {
  await postgres.stop()
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
