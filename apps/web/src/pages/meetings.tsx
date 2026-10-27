import type { MeetingAttendanceView, MeetingDetail, MeetingSummary, Paginated } from '@coroinha/contracts'
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, MEETING_STATUS_LABELS, type AttendanceStatus } from '@coroinha/contracts'
import { meetingBodySchema } from '@coroinha/validators'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Resolver } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Can, ConfirmButton, EmptyState, Field, PageHeader, Panel, QueryBoundary, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { api, ApiError, downloadFile } from '@/lib/api'
import { currentMonth, formatDate, shiftMonth, todayInput } from '@/lib/format'

type FormValues = {
  title: string
  agenda: string
  date: string
  startTime: string
  endTime: string
  location: string
  notes: string
  decisions: string
  status: 'SCHEDULED' | 'HELD' | 'CANCELLED'
  participants: { name: string; userId?: string | null }[]
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year || 2000, (monthNumber || 1) - 1, 1)
  return first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function AgendaPage() {
  const [month, setMonth] = useState(currentMonth())
  const [day, setDay] = useState('')
  const [anchored, setAnchored] = useState(false)
  const query = useQuery({
    queryKey: ['meetings', month],
    queryFn: () => api<Paginated<MeetingSummary>>(`/api/meetings?month=${month}&pageSize=100`),
  })
  const overview = useQuery({
    queryKey: ['meetings', 'overview'],
    queryFn: () => api<Paginated<MeetingSummary>>('/api/meetings?pageSize=100'),
  })
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year || 2000, (monthNumber || 1) - 1, 1)
  const days = new Date(year || 2000, monthNumber || 1, 0).getDate()
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)]
  const meetings = query.data?.items ?? []
  const visible = day ? meetings.filter((item) => item.date === `${month}-${day}`) : meetings
  const otherMonths = Array.from(
    new Set((overview.data?.items ?? []).map((item) => item.date.slice(0, 7)).filter((value) => value !== month)),
  ).sort()

  useEffect(() => {
    if (anchored || !overview.isSuccess || query.isLoading) return
    if ((query.data?.items.length ?? 0) > 0) {
      setAnchored(true)
      return
    }
    const today = todayInput()
    const all = overview.data?.items ?? []
    if (all.length === 0) {
      setAnchored(true)
      return
    }
    const upcoming = all.filter((item) => item.date >= today).sort((a, b) => a.date.localeCompare(b.date))
    const target = upcoming[0] ?? [...all].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (target) {
      setMonth(target.date.slice(0, 7))
      setDay('')
    }
    setAnchored(true)
  }, [anchored, overview.data, overview.isSuccess, query.data, query.isLoading])

  function changeMonth(next: string) {
    setMonth(next)
    setDay('')
  }

  return (
    <div>
      <PageHeader title="Agenda e reuniões" description="Encontre a próxima reunião, consulte a pauta e registre a presença." actions={<Can permission="meetings.write"><Button asChild><Link to="/agenda/nova">Nova reunião</Link></Button></Can>} />
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => changeMonth(shiftMonth(month, -1))}>Anterior</Button>
            <p className="font-display text-2xl capitalize">{monthLabel(month)}</p>
            <Button variant="outline" size="sm" onClick={() => changeMonth(shiftMonth(month, 1))}>Próximo</Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((value, index) => {
              const iso = value ? `${month}-${String(value).padStart(2, '0')}` : ''
              const count = meetings.filter((item) => item.date === iso).length
              const soon = meetings.some((item) => item.date === iso && item.soon)
              const selected = day === String(value).padStart(2, '0')
              return (
                <button
                  key={index}
                  disabled={!value}
                  className={`h-12 rounded-lg text-sm ${selected ? 'bg-navy-900 text-white' : 'bg-paper'} ${soon ? 'ring-1 ring-gold-500' : ''}`}
                  onClick={() => {
                    if (!value) return
                    const next = String(value).padStart(2, '0')
                    setDay((current) => (current === next ? '' : next))
                  }}
                >
                  {value}
                  {count ? <span className="block text-[10px]">{count}</span> : null}
                </button>
              )
            })}
          </div>
          {day ? (
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => setDay('')}>Ver todas do mês</Button>
            </div>
          ) : null}
          {otherMonths.length ? (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Outros meses com reuniões</p>
              <div className="flex flex-wrap gap-2">
                {otherMonths.map((value) => (
                  <Button key={value} variant="outline" size="sm" onClick={() => changeMonth(value)}>
                    <span className="capitalize">{monthLabel(value)}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
        <div>
          <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()} isEmpty={visible.length === 0} empty={<EmptyState title="Nenhuma reunião neste período" description={otherMonths.length ? 'Use os botões de outros meses ou navegue no calendário.' : 'Agende a próxima reunião da coordenação.'} />}>
            <div className="grid gap-3">
              {visible.map((item) => (
                <Link key={item.id} to={`/agenda/${item.id}`} className="rounded-2xl border border-line bg-white p-4 hover:border-gold-500">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-sm text-muted">{formatDate(item.date)} · {item.startTime}–{item.endTime}</p>
                      <p className="mt-1 text-xs text-muted">Presença {item.attendanceCounted}/{item.attendanceTotal}</p>
                    </div>
                    <StatusBadge value={item.status} label={MEETING_STATUS_LABELS[item.status]} />
                  </div>
                  {item.soon ? <p className="mt-2 text-xs font-semibold text-gold-700">Reunião próxima</p> : null}
                </Link>
              ))}
            </div>
          </QueryBoundary>
        </div>
      </div>
    </div>
  )
}

export function MeetingFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useQuery({ queryKey: ['meeting', id], queryFn: () => api<MeetingDetail>(`/api/meetings/${id}`), enabled: Boolean(id) })
  const [name, setName] = useState('')
  const form = useForm<FormValues>({
    resolver: zodResolver(meetingBodySchema) as unknown as Resolver<FormValues>,
    values: existing.data ? {
      title: existing.data.title,
      agenda: existing.data.agenda ?? '',
      date: existing.data.date,
      startTime: existing.data.startTime,
      endTime: existing.data.endTime,
      location: existing.data.location ?? '',
      notes: existing.data.notes ?? '',
      decisions: existing.data.decisions ?? '',
      status: existing.data.status,
      participants: existing.data.participants.map((item) => ({ name: item.name, userId: item.userId })),
    } : undefined,
    defaultValues: { title: '', agenda: '', date: todayInput(), startTime: '19:00', endTime: '20:30', location: '', notes: '', decisions: '', status: 'SCHEDULED', participants: [] },
  })
  const participants = form.watch('participants')
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={id ? 'Editar reunião' : 'Nova reunião'} description="Registre a pauta, o horário e, se quiser, os encaminhamentos." />
      <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => {
        try {
          const saved = await api<MeetingDetail>(id ? `/api/meetings/${id}` : '/api/meetings', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) })
          toast.success('Reunião salva.')
          navigate(`/agenda/${saved.id}`)
        } catch (error) {
          toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
        }
      })}>
        <Panel className="grid gap-4 p-5 md:grid-cols-2">
          <div className="md:col-span-2"><Field label="Título" error={form.formState.errors.title?.message}><Input {...form.register('title')} /></Field></div>
          <Field label="Data" error={form.formState.errors.date?.message}><Input type="date" {...form.register('date')} /></Field>
          <Field label="Situação"><Select {...form.register('status')}><option value="SCHEDULED">Agendada</option><option value="HELD">Realizada</option><option value="CANCELLED">Cancelada</option></Select></Field>
          <Field label="Início" error={form.formState.errors.startTime?.message}><Input type="time" {...form.register('startTime')} /></Field>
          <Field label="Término" error={form.formState.errors.endTime?.message}><Input type="time" {...form.register('endTime')} /></Field>
          <div className="md:col-span-2"><Field label="Local" error={form.formState.errors.location?.message}><Input {...form.register('location')} /></Field></div>
          <div className="md:col-span-2"><Field label="Pauta" error={form.formState.errors.agenda?.message}><Textarea {...form.register('agenda')} /></Field></div>
          <div className="md:col-span-2"><Field label="Observações" error={form.formState.errors.notes?.message}><Textarea {...form.register('notes')} /></Field></div>
          <div className="md:col-span-2"><Field label="Decisões ou encaminhamentos" error={form.formState.errors.decisions?.message}><Textarea {...form.register('decisions')} /></Field></div>
          <div className="md:col-span-2">
            <Field label="Participantes da coordenação">
              <div className="flex gap-2">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do participante" />
                <Button type="button" variant="outline" onClick={() => {
                  if (name.trim().length < 3) return
                  form.setValue('participants', [...participants, { name: name.trim(), userId: null }])
                  setName('')
                }}>Adicionar</Button>
              </div>
            </Field>
            <ul className="mt-2 flex flex-wrap gap-2">
              {participants.map((participant) => (
                <li key={participant.name}><button type="button" className="rounded-full bg-paper px-3 py-1 text-sm" onClick={() => form.setValue('participants', participants.filter((item) => item.name !== participant.name))}>{participant.name} ×</button></li>
              ))}
            </ul>
          </div>
        </Panel>
        <Button type="submit">Salvar reunião</Button>
      </form>
    </div>
  )
}

export function MeetingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['meeting', id], queryFn: () => api<MeetingDetail>(`/api/meetings/${id}`) })
  const meeting = query.data
  return (
    <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()}>
      {meeting ? (
        <div className="mx-auto max-w-3xl">
          <PageHeader
            title={meeting.title}
            description={`${formatDate(meeting.date)} · ${meeting.startTime}–${meeting.endTime}${meeting.location ? ` · ${meeting.location}` : ''}`}
            actions={
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadFile(`/api/meetings/${meeting.id}/report.pdf`, `reuniao-${meeting.date}.pdf`).catch((error) =>
                      toast.error(error instanceof ApiError ? error.message : 'Não foi possível gerar o relatório.'),
                    )
                  }
                >
                  Relatório
                </Button>
                <Can permission="meetings.write">
                  <Button asChild variant="outline"><Link to={`/agenda/${meeting.id}/editar`}>Editar</Link></Button>
                  {meeting.status !== 'CANCELLED' ? (
                    <Button asChild><Link to={`/agenda/${meeting.id}/presenca`}>Presença</Link></Button>
                  ) : null}
                  {meeting.status !== 'CANCELLED' ? (
                    <ConfirmButton title="Cancelar reunião" description="A reunião permanece no histórico como cancelada." confirmLabel="Cancelar reunião" danger onConfirm={async () => { await api(`/api/meetings/${meeting.id}/cancel`, { method: 'POST' }); await client.invalidateQueries({ queryKey: ['meeting', id] }); toast.success('Reunião cancelada.') }}>
                      <Button variant="outline">Cancelar</Button>
                    </ConfirmButton>
                  ) : null}
                  <ConfirmButton title="Excluir reunião" description="A reunião sai da agenda e deixa de aparecer no calendário." confirmLabel="Excluir" danger onConfirm={async () => { try { await api(`/api/meetings/${meeting.id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['meetings'] }); toast.success('Reunião excluída.'); navigate('/agenda') } catch (error) { toast.error(error instanceof ApiError ? error.message : 'Não foi possível excluir a reunião.') } }}>
                    <Button variant="outline" type="button">Excluir</Button>
                  </ConfirmButton>
                </Can>
              </>
            }
          />
          {meeting.soon ? <p className="mb-4 text-sm font-semibold text-gold-700">Esta reunião está próxima.</p> : null}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <StatusBadge value={meeting.status} label={MEETING_STATUS_LABELS[meeting.status]} />
            <span className="text-sm text-muted">Presença {meeting.attendanceCounted}/{meeting.attendanceTotal}</span>
          </div>
          <Panel className="mt-4 p-5">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Responsável</p>
            <p>{meeting.organizer.name}</p>
            <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Pauta</p>
            <p className="whitespace-pre-wrap">{meeting.agenda || 'Sem pauta registrada.'}</p>
            <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Decisões</p>
            <p className="whitespace-pre-wrap">{meeting.decisions || 'Nenhum encaminhamento registrado.'}</p>
            <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Participantes da coordenação</p>
            <p>{meeting.participants.map((item) => item.name).join(', ') || 'Não informados.'}</p>
          </Panel>
        </div>
      ) : null}
    </QueryBoundary>
  )
}

type AttendanceItem = {
  coroinhaId: string
  coroinhaName: string
  status: AttendanceStatus | null
  notes: string | null
}

export function MeetingAttendancePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['meeting-attendance', id],
    queryFn: () => api<MeetingAttendanceView>(`/api/meetings/${id}/attendance`),
  })
  const [items, setItems] = useState<AttendanceItem[]>([])
  useEffect(() => {
    if (query.data) setItems(query.data.items)
  }, [query.data])
  const save = useMutation({
    mutationFn: () =>
      api(`/api/meetings/${id}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({
          markHeld: true,
          items: items.map((item) => ({ coroinhaId: item.coroinhaId, status: item.status, notes: item.notes })),
        }),
      }),
    onSuccess: async () => {
      toast.success('Presença da reunião registrada.')
      await client.invalidateQueries({ queryKey: ['meeting', id] })
      await client.invalidateQueries({ queryKey: ['meetings'] })
      await client.invalidateQueries({ queryKey: ['meeting-attendance', id] })
      navigate(`/agenda/${id}`)
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar a presença.'),
  })
  const complete = items.length > 0 && items.every((item) => item.status)
  return (
    <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()}>
      <PageHeader
        title="Presença da reunião"
        description={query.data ? `${query.data.title} · ${formatDate(query.data.date)}` : 'Marque a situação de cada coroinha.'}
        actions={<Button variant="outline" asChild><Link to={`/agenda/${id}`}>Voltar</Link></Button>}
      />
      {items.length === 0 ? (
        <Panel className="p-6 text-sm text-muted">Não há coroinhas ativos para registrar presença.</Panel>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setItems((current) => current.map((item) => ({ ...item, status: 'PRESENT' })))}>Marcar todos presentes</Button>
            <Button variant="outline" onClick={() => setItems((current) => current.map((item) => ({ ...item, status: 'ABSENT' })))}>Marcar todos ausentes</Button>
          </div>
          {items.map((item) => (
            <Panel key={item.coroinhaId} className="p-4">
              <p className="font-semibold">{item.coroinhaName}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ATTENDANCE_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${item.status === status ? 'bg-navy-900 text-white' : 'bg-paper text-navy-900'}`}
                    onClick={() => setItems((current) => current.map((row) => row.coroinhaId === item.coroinhaId ? { ...row, status } : row))}
                  >
                    {ATTENDANCE_LABELS[status]}
                  </button>
                ))}
              </div>
            </Panel>
          ))}
          <Button disabled={!complete || save.isPending} onClick={() => save.mutate()}>
            {complete ? 'Salvar presença' : 'Selecione a situação de todos'}
          </Button>
        </div>
      )}
    </QueryBoundary>
  )
}
