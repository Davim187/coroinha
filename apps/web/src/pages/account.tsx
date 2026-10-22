import { changePasswordSchema } from '@coroinha/validators'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Resolver } from 'react-hook-form'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Field, PageHeader, Panel } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth'
import { api, ApiError, setAccessToken } from '@/lib/api'
import type { AuthUser } from '@coroinha/contracts'
import { USER_ROLE_LABELS } from '@coroinha/contracts'

type Form = { currentPassword: string; newPassword: string }

export function AccountPage() {
  const { user, setUser } = useAuth()
  const form = useForm<Form>({
    resolver: zodResolver(changePasswordSchema) as Resolver<Form>,
    defaultValues: { currentPassword: '', newPassword: '' },
  })
  if (!user) return null
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Minha conta" description="Atualize sua senha. O perfil de acesso é definido por um administrador." />
      <Panel className="mb-4 p-5">
        <p className="font-semibold">{user.name}</p>
        <p className="text-sm text-muted">{user.email}</p>
        <p className="mt-2 text-sm">{USER_ROLE_LABELS[user.role]}</p>
      </Panel>
      <Panel className="p-5">
        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const result = await api<{ accessToken: string; user: AuthUser }>('/api/auth/password', {
                method: 'POST',
                body: JSON.stringify(values),
              })
              setAccessToken(result.accessToken)
              setUser(result.user)
              form.reset()
              toast.success('Senha atualizada.')
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : 'Não foi possível atualizar a senha.')
            }
          })}
        >
          <Field label="Senha atual" error={form.formState.errors.currentPassword?.message}>
            <Input type="password" {...form.register('currentPassword')} />
          </Field>
          <Field label="Nova senha" error={form.formState.errors.newPassword?.message}>
            <Input type="password" {...form.register('newPassword')} />
          </Field>
          <Button type="submit">Salvar senha</Button>
        </form>
      </Panel>
    </div>
  )
}
