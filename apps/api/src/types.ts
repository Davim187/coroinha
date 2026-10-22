import type { Permission, UserRole, AccountStatus } from '@coroinha/contracts'
import type { PrismaClient } from '@prisma/client'

export type AuthContext = {
  id: string
  name: string
  email: string
  role: UserRole
  status: AccountStatus
  permissions: Permission[]
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
  interface FastifyRequest {
    auth?: AuthContext
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; sv: number }
    user: { sub: string; sv: number }
  }
}
