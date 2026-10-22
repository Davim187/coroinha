import type { CelebrationDetail } from '@coroinha/contracts'
import { ROLE_GROUPS, ROLE_LABELS, SCALE_STATUS_LABELS } from '@coroinha/contracts'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'

export function PrintScalePage() {
  const { id } = useParams()
  const celebration = useQuery({ queryKey: ['celebration', id], queryFn: () => api<CelebrationDetail>(`/api/celebrations/${id}`) })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<{ parishName: string }>('/api/settings') })
  if (celebration.isLoading) return <p className="p-8">Carregando escala...</p>
  if (!celebration.data) return <p className="p-8">Escala não encontrada.</p>
  const data = celebration.data
  const names = new Map(data.assignments.map((item) => [item.role, item.coroinhaName]))
  return (
    <div className="mx-auto max-w-3xl bg-white p-8">
      <div className="no-print mb-6">
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>
      <div className="mb-4 h-px w-16 bg-gold-500" />
      <p className="text-sm text-gold-700">{settings.data?.parishName ?? 'Pastoral de Coroinhas'}</p>
      <h1 className="font-display text-4xl text-navy-900">{data.title}</h1>
      <p className="mt-2 text-sm">{formatDate(data.date)} · {data.time}{data.location ? ` · ${data.location}` : ''} · {SCALE_STATUS_LABELS[data.status]}</p>
      <div className="mt-8 grid gap-6">
        {ROLE_GROUPS.map((group) => (
          <section key={group.id}>
            <h2 className="font-display text-2xl">{group.title}</h2>
            <ul className="mt-2 divide-y divide-line">
              {group.roles.filter((role) => data.roles.find((item) => item.role === role)?.enabled).map((role) => (
                <li key={role} className="flex justify-between py-2">
                  <span>{ROLE_LABELS[role]}</span>
                  <strong>{names.get(role) ?? 'Pendente'}</strong>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {data.notes ? <p className="mt-6 text-sm">{data.notes}</p> : null}
    </div>
  )
}
