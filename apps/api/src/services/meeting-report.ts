import { ATTENDANCE_LABELS, MEETING_STATUS_LABELS } from '@coroinha/contracts'
import type { PrismaClient } from '@prisma/client'
import { dateOnly } from '../domain.js'

export type MeetingReport = {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  location: string | null
  status: string
  organizer: string
  agenda: string | null
  notes: string | null
  decisions: string | null
  participants: string[]
  attendance: { coroinha: string; status: string; notes: string | null }[]
  history: {
    at: string
    user: string
    action: string
    summary: string
    changes: { field: string; from: string | null; to: string | null }[]
  }[]
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  agenda: 'Pauta',
  date: 'Data',
  startTime: 'Início',
  endTime: 'Término',
  location: 'Local',
  notes: 'Observações',
  decisions: 'Decisões',
  status: 'Situação',
  participants: 'Participantes',
}

const ACTION_LABELS: Record<string, string> = {
  'meeting.create': 'Criou a reunião',
  'meeting.update': 'Atualizou a reunião',
  'meeting.cancel': 'Cancelou a reunião',
  'meeting.attendance': 'Registrou a presença',
  'meeting.delete': 'Excluiu a reunião',
}

function asText(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  return String(value)
}

export async function buildMeetingReport(prisma: PrismaClient, id: string): Promise<MeetingReport | null> {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      organizer: true,
      participants: { orderBy: { name: 'asc' } },
      attendances: { include: { coroinha: true }, orderBy: { coroinha: { fullName: 'asc' } } },
    },
  })
  if (!meeting) return null

  const audits = await prisma.auditLog.findMany({
    where: { entity: 'Meeting', entityId: id },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  })

  const history = audits.map((entry) => {
    const metadata = (entry.metadata ?? {}) as {
      before?: Record<string, unknown>
      after?: Record<string, unknown>
      summary?: string
    }
    const before = metadata.before ?? {}
    const after = metadata.after ?? {}
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    const changes = [...keys]
      .map((field) => ({
        field: FIELD_LABELS[field] ?? field,
        from: asText(before[field]),
        to: asText(after[field]),
      }))
      .filter((item) => item.from !== item.to)
    return {
      at: entry.createdAt.toISOString(),
      user: entry.user?.name ?? 'Sistema',
      action: ACTION_LABELS[entry.action] ?? entry.action,
      summary: metadata.summary ?? ACTION_LABELS[entry.action] ?? entry.action,
      changes,
    }
  })

  return {
    id: meeting.id,
    title: meeting.title,
    date: dateOnly(meeting.date),
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    location: meeting.location,
    status: MEETING_STATUS_LABELS[meeting.status],
    organizer: meeting.organizer.name,
    agenda: meeting.agenda,
    notes: meeting.notes,
    decisions: meeting.decisions,
    participants: meeting.participants.map((item) => item.name),
    attendance: meeting.attendances.map((item) => ({
      coroinha: item.coroinha.fullName,
      status: ATTENDANCE_LABELS[item.status],
      notes: item.notes,
    })),
    history,
  }
}

export function meetingSnapshot(meeting: {
  title: string
  agenda: string | null
  date: Date | string
  startTime: string
  endTime: string
  location: string | null
  notes: string | null
  decisions: string | null
  status: string
  participants?: { name: string }[]
}) {
  return {
    title: meeting.title,
    agenda: meeting.agenda,
    date: typeof meeting.date === 'string' ? meeting.date.slice(0, 10) : dateOnly(meeting.date),
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    location: meeting.location,
    notes: meeting.notes,
    decisions: meeting.decisions,
    status: meeting.status,
    participants: (meeting.participants ?? []).map((item) => item.name),
  }
}
