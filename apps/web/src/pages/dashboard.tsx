import type { DashboardData } from '@coroinha/contracts'
import { hasPermission } from '@coroinha/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, PageHeader, Panel, QueryBoundary } from '@/components/common'
import { useAuth } from '@/features/auth'
import { api } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'

export function DashboardPage() {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/api/dashboard') })
  const data = query.data
  return (
    <div>
      <PageHeader title={`Olá, ${user?.name.split(' ')[0] ?? ''}`} description={data?.parishName ?? 'Visão geral da pastoral'} />
      <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()}>
        {data ? (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat to="/coroinhas?status=ACTIVE" label="Coroinhas ativos" value={String(data.coroinhasActive)} />
              <Stat to="/escalas?pending=1" label="Funções pendentes" value={String(data.pendingRoles)} />
              <Stat to="/escalas?when=past" label="Presenças a registrar" value={String(data.attendancePending)} />
              {data.rafflesActive !== null ? <Stat to="/rifas?status=ACTIVE" label="Rifas em andamento" value={String(data.rafflesActive)} hint={data.raffleReceived ? formatMoney(data.raffleReceived) + ' recebidos' : undefined} /> : null}
              {data.fundraisingBalance !== null ? (
                <Stat to="/arrecadacoes?status=ONGOING" label="Saldo das arrecadações" value={formatMoney(data.fundraisingBalance)} hint={`${data.fundraisingParticipants ?? 0} coroinhas participantes`} />
              ) : null}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel className="p-5">
                <h2 className="font-display text-2xl">Próximas celebrações</h2>
                {data.upcomingCelebrations.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">Nenhuma celebração futura. Comece criando uma escala.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-line">
                    {data.upcomingCelebrations.map((item) => (
                      <li key={item.id}>
                        <Link to={`/escalas/${item.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-navy-700">
                          <span>
                            <span className="block font-semibold">{item.title}</span>
                            <span className="text-sm text-muted">{formatDate(item.date)} · {item.time}</span>
                          </span>
                          <span className="text-sm text-muted">{item.filledRoles}/{item.requiredRoles}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel className="p-5">
                <h2 className="font-display text-2xl">Próximas reuniões</h2>
                {data.upcomingMeetings.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">Nenhuma reunião agendada.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-line">
                    {data.upcomingMeetings.map((item) => (
                      <li key={item.id}>
                        <Link to={`/agenda/${item.id}`} className="block py-3">
                          <span className="font-semibold">{item.title}</span>
                          <span className="mt-1 block text-sm text-muted">{formatDate(item.date)} · {item.startTime}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel className="p-5">
                <h2 className="font-display text-2xl">Presenças recentes</h2>
                {data.attendanceChart.length === 0 ? <p className="mt-4 text-sm text-muted">As presenças registradas aparecerão aqui.</p> : (
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.attendanceChart}>
                        <CartesianGrid stroke="#e3e8ef" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="present" name="Presentes" fill="#0b1f3a" radius={4} />
                        <Bar dataKey="absent" name="Ausências" fill="#c4a35a" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>
              <Panel className="p-5">
                <h2 className="font-display text-2xl">Participação nas escalas</h2>
                {data.participationChart.length === 0 ? <p className="mt-4 text-sm text-muted">A distribuição das escalas recentes aparecerá aqui.</p> : (
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.participationChart} layout="vertical" margin={{ left: 16 }}>
                        <CartesianGrid stroke="#e3e8ef" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Escalas" fill="#143056" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>
            </div>
            {data.coroinhasActive === 0 && user && hasPermission(user.role, user.permissions, 'coroinhas.write') ? (
              <EmptyState title="A pastoral ainda não tem cadastros" description="Cadastre o primeiro coroinha para começar as escalas." action={<Link className="font-semibold text-navy-900 underline" to="/coroinhas/nova">Cadastrar coroinha</Link>} />
            ) : null}
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  )
}

function Stat({ to, label, value, hint }: { to: string; label: string; value: string; hint?: string }) {
  return (
    <Link to={to} className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-gold-500">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display mt-2 text-3xl text-navy-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gold-700">{hint}</p> : null}
    </Link>
  )
}
