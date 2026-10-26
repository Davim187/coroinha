import { PrismaClient } from '@prisma/client'
import { beforeEach } from 'vitest'

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Attendance",
      "ScaleAssignment",
      "ScaleRoleSetting",
      "Scale",
      "Celebration",
      "RaffleBlockEvent",
      "RaffleBlock",
      "RaffleBatch",
      "RaffleCampaign",
      "FinancialRevision",
      "FinancialTransaction",
      "FundraisingParticipant",
      "FundraisingCampaign",
      "MeetingParticipant",
      "Meeting",
      "AuditLog",
      "Session",
      "Coroinha",
      "User",
      "Setting"
    RESTART IDENTITY CASCADE
  `)
  await prisma.setting.create({ data: { id: 'default' } })
})
