import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { Prisma } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import Fastify from 'fastify'
import { authenticate } from './auth.js'
import { env } from './config.js'
import { ApiError } from './errors.js'
import { authRoutes } from './routes/auth.js'
import { coroinhaRoutes } from './routes/coroinhas.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { fundraisingRoutes } from './routes/fundraising.js'
import { meetingRoutes } from './routes/meetings.js'
import { raffleRoutes } from './routes/raffles.js'
import { reportRoutes } from './routes/reports.js'
import { scaleRoutes } from './routes/scales.js'
import { userRoutes } from './routes/users.js'
import './types.js'

export async function buildApp(options?: { logger?: boolean }) {
  const prisma = new PrismaClient()
  const app = Fastify({
    logger: options?.logger ?? env.nodeEnv !== 'test',
    trustProxy: true,
  })
  app.decorate('prisma', prisma)
  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, { origin: env.webOrigin, credentials: true })
  await app.register(cookie, { secret: env.jwtRefreshSecret })
  await app.register(jwt, { secret: env.jwtAccessSecret, sign: { expiresIn: '15m' } })
  if (env.nodeEnv !== 'test') {
    await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' })
  }

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.', details: null } })
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details ?? null },
      })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: 'Já existe um registro com estes dados.', details: null },
      })
    }
    const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
    const message = error instanceof Error ? error.message : 'Requisição inválida.'
    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        error: { code: 'REQUEST', message, details: null },
      })
    }
    request.log.error(error)
    return reply.status(500).send({
      error: { code: 'INTERNAL', message: 'Ocorreu um erro interno. Tente novamente.', details: null },
    })
  })

  app.addHook('onRequest', async (request) => {
    const url = request.url.split('?')[0] ?? request.url
    const isPublic =
      (request.method === 'GET' && url === '/api/health') ||
      (request.method === 'POST' &&
        (url === '/api/auth/login' || url === '/api/auth/refresh' || url === '/api/auth/logout'))
    if (!isPublic) await authenticate(app, request)
  })

  app.get('/api/health', async () => ({ ok: true }))
  await authRoutes(app)
  await userRoutes(app)
  await coroinhaRoutes(app)
  await scaleRoutes(app)
  await raffleRoutes(app)
  await fundraisingRoutes(app)
  await meetingRoutes(app)
  await dashboardRoutes(app)
  await reportRoutes(app)
  return app
}
