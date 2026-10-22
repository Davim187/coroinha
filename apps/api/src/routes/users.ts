import { DEFAULT_PERMISSIONS, type UserView } from '@coroinha/contracts'
import { createUserSchema, listQuerySchema, resetPasswordSchema, userBodySchema } from '@coroinha/validators'
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { hashPassword } from '../auth.js'
import { ApiError } from '../errors.js'
import { actor, assertAdmin, audit, paging, parse, presentUser } from '../http.js'

async function keepAdmin(app: FastifyInstance, userId: string, role: string, status: string) {
  const current = await app.prisma.user.findUnique({ where: { id: userId } })
  if (!current || current.role !== 'ADMIN' || current.status !== 'ACTIVE') return
  const remains = role === 'ADMIN' && status === 'ACTIVE'
  if (remains) return
  const others = await app.prisma.user.count({
    where: { role: 'ADMIN', status: 'ACTIVE', id: { not: userId } },
  })
  if (others === 0) {
    throw new ApiError(409, 'LAST_ADMIN', 'Deve permanecer ao menos um administrador ativo.')
  }
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/users', async (request) => {
    const auth = actor(request)
    assertAdmin(auth)
    const query = parse(listQuerySchema, request.query)
    const where: Prisma.UserWhereInput = {}
    if (query.q) where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
    ]
    if (query.status === 'ACTIVE' || query.status === 'INACTIVE') where.status = query.status
    const { page, pageSize, skip } = paging(query)
    const [total, rows] = await Promise.all([
      app.prisma.user.count({ where }),
      app.prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
    ])
    const items: UserView[] = rows.map((user) => ({
      ...presentUser(user),
      createdAt: user.createdAt.toISOString(),
    }))
    return { items, page, pageSize, total }
  })

  app.post('/api/users', async (request) => {
    const auth = actor(request)
    assertAdmin(auth)
    const body = parse(createUserSchema, request.body)
    const email = body.email.toLowerCase()
    const existing = await app.prisma.user.findUnique({ where: { email } })
    if (existing) throw new ApiError(409, 'CONFLICT', 'Já existe um usuário com este e-mail.')
    const permissions = body.role === 'ADMIN' ? DEFAULT_PERMISSIONS.ADMIN : body.permissions ?? DEFAULT_PERMISSIONS[body.role]
    const user = await app.prisma.user.create({
      data: {
        name: body.name.trim(),
        email,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        status: body.status ?? 'ACTIVE',
        permissions,
      },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'user.create',
      entity: 'User',
      entityId: user.id,
      metadata: { role: user.role },
      ip: request.ip,
    })
    return { ...presentUser(user), createdAt: user.createdAt.toISOString() }
  })

  app.patch('/api/users/:id', async (request) => {
    const auth = actor(request)
    assertAdmin(auth)
    const params = request.params as { id: string }
    const body = parse(userBodySchema.omit({ password: true }), request.body)
    const current = await app.prisma.user.findUnique({ where: { id: params.id } })
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Usuário não encontrado.')
    if (current.id === auth.id && body.status === 'INACTIVE') {
      throw new ApiError(409, 'SELF', 'Você não pode desativar a própria conta.')
    }
    await keepAdmin(app, current.id, body.role, body.status ?? current.status)
    const email = body.email.toLowerCase()
    const duplicate = await app.prisma.user.findFirst({ where: { email, id: { not: current.id } } })
    if (duplicate) throw new ApiError(409, 'CONFLICT', 'Já existe um usuário com este e-mail.')
    const permissions = body.role === 'ADMIN' ? DEFAULT_PERMISSIONS.ADMIN : body.permissions ?? DEFAULT_PERMISSIONS[body.role]
    const user = await app.prisma.user.update({
      where: { id: current.id },
      data: {
        name: body.name.trim(),
        email,
        role: body.role,
        status: body.status ?? current.status,
        permissions,
        sessionVersion: body.role !== current.role || (body.status ?? current.status) !== current.status
          ? { increment: 1 }
          : undefined,
      },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'user.update',
      entity: 'User',
      entityId: user.id,
      metadata: { role: user.role, status: user.status },
      ip: request.ip,
    })
    return { ...presentUser(user), createdAt: user.createdAt.toISOString() }
  })

  app.post('/api/users/:id/password', async (request) => {
    const auth = actor(request)
    assertAdmin(auth)
    const params = request.params as { id: string }
    const body = parse(resetPasswordSchema, request.body)
    const current = await app.prisma.user.findUnique({ where: { id: params.id } })
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Usuário não encontrado.')
    await app.prisma.user.update({
      where: { id: current.id },
      data: { passwordHash: await hashPassword(body.password), sessionVersion: { increment: 1 } },
    })
    await app.prisma.session.updateMany({
      where: { userId: current.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await audit(app.prisma, {
      userId: auth.id,
      action: 'user.password',
      entity: 'User',
      entityId: current.id,
      ip: request.ip,
    })
    return { ok: true }
  })
}
