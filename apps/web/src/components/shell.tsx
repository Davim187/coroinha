import { hasPermission, USER_ROLE_LABELS, type Permission } from '@coroinha/contracts'
import {
  CalendarDays,
  Church,
  Coins,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { cn } from '@/lib/utils'

const items: { to: string; label: string; icon: typeof Users; permission?: Permission; end?: boolean }[] = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/coroinhas', label: 'Coroinhas', icon: Users, permission: 'coroinhas.read' },
  { to: '/escalas', label: 'Escalas', icon: Church, permission: 'scales.read' },
  { to: '/rifas', label: 'Rifas', icon: Ticket, permission: 'raffles.read' },
  { to: '/arrecadacoes', label: 'Arrecadações', icon: Coins, permission: 'fundraising.read' },
  { to: '/agenda', label: 'Agenda e reuniões', icon: CalendarDays, permission: 'meetings.read' },
  { to: '/relatorios', label: 'Relatórios', icon: ScrollText, permission: 'reports.read' },
  { to: '/usuarios', label: 'Usuários e permissões', icon: Users, permission: 'users.manage' },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, permission: 'settings.manage' },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  if (!user) return null
  const visible = items.filter((item) => !item.permission || hasPermission(user.role, user.permissions, item.permission))

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className={cn('fixed inset-y-0 left-0 z-30 w-[260px] bg-navy-950 text-white transition lg:static', open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="mb-3 h-px w-10 bg-gold-500" />
            <p className="font-display text-2xl">Coroinhas</p>
            <p className="text-xs tracking-wide text-white/60">Coordenação da pastoral</p>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 transition hover:bg-white/8 hover:text-white',
                    isActive && 'bg-white/10 text-white shadow-[inset_3px_0_0_#c4a35a]',
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-white/10 p-4">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-white/60">{USER_ROLE_LABELS[user.role]}</p>
            <button
              className="mt-3 flex items-center gap-2 text-sm text-white/80 hover:text-white"
              onClick={async () => {
                await logout()
                navigate('/login')
              }}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </aside>
      {open ? <button className="fixed inset-0 z-20 bg-navy-950/40 lg:hidden" aria-label="Fechar menu" onClick={() => setOpen(false)} /> : null}
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Fechar menu' : 'Abrir menu'}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <p className="text-sm text-muted">Uso interno da coordenação</p>
          <NavLink to="/conta" className="text-sm font-semibold text-navy-900">
            Minha conta
          </NavLink>
        </header>
        <main className="page-enter px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
