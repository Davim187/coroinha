import type { FundraisingDetail, FundraisingListItem, Paginated, TransactionType } from '@coroinha/contracts'
import { FUNDRAISING_STATUS_LABELS, TRANSACTION_LABELS } from '@coroinha/contracts'
import { fundraisingBodySchema, transactionSchema } from '@coroinha/validators'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Resolver } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Can, ConfirmButton, CoroinhaPicker, EmptyState, Field, PageHeader, Panel, Pager, QueryBoundary, SearchBox, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/input'
import { api, ApiError, downloadFile } from '@/lib/api'
import { formatDate, formatMoney, todayInput } from '@/lib/format'

type FormValues = {
  name: string
  description: string
  category: string
  startsAt: string
  endsAt: string
  goalAmount: string
  notes: string
  status: 'ONGOING' | 'CLOSED'
}

export function FundraisingPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? 1)
  const query = useQuery({
    queryKey: ['fundraisings', q, status, page],
    queryFn: () => api<Paginated<FundraisingListItem>>(`/api/fundraisings?q=${encodeURIComponent(q)}&status=${status}&page=${page}`),
  })
  return (
    <div>
      <PageHeader title="Arrecadações" description="Cada campanha tem seu saldo, seus participantes e seu histórico." actions={<Can permission="fundraising.write"><Button asChild><Link to="/arrecadacoes/nova">Nova arrecadação</Link></Button></Can>} />
      <div className="mb-4 flex gap-2">
        <SearchBox value={q} onChange={(value) => setParams({ q: value, status })} placeholder="Pesquisar" />
        <Select className="w-44" value={status} onChange={(event) => setParams({ q, status: event.target.value })}>
          <option value="">Todas</option>
          <option value="ONGOING">Em andamento</option>
          <option value="CLOSED">Encerradas</option>
        </Select>
      </div>
      <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()} isEmpty={!query.data?.items.length} empty={<EmptyState title="Nenhuma arrecadação" description="Registre uma contribuição, campanha ou evento." />}>
        <div className="grid gap-3">
          {query.data?.items.map((item) => (
            <Link key={item.id} to={`/arrecadacoes/${item.id}`} className="rounded-2xl border border-line bg-white p-4 hover:border-gold-500">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted">{item.category} · {item.totals.participantCount} coroinhas</p>
                </div>
                <StatusBadge value={item.status} label={FUNDRAISING_STATUS_LABELS[item.status]} />
              </div>
              <p className="mt-2 font-display text-2xl">{formatMoney(item.totals.balance)}</p>
            </Link>
          ))}
        </div>
        <Pager page={page} total={query.data?.total ?? 0} pageSize={20} onPage={(next) => setParams({ q, status, page: String(next) })} />
      </QueryBoundary>
    </div>
  )
}

export function FundraisingFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useQuery({ queryKey: ['fundraising', id], queryFn: () => api<FundraisingDetail>(`/api/fundraisings/${id}`), enabled: Boolean(id) })
  const form = useForm<FormValues>({
    resolver: zodResolver(fundraisingBodySchema) as unknown as Resolver<FormValues>,
    values: existing.data ? {
      name: existing.data.name,
      description: existing.data.description ?? '',
      category: existing.data.category,
      startsAt: existing.data.startsAt,
      endsAt: existing.data.endsAt ?? '',
      goalAmount: existing.data.totals.goalAmount ?? '',
      notes: existing.data.notes ?? '',
      status: existing.data.status,
    } : undefined,
    defaultValues: { name: '', description: '', category: 'Contribuição', startsAt: todayInput(), endsAt: '', goalAmount: '', notes: '', status: 'ONGOING' },
  })
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={id ? 'Editar arrecadação' : 'Nova arrecadação'} description="O valor arrecadado é calculado pelos lançamentos, não digitado à parte." />
      <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => {
        try {
          const saved = await api<FundraisingDetail>(id ? `/api/fundraisings/${id}` : '/api/fundraisings', {
            method: id ? 'PATCH' : 'POST',
            body: JSON.stringify({ ...values, endsAt: values.endsAt || null, goalAmount: values.goalAmount || null }),
          })
          toast.success('Arrecadação salva.')
          navigate(`/arrecadacoes/${saved.id}`)
        } catch (error) {
          toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
        }
      })}>
        <Panel className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Nome" error={form.formState.errors.name?.message}><Input {...form.register('name')} /></Field>
          <Field label="Categoria" error={form.formState.errors.category?.message}><Input list="categorias" {...form.register('category')} /></Field>
          <datalist id="categorias"><option value="Contribuição" /><option value="Campanha" /><option value="Evento" /><option value="Outra" /></datalist>
          <Field label="Início" error={form.formState.errors.startsAt?.message}><Input type="date" {...form.register('startsAt')} /></Field>
          <Field label="Encerramento" error={form.formState.errors.endsAt?.message}><Input type="date" {...form.register('endsAt')} /></Field>
          <Field label="Meta" error={form.formState.errors.goalAmount?.message}><Input {...form.register('goalAmount')} /></Field>
          <Field label="Situação"><Select {...form.register('status')}><option value="ONGOING">Em andamento</option><option value="CLOSED">Encerrada</option></Select></Field>
          <div className="md:col-span-2"><Field label="Finalidade" error={form.formState.errors.description?.message}><Textarea {...form.register('description')} /></Field></div>
          <div className="md:col-span-2"><Field label="Observações" error={form.formState.errors.notes?.message}><Textarea {...form.register('notes')} /></Field></div>
        </Panel>
        <Button type="submit">Salvar</Button>
      </form>
    </div>
  )
}

export function FundraisingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['fundraising', id], queryFn: () => api<FundraisingDetail>(`/api/fundraisings/${id}`) })
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null)
  const [open, setOpen] = useState(false)
  const campaign = query.data
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['fundraising', id] })
  }
  return (
    <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()}>
      {campaign ? (
        <div>
          <PageHeader title={campaign.name} description={campaign.description || campaign.category} actions={<><Button asChild variant="outline"><Link to={`/arrecadacoes/${campaign.id}/editar`}>Editar</Link></Button><Button variant="outline" onClick={() => downloadFile(`/api/fundraisings/${campaign.id}/export.csv`, 'arrecadacao.csv')}>CSV</Button><Button variant="outline" onClick={() => downloadFile(`/api/fundraisings/${campaign.id}/export.pdf`, 'arrecadacao.pdf')}>PDF</Button><Can permission="fundraising.write"><ConfirmButton title="Excluir arrecadação" description="A campanha, os participantes e os lançamentos serão removidos." confirmLabel="Excluir" danger onConfirm={async () => { try { await api(`/api/fundraisings/${campaign.id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['fundraisings'] }); toast.success('Arrecadação excluída.'); navigate('/arrecadacoes') } catch (error) { toast.error(error instanceof ApiError ? error.message : 'Não foi possível excluir a arrecadação.') } }}><Button variant="outline" type="button">Excluir</Button></ConfirmButton></Can></>} />
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Entradas" value={formatMoney(campaign.totals.income)} />
            <Metric label="Saídas" value={formatMoney(campaign.totals.expense)} />
            <Metric label="Saldo" value={formatMoney(campaign.totals.balance)} />
            <Metric label="Coroinhas participantes" value={String(campaign.totals.participantCount)} />
          </div>
          {campaign.totals.goalAmount ? <p className="mb-4 text-sm text-muted">Meta {formatMoney(campaign.totals.goalAmount)} · {campaign.totals.goalPercent ?? 0}% do saldo</p> : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-4">
              <h2 className="font-display text-2xl">Participantes</h2>
              <Can permission="fundraising.write">
                <div className="mt-3 flex gap-2">
                  <div className="flex-1"><CoroinhaPicker value={person} onChange={setPerson} /></div>
                  <Button onClick={async () => {
                    if (!person) return
                    try {
                      await api(`/api/fundraisings/${campaign.id}/participants`, { method: 'POST', body: JSON.stringify({ coroinhaId: person.id }) })
                      setPerson(null)
                      await refresh()
                      toast.success('Participante adicionado.')
                    } catch (error) {
                      toast.error(error instanceof ApiError ? error.message : 'Não foi possível adicionar.')
                    }
                  }}>Adicionar</Button>
                </div>
              </Can>
              <ul className="mt-3 divide-y divide-line">
                {campaign.participants.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{item.coroinhaName}</span>
                    <Can permission="fundraising.write"><button className="text-muted" onClick={async () => { await api(`/api/fundraisings/${campaign.id}/participants/${item.coroinhaId}`, { method: 'DELETE' }); await refresh() }}>Remover</button></Can>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl">Lançamentos</h2>
                <Can permission="fundraising.write"><Button size="sm" onClick={() => setOpen(true)}>Novo lançamento</Button></Can>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {campaign.transactions.map((item) => (
                  <li key={item.id} className="py-2 text-sm">
                    <span className="font-semibold">{TRANSACTION_LABELS[item.type]} · {formatMoney(item.amount)}</span>
                    <span className="block text-muted">{formatDate(item.date)} · {item.description} · {item.recordedBy}</span>
                  </li>
                ))}
              </ul>
              {campaign.revisions.length ? <p className="mt-3 text-xs text-muted">{campaign.revisions.length} correções registradas no histórico.</p> : null}
            </Panel>
          </div>
          <TransactionDialog id={campaign.id} open={open} onOpenChange={setOpen} onSaved={refresh} />
        </div>
      ) : null}
    </QueryBoundary>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Panel className="p-4"><p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p><p className="font-display mt-1 text-2xl">{value}</p></Panel>
}

function TransactionDialog({ id, open, onOpenChange, onSaved }: { id: string; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const form = useForm<{ type: TransactionType; amount: string; date: string; description: string; addParticipant: boolean }>({
    resolver: zodResolver(transactionSchema) as unknown as Resolver<{ type: TransactionType; amount: string; date: string; description: string; addParticipant: boolean }>,
    defaultValues: { type: 'INCOME', amount: '', date: todayInput(), description: '', addParticipant: false },
  })
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Lançamento" description="Entradas e saídas ficam vinculadas somente a esta arrecadação.">
        <form className="grid gap-3" onSubmit={form.handleSubmit(async (values) => {
          try {
            await api(`/api/fundraisings/${id}/transactions`, { method: 'POST', body: JSON.stringify({ ...values, coroinhaId: person?.id ?? null }) })
            toast.success('Lançamento registrado.')
            onOpenChange(false)
            onSaved()
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : 'Não foi possível lançar.')
          }
        })}>
          <Field label="Tipo"><Select {...form.register('type')}><option value="INCOME">Entrada</option><option value="EXPENSE">Saída</option></Select></Field>
          <Field label="Valor" error={form.formState.errors.amount?.message}><Input {...form.register('amount')} /></Field>
          <Field label="Data" error={form.formState.errors.date?.message}><Input type="date" {...form.register('date')} /></Field>
          <Field label="Descrição" error={form.formState.errors.description?.message}><Input {...form.register('description')} /></Field>
          <Field label="Coroinha, se a contribuição for individual"><CoroinhaPicker value={person} onChange={setPerson} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...form.register('addParticipant')} /> Contar também como participante</label>
          <Button type="submit">Registrar</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
