import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { env } from './config.js'
import { ApiError } from './errors.js'
import { presentUser } from './http.js'

const COOKIE = 'coroinha_rt'
const WEEK_SECONDS = 7 * 24 * 60 * 60

export function hashPassword(password: string) {
  return bcrypt.hash(password, env.bcryptRounds)
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

export function newRefreshToken() {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function signAccess(app: FastifyInstance, user: { id: string; sessionVersion: number }) {
  return app.jwt.sign({ sub: user.id, sv: user.sessionVersion })
}

export function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/api/auth',
    maxAge: WEEK_SECONDS,
    signed: true,
  })
}

export function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(COOKIE, { path: '/api/auth' })
}

export function readRefreshCookie(request: FastifyRequest) {
  const raw = request.cookies[COOKIE]
  if (!raw) return null
  const unsigned = request.unsignCookie(raw)
  return unsigned.valid ? unsigned.value : null
}

export async function createSession(app: FastifyInstance, request: FastifyRequest, userId: string) {
  const token = newRefreshToken()
  const userAgent = request.headers['user-agent']
  await app.prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + WEEK_SECONDS * 1000),
      userAgent: userAgent?.slice(0, 300),
      ip: request.ip,
    },
  })
  return token
}

export async function authenticate(app: FastifyInstance, request: FastifyRequest) {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre novamente.')
  }
  let payload: { sub: string; sv: number }
  try {
    payload = await request.jwtVerify()
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre novamente.')
  }
  const user = await app.prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user || user.status !== 'ACTIVE' || user.sessionVersion !== payload.sv) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre novamente.')
  }
  request.auth = presentUser(user)
}

export function assertClientHeader(request: FastifyRequest) {
  if (request.headers['x-coroinha-client'] !== 'web') {
    throw new ApiError(403, 'FORBIDDEN', 'Requisição recusada.')
  }
}
