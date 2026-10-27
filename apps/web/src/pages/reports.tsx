import { hasPermission, type Permission } from '@coroinha/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Forbidden, PageHeader, Panel } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth'
import { api, ApiError, downloadFile } from '@/lib/api'
import { currentMonth, shiftMonth } from '@/lib/format'

const reports: { title: string; path: string; permission: Permission; description: string }[] = [
  { title: 'Coroinhas', path: '/api/reports/coroinhas', permission: 'coroinhas.read', description: 'Lista de ativos e inativos, inclusive arquivados.' },
  { title: 'Escalas', path: '/api/reports/escalas', permission: 'scales.read', description: 'Funções e nomes por período.' },
  { title: 'Presenças', path: '/api/reports/presencas', permission: 'scales.read', description: 'Histórico de presença nas celebrações.' },
  { title: 'Rifas', path: '/api/reports/rifas', permission: 'raffles.read', description: 'Resumo das campanhas e valores recebidos.' },
  { title: 'Arrecadações', path: '/api/reports/arrecadacoes', permission: 'fundraising.read', description: 'Saldo e quantidade de participantes por campanha.' },
  { title: 'Reuniões', path: '/api/reports/reunioes', permission: 'meetings.read', description: 'Agenda e situação dos compromissos.' },
]

type MonthlyReport = {
  month: string
  label: string
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
  mostServed: { name: string; assignments: number; present: number }[]
  leastServed: { name: string; assignments: number; present: number }[]
  mostAbsent: { name: string; absent: number; justified: number; assignments: number }[]
  people: Record<string, string | number | null>[]
}

export function ReportsPage() {
  const { user } = useAuth()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [title, setTitle] = useState('')
  const [month, setMonth] = useState(shiftMonth(currentMonth(), -1))
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null)
  const [sending, setSending] = useState(false)
  const status = useQuery({
    queryKey: ['monthly-report-status'],
    queryFn: () => api<{ mailConfigured: boolean; lastAttendanceReportMonth: string | null; suggestedMonth: string }>('/api/reports/presencas-mensal/status'),
    enabled: Boolean(user && hasPermission(user.role, user.permissions, 'reports.read')),
  })
  if (!user || !hasPermission(user.role, user.permissions, 'reports.read')) return <Forbidden />
  const visible = reports.filter((report) => hasPermission(user.role, user.permissions, report.permission))
  const canScales = hasPermission(user.role, user.permissions, 'scales.read')
  const query = `from=${from}&to=${to}`
  return (
    <div>
      <PageHeader title="Relatórios" description="Consulte na tela, exporte a planilha ou envie o resumo mensal de presença por e-mail." />
      <Panel className="mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">De <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm font-semibold">Até <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </Panel>

      {canScales ? (
        <Panel className="mb-4 p-4">
          <h2 className="font-display text-2xl">Presença mensal das escalas</h2>
          <p className="mt-1 text-sm text-muted">
            Resumo de quem faltou, quem serviu mais e quem serviu menos. No dia configurado do mês, o sistema envia o relatório do mês anterior aos usuários ativos.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold">
              Mês
              <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const result = await api<MonthlyReport>(`/api/reports/presencas-mensal?month=${month}&format=json`)
                  setMonthly(result)
                  setTitle(`Presença mensal — ${result.label}`)
                  setRows(
                    result.people.map((item) => ({
                      coroinha: String(item.name ?? ''),
                      funcoes: String(item.assignments ?? 0),
                      presentes: String(item.present ?? 0),
                      ausentes: String(item.absent ?? 0),
                      atrasos: String(item.late ?? 0),
                      justificadas: String(item.justified ?? 0),
                      semRegistro: String(item.unrecorded ?? 0),
                      taxa: item.presenceRate === null || item.presenceRate === undefined ? '—' : `${item.presenceRate}%`,
                    })),
                  )
                } catch (error) {
                  toast.error(error instanceof ApiError ? error.message : 'Não foi possível consultar.')
                }
              }}
            >
              Ver
            </Button>
            <Button variant="outline" onClick={() => downloadFile(`/api/reports/presencas-mensal?month=${month}&format=csv`, `presencas-${month}.csv`).catch((error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível exportar.'))}>
              CSV
            </Button>
            <Button variant="outline" onClick={() => downloadFile(`/api/reports/presencas-mensal?month=${month}&format=pdf`, `presencas-${month}.pdf`).catch((error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível gerar o PDF.'))}>
              PDF
            </Button>
            <Button
              disabled={sending}
              onClick={async () => {
                setSending(true)
                try {
                  const result = await api<{ recipients: number; month: string }>('/api/reports/presencas-mensal/enviar', {
                    method: 'POST',
                    body: JSON.stringify({ month }),
                  })
                  toast.success(`Relatório enviado para ${result.recipients} usuários.`)
                  await status.refetch()
                } catch (error) {
                  toast.error(error instanceof ApiError ? error.message : 'Não foi possível enviar o e-mail.')
                } finally {
                  setSending(false)
                }
              }}
            >
              Enviar por e-mail
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            {status.data?.mailConfigured
              ? `E-mail configurado. Último envio automático: ${status.data.lastAttendanceReportMonth ?? 'ainda não enviado'}.`
              : 'E-mail ainda não configurado no servidor (SMTP_HOST e SMTP_FROM). O relatório continua disponível para ver e baixar.'}
          </p>
          {monthly ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-paper p-3 text-sm">
                <p className="font-semibold">Resumo</p>
                <p>{monthly.summary.celebrations} celebrações</p>
                <p>{monthly.summary.present} presentes · {monthly.summary.absent} ausentes</p>
                <p>{monthly.summary.justified} justificadas · {monthly.summary.unrecorded} sem registro</p>
              </div>
              <div className="rounded-xl bg-paper p-3 text-sm">
                <p className="font-semibold">Mais serviram</p>
                {monthly.mostServed.length ? monthly.mostServed.map((item) => <p key={item.name}>{item.name}: {item.assignments}</p>) : <p>Ninguém escalado.</p>}
              </div>
              <div className="rounded-xl bg-paper p-3 text-sm">
                <p className="font-semibold">Mais faltaram</p>
                {monthly.mostAbsent.length ? monthly.mostAbsent.map((item) => <p key={item.name}>{item.name}: {item.absent + item.justified}</p>) : <p>Nenhuma ausência.</p>}
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((report) => (
          <Panel key={report.path} className="p-4">
            <h2 className="font-display text-2xl">{report.title}</h2>
            <p className="mt-1 text-sm text-muted">{report.description}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={async () => {
                try {
                  const result = await api<{ items: Record<string, string>[] }>(`${report.path}?${query}&format=json`)
                  setTitle(report.title)
                  setMonthly(null)
                  setRows(result.items)
                } catch (error) {
                  toast.error(error instanceof ApiError ? error.message : 'Não foi possível consultar.')
                }
              }}>Ver</Button>
              <Button variant="outline" onClick={() => downloadFile(`${report.path}?${query}&format=csv`, `${report.title}.csv`).catch((error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível exportar.'))}>CSV</Button>
            </div>
          </Panel>
        ))}
      </div>
      {rows.length ? (
        <Panel className="mt-4 overflow-x-auto p-4">
          <h2 className="font-display mb-3 text-2xl">{title}</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>{Object.keys(rows[0] ?? {}).map((key) => <th key={key} className="border-b border-line px-2 py-2 capitalize">{key}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>{Object.values(row).map((value, cell) => <td key={cell} className="border-b border-line px-2 py-2">{String(value ?? '—')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}
    </div>
  )
}
