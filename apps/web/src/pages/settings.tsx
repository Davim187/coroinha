import type { AuditView, SettingsView } from '@coroinha/contracts'
import { settingsSchema } from '@coroinha/validators'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Resolver } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Forbidden, Field, PageHeader, Panel, QueryBoundary } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth'
import { api, ApiError } from '@/lib/api'

const actions: Record<string, string> = {
  'auth.login': 'Entrou no sistema',
  'auth.password': 'Alterou a própria senha',
  'user.create': 'Criou um usuário',
  'user.update': 'Atualizou um usuário',
  'user.password': 'Redefiniu uma senha',
  'coroinha.create': 'Cadastrou um coroinha',
  'coroinha.update': 'Atualizou um coroinha',
  'coroinha.archive': 'Arquivou um coroinha',
  'coroinha.restore': 'Restaurou um coroinha',
  'scale.create': 'Criou uma celebração',
  'scale.update': 'Atualizou uma celebração',
  'scale.assign': 'Alterou uma escala',
  'scale.publish': 'Publicou uma escala',
  'scale.complete': 'Concluiu uma escala',
  'scale.reopen': 'Reabriu uma escala',
  'scale.duplicate': 'Duplicou uma escala',
  'scale.delete': 'Excluiu uma escala',
  'attendance.save': 'Registrou presenças',
  'raffle.create': 'Criou uma rifa',
  'raffle.split': 'Desfez os blocos em miniblocos',
  'raffle.batch': 'Acrescentou blocos novos na rifa',
  'raffle.update': 'Atualizou uma rifa',
  'raffle.block': 'Alterou um bloco de rifa',
  'raffle.assign': 'Atrelou um minibloco a um coroinha',
  'raffle.return': 'Registrou devolução de rifa',
  'raffle.delete': 'Excluiu uma rifa',
  'fundraising.create': 'Criou uma arrecadação',
  'fundraising.update': 'Atualizou uma arrecadação',
  'fundraising.transaction': 'Registrou movimento financeiro',
  'fundraising.delete': 'Excluiu uma arrecadação',
  'meeting.create': 'Agendou uma reunião',
  'meeting.update': 'Atualizou uma reunião',
  'meeting.cancel': 'Cancelou uma reunião',
  'meeting.delete': 'Excluiu uma reunião',
  'meeting.attendance': 'Registrou presença de reunião',
  'report.attendance.email': 'Enviou o relatório mensal de presença',
  'settings.update': 'Alterou as configurações',
}

export function SettingsPage() {
  const { user } = useAuth()
  const client = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsView>('/api/settings') })
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api<{ items: AuditView[] }>('/api/audit'), enabled: user?.role === 'ADMIN' })
  const form = useForm<SettingsView>({
    resolver: zodResolver(settingsSchema) as Resolver<SettingsView>,
    values: settings.data,
  })
  if (user && user.role !== 'ADMIN') return <Forbidden />
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Configurações" description="Nome da pastoral e critérios usados nos alertas das escalas." />
      <QueryBoundary isLoading={settings.isLoading} isError={settings.isError} error={settings.error} refetch={() => settings.refetch()}>
        <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => {
          try {
            await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ ...values, celebrationDurationMinutes: Number(values.celebrationDurationMinutes), balanceWindowDays: Number(values.balanceWindowDays) }) })
            await client.invalidateQueries({ queryKey: ['settings'] })
            toast.success('Configurações salvas.')
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
          }
        })}>
          <Panel className="grid gap-4 p-5">
            <Field label="Nome da pastoral" error={form.formState.errors.parishName?.message}><Input {...form.register('parishName')} /></Field>
            <Field label="Duração da celebração para conflito de horário (minutos)" error={form.formState.errors.celebrationDurationMinutes?.message}><Input type="number" {...form.register('celebrationDurationMinutes', { valueAsNumber: true })} /></Field>
            <Field label="Janela da distribuição equilibrada (dias)" error={form.formState.errors.balanceWindowDays?.message}><Input type="number" {...form.register('balanceWindowDays', { valueAsNumber: true })} /></Field>
          </Panel>
          <Button type="submit">Salvar configurações</Button>
        </form>
      </QueryBoundary>
      <h2 className="font-display mt-8 mb-3 text-2xl">Ações recentes</h2>
      <Panel>
        <ul className="divide-y divide-line">
          {audit.data?.items.map((item) => (
            <li key={item.id} className="px-4 py-3 text-sm">
              <span className="font-semibold">{actions[item.action] ?? item.action}</span>
              <span className="block text-muted">{item.userName ?? 'Sistema'} · {new Date(item.createdAt).toLocaleString('pt-BR')}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
