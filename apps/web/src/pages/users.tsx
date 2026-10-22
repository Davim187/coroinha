import type { Paginated, Permission, UserRole, UserView } from '@coroinha/contracts'
import { DEFAULT_PERMISSIONS, PERMISSION_LABELS, PERMISSIONS, USER_ROLE_LABELS, USER_ROLES } from '@coroinha/contracts'
import { passwordSchema, resetPasswordSchema } from '@coroinha/validators'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Resolver } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { EmptyState, Field, Forbidden, PageHeader, Panel, QueryBoundary, SearchBox, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { useAuth } from '@/features/auth'
import { api, ApiError } from '@/lib/api'

export function UsersPage() {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UserView | null>(null)
  const query = useQuery({ queryKey: ['users', q], queryFn: () => api<Paginated<UserView>>(`/api/users?q=${encodeURIComponent(q)}&pageSize=50`) })
  if (user && user.role !== 'ADMIN') return <Forbidden />
  return (
    <div>
      <PageHeader title="Usuários e permissões" description="Somente um administrador cria contas e define quem coordena a pastoral." actions={<Button onClick={() => { setEditing(null); setOpen(true) }}>Novo usuário</Button>} />
      <div className="mb-4"><SearchBox value={q} onChange={setQ} placeholder="Pesquisar por nome ou e-mail" /></div>
      <QueryBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} refetch={() => query.refetch()} isEmpty={!query.data?.items.length} empty={<EmptyState title="Nenhum usuário" description="Cadastre a equipe da coordenação." />}>
        <Panel>
          <ul className="divide-y divide-line">
            {query.data?.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted">{item.email} · {USER_ROLE_LABELS[item.role]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={item.status} label={item.status === 'ACTIVE' ? 'Ativa' : 'Inativa'} />
                  <Button size="sm" variant="outline" onClick={() => { setEditing(item); setOpen(true) }}>Editar</Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </QueryBoundary>
      <UserDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => query.refetch()} />
    </div>
  )
}

function UserDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; editing: UserView | null; onSaved: () => void }) {
  const client = useQueryClient()
  const [permissions, setPermissions] = useState<Permission[]>(editing?.permissions ?? DEFAULT_PERMISSIONS.COORDINATOR)
  const [role, setRole] = useState<UserRole>(editing?.role ?? 'COORDINATOR')
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(editing?.status ?? 'ACTIVE')
  useEffect(() => {
    setRole(editing?.role ?? 'COORDINATOR')
    setStatus(editing?.status ?? 'ACTIVE')
    setPermissions(editing?.role === 'ADMIN' ? DEFAULT_PERMISSIONS.ADMIN : editing?.permissions ?? DEFAULT_PERMISSIONS.COORDINATOR)
  }, [editing])
  const form = useForm<{ name: string; email: string; password: string }>({
    resolver: zodResolver(z.object({
      name: z.string().trim().min(3, 'Informe o nome.'),
      email: z.string().trim().email('Informe um e-mail válido.'),
      password: z.string(),
    })) as unknown as Resolver<{ name: string; email: string; password: string }>,
    values: editing ? { name: editing.name, email: editing.email, password: '' } : undefined,
    defaultValues: { name: '', email: '', password: '' },
  })
  const password = useForm<{ password: string }>({ resolver: zodResolver(resetPasswordSchema) as Resolver<{ password: string }>, defaultValues: { password: '' } })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? 'Editar usuário' : 'Novo usuário'} description="O administrador sempre mantém acesso total." className="w-[min(680px,calc(100%-2rem))]">
        <form className="grid gap-3"         onSubmit={form.handleSubmit(async (values) => {
          if (!editing && !passwordSchema.safeParse(values.password).success) {
            form.setError('password', { message: 'A senha deve ter ao menos 10 caracteres, com letras e números.' })
            return
          }
          const body = { name: values.name, email: values.email, role, status, permissions, password: values.password || undefined }
          try {
            await api(editing ? `/api/users/${editing.id}` : '/api/users', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) })
            toast.success(editing ? 'Usuário atualizado.' : 'Usuário criado.')
            await client.invalidateQueries({ queryKey: ['users'] })
            onSaved()
            onOpenChange(false)
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
          }
        })}>
          <Field label="Nome" error={form.formState.errors.name?.message}><Input {...form.register('name')} /></Field>
          <Field label="E-mail" error={form.formState.errors.email?.message}><Input type="email" {...form.register('email')} /></Field>
          {!editing ? <Field label="Senha inicial" error={form.formState.errors.password?.message}><Input type="password" {...form.register('password')} /></Field> : null}
          <Field label="Perfil">
            <Select value={role} onChange={(event) => {
              const next = event.target.value as UserRole
              setRole(next)
              setPermissions(DEFAULT_PERMISSIONS[next])
            }}>
              {USER_ROLES.map((item) => <option key={item} value={item}>{USER_ROLE_LABELS[item]}</option>)}
            </Select>
          </Field>
          <Field label="Situação">
            <Select value={status} onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'INACTIVE')}>
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
            </Select>
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERMISSIONS.map((permission) => (
              <label key={permission} className="flex items-start gap-2 text-sm">
                <input type="checkbox" disabled={role === 'ADMIN'} checked={role === 'ADMIN' || permissions.includes(permission)} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />
                {PERMISSION_LABELS[permission]}
              </label>
            ))}
          </div>
          <Button type="submit">Salvar usuário</Button>
        </form>
        {editing ? (
          <form className="mt-4 grid gap-2 border-t border-line pt-4" onSubmit={password.handleSubmit(async (values) => {
            try {
              await api(`/api/users/${editing.id}/password`, { method: 'POST', body: JSON.stringify(values) })
              toast.success('Senha redefinida. A sessão anterior foi encerrada.')
              password.reset()
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : 'Não foi possível redefinir a senha.')
            }
          })}>
            <Field label="Nova senha" error={password.formState.errors.password?.message}><Input type="password" {...password.register('password')} /></Field>
            <Button type="submit" variant="outline">Redefinir senha</Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
