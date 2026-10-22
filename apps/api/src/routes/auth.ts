import { changePasswordSchema, loginSchema } from '@coroinha/validators'
import type { FastifyInstance } from 'fastify'
import {
  assertClientHeader,
  clearRefreshCookie,
  createSession,
  hashPassword,
  hashToken,
  readRefreshCookie,
  setRefreshCookie,
  signAccess,
  verifyPassword,
} from '../auth.js'
import { ApiError } from '../errors.js'
import { actor, audit, parse, presentUser } from '../http.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const body = parse(loginSchema, request.body)
    const email = body.email.toLowerCase()
    const user = await app.prisma.user.findUnique({ where: { email } })
    const valid = user ? await verifyPassword(body.password, user.passwordHash) : false
    if (!user || !valid) {
      throw new ApiError(401, 'UNAUTHORIZED', 'E-mail ou senha incorretos.')
    }
    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'INACTIVE', 'Esta conta está inativa. Procure um administrador.')
    }
    const token = await createSession(app, request, user.id)
    setRefreshCookie(reply, token)
    await audit(app.prisma, {
      userId: user.id,
      action: 'auth.login',
      entity: 'User',
      entityId: user.id,
      ip: request.ip,
    })
    return { accessToken: signAccess(app, user), user: presentUser(user) }
  })

  app.post('/api/auth/refresh', async (request, reply) => {
    assertClientHeader(request)
    const token = readRefreshCookie(request)
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre novamente.')
    const session = await app.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
      clearRefreshCookie(reply)
      throw new ApiError(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre novamente.')
    }
    await app.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
    const next = await createSession(app, request, session.userId)
    setRefreshCookie(reply, next)
    return { accessToken: signAccess(app, session.user), user: presentUser(session.user) }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    assertClientHeader(request)
    const token = readRefreshCookie(request)
    if (token) {
      await app.prisma.session.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    clearRefreshCookie(reply)
    return { ok: true }
  })

  app.get('/api/auth/me', async (request) => {
    return { user: actor(request) }
  })

  app.post('/api/auth/password', async (request) => {
    const auth = actor(request)
    const body = parse(changePasswordSchema, request.body)
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: auth.id } })
    const valid = await verifyPassword(body.currentPassword, user.passwordHash)
    if (!valid) throw new ApiError(422, 'VALIDATION', 'A senha atual está incorreta.')
    const updated = await app.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(body.newPassword),
        sessionVersion: { increment: 1 },
      },
    })
    await app.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await audit(app.prisma, {
      userId: user.id,
      action: 'auth.password',
      entity: 'User',
      entityId: user.id,
      ip: request.ip,
    })
    return { accessToken: signAccess(app, updated), user: presentUser(updated) }
  })
}
