import { DEFAULT_PERMISSIONS } from '@coroinha/contracts'
import { passwordSchema } from '@coroinha/validators'
import type { PrismaClient } from '@prisma/client'
import { hashPassword } from './auth.js'
import { env } from './config.js'

export async function ensureSettings(prisma: PrismaClient) {
  await prisma.setting.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  })
}

export async function ensureAdmin(prisma: PrismaClient, mode: 'bootstrap' | 'seed') {
  if (!env.adminEmail || !env.adminPassword) {
    console.log('ADMIN_EMAIL ou ADMIN_PASSWORD não definidos. Nenhum administrador foi criado.')
    return
  }
  if (!passwordSchema.safeParse(env.adminPassword).success) {
    throw new Error('ADMIN_PASSWORD deve ter ao menos 10 caracteres, com letras e números.')
  }
  const existing = await prisma.user.findUnique({ where: { email: env.adminEmail } })
  if (existing) {
    console.log('O administrador inicial já existe. Nenhuma senha foi alterada.')
    return
  }
  if (mode === 'bootstrap' && (await prisma.user.count()) > 0) return

  await prisma.user.create({
    data: {
      name: env.adminName,
      email: env.adminEmail,
      passwordHash: await hashPassword(env.adminPassword),
      role: 'ADMIN',
      status: 'ACTIVE',
      permissions: DEFAULT_PERMISSIONS.ADMIN,
    },
  })
  console.log(`Administrador criado para ${env.adminEmail}.`)
}
