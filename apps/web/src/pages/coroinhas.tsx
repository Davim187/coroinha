import type { CoroinhaDetail, CoroinhaSummary, Paginated } from '@coroinha/contracts'
import {
  ATTENDANCE_LABELS,
  BLOCK_STATUS_LABELS,
  FUNDRAISING_STATUS_LABELS,
  ROLE_LABELS,
  SCALE_STATUS_LABELS,
} from '@coroinha/contracts'
import { coroinhaBodySchema } from '@coroinha/validators'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Resolver } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Can, ConfirmButton, EmptyState, Field, PageHeader, Panel, Pager, QueryBoundary, SearchBox, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'

type FormValues = {
  fullName: string
  birthDate: string
  phone: string
  guardianName: string
  guardianPhone: string
  joinedAt: string
  notes: string
  status: 'ACTIVE' | 'INACTIVE'
}

export function CoroinhasPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const archived = params.get('archived') ?? 'false'
  const page = Number(params.get('page') ?? 1)
  const query = useQuery({
    queryKey: ['coroinhas', q, status, archived, page],
    queryFn: () => api<Paginated<CoroinhaSummary>>(`/api/coroinhas?q=${encodeURIComponent(q)}&status=${status}&archived=${archived}&page=${page}`),
  })
  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    Object.entries(next).forEach(([key, value]) => {
      if (value) merged.set(key, value)
      else merged.delete(key)
    })
    if (!('page' in next)) merged.delete('page')
    setParams(merged)
  }
  return (
    <div>
      <PageHeader
        title="Coroinhas"
        description="Cadastro, situação e histórico de cada coroinha."
        actions={<Can permission="coroinhas.write"><Button asChild><Link to="/coroinhas/nova">Novo coroinha</Link></Button></Can>}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchBox value={q} onChange={(value) => update({ q: value })} placeholder="Pesquisar por nome" />
        <Select className="sm:w-44" value={status} onChange={(event) => update({ status: event.target.value })}>
          <option value="">Todas as situações</option>
          <option value="ACTIVE">Ativos</option>
          <option value="INACTIVE">Inativos</option>
        </Select>
        <Select className="sm:w-44" value={archived} onChange={(event) => update({ archived: event.target.value })}>
          <option value="false">Em atividade</option>
          <option value="true">Arquivados</option>
          <option value="all">Todos</option>
        </Select>
      </div>
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        refetch={() => query.refetch()}
        isEmpty={query.data?.items.length === 0}
        empty={<EmptyState title="Nenhum coroinha encontrado" description="Ajuste a pesquisa ou cadastre uma nova pessoa." />}
      >
        <Panel>
          <ul className="divide-y divide-line">
            {query.data?.items.map((person) => (
              <li key={person.id}>
                <Link to={`/coroinhas/${person.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-paper sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="block font-semibold">{person.fullName}</span>
                    <span className="text-sm text-muted">{person.phone || 'Sem telefone'} · entrada em {formatDate(person.joinedAt)}</span>
                  </span>
                  <span className="flex gap-2">
                    <StatusBadge value={person.status} label={person.status === 'ACTIVE' ? 'Ativo' : 'Inativo'} />
                    {person.archivedAt ? <StatusBadge value="CLOSED" label="Arquivado" /> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Pager page={page} pageSize={20} total={query.data?.total ?? 0} onPage={(next) => update({ page: String(next) })} />
      </QueryBoundary>
    </div>
  )
}

export function CoroinhaFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const existing = useQuery({
    queryKey: ['coroinha', id],
    queryFn: () => api<CoroinhaDetail>(`/api/coroinhas/${id}`),
    enabled: Boolean(id),
  })
  const form = useForm<FormValues>({
    resolver: zodResolver(coroinhaBodySchema) as Resolver<FormValues>,
    values: existing.data
      ? {
          fullName: existing.data.fullName,
          birthDate: existing.data.birthDate,
          phone: existing.data.phone ?? '',
          guardianName: existing.data.guardianName ?? '',
          guardianPhone: existing.data.guardianPhone ?? '',
          joinedAt: existing.data.joinedAt,
          notes: existing.data.notes ?? '',
          status: existing.data.status,
        }
      : undefined,
    defaultValues: { fullName: '', birthDate: '', phone: '', guardianName: '', guardianPhone: '', joinedAt: '', notes: '', status: 'ACTIVE' },
  })
  const save = useMutation({
    mutationFn: (values: FormValues) =>
      api(id ? `/api/coroinhas/${id}` : '/api/coroinhas', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) }),
    onSuccess: async (person) => {
      await client.invalidateQueries({ queryKey: ['coroinhas'] })
      toast.success(id ? 'Cadastro atualizado.' : 'Coroinha cadastrado.')
      navigate(`/coroinhas/${(person as CoroinhaSummary).id}`)
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.'),
  })
  if (id && existing.isLoading) return null
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={id ? 'Editar coroinha' : 'Novo coroinha'} description="Organize os dados em identificação, responsável e vínculo com a pastoral." />
      <form className="grid gap-4" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
        <Panel className="grid gap-4 p-5 md:grid-cols-2">
          <h2 className="font-display text-2xl md:col-span-2">Identificação</h2>
          <Field label="Nome completo" error={form.formState.errors.fullName?.message}><Input {...form.register('fullName')} /></Field>
          <Field label="Data de nascimento" error={form.formState.errors.birthDate?.message}><Input type="date" {...form.register('birthDate')} /></Field>
          <Field label="Telefone" error={form.formState.errors.phone?.message}><Input {...form.register('phone')} /></Field>
          <Field label="Situação" error={form.formState.errors.status?.message}>
            <Select {...form.register('status')}>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </Select>
          </Field>
        </Panel>
        <Panel className="grid gap-4 p-5 md:grid-cols-2">
          <h2 className="font-display text-2xl md:col-span-2">Responsável</h2>
          <Field label="Nome do responsável" error={form.formState.errors.guardianName?.message}><Input {...form.register('guardianName')} /></Field>
          <Field label="Telefone do responsável" error={form.formState.errors.guardianPhone?.message}><Input {...form.register('guardianPhone')} /></Field>
        </Panel>
        <Panel className="grid gap-4 p-5">
          <h2 className="font-display text-2xl">Pastoral</h2>
          <Field label="Data de entrada" error={form.formState.errors.joinedAt?.message}><Input type="date" {...form.register('joinedAt')} /></Field>
          <Field label="Observações" error={form.formState.errors.notes?.message}><Textarea {...form.register('notes')} /></Field>
        </Panel>
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>Salvar</Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}

export function CoroinhaDetailPage() {
  const { id } = useParams()
  const client = useQueryClient()
  const [tab, setTab] = useState<'escalas' | 'presencas' | 'arrecadacoes' | 'rifas'>('escalas')
  const query = useQuery({ queryKey: ['coroinha', id], queryFn: () => api<CoroinhaDetail>(`/api/coroinhas/${id}`) })
  const archive = useMutation({
    mutationFn: () => api(`/api/coroinhas/${id}/${query.data?.archivedAt ? 'restore' : 'archive'}`, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['coroinha', id] })
      toast.success(query.data?.archivedAt ? 'Cadastro restaurado.' : 'Cadastro arquivado. O histórico foi mantido.')
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível concluir.'),
  })
  const person = query.data
  return (
    <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()}>
      {person ? (
        <div>
          <PageHeader
            title={person.fullName}
            description={`Entrada em ${formatDate(person.joinedAt)}`}
            actions={
              <Can permission="coroinhas.write">
                <Button asChild variant="outline"><Link to={`/coroinhas/${person.id}/editar`}>Editar</Link></Button>
                <ConfirmButton
                  title={person.archivedAt ? 'Restaurar cadastro' : 'Arquivar cadastro'}
                  description={person.archivedAt ? 'O coroinha voltará às listas ativas.' : 'O histórico de escalas, presenças, rifas e arrecadações será preservado.'}
                  confirmLabel={person.archivedAt ? 'Restaurar' : 'Arquivar'}
                  danger={!person.archivedAt}
                  onConfirm={() => archive.mutate()}
                >
                  <Button variant={person.archivedAt ? 'default' : 'outline'} type="button">{person.archivedAt ? 'Restaurar' : 'Arquivar'}</Button>
                </ConfirmButton>
              </Can>
            }
          />
          <div className="mb-4 flex gap-2">
            <StatusBadge value={person.status} label={person.status === 'ACTIVE' ? 'Ativo' : 'Inativo'} />
            {person.archivedAt ? <StatusBadge value="CLOSED" label="Arquivado" /> : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Info label="Nascimento" value={formatDate(person.birthDate)} />
            <Info label="Telefone" value={person.phone || '—'} />
            <Info label="Responsável" value={person.guardianName || '—'} />
            <Info label="Telefone do responsável" value={person.guardianPhone || '—'} />
            <Info label="Observações" value={person.notes || '—'} />
          </div>
          <div className="mt-6 flex gap-2 overflow-auto">
            {(['escalas', 'presencas', 'arrecadacoes', 'rifas'] as const).map((item) => (
              <button key={item} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === item ? 'bg-navy-900 text-white' : 'bg-white text-navy-900'}`} onClick={() => setTab(item)}>
                {item === 'escalas' ? 'Escalas' : item === 'presencas' ? 'Presenças' : item === 'arrecadacoes' ? 'Arrecadações' : 'Rifas'}
              </button>
            ))}
          </div>
          <Panel className="mt-3">
            {tab === 'escalas' ? <History rows={person.history.scales} empty="Nenhuma escala encontrada." render={(item) => `${formatDate(item.date)} · ${item.title} · ${ROLE_LABELS[item.role]} · ${SCALE_STATUS_LABELS[item.status]}`} /> : null}
            {tab === 'presencas' ? <History rows={person.history.attendance} empty="Nenhuma presença registrada." render={(item) => `${formatDate(item.date)} · ${item.title} · ${ATTENDANCE_LABELS[item.status]}`} /> : null}
            {tab === 'arrecadacoes' ? <History rows={person.history.fundraising} empty="Nenhuma participação em arrecadação." render={(item) => `${item.name} · ${formatDate(item.date)} · ${FUNDRAISING_STATUS_LABELS[item.status]}`} /> : null}
            {tab === 'rifas' ? <History rows={person.history.raffleBlocks} empty="Nenhum bloco de rifa atribuído." render={(item) => `${item.campaignName} · bloco ${item.label} · ${item.soldQuantity}/${item.quantity} · ${BLOCK_STATUS_LABELS[item.status]}`} /> : null}
          </Panel>
        </div>
      ) : null}
    </QueryBoundary>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Panel className="p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1">{value}</p>
    </Panel>
  )
}

function History<T>({ rows, empty, render }: { rows: T[]; empty: string; render: (row: T) => string }) {
  if (rows.length === 0) return <p className="p-6 text-sm text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-line">
      {rows.map((row, index) => (
        <li key={index} className="px-5 py-3 text-sm">{render(row)}</li>
      ))}
    </ul>
  )
}
