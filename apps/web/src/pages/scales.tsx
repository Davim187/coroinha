import type { CelebrationDetail, CelebrationSummary, LiturgicalRole, Paginated } from '@coroinha/contracts'
import { LITURGICAL_ROLES, ROLE_GROUPS, ROLE_LABELS, SCALE_STATUS_LABELS } from '@coroinha/contracts'
import { celebrationBodySchema, duplicateScaleSchema } from '@coroinha/validators'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Resolver } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Can, ConfirmButton, CoroinhaPicker, EmptyState, Field, PageHeader, Panel, Pager, QueryBoundary, SearchBox, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/input'
import { api, ApiError, downloadFile } from '@/lib/api'
import { formatDate, todayInput } from '@/lib/format'

type Slot = { coroinhaId: string; name: string; overrideReason: string } | null

export function ScalesPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const when = params.get('when') ?? 'upcoming'
  const pending = params.get('pending') ?? ''
  const page = Number(params.get('page') ?? 1)
  const query = useQuery({
    queryKey: ['celebrations', q, status, when, pending, page],
    queryFn: () =>
      api<Paginated<CelebrationSummary>>(
        `/api/celebrations?q=${encodeURIComponent(q)}&status=${status}&when=${when}&pending=${pending}&page=${page}&pageSize=20`,
      ),
  })
  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)))
    if (!('page' in next)) merged.delete('page')
    setParams(merged)
  }
  return (
    <div>
      <PageHeader
        title="Escalas"
        description="Monte as funções de cada celebração e acompanhe o que ainda falta preencher."
        actions={<Can permission="scales.write"><Button asChild><Link to="/escalas/nova">Nova celebração</Link></Button></Can>}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchBox value={q} onChange={(value) => update({ q: value })} placeholder="Pesquisar celebração" />
        <Select className="sm:w-40" value={when} onChange={(event) => update({ when: event.target.value })}>
          <option value="upcoming">Próximas</option>
          <option value="past">Realizadas</option>
          <option value="all">Todas</option>
        </Select>
        <Select className="sm:w-44" value={status} onChange={(event) => update({ status: event.target.value })}>
          <option value="">Todas as situações</option>
          <option value="DRAFT">Em preparação</option>
          <option value="PUBLISHED">Publicadas</option>
          <option value="COMPLETED">Concluídas</option>
        </Select>
        <Select className="sm:w-44" value={pending} onChange={(event) => update({ pending: event.target.value })}>
          <option value="">Completas e pendentes</option>
          <option value="1">Com funções pendentes</option>
        </Select>
      </div>
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        refetch={() => query.refetch()}
        isEmpty={!query.data?.items.length}
        empty={<EmptyState title="Nenhuma escala neste filtro" description="Crie uma celebração ou ajuste o período." />}
      >
        <div className="grid gap-3">
          {query.data?.items.map((item) => (
            <Link key={item.id} to={`/escalas/${item.id}`} className="rounded-2xl border border-line bg-white px-5 py-4 shadow-sm hover:border-gold-500">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-muted">{formatDate(item.date)} · {item.time}{item.location ? ` · ${item.location}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${item.filledRoles < item.requiredRoles ? 'text-gold-700' : 'text-emerald-800'}`}>
                    {item.filledRoles} de {item.requiredRoles} funções
                  </span>
                  <StatusBadge value={item.status} label={SCALE_STATUS_LABELS[item.status]} />
                </div>
              </div>
            </Link>
          ))}
        </div>
        <Pager page={page} total={query.data?.total ?? 0} pageSize={20} onPage={(next) => update({ page: String(next) })} />
      </QueryBoundary>
    </div>
  )
}

export function CelebrationFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useQuery({ queryKey: ['celebration', id], queryFn: () => api<CelebrationDetail>(`/api/celebrations/${id}`), enabled: Boolean(id) })
  const form = useForm<{ title: string; date: string; time: string; location: string; notes: string }>({
    resolver: zodResolver(celebrationBodySchema) as Resolver<{ title: string; date: string; time: string; location: string; notes: string }>,
    values: existing.data
      ? { title: existing.data.title, date: existing.data.date, time: existing.data.time, location: existing.data.location ?? '', notes: existing.data.notes ?? '' }
      : undefined,
    defaultValues: { title: '', date: todayInput(), time: '19:00', location: '', notes: '' },
  })
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={id ? 'Editar celebração' : 'Nova celebração'} description="A escala será criada em preparação, com as oito funções disponíveis." />
      <form
        className="grid gap-4"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            const saved = await api<CelebrationDetail>(id ? `/api/celebrations/${id}` : '/api/celebrations', {
              method: id ? 'PATCH' : 'POST',
              body: JSON.stringify(values),
            })
            toast.success('Celebração salva.')
            navigate(`/escalas/${saved.id}`)
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
          }
        })}
      >
        <Panel className="grid gap-4 p-5">
          <Field label="Nome ou tipo" error={form.formState.errors.title?.message}><Input {...form.register('title')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data" error={form.formState.errors.date?.message}><Input type="date" {...form.register('date')} /></Field>
            <Field label="Horário" error={form.formState.errors.time?.message}><Input type="time" {...form.register('time')} /></Field>
          </div>
          <Field label="Local" error={form.formState.errors.location?.message}><Input {...form.register('location')} /></Field>
          <Field label="Observações" error={form.formState.errors.notes?.message}><Textarea {...form.register('notes')} /></Field>
        </Panel>
        <Button type="submit">Salvar celebração</Button>
      </form>
    </div>
  )
}

export function ScaleBuilderPage() {
  const { id } = useParams()
  const query = useQuery({ queryKey: ['celebration', id], queryFn: () => api<CelebrationDetail>(`/api/celebrations/${id}`) })
  return (
    <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()}>
      {query.data ? <Builder celebration={query.data} /> : null}
    </QueryBoundary>
  )
}

function Builder({ celebration }: { celebration: CelebrationDetail }) {
  const client = useQueryClient()
  const [slots, setSlots] = useState<Record<string, Slot>>(() => {
    const initial: Record<string, Slot> = {}
    for (const role of LITURGICAL_ROLES) {
      const found = celebration.assignments.find((item) => item.role === role)
      initial[role] = found ? { coroinhaId: found.coroinhaId, name: found.coroinhaName, overrideReason: found.overrideReason ?? '' } : null
    }
    return initial
  })
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [proposals, setProposals] = useState<{ role: LiturgicalRole; coroinhaId: string; coroinhaName: string; warnings: string[] }[]>([])
  const enabled = celebration.roles.filter((role) => role.enabled)
  const filled = enabled.filter((role) => slots[role.role]?.coroinhaId).length
  const payload = useMemo(
    () =>
      enabled
        .filter((role) => slots[role.role]?.coroinhaId)
        .map((role) => ({
          role: role.role,
          coroinhaId: slots[role.role]!.coroinhaId,
          overrideReason: slots[role.role]?.overrideReason || null,
        })),
    [enabled, slots],
  )

  async function save() {
    const saved = await api<CelebrationDetail>(`/api/celebrations/${celebration.id}/assignments`, {
      method: 'PUT',
      body: JSON.stringify({ assignments: payload }),
    })
    await client.invalidateQueries({ queryKey: ['celebration', celebration.id] })
    return saved
  }

  async function run(action: () => Promise<void>, success: string) {
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível concluir.')
    }
  }

  return (
    <div>
      <PageHeader
        title={celebration.title}
        description={`${formatDate(celebration.date)} · ${celebration.time}${celebration.location ? ` · ${celebration.location}` : ''}`}
        actions={
          <Can permission="scales.write">
            <Button variant="outline" asChild><Link to={`/escalas/${celebration.id}/editar`}>Dados</Link></Button>
            <Button variant="outline" onClick={() => downloadFile(`/api/celebrations/${celebration.id}/export.csv`, `escala-${celebration.date}.csv`)}>CSV</Button>
            <Button variant="outline" onClick={() => downloadFile(`/api/celebrations/${celebration.id}/export.pdf`, `escala-${celebration.date}.pdf`)}>PDF</Button>
            <Button variant="outline" asChild><Link to={`/imprimir/escalas/${celebration.id}`} target="_blank">Imprimir</Link></Button>
          </Can>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge value={celebration.status} label={SCALE_STATUS_LABELS[celebration.status]} />
        <span className="text-sm font-semibold text-navy-900">{filled} de {enabled.length} funções preenchidas</span>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-gold-500" style={{ width: `${enabled.length ? (filled / enabled.length) * 100 : 0}%` }} />
        </div>
      </div>
      {celebration.balanceAlerts.length ? (
        <Panel className="mb-4 border-gold-500/50 bg-gold-100 p-4 text-sm text-gold-700">
          {celebration.balanceAlerts.map((alert) => <p key={alert}>{alert}</p>)}
        </Panel>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {celebration.roles.map((role) => (
          <button
            key={role.role}
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${role.enabled ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-muted'}`}
            onClick={() =>
              run(async () => {
                const roles = Object.fromEntries(celebration.roles.map((item) => [item.role, item.role === role.role ? !item.enabled : item.enabled]))
                await api(`/api/celebrations/${celebration.id}/roles`, { method: 'PATCH', body: JSON.stringify({ roles }) })
                await client.invalidateQueries({ queryKey: ['celebration', celebration.id] })
              }, role.enabled ? 'Função desativada.' : 'Função disponível.')
            }
          >
            {ROLE_LABELS[role.role]}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {ROLE_GROUPS.map((group) => (
          <Panel key={group.id} className="p-4">
            <h2 className="font-display mb-3 text-2xl">{group.title}</h2>
            <div className="grid gap-3">
              {group.roles.map((role) => {
                const setting = celebration.roles.find((item) => item.role === role)
                if (!setting?.enabled) return null
                const slot = slots[role]
                const warning = celebration.assignments.find((item) => item.role === role)?.warnings ?? []
                const repeated = payload.filter((item) => item.coroinhaId === slot?.coroinhaId).length > 1
                return (
                  <div key={role} className={`rounded-xl border p-3 ${slot ? 'border-line bg-paper' : 'border-dashed border-gold-500 bg-white'}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">{ROLE_LABELS[role]}</p>
                      <span className="text-xs text-muted">{slot ? 'Preenchida' : 'Pendente'}</span>
                    </div>
                    <CoroinhaPicker value={slot ? { id: slot.coroinhaId, name: slot.name } : null} onChange={(value) => setSlots((current) => ({ ...current, [role]: value ? { coroinhaId: value.id, name: value.name, overrideReason: current[role]?.overrideReason ?? '' } : null }))} />
                    {repeated ? (
                      <Input className="mt-2" placeholder="Justificativa para repetir o coroinha" value={slot?.overrideReason ?? ''} onChange={(event) => setSlots((current) => ({ ...current, [role]: current[role] ? { ...current[role], overrideReason: event.target.value } : null }))} />
                    ) : null}
                    {warning.map((item) => <p key={item} className="mt-2 text-xs text-gold-700">{item}</p>)}
                  </div>
                )
              })}
            </div>
          </Panel>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Can permission="scales.write">
          <Button onClick={() => run(async () => { await save() }, 'Escala salva.')}>Salvar rascunho</Button>
          <Button variant="outline" onClick={() => run(async () => {
            const result = await api<{ proposals: typeof proposals }>(`/api/celebrations/${celebration.id}/suggestions`)
            setProposals(result.proposals)
            setSuggestOpen(true)
          }, resultMessage(proposals))}>Sugerir distribuição</Button>
          <Button variant="gold" onClick={() => run(async () => { await save(); await api(`/api/celebrations/${celebration.id}/publish`, { method: 'POST' }); await client.invalidateQueries({ queryKey: ['celebration', celebration.id] }) }, 'Escala publicada.')}>Publicar</Button>
          {celebration.status === 'PUBLISHED' ? <Button variant="outline" onClick={() => run(async () => { await api(`/api/celebrations/${celebration.id}/complete`, { method: 'POST' }); await client.invalidateQueries({ queryKey: ['celebration', celebration.id] }) }, 'Escala concluída.')}>Concluir</Button> : null}
          {celebration.status === 'COMPLETED' ? <Button variant="outline" onClick={() => run(async () => { await api(`/api/celebrations/${celebration.id}/reopen`, { method: 'POST' }); await client.invalidateQueries({ queryKey: ['celebration', celebration.id] }) }, 'Escala reaberta.')}>Reabrir</Button> : null}
          <Button variant="outline" onClick={() => setDuplicateOpen(true)}>Duplicar</Button>
          {celebration.status !== 'DRAFT' ? <Button asChild><Link to={`/escalas/${celebration.id}/presenca`}>Registrar presença</Link></Button> : null}
          <ConfirmButton title="Excluir escala" description="A celebração, as funções preenchidas e as presenças serão removidas." confirmLabel="Excluir" danger onConfirm={() => run(async () => { await api(`/api/celebrations/${celebration.id}`, { method: 'DELETE' }); window.location.href = '/escalas' }, 'Escala excluída.')}>
            <Button variant="outline" type="button">Excluir</Button>
          </ConfirmButton>
        </Can>
      </div>
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent title="Sugestão de distribuição" description="A sugestão preenche apenas funções vazias. Nada é salvo até você confirmar e salvar.">
          {proposals.length === 0 ? <p className="text-sm text-muted">Não há funções vazias ou coroinhas disponíveis.</p> : (
            <ul className="grid gap-2">
              {proposals.map((item) => (
                <li key={item.role} className="rounded-xl bg-paper px-3 py-2 text-sm">
                  <strong>{ROLE_LABELS[item.role]}:</strong> {item.coroinhaName}
                  {item.warnings.map((warning) => <span key={warning} className="mt-1 block text-xs text-gold-700">{warning}</span>)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSuggestOpen(false)}>Agora não</Button>
            <Button onClick={() => {
              setSlots((current) => {
                const next = { ...current }
                for (const proposal of proposals) {
                  if (!next[proposal.role]) next[proposal.role] = { coroinhaId: proposal.coroinhaId, name: proposal.coroinhaName, overrideReason: '' }
                }
                return next
              })
              setSuggestOpen(false)
              toast.success('Sugestão aplicada ao rascunho. Revise antes de salvar.')
            }}>Aplicar nas funções vazias</Button>
          </div>
        </DialogContent>
      </Dialog>
      <DuplicateDialog id={celebration.id} open={duplicateOpen} onOpenChange={setDuplicateOpen} />
    </div>
  )
}

function resultMessage(proposals: unknown[]) {
  return proposals ? 'Sugestões carregadas.' : 'Sugestões carregadas.'
}

function DuplicateDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const form = useForm<{ date: string; time: string; copyAssignments: boolean }>({
    resolver: zodResolver(duplicateScaleSchema) as Resolver<{ date: string; time: string; copyAssignments: boolean }>,
    defaultValues: { date: todayInput(), time: '19:00', copyAssignments: false },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Duplicar escala" description="A nova escala nasce em preparação. Você escolhe se os nomes serão copiados.">
        <form
          className="grid gap-3"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const result = await api<{ celebration: CelebrationDetail; skipped: string[] }>(`/api/celebrations/${id}/duplicate`, {
                method: 'POST',
                body: JSON.stringify(values),
              })
              if (result.skipped.length) toast.message(`Alguns coroinhas não foram copiados: ${result.skipped.join(', ')}`)
              onOpenChange(false)
              navigate(`/escalas/${result.celebration.id}`)
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : 'Não foi possível duplicar.')
            }
          })}
        >
          <Field label="Nova data" error={form.formState.errors.date?.message}><Input type="date" {...form.register('date')} /></Field>
          <Field label="Novo horário" error={form.formState.errors.time?.message}><Input type="time" {...form.register('time')} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...form.register('copyAssignments')} /> Copiar os coroinhas escalados</label>
          <Button type="submit">Criar cópia</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
