import { buildApp } from './app'
import { ensureAdmin, ensureSettings } from './bootstrap.js'
import { env } from './config.js'

const app = await buildApp()
await ensureSettings(app.prisma)
await ensureAdmin(app.prisma, 'bootstrap')
await app.listen({ host: env.host, port: env.port })
