import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/shell'
import { AuthProvider, useAuth } from '@/features/auth'
import { AccountPage } from '@/pages/account'
import { AttendancePage } from '@/pages/attendance'
import { CoroinhaDetailPage, CoroinhaFormPage, CoroinhasPage } from '@/pages/coroinhas'
import { DashboardPage } from '@/pages/dashboard'
import { FundraisingDetailPage, FundraisingFormPage, FundraisingPage } from '@/pages/fundraising'
import { LoginPage } from '@/pages/login'
import { AgendaPage, MeetingDetailPage, MeetingFormPage } from '@/pages/meetings'
import { PrintScalePage } from '@/pages/print'
import { RafflesPage, RaffleDetailPage, RaffleFormPage } from '@/pages/raffles'
import { ReportsPage } from '@/pages/reports'
import { CelebrationFormPage, ScaleBuilderPage, ScalesPage } from '@/pages/scales'
import { SettingsPage } from '@/pages/settings'
import { UsersPage } from '@/pages/users'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/source-sans-3/700.css'
import '@fontsource/newsreader/500.css'
import '@fontsource/newsreader/600.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 10_000 } },
})

function RequireAuth() {
  const { user, ready } = useAuth()
  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-muted">Carregando...</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/imprimir/escalas/:id', element: <PrintScalePage /> },
      {
        path: '/',
        element: <AppShell />,
        children: [
      { index: true, element: <DashboardPage /> },
      { path: 'conta', element: <AccountPage /> },
      { path: 'coroinhas', element: <CoroinhasPage /> },
      { path: 'coroinhas/nova', element: <CoroinhaFormPage /> },
      { path: 'coroinhas/:id', element: <CoroinhaDetailPage /> },
      { path: 'coroinhas/:id/editar', element: <CoroinhaFormPage /> },
      { path: 'escalas', element: <ScalesPage /> },
      { path: 'escalas/nova', element: <CelebrationFormPage /> },
      { path: 'escalas/:id', element: <ScaleBuilderPage /> },
      { path: 'escalas/:id/editar', element: <CelebrationFormPage /> },
      { path: 'escalas/:id/presenca', element: <AttendancePage /> },
      { path: 'rifas', element: <RafflesPage /> },
      { path: 'rifas/nova', element: <RaffleFormPage /> },
      { path: 'rifas/:id', element: <RaffleDetailPage /> },
      { path: 'rifas/:id/editar', element: <RaffleFormPage /> },
      { path: 'arrecadacoes', element: <FundraisingPage /> },
      { path: 'arrecadacoes/nova', element: <FundraisingFormPage /> },
      { path: 'arrecadacoes/:id', element: <FundraisingDetailPage /> },
      { path: 'arrecadacoes/:id/editar', element: <FundraisingFormPage /> },
      { path: 'agenda', element: <AgendaPage /> },
      { path: 'agenda/nova', element: <MeetingFormPage /> },
      { path: 'agenda/:id', element: <MeetingDetailPage /> },
      { path: 'agenda/:id/editar', element: <MeetingFormPage /> },
      { path: 'usuarios', element: <UsersPage /> },
      { path: 'relatorios', element: <ReportsPage /> },
      { path: 'configuracoes', element: <SettingsPage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
