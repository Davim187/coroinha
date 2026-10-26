import { existsSync } from 'node:fs'
import path from 'node:path'

function loadEnv() {
  const starts = [process.cwd(), path.resolve(process.cwd(), '../..')]
  for (const start of starts) {
    let dir = start
    for (let depth = 0; depth < 5; depth += 1) {
      const candidate = path.join(dir, '.env')
      if (existsSync(candidate)) {
        process.loadEnvFile(candidate)
        return
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
}

loadEnv()

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente obrigatória: ${name}`)
  return value
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  host: process.env.API_HOST ?? '0.0.0.0',
  port: Number(process.env.API_PORT ?? 3333),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  adminName: process.env.ADMIN_NAME?.trim() || 'Administrador',
  adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  webDist: process.env.WEB_DIST?.trim() || '',
}

if (env.jwtAccessSecret.length < 16 || env.jwtRefreshSecret.length < 16) {
  throw new Error('Os segredos JWT precisam ter pelo menos 16 caracteres.')
}
