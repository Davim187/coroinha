import type { Permission } from '@coroinha/contracts'
import { hasPermission } from '@coroinha/contracts'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent } from './ui/dialog'
import { Input } from './ui/input'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl text-navy-900 sm:text-4xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-line bg-white shadow-sm', className)}>{children}</section>
}

export function LoadingState() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Carregando">
      <div className="h-16 animate-pulse rounded-2xl bg-white" />
      <div className="h-16 animate-pulse rounded-2xl bg-white" />
      <div className="h-40 animate-pulse rounded-2xl bg-white" />
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Não foi possível carregar os dados.'
  return (
    <Panel className="p-8 text-center">
      <p className="font-medium text-navy-900">Algo não saiu como esperado</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </Panel>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Panel className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 h-px w-16 bg-gold-500" />
      <h2 className="font-display text-2xl text-navy-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Panel>
  )
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-semibold text-navy-900">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  )
}

export function QueryBoundary({
  isLoading,
  isError,
  error,
  refetch,
  isEmpty,
  empty,
  children,
}: {
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch?: () => void
  isEmpty?: boolean
  empty?: ReactNode
  children: ReactNode
}) {
  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={refetch} />
  if (isEmpty) return <>{empty}</>
  return <>{children}</>
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>
        Página {page} de {pages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Próxima
        </Button>
      </div>
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted" />
      <Input className="pl-9" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { user } = useAuth()
  if (!user || !hasPermission(user.role, user.permissions, permission)) return null
  return <>{children}</>
}

export function Forbidden() {
  return <EmptyState title="Acesso restrito" description="Sua conta não possui permissão para esta área." />
}

const tones = {
  ACTIVE: 'green',
  INACTIVE: 'slate',
  DRAFT: 'amber',
  PUBLISHED: 'navy',
  COMPLETED: 'green',
  OPEN: 'amber',
  PARTIAL: 'gold',
  SETTLED: 'green',
  RETURNED: 'slate',
  ONGOING: 'navy',
  CLOSED: 'slate',
  SCHEDULED: 'navy',
  HELD: 'green',
  CANCELLED: 'red',
  PRESENT: 'green',
  ABSENT: 'red',
  LATE: 'amber',
  JUSTIFIED: 'gold',
} as const

export function StatusBadge({ value, label }: { value: string; label: string }) {
  const tone = tones[value as keyof typeof tones] ?? 'slate'
  return <Badge tone={tone}>{label}</Badge>
}

export function ConfirmButton({
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
  danger,
}: {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  children: ReactNode
  danger?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{children}</span>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant={danger ? 'danger' : 'default'}
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CoroinhaPicker({
  value,
  label,
  onChange,
}: {
  value?: { id: string; name: string } | null
  label?: string
  onChange: (value: { id: string; name: string } | null) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['coroinhas-picker', q],
    queryFn: () => api<{ items: { id: string; fullName: string }[] }>(`/api/coroinhas?q=${encodeURIComponent(q)}&status=ACTIVE&pageSize=8`),
    enabled: open,
  })
  return (
    <div className="relative">
      <Input
        value={open ? q : value?.name || label || ''}
        placeholder="Pesquisar coroinha"
        onFocus={() => {
          setOpen(true)
          setQ('')
        }}
        onChange={(event) => setQ(event.target.value)}
        aria-label="Pesquisar coroinha"
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-white p-1 shadow-lg">
          {value ? (
            <button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-paper" type="button" onClick={() => { onChange(null); setOpen(false) }}>
              Limpar seleção
            </button>
          ) : null}
          {query.data?.items.length ? (
            query.data.items.map((person) => (
              <button
                key={person.id}
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gold-100"
                onClick={() => {
                  onChange({ id: person.id, name: person.fullName })
                  setOpen(false)
                }}
              >
                {person.fullName}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-muted">{query.isLoading ? 'Buscando...' : 'Nenhum coroinha encontrado.'}</p>
          )}
          <button className="block w-full px-3 py-1 text-left text-xs text-muted" type="button" onClick={() => setOpen(false)}>
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-semibold text-navy-800 underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}
