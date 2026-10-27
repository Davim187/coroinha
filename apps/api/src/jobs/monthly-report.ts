import type { PrismaClient } from '@prisma/client'
import { env } from '../config.js'
import {
  buildMonthlyAttendanceReport,
  monthlyReportHtml,
  monthlyReportPlainText,
  previousMonth,
} from '../services/attendance-report.js'
import { mailConfigured, sendMail } from '../services/mail.js'
import { renderMonthlyAttendancePdf } from '../services/report-pdf.js'

export async function sendMonthlyAttendanceReport(prisma: PrismaClient, month: string) {
  if (!mailConfigured()) {
    return { ok: false as const, reason: 'smtp-missing' as const, month }
  }
  const settings = await prisma.setting.findUniqueOrThrow({ where: { id: 'default' } })
  const report = await buildMonthlyAttendanceReport(prisma, month)
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { email: true, name: true },
    orderBy: { name: 'asc' },
  })
  if (users.length === 0) {
    return { ok: false as const, reason: 'no-users' as const, month }
  }
  const pdf = await renderMonthlyAttendancePdf(settings.parishName, report)
  await sendMail({
    to: users.map((user) => user.email),
    subject: `${settings.parishName} — relatório de presença ${report.label}`,
    text: monthlyReportPlainText(report, settings.parishName),
    html: monthlyReportHtml(report, settings.parishName),
    attachments: [{ filename: `presencas-${month}.pdf`, content: pdf, contentType: 'application/pdf' }],
  })
  await prisma.setting.update({
    where: { id: 'default' },
    data: { lastAttendanceReportMonth: month },
  })
  return { ok: true as const, month, recipients: users.length }
}

export function startMonthlyReportJob(prisma: PrismaClient, log?: { info: (msg: string) => void; error: (err: unknown) => void }) {
  if (env.nodeEnv === 'test') return () => undefined
  const tick = async () => {
    try {
      if (!mailConfigured()) return
      const today = new Date()
      if (today.getUTCDate() < Math.max(1, Math.min(28, env.monthlyReportDay))) return
      const month = previousMonth(today)
      const settings = await prisma.setting.findUnique({ where: { id: 'default' } })
      if (!settings || settings.lastAttendanceReportMonth === month) return
      const result = await sendMonthlyAttendanceReport(prisma, month)
      if (result.ok) log?.info(`Relatório mensal ${month} enviado para ${result.recipients} usuários.`)
    } catch (error) {
      log?.error(error)
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), 30 * 60 * 1000)
  return () => clearInterval(timer)
}
