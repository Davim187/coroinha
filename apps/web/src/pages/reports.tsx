import { hasPermission, type Permission } from '@coroinha/contracts'
import { useState } from 'react'
import { toast } from 'sonner'
import { Forbidden, PageHeader, Panel } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth'
import { api, ApiError, downloadFile } from '@/lib/api'

const reports: { title: string; path: string; permission: Permission; description: string }[] = [
  { title: 'Coroinhas', path: '/api/reports/coroinhas', permission: 'coroinhas.read', description: 'Lista de ativos e inativos, inclusive arquivados.' },
  { title: 'Escalas', path: '/api/reports/escalas', permission: 'scales.read', description: 'Funções e nomes por período.' },
  { title: 'Presenças', path: '/api/reports/presencas', permission: 'scales.read', description: 'Histórico de presença nas celebrações.' },
  { title: 'Rifas', path: '/api/reports/rifas', permission: 'raffles.read', description: 'Resumo das campanhas e valores recebidos.' },
  { title: 'Arrecadações', path: '/api/reports/arrecadacoes', permission: 'fundraising.read', description: 'Saldo e quantidade de participantes por campanha.' },
  { title: 'Reuniões', path: '/api/reports/reunioes', permission: 'meetings.read', description: 'Agenda e situação dos compromissos.' },
]

export function ReportsPage() {
  const { user } = useAuth()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [title, setTitle] = useState('')
  if (!user || !hasPermission(user.role, user.permissions, 'reports.read')) return <Forbidden />
  const visible = reports.filter((report) => hasPermission(user.role, user.permissions, report.permission))
  const query = `from=${from}&to=${to}`
  return (
    <div>
      <PageHeader title="Relatórios" description="Consulte na tela ou exporte a planilha. Os dados respeitam o seu perfil." />
      <Panel className="mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">De <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm font-semibold">Até <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </Panel>
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
