import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  await prisma.setting.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      parishName: 'Pastoral de Coroinhas',
      celebrationDurationMinutes: 90,
      balanceWindowDays: 60,
    },
  })

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME?.trim() || 'Administrador'

  if (!email || !password) {
    console.log('ADMIN_EMAIL ou ADMIN_PASSWORD não definidos. Nenhum administrador foi criado.')
    return
  }

  if (password.length < 10 || !/[A-Za-zÀ-ÿ]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('ADMIN_PASSWORD deve ter ao menos 10 caracteres, com letras e números.')
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log('O administrador inicial já existe. Nenhuma senha foi alterada.')
    return
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12)
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, rounds),
      role: 'ADMIN',
      status: 'ACTIVE',
      permissions: [
        'coroinhas.read',
        'coroinhas.write',
        'scales.read',
        'scales.write',
        'scales.override',
        'attendance.write',
        'raffles.read',
        'raffles.write',
        'fundraising.read',
        'fundraising.write',
        'meetings.read',
        'meetings.write',
        'reports.read',
        'users.manage',
        'settings.manage',
      ],
    },
  })

  console.log(`Administrador criado para ${email}.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
