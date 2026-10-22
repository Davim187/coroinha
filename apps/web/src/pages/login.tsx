import { loginSchema } from '@coroinha/validators'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth'
import { ApiError } from '@/lib/api'
import { Field } from '@/components/common'

export function LoginPage() {
  const { user, login } = useAuth()
  const form = useForm<{ email: string; password: string }>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  if (user) return <Navigate to="/" replace />

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-navy-950 p-12 text-white lg:flex">
        <div>
          <div className="mb-8 h-px w-16 bg-gold-500" />
          <p className="text-sm tracking-[0.2em] text-gold-500 uppercase">Pastoral</p>
          <h1 className="font-display mt-4 max-w-md text-5xl leading-tight">A coordenação dos coroinhas, em um só lugar.</h1>
        </div>
        <p className="max-w-sm text-sm text-white/70">Escalas, presenças, rifas, arrecadações e reuniões para quem organiza a pastoral.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <form
          className="w-full max-w-sm"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await login(values.email, values.password)
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : 'Não foi possível entrar.')
            }
          })}
        >
          <div className="mb-6 h-px w-12 bg-gold-500 lg:hidden" />
          <h2 className="font-display text-4xl text-navy-900">Entrar</h2>
          <p className="mt-2 mb-8 text-sm text-muted">Acesso exclusivo da coordenação.</p>
          <div className="grid gap-4">
            <Field label="E-mail" error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="username" {...form.register('email')} />
            </Field>
            <Field label="Senha" error={form.formState.errors.password?.message}>
              <Input type="password" autoComplete="current-password" {...form.register('password')} />
            </Field>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Entrando...' : 'Acessar o sistema'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
