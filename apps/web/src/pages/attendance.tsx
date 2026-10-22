import type { AttendanceStatus, LiturgicalRole } from '@coroinha/contracts'
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, ROLE_LABELS } from '@coroinha/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader, Panel, QueryBoundary } from '@/components/common'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'

type Item = {
  assignmentId: string
  role: LiturgicalRole
  coroinhaName: string
  status: AttendanceStatus | null
  notes: string | null
}

export function AttendancePage() {
  const { id } = useParams()
  const query = useQuery({
    queryKey: ['attendance', id],
    queryFn: () => api<{ status: string; items: Item[] }>(`/api/celebrations/${id}/attendance`),
  })
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    if (query.data) setItems(query.data.items)
  }, [query.data])
  const save = useMutation({
    mutationFn: () =>
      api(`/api/celebrations/${id}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({
          items: items.map((item) => ({ assignmentId: item.assignmentId, status: item.status, notes: item.notes })),
        }),
      }),
    onSuccess: () => toast.success('Presença registrada.'),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar a presença.'),
  })
  const complete = items.length > 0 && items.every((item) => item.status)
  return (
    <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()}>
      <PageHeader title="Registrar presença" description="A presença não é marcada automaticamente. Escolha a situação de cada coroinha escalado." actions={<Button variant="outline" asChild><Link to={`/escalas/${id}`}>Voltar à escala</Link></Button>} />
      {items.length === 0 ? <Panel className="p-6 text-sm text-muted">Não há coroinhas escalados.</Panel> : (
        <div className="grid gap-3">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setItems((current) => current.map((item) => ({ ...item, status: 'PRESENT' })))}>Marcar todos presentes</Button>
          </div>
          {items.map((item) => (
            <Panel key={item.assignmentId} className="p-4">
              <p className="font-semibold">{item.coroinhaName}</p>
              <p className="mb-3 text-sm text-muted">{ROLE_LABELS[item.role]}</p>
              <div className="flex flex-wrap gap-2">
                {ATTENDANCE_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${item.status === status ? 'bg-navy-900 text-white' : 'bg-paper text-navy-900'}`}
                    onClick={() => setItems((current) => current.map((row) => row.assignmentId === item.assignmentId ? { ...row, status } : row))}
                  >
                    {ATTENDANCE_LABELS[status]}
                  </button>
                ))}
              </div>
            </Panel>
          ))}
          <Button disabled={!complete || save.isPending} onClick={() => save.mutate()}>
            {complete ? 'Salvar presença' : 'Selecione a situação de todos'}
          </Button>
        </div>
      )}
    </QueryBoundary>
  )
}
