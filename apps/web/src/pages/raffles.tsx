import type { Paginated, RaffleDetail, RaffleListItem } from '@coroinha/contracts'
import { BLOCK_STATUS_LABELS, RAFFLE_STATUS_LABELS } from '@coroinha/contracts'
import { raffleBatchSchema, raffleBlockSchema, raffleBodySchema } from '@coroinha/validators'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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

type CampaignForm = {
  name: string
  description: string
  prize: string
  unitPrice: string
  blockCount: number
  miniBlockSize: number
  firstNumber: number
  firstBlock: number
  startsAt: string
  endsAt: string
  drawAt: string
  goalAmount: string
  notes: string
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED'
}

export function RafflesPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? 1)
  const query = useQuery({
    queryKey: ['raffles', q, status, page],
    queryFn: () => api<Paginated<RaffleListItem>>(`/api/raffles?q=${encodeURIComponent(q)}&status=${status}&page=${page}`),
  })
  return (
    <div>
      <PageHeader title="Rifas" description="Blocos de 10 rifas, desfeitos em miniblocos e reunidos de novo no fim." actions={<Can permission="raffles.write"><Button asChild><Link to="/rifas/nova">Nova rifa</Link></Button></Can>} />
      <div className="mb-4 flex gap-2">
        <SearchBox value={q} onChange={(value) => setParams({ q: value, status })} placeholder="Pesquisar campanha" />
        <Select className="w-44" value={status} onChange={(event) => setParams({ q, status: event.target.value })}>
          <option value="">Todas</option>
          <option value="DRAFT">Rascunho</option>
          <option value="ACTIVE">Em andamento</option>
          <option value="CLOSED">Encerradas</option>
        </Select>
      </div>
      <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()} isEmpty={!query.data?.items.length} empty={<EmptyState title="Nenhuma rifa encontrada" description="Crie uma campanha para distribuir os blocos." />}>
        <div className="grid gap-3">
          {query.data?.items.map((item) => (
            <Link key={item.id} to={`/rifas/${item.id}`} className="rounded-2xl border border-line bg-white p-4 hover:border-gold-500">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted">{item.prize} · {formatDate(item.startsAt)} a {formatDate(item.endsAt)}</p>
                </div>
                <StatusBadge value={item.status} label={RAFFLE_STATUS_LABELS[item.status]} />
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-navy-900" style={{ width: `${Math.min(item.summary.completionPercent, 100)}%` }} /></div>
              <p className="mt-2 text-sm text-muted">{item.summary.sold} vendidos · {formatMoney(item.summary.receivedAmount)} recebidos · {formatMoney(item.summary.pendingAmount)} pendentes</p>
            </Link>
          ))}
        </div>
        <Pager page={page} total={query.data?.total ?? 0} pageSize={20} onPage={(next) => setParams({ q, status, page: String(next) })} />
      </QueryBoundary>
    </div>
  )
}

export function RaffleFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useQuery({ queryKey: ['raffle', id], queryFn: () => api<RaffleDetail>(`/api/raffles/${id}`), enabled: Boolean(id) })
  const form = useForm<CampaignForm>({
    resolver: zodResolver(raffleBodySchema) as unknown as Resolver<CampaignForm>,
    values: existing.data ? {
      name: existing.data.name,
      description: existing.data.description ?? '',
      prize: existing.data.prize,
      unitPrice: existing.data.unitPrice,
      blockCount: existing.data.blockCount,
      miniBlockSize: existing.data.miniBlockSize,
      firstNumber: existing.data.firstNumber,
      firstBlock: existing.data.firstBlock,
      startsAt: existing.data.startsAt,
      endsAt: existing.data.endsAt,
      drawAt: existing.data.drawAt ?? '',
      goalAmount: existing.data.summary.goalAmount ?? '',
      notes: existing.data.notes ?? '',
      status: existing.data.status,
    } : undefined,
    defaultValues: { name: '', description: '', prize: '', unitPrice: '', blockCount: 1, miniBlockSize: 5, firstNumber: 1, firstBlock: 1, startsAt: todayInput(), endsAt: todayInput(), drawAt: '', goalAmount: '', notes: '', status: 'DRAFT' },
  })
  const blockCount = Number(form.watch('blockCount'))
  const miniBlockSize = Number(form.watch('miniBlockSize'))
  const firstNumber = Number(form.watch('firstNumber'))
  const firstBlock = Number(form.watch('firstBlock'))
  const totalNumbers = Number.isInteger(blockCount) && blockCount > 0 ? blockCount * 10 : 0
  const miniCount = Number.isInteger(miniBlockSize) && miniBlockSize > 0 && totalNumbers > 0 ? Math.ceil(totalNumbers / miniBlockSize) : 0
  const lastNumber = Number.isInteger(firstNumber) && firstNumber > 0 && totalNumbers > 0 ? firstNumber + totalNumbers - 1 : 0
  const lastBlock = Number.isInteger(firstBlock) && firstBlock > 0 && blockCount > 0 ? firstBlock + blockCount - 1 : 0
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={id ? 'Editar rifa' : 'Nova rifa'} description="Cada bloco tem 10 rifas. Elas são desfeitas em miniblocos e, no fim, reunidas de novo." />
      <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => {
        const body = { ...values, blockCount: Number(values.blockCount), miniBlockSize: Number(values.miniBlockSize), firstNumber: Number(values.firstNumber), firstBlock: Number(values.firstBlock), drawAt: values.drawAt || null, goalAmount: values.goalAmount || null }
        try {
          const saved = await api<RaffleDetail>(id ? `/api/raffles/${id}` : '/api/raffles', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) })
          toast.success('Campanha salva.')
          navigate(`/rifas/${saved.id}`)
        } catch (error) {
          toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
        }
      })}>
        <Panel className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Nome" error={form.formState.errors.name?.message}><Input {...form.register('name')} /></Field>
          <Field label="Prêmio" error={form.formState.errors.prize?.message}><Input {...form.register('prize')} /></Field>
          <Field label="Valor do número" error={form.formState.errors.unitPrice?.message}><Input {...form.register('unitPrice')} placeholder="5,00" /></Field>
          <Field label="Quantidade de blocos" error={form.formState.errors.blockCount?.message}><Input type="number" min={1} {...form.register('blockCount', { valueAsNumber: true })} /></Field>
          <Field label="Rifas em cada minibloco" error={form.formState.errors.miniBlockSize?.message}><Input type="number" min={1} max={10} {...form.register('miniBlockSize', { valueAsNumber: true })} /></Field>
          <Field label="Numeração inicial" error={form.formState.errors.firstNumber?.message}><Input type="number" min={1} {...form.register('firstNumber', { valueAsNumber: true })} /></Field>
          <Field label="Bloco inicial" error={form.formState.errors.firstBlock?.message}><Input type="number" min={1} {...form.register('firstBlock', { valueAsNumber: true })} /></Field>
          <p className="text-sm text-muted md:col-span-2">{totalNumbers > 0 && miniCount > 0 && lastNumber > 0 && lastBlock > 0 ? `${blockCount} ${blockCount === 1 ? 'bloco' : 'blocos'} de 10 rifas, do bloco ${firstBlock} ao ${lastBlock}, numerados de ${firstNumber} a ${lastNumber}. O bloco ${firstBlock} começa no ${firstNumber}. A divisão gera ${miniCount} ${miniCount === 1 ? 'minibloco' : 'miniblocos'} de até ${miniBlockSize} rifas.` : 'Informe os blocos, o minibloco, o número inicial e o bloco inicial.'}</p>
          <Field label="Início" error={form.formState.errors.startsAt?.message}><Input type="date" {...form.register('startsAt')} /></Field>
          <Field label="Encerramento" error={form.formState.errors.endsAt?.message}><Input type="date" {...form.register('endsAt')} /></Field>
          <Field label="Sorteio" error={form.formState.errors.drawAt?.message}><Input type="date" {...form.register('drawAt')} /></Field>
          <Field label="Meta" error={form.formState.errors.goalAmount?.message}><Input {...form.register('goalAmount')} placeholder="Opcional" /></Field>
          <Field label="Situação" error={form.formState.errors.status?.message}>
            <Select {...form.register('status')}><option value="DRAFT">Rascunho</option><option value="ACTIVE">Em andamento</option><option value="CLOSED">Encerrada</option></Select>
          </Field>
          <div className="md:col-span-2"><Field label="Descrição" error={form.formState.errors.description?.message}><Textarea {...form.register('description')} /></Field></div>
          <div className="md:col-span-2"><Field label="Observações" error={form.formState.errors.notes?.message}><Textarea {...form.register('notes')} /></Field></div>
        </Panel>
        <Button type="submit">Salvar campanha</Button>
      </form>
    </div>
  )
}

export function RaffleDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['raffle', id], queryFn: () => api<RaffleDetail>(`/api/raffles/${id}`) })
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const campaign = query.data
  return (
    <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()}>
      {campaign ? (
        <div>
          <PageHeader title={campaign.name} description={campaign.prize} actions={<><Button variant="outline" asChild><Link to={`/rifas/${campaign.id}/editar`}>Editar</Link></Button><Button variant="outline" onClick={() => downloadFile(`/api/raffles/${campaign.id}/export.csv`, 'rifa.csv')}>CSV</Button><Button variant="outline" onClick={() => downloadFile(`/api/raffles/${campaign.id}/export.pdf`, 'prestacao-de-contas.pdf').catch((error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível gerar a prestação de contas.'))}>Prestação de contas</Button><Can permission="raffles.write"><ConfirmButton title="Excluir rifa" description="A campanha, os miniblocos e a prestação de contas serão removidos." confirmLabel="Excluir" danger onConfirm={async () => { try { await api(`/api/raffles/${campaign.id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['raffles'] }); toast.success('Rifa excluída.'); navigate('/rifas') } catch (error) { toast.error(error instanceof ApiError ? error.message : 'Não foi possível excluir a rifa.') } }}><Button variant="outline" type="button">Excluir</Button></ConfirmButton></Can></>} />
          <div className="mb-4 flex items-center gap-3"><StatusBadge value={campaign.status} label={RAFFLE_STATUS_LABELS[campaign.status]} /><span className="text-sm">{campaign.summary.completionPercent}% vendido</span></div>
          <div className="mb-4 h-3 overflow-hidden rounded-full bg-line"><div className="h-full bg-gold-500" style={{ width: `${Math.min(campaign.summary.completionPercent, 100)}%` }} /></div>
          <div className="mb-4 grid gap-1">
            {campaign.batches.map((batch) => (
              <p key={batch.id} className="text-sm text-muted">
                {batch.blockCount} {batch.blockCount === 1 ? 'bloco' : 'blocos'} de 10 rifas, do bloco {batch.firstBlock} ao {batch.firstBlock + batch.blockCount - 1}, números {batch.firstNumber} a {batch.firstNumber + batch.totalNumbers - 1}. Cada pessoa leva até {batch.miniBlockSize} {batch.miniBlockSize === 1 ? 'rifa' : 'rifas'}.
              </p>
            ))}
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Vendidos" value={`${campaign.summary.sold} / ${campaign.totalNumbers}`} />
            <Metric label="Disponíveis" value={String(campaign.summary.available)} />
            <Metric label="Recebido" value={formatMoney(campaign.summary.receivedAmount)} />
            <Metric label="Pendente" value={formatMoney(campaign.summary.pendingAmount)} />
          </div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Miniblocos</h2>
            <Can permission="raffles.write">
              <div className="flex gap-2">
                {campaign.blocks.length === 0 ? <Button onClick={async () => {
                  try {
                    await api(`/api/raffles/${campaign.id}/split`, { method: 'POST' })
                    await client.invalidateQueries({ queryKey: ['raffle', id] })
                    toast.success('Blocos desfeitos em miniblocos.')
                  } catch (error) {
                    toast.error(error instanceof ApiError ? error.message : 'Não foi possível dividir os blocos.')
                  }
                }}>Desfazer e dividir</Button> : campaign.status !== 'CLOSED' ? <Button onClick={() => setAdding(true)}>Adicionar blocos novos</Button> : null}
                {campaign.blocks.length > 0 && campaign.summary.available > 0 ? <Button variant="outline" onClick={() => { setEditing(null); setOpen(true) }}>Atribuir minibloco</Button> : null}
              </div>
            </Can>
          </div>
          {campaign.blocks.length === 0 ? (
            <div className="grid gap-3">
              <EmptyState title="Os blocos ainda estão inteiros" description="Desfaça os blocos de 10 para distribuir a numeração nos miniblocos." />
              <Panel>
                <ul className="divide-y divide-line">
                  {campaign.plannedMiniBlocks.map((block) => (
                    <li key={block.label} className="px-5 py-3">
                      <p className="font-semibold">{block.label} · números {numberRange(block.startNumber, block.endNumber)}</p>
                      <p className="text-sm text-muted">{originalBlockLabel(block.originalBlockStart, block.originalBlockEnd)} · {block.quantity} rifas</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : (
            <Panel>
              <ul className="divide-y divide-line">
                {campaign.blocks.map((block) => (
                  <li key={block.id} className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <p className="font-semibold">{block.label} · números {numberRange(block.startNumber, block.endNumber)}</p>
                      <p className="text-sm text-muted">{originalBlockLabel(block.originalBlockStart, block.originalBlockEnd)} · {block.coroinhaId ? block.participantName : 'Sem coroinha'}</p>
                      <Can permission="raffles.write">
                        <div className="mt-2 max-w-sm">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Coroinha</p>
                          <CoroinhaPicker
                            value={block.coroinhaId ? { id: block.coroinhaId, name: block.participantName } : null}
                            onChange={(person) => {
                              void api(`/api/raffles/${campaign.id}/blocks/${block.id}/assign`, { method: 'POST', body: JSON.stringify({ coroinhaId: person?.id ?? null }) })
                                .then(async () => {
                                  toast.success(person ? `Minibloco atrelado a ${person.name}.` : 'Coroinha removido do minibloco.')
                                  await client.invalidateQueries({ queryKey: ['raffle', id] })
                                })
                                .catch((error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível atrelar o coroinha.'))
                            }}
                          />
                        </div>
                      </Can>
                      <p className="mt-2 text-sm text-muted">{block.soldQuantity} vendidos · {block.unsoldQuantity} não vendidos · {formatMoney(block.amountReceived)} recebidos · {formatMoney(block.pendingAmount)} pendentes</p>
                      <div className="mt-2"><StatusBadge value={block.status} label={BLOCK_STATUS_LABELS[block.status]} /></div>
                    </div>
                    <Can permission="raffles.write">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setEditing(block.id); setOpen(true) }}>Corrigir</Button>
                        {!block.unsoldReturned ? <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            await api(`/api/raffles/${campaign.id}/blocks/${block.id}/return`, { method: 'POST', body: JSON.stringify({ correctionNote: 'Devolução dos números não vendidos' }) })
                            await client.invalidateQueries({ queryKey: ['raffle', id] })
                            toast.success('Devolução registrada.')
                          } catch (error) {
                            toast.error(error instanceof ApiError ? error.message : 'Não foi possível devolver.')
                          }
                        }}>Devolver não vendidos</Button> : null}
                      </div>
                    </Can>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <h2 className="font-display mt-8 mb-3 text-2xl">Prestação de contas</h2>
          <p className="mb-3 text-sm text-muted">Cada coroinha responde pelos miniblocos atrelados a ele: rifas vendidas, valor esperado e valor já recebido.</p>
          {campaign.accountability.lines.length === 0 ? <EmptyState title="Nada para prestar contas" description="Divida os blocos e atrele cada minibloco a um coroinha." /> : (
            <Panel className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="px-4 py-3 font-semibold">Coroinha</th>
                    <th className="px-4 py-3 font-semibold">Miniblocos</th>
                    <th className="px-4 py-3 font-semibold">Vendidos</th>
                    <th className="px-4 py-3 font-semibold">Não vendidos</th>
                    <th className="px-4 py-3 font-semibold">Esperado</th>
                    <th className="px-4 py-3 font-semibold">Recebido</th>
                    <th className="px-4 py-3 font-semibold">Pendente</th>
                  </tr>
                </thead>
                <tbody>
                  {campaign.accountability.lines.map((line) => (
                    <tr key={line.coroinhaId ?? 'sem-coroinha'} className="border-b border-line align-top">
                      <td className="px-4 py-3 font-semibold">{line.name}</td>
                      <td className="px-4 py-3">{line.blocks.map((item) => `${item.label} (${numberRange(item.startNumber, item.endNumber)})`).join(', ')}</td>
                      <td className="px-4 py-3">{line.soldQuantity}</td>
                      <td className="px-4 py-3">{line.unsoldQuantity}</td>
                      <td className="px-4 py-3">{formatMoney(line.expectedAmount)}</td>
                      <td className="px-4 py-3">{formatMoney(line.receivedAmount)}</td>
                      <td className="px-4 py-3">{formatMoney(line.pendingAmount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-4 py-3 font-semibold">Total</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 font-semibold">{campaign.accountability.soldQuantity}</td>
                    <td className="px-4 py-3 font-semibold">{campaign.accountability.unsoldQuantity}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(campaign.accountability.expectedAmount)}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(campaign.accountability.receivedAmount)}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(campaign.accountability.pendingAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </Panel>
          )}
          <h2 className="font-display mt-8 mb-3 text-2xl">Blocos reunidos</h2>
          <p className="mb-3 text-sm text-muted">As rifas dos miniblocos, na ordem da numeração, voltam a preencher os blocos originais de 10.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {campaign.joinedBlocks.map((block) => (
              <Panel key={block.label} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{block.label}</p>
                    <p className="text-sm text-muted">Começa no {block.startNumber} · números {numberRange(block.startNumber, block.endNumber)}</p>
                  </div>
                  <StatusBadge value={block.status} label={BLOCK_STATUS_LABELS[block.status]} />
                </div>
                <p className="mt-2 text-sm text-muted">{block.soldQuantity} vendidos · {block.unsoldQuantity} não vendidos · {formatMoney(block.amountReceived)} recebidos</p>
              </Panel>
            ))}
          </div>
          <BlockDialog campaign={campaign} blockId={editing} open={open} onOpenChange={setOpen} onSaved={() => client.invalidateQueries({ queryKey: ['raffle', id] })} />
          <AddBlocksDialog campaign={campaign} open={adding} onOpenChange={setAdding} onSaved={() => client.invalidateQueries({ queryKey: ['raffle', id] })} />
        </div>
      ) : null}
    </QueryBoundary>
  )
}

function numberRange(start: number, end: number) {
  return start === end ? String(start) : `${start} a ${end}`
}

function originalBlockLabel(start: number, end: number) {
  return start === end ? `Bloco original ${start}` : `Blocos originais ${start} a ${end}`
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Panel className="p-4"><p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p><p className="font-display mt-1 text-2xl">{value}</p></Panel>
}

function AddBlocksDialog({ campaign, open, onOpenChange, onSaved }: { campaign: RaffleDetail; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const last = campaign.batches[campaign.batches.length - 1]
  const form = useForm<{ blockCount: number; miniBlockSize: number; firstNumber: number; firstBlock: number }>({
    resolver: zodResolver(raffleBatchSchema) as Resolver<{ blockCount: number; miniBlockSize: number; firstNumber: number; firstBlock: number }>,
    defaultValues: { blockCount: 1, miniBlockSize: last?.miniBlockSize ?? campaign.miniBlockSize, firstNumber: 1, firstBlock: 1 },
  })
  useEffect(() => {
    if (!open || !last) return
    form.reset({
      blockCount: 1,
      miniBlockSize: last.miniBlockSize,
      firstNumber: last.firstNumber + last.totalNumbers,
      firstBlock: last.firstBlock + last.blockCount,
    })
  }, [open, last, form])
  const blockCount = Number(form.watch('blockCount'))
  const miniBlockSize = Number(form.watch('miniBlockSize'))
  const firstNumber = Number(form.watch('firstNumber'))
  const firstBlock = Number(form.watch('firstBlock'))
  const totalNumbers = Number.isInteger(blockCount) && blockCount > 0 ? blockCount * 10 : 0
  const lastNumber = Number.isInteger(firstNumber) && firstNumber > 0 && totalNumbers > 0 ? firstNumber + totalNumbers - 1 : 0
  const lastBlock = Number.isInteger(firstBlock) && firstBlock > 0 && blockCount > 0 ? firstBlock + blockCount - 1 : 0
  const miniCount = Number.isInteger(miniBlockSize) && miniBlockSize > 0 && totalNumbers > 0 ? Math.ceil(totalNumbers / miniBlockSize) : 0
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Adicionar blocos novos" description="Os miniblocos já distribuídos permanecem. Este lote entra com o bloco e a numeração que você pegou.">
        <form className="grid gap-3" onSubmit={form.handleSubmit(async (values) => {
          try {
            await api(`/api/raffles/${campaign.id}/batches`, { method: 'POST', body: JSON.stringify({ blockCount: Number(values.blockCount), miniBlockSize: Number(values.miniBlockSize), firstNumber: Number(values.firstNumber), firstBlock: Number(values.firstBlock) }) })
            toast.success('Blocos novos acrescentados.')
            onOpenChange(false)
            onSaved()
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : 'Não foi possível acrescentar os blocos.')
          }
        })}>
          <Field label="Quantidade de blocos" error={form.formState.errors.blockCount?.message}><Input type="number" min={1} {...form.register('blockCount', { valueAsNumber: true })} /></Field>
          <Field label="Rifas para cada pessoa" error={form.formState.errors.miniBlockSize?.message}><Input type="number" min={1} max={10} {...form.register('miniBlockSize', { valueAsNumber: true })} /></Field>
          <Field label="Bloco inicial" error={form.formState.errors.firstBlock?.message}><Input type="number" min={1} {...form.register('firstBlock', { valueAsNumber: true })} /></Field>
          <Field label="Numeração inicial" error={form.formState.errors.firstNumber?.message}><Input type="number" min={1} {...form.register('firstNumber', { valueAsNumber: true })} /></Field>
          <p className="text-sm text-muted">{totalNumbers > 0 && miniCount > 0 && lastNumber > 0 && lastBlock > 0 ? `${blockCount} ${blockCount === 1 ? 'bloco' : 'blocos'}, do bloco ${firstBlock} ao ${lastBlock}, números ${firstNumber} a ${lastNumber}. A divisão gera ${miniCount} ${miniCount === 1 ? 'minibloco' : 'miniblocos'} de até ${miniBlockSize} rifas.` : 'Informe os blocos, quantas rifas cada pessoa leva, o bloco inicial e o número inicial.'}</p>
          <Button type="submit">Acrescentar blocos</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BlockDialog({ campaign, blockId, open, onOpenChange, onSaved }: { campaign: RaffleDetail; blockId: string | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const block = campaign.blocks.find((item) => item.id === blockId)
  const form = useForm({
    resolver: zodResolver(raffleBlockSchema) as Resolver<{ label: string; participantName: string; quantity: number; soldQuantity: number; unsoldQuantity: number; amountReceived: string; notes: string; correctionNote: string; coroinhaId: string | null }>,
    values: block ? { label: block.label, participantName: block.participantName, quantity: block.quantity, soldQuantity: block.soldQuantity, unsoldQuantity: block.unsoldQuantity, amountReceived: block.amountReceived, notes: block.notes ?? '', correctionNote: '', coroinhaId: block.coroinhaId } : undefined,
    defaultValues: { label: '', participantName: '', quantity: campaign.miniBlockSize, soldQuantity: 0, unsoldQuantity: 0, amountReceived: '0', notes: '', correctionNote: '', coroinhaId: null as string | null },
  })
  const [person, setPerson] = useState<{ id: string; name: string } | null>(block?.coroinhaId ? { id: block.coroinhaId, name: block.participantName } : null)
  useEffect(() => {
    setPerson(block?.coroinhaId ? { id: block.coroinhaId, name: block.participantName } : null)
  }, [block?.id, block?.coroinhaId, block?.participantName])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={block ? 'Corrigir minibloco' : 'Atribuir minibloco'} description={`Cada minibloco tem ${campaign.miniBlockSize} rifas. A soma de vendidos e não vendidos não pode passar dessa quantidade.`}>
        <form className="grid gap-3" onSubmit={form.handleSubmit(async (values) => {
          const body = { ...values, quantity: Number(values.quantity), soldQuantity: Number(values.soldQuantity), unsoldQuantity: Number(values.unsoldQuantity), coroinhaId: person?.id || null, participantName: person?.name || values.participantName }
          try {
            await api(block ? `/api/raffles/${campaign.id}/blocks/${block.id}` : `/api/raffles/${campaign.id}/blocks`, { method: block ? 'PATCH' : 'POST', body: JSON.stringify(body) })
            toast.success(block ? 'Bloco atualizado.' : 'Bloco atribuído.')
            onOpenChange(false)
            onSaved()
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar o bloco.')
          }
        })}>
          <Field label="Identificação" error={form.formState.errors.label?.message}><Input {...form.register('label')} /></Field>
          <Field label="Coroinha responsável"><CoroinhaPicker value={person?.id ? person : null} onChange={(value) => { setPerson(value); if (value) form.setValue('participantName', value.name) }} /></Field>
          <Field label="Nome do responsável" error={form.formState.errors.participantName?.message}><Input {...form.register('participantName')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantidade" error={form.formState.errors.quantity?.message}><Input type="number" {...form.register('quantity', { valueAsNumber: true })} /></Field>
            <Field label="Vendidos" error={form.formState.errors.soldQuantity?.message}><Input type="number" {...form.register('soldQuantity', { valueAsNumber: true })} /></Field>
            <Field label="Não vendidos" error={form.formState.errors.unsoldQuantity?.message}><Input type="number" {...form.register('unsoldQuantity', { valueAsNumber: true })} /></Field>
            <Field label="Valor recebido" error={form.formState.errors.amountReceived?.message}><Input {...form.register('amountReceived')} /></Field>
          </div>
          <Field label="Observação da correção" error={form.formState.errors.correctionNote?.message}><Input {...form.register('correctionNote')} /></Field>
          <Button type="submit">Salvar bloco</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
