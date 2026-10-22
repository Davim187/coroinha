import { effectivePermissions, hasPermission, type AuthUser, type Permission } from '@coroinha/contracts'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ZodType } from 'zod'
import { ApiError } from './errors.js'
import type { AuthContext } from './types.js'

export function paging(query: { page?: number; pageSize?: number }) {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  return { page, pageSize, skip: (page - 1) * pageSize }
}

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ApiError(422, 'VALIDATION', 'Verifique os campos informados.', result.error.flatten())
  }
  return result.data
}

export function actor(request: FastifyRequest) {
  if (!request.auth) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre novamente.')
  }
  return request.auth
}

export function assertCan(auth: AuthContext, permission: Permission) {
  if (!hasPermission(auth.role, auth.permissions, permission)) {
    throw new ApiError(403, 'FORBIDDEN', 'Você não tem permissão para esta ação.')
  }
}

export function assertAdmin(auth: AuthContext) {
  if (auth.role !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Apenas um administrador pode realizar esta ação.')
  }
}

export function presentUser(user: {
  id: string
  name: string
  email: string
  role: AuthUser['role']
  status: AuthUser['status']
  permissions: string[]
}): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    permissions: effectivePermissions(user.role, user.permissions),
  }
}

export function csv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (value: string | number | null | undefined) =>
    `"${String(value ?? '').replaceAll('"', '""')}"`
  const lines = [headers, ...rows].map((row) => row.map(escape).join(';'))
  return `\uFEFF${lines.join('\n')}`
}

export function sendCsv(reply: FastifyReply, filename: string, content: string) {
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .send(content)
}

export function sendPdf(reply: FastifyReply, filename: string, content: Buffer) {
  return reply
    .header('content-type', 'application/pdf')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .send(content)
}

export async function audit(
  prisma: PrismaClient,
  entry: {
    userId?: string | null
    action: string
    entity: string
    entityId?: string | null
    metadata?: Prisma.InputJsonValue
    ip?: string | null
  },
) {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
      ip: entry.ip ?? null,
    },
  })
}
