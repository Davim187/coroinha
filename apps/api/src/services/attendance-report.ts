import { ATTENDANCE_LABELS, ROLE_LABELS, SCALE_STATUS_LABELS } from '@coroinha/contracts'
import type { PrismaClient } from '@prisma/client'
import { asDate, dateOnly } from '../domain.js'

export type MonthlyAttendanceReport = {
  month: string
  label: string
  generatedAt: string
  summary: {
    celebrations: number
    publishedOrCompleted: number
    withAttendance: number
    withoutAttendance: number
    assignments: number
    present: number
    absent: number
    late: number
    justified: number
    unrecorded: number
  }
  mostServed: { coroinhaId: string; name: string; assignments: number; present: number }[]
  leastServed: { coroinhaId: string; name: string; assignments: number; present: number }[]
  mostAbsent: { coroinhaId: string; name: string; absent: number; justified: number; assignments: number }[]
  people: {
    coroinhaId: string
    name: string
    assignments: number
    present: number
    absent: number
    late: number
    justified: number
    unrecorded: number
    presenceRate: number | null
  }[]
  absences: {
    date: string
    celebration: string
    role: string
    coroinha: string
    status: string
  }[]
  celebrations: {
    id: string
    title: string
    date: string
    time: string
    status: string
    filled: number
    required: number
    attendanceRecorded: number
    attendanceMissing: number
  }[]
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const start = new Date(Date.UTC(year || 2000, (monthNumber || 1) - 1, 1))
  const end = new Date(Date.UTC(year || 2000, monthNumber || 1, 1))
  const lastDay = new Date(Date.UTC(year || 2000, monthNumber || 1, 0))
  return {
    start,
    end,
    from: dateOnly(start),
    to: dateOnly(lastDay),
    label: start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  }
}

export function previousMonth(reference = new Date()) {
  const year = reference.getUTCFullYear()
  const month = reference.getUTCMonth()
  const date = new Date(Date.UTC(year, month - 1, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function buildMonthlyAttendanceReport(prisma: PrismaClient, month: string): Promise<MonthlyAttendanceReport> {
  const bounds = monthBounds(month)
  const [celebrations, activeCoroinhas] = await Promise.all([
    prisma.celebration.findMany({
      where: { date: { gte: bounds.start, lt: bounds.end } },
      include: {
        scale: {
          include: {
            roles: true,
            assignments: { include: { coroinha: true, attendance: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    }),
    prisma.coroinha.findMany({
      where: { status: 'ACTIVE', archivedAt: null },
      orderBy: { fullName: 'asc' },
    }),
  ])

  const stats = new Map<
    string,
    {
      coroinhaId: string
      name: string
      assignments: number
      present: number
      absent: number
      late: number
      justified: number
      unrecorded: number
    }
  >()

  for (const person of activeCoroinhas) {
    stats.set(person.id, {
      coroinhaId: person.id,
      name: person.fullName,
      assignments: 0,
      present: 0,
      absent: 0,
      late: 0,
      justified: 0,
      unrecorded: 0,
    })
  }

  const absences: MonthlyAttendanceReport['absences'] = []
  const celebrationRows: MonthlyAttendanceReport['celebrations'] = []
  let present = 0
  let absent = 0
  let late = 0
  let justified = 0
  let unrecorded = 0
  let assignments = 0
  let withAttendance = 0
  let withoutAttendance = 0
  let publishedOrCompleted = 0

  for (const celebration of celebrations) {
    const scale = celebration.scale
    const required = (scale?.roles ?? []).filter((role) => role.enabled).length
    const filled = scale?.assignments.length ?? 0
    const recorded = (scale?.assignments ?? []).filter((item) => item.attendance).length
    const missing = Math.max(filled - recorded, 0)
    if (scale && (scale.status === 'PUBLISHED' || scale.status === 'COMPLETED')) {
      publishedOrCompleted += 1
      if (filled > 0 && missing === 0) withAttendance += 1
      else withoutAttendance += 1
    }
    celebrationRows.push({
      id: celebration.id,
      title: celebration.title,
      date: dateOnly(celebration.date),
      time: celebration.time,
      status: scale ? SCALE_STATUS_LABELS[scale.status] : 'Sem escala',
      filled,
      required,
      attendanceRecorded: recorded,
      attendanceMissing: missing,
    })

    for (const assignment of scale?.assignments ?? []) {
      assignments += 1
      let row = stats.get(assignment.coroinhaId)
      if (!row) {
        row = {
          coroinhaId: assignment.coroinhaId,
          name: assignment.coroinha.fullName,
          assignments: 0,
          present: 0,
          absent: 0,
          late: 0,
          justified: 0,
          unrecorded: 0,
        }
        stats.set(assignment.coroinhaId, row)
      }
      row.assignments += 1
      const status = assignment.attendance?.status
      if (!status) {
        row.unrecorded += 1
        unrecorded += 1
        continue
      }
      if (status === 'PRESENT') {
        row.present += 1
        present += 1
      } else if (status === 'ABSENT') {
        row.absent += 1
        absent += 1
        absences.push({
          date: dateOnly(celebration.date),
          celebration: celebration.title,
          role: ROLE_LABELS[assignment.role],
          coroinha: assignment.coroinha.fullName,
          status: ATTENDANCE_LABELS[status],
        })
      } else if (status === 'LATE') {
        row.late += 1
        late += 1
      } else if (status === 'JUSTIFIED') {
        row.justified += 1
        justified += 1
        absences.push({
          date: dateOnly(celebration.date),
          celebration: celebration.title,
          role: ROLE_LABELS[assignment.role],
          coroinha: assignment.coroinha.fullName,
          status: ATTENDANCE_LABELS[status],
        })
      }
    }
  }

  const people = [...stats.values()]
    .map((row) => {
      const decided = row.present + row.absent + row.late + row.justified
      return {
        ...row,
        presenceRate: decided > 0 ? Math.round(((row.present + row.late) / decided) * 100) : null,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))

  const served = people.filter((item) => item.assignments > 0)
  const mostServed = [...served]
    .sort((left, right) => right.assignments - left.assignments || left.name.localeCompare(right.name, 'pt-BR'))
    .slice(0, 8)
    .map((item) => ({ coroinhaId: item.coroinhaId, name: item.name, assignments: item.assignments, present: item.present }))
  const leastServed = [...served]
    .sort((left, right) => left.assignments - right.assignments || left.name.localeCompare(right.name, 'pt-BR'))
    .slice(0, 8)
    .map((item) => ({ coroinhaId: item.coroinhaId, name: item.name, assignments: item.assignments, present: item.present }))
  const mostAbsent = [...people]
    .filter((item) => item.absent + item.justified > 0)
    .sort((left, right) => right.absent + right.justified - (left.absent + left.justified) || left.name.localeCompare(right.name, 'pt-BR'))
    .slice(0, 8)
    .map((item) => ({
      coroinhaId: item.coroinhaId,
      name: item.name,
      absent: item.absent,
      justified: item.justified,
      assignments: item.assignments,
    }))

  return {
    month,
    label: bounds.label,
    generatedAt: new Date().toISOString(),
    summary: {
      celebrations: celebrations.length,
      publishedOrCompleted,
      withAttendance,
      withoutAttendance,
      assignments,
      present,
      absent,
      late,
      justified,
      unrecorded,
    },
    mostServed,
    leastServed,
    mostAbsent,
    people,
    absences,
    celebrations: celebrationRows,
  }
}

export function monthlyReportPlainText(report: MonthlyAttendanceReport, parishName: string) {
  const lines = [
    `${parishName}`,
    `Relatório mensal de presença nas escalas — ${report.label}`,
    '',
    `Celebrações: ${report.summary.celebrations}`,
    `Publicadas/concluídas: ${report.summary.publishedOrCompleted}`,
    `Com presença completa: ${report.summary.withAttendance}`,
    `Sem presença completa: ${report.summary.withoutAttendance}`,
    `Funções preenchidas: ${report.summary.assignments}`,
    `Presentes: ${report.summary.present} · Atrasados: ${report.summary.late}`,
    `Ausentes: ${report.summary.absent} · Justificados: ${report.summary.justified}`,
    `Sem registro: ${report.summary.unrecorded}`,
    '',
    'Quem mais serviu:',
    ...report.mostServed.map((item) => `- ${item.name}: ${item.assignments} funções (${item.present} presentes)`),
    '',
    'Quem menos serviu (entre os escalados):',
    ...report.leastServed.map((item) => `- ${item.name}: ${item.assignments} funções`),
    '',
    'Quem mais faltou:',
    ...report.mostAbsent.map((item) => `- ${item.name}: ${item.absent} ausências e ${item.justified} justificadas`),
    '',
    'Ausências e justificativas:',
    ...(report.absences.length
      ? report.absences.map((item) => `- ${item.date} · ${item.celebration} · ${item.coroinha} (${item.role}) · ${item.status}`)
      : ['- Nenhuma ausência ou justificativa registrada.']),
  ]
  return lines.join('\n')
}

export function monthlyReportHtml(report: MonthlyAttendanceReport, parishName: string) {
  const list = (items: string[]) => items.map((item) => `<li>${item}</li>`).join('')
  return `<!doctype html>
<html lang="pt-BR">
<body style="font-family: Georgia, serif; color: #142033; line-height: 1.45;">
  <h1 style="color:#0B1F3A;">${parishName}</h1>
  <h2 style="color:#8C6E2F;">Relatório mensal de presença nas escalas — ${report.label}</h2>
  <p>
    Celebrações: <strong>${report.summary.celebrations}</strong><br/>
    Publicadas/concluídas: <strong>${report.summary.publishedOrCompleted}</strong><br/>
    Com presença completa: <strong>${report.summary.withAttendance}</strong><br/>
    Sem presença completa: <strong>${report.summary.withoutAttendance}</strong><br/>
    Funções preenchidas: <strong>${report.summary.assignments}</strong><br/>
    Presentes: <strong>${report.summary.present}</strong> · Atrasados: <strong>${report.summary.late}</strong><br/>
    Ausentes: <strong>${report.summary.absent}</strong> · Justificados: <strong>${report.summary.justified}</strong><br/>
    Sem registro: <strong>${report.summary.unrecorded}</strong>
  </p>
  <h3>Quem mais serviu</h3>
  <ul>${list(report.mostServed.map((item) => `${item.name}: ${item.assignments} funções (${item.present} presentes)`)) || '<li>Ninguém escalado neste mês.</li>'}</ul>
  <h3>Quem menos serviu</h3>
  <ul>${list(report.leastServed.map((item) => `${item.name}: ${item.assignments} funções`)) || '<li>Ninguém escalado neste mês.</li>'}</ul>
  <h3>Quem mais faltou</h3>
  <ul>${list(report.mostAbsent.map((item) => `${item.name}: ${item.absent} ausências e ${item.justified} justificadas`)) || '<li>Nenhuma ausência registrada.</li>'}</ul>
  <h3>Ausências e justificativas</h3>
  <ul>${list(report.absences.map((item) => `${item.date} · ${item.celebration} · ${item.coroinha} (${item.role}) · ${item.status}`)) || '<li>Nenhuma ausência ou justificativa registrada.</li>'}</ul>
</body>
</html>`
}

export function monthRangeDates(month: string) {
  const bounds = monthBounds(month)
  return { from: bounds.from, to: bounds.to, label: bounds.label, start: bounds.start, end: bounds.end }
}

export function isValidMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month) && !Number.isNaN(asDate(`${month}-01`).getTime())
}
