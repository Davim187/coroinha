import type { MeetingDetail, MeetingSummary, Paginated } from '@coroinha/contracts'
import { MEETING_STATUS_LABELS } from '@coroinha/contracts'
import { meetingBodySchema } from '@coroinha/validators'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Resolver } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Can, ConfirmButton, EmptyState, Field, PageHeader, Panel, QueryBoundary, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { api, ApiError } from '@/lib/api'
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

export function AgendaPage() {
  const [month, setMonth] = useState(currentMonth())
  const [day, setDay] = useState('')
  const query = useQuery({
    queryKey: ['meetings', month],
    queryFn: () => api<Paginated<MeetingSummary>>(`/api/meetings?month=${month}&pageSize=100`),
  })
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year || 2000, (monthNumber || 1) - 1, 1)
  const days = new Date(year || 2000, monthNumber || 1, 0).getDate()
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)]
  const meetings = query.data?.items ?? []
  const visible = day ? meetings.filter((item) => item.date.endsWith(day.padStart(2, '0')) && item.date.startsWith(month)) : meetings
  return (
    <div>
      <PageHeader title="Agenda e reuniões" description="Encontre a próxima reunião e consulte a pauta." actions={<Can permission="meetings.write"><Button asChild><Link to="/agenda/nova">Nova reunião</Link></Button></Can>} />
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, -1))}>Anterior</Button>
            <p className="font-display text-2xl capitalize">{first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
            <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, 1))}>Próximo</Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((value, index) => {
              const iso = value ? `${month}-${String(value).padStart(2, '0')}` : ''
              const count = meetings.filter((item) => item.date === iso).length
              const soon = meetings.some((item) => item.date === iso && item.soon)
              return (
                <button key={index} disabled={!value} className={`h-12 rounded-lg text-sm ${day === String(value).padStart(2, '0') ? 'bg-navy-900 text-white' : 'bg-paper'} ${soon ? 'ring-1 ring-gold-500' : ''}`} onClick={() => setDay(value ? String(value).padStart(2, '0') : '')}>
                  {value}
                  {count ? <span className="block text-[10px]">{count}</span> : null}
                </button>
              )
            })}
          </div>
        </Panel>
        <div>
          <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()} isEmpty={visible.length === 0} empty={<EmptyState title="Nenhuma reunião neste período" description="Agende a próxima reunião da coordenação." />}>
            <div className="grid gap-3">
              {visible.map((item) => (
                <Link key={item.id} to={`/agenda/${item.id}`} className="rounded-2xl border border-line bg-white p-4 hover:border-gold-500">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-sm text-muted">{formatDate(item.date)} · {item.startTime}–{item.endTime}</p>
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
            <Field label="Participantes">
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
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['meeting', id], queryFn: () => api<MeetingDetail>(`/api/meetings/${id}`) })
  const meeting = query.data
  return (
    <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()}>
      {meeting ? (
        <div className="mx-auto max-w-3xl">
          <PageHeader title={meeting.title} description={`${formatDate(meeting.date)} · ${meeting.startTime}–${meeting.endTime}${meeting.location ? ` · ${meeting.location}` : ''}`} actions={<Can permission="meetings.write"><Button asChild variant="outline"><Link to={`/agenda/${meeting.id}/editar`}>Editar</Link></Button>{meeting.status !== 'CANCELLED' ? <ConfirmButton title="Cancelar reunião" description="A reunião permanece no histórico como cancelada." confirmLabel="Cancelar reunião" danger onConfirm={async () => { await api(`/api/meetings/${meeting.id}/cancel`, { method: 'POST' }); await client.invalidateQueries({ queryKey: ['meeting', id] }); toast.success('Reunião cancelada.') }}><Button variant="outline">Cancelar</Button></ConfirmButton> : null}</Can>} />
          {meeting.soon ? <p className="mb-4 text-sm font-semibold text-gold-700">Esta reunião está próxima.</p> : null}
          <StatusBadge value={meeting.status} label={MEETING_STATUS_LABELS[meeting.status]} />
          <Panel className="mt-4 p-5">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Responsável</p>
            <p>{meeting.organizer.name}</p>
            <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Pauta</p>
            <p className="whitespace-pre-wrap">{meeting.agenda || 'Sem pauta registrada.'}</p>
            <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Decisões</p>
            <p className="whitespace-pre-wrap">{meeting.decisions || 'Nenhum encaminhamento registrado.'}</p>
            <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Participantes</p>
            <p>{meeting.participants.map((item) => item.name).join(', ') || 'Não informados.'}</p>
          </Panel>
        </div>
      ) : null}
    </QueryBoundary>
  )
}
