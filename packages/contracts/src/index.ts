export const USER_ROLES = ['ADMIN', 'COORDINATOR', 'SECRETARY'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const COROINHA_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export type CoroinhaStatus = (typeof COROINHA_STATUSES)[number]

export const SCALE_STATUSES = ['DRAFT', 'PUBLISHED', 'COMPLETED'] as const
export type ScaleStatus = (typeof SCALE_STATUSES)[number]

export const LITURGICAL_ROLES = [
  'CRUCIFERARIO',
  'LIBRIFERO',
  'CREDENCIA',
  'OBJETOS',
  'CEROFERARIO_1',
  'CEROFERARIO_2',
  'TURIFERARIO',
  'NAVETEIRO',
] as const
export type LiturgicalRole = (typeof LITURGICAL_ROLES)[number]

export const ROLE_LABELS: Record<LiturgicalRole, string> = {
  CRUCIFERARIO: 'Cruciferário',
  LIBRIFERO: 'Librífero',
  CREDENCIA: 'Credência / banco',
  OBJETOS: 'Objetos',
  CEROFERARIO_1: 'Ceroferário 1',
  CEROFERARIO_2: 'Ceroferário 2',
  TURIFERARIO: 'Turiferário',
  NAVETEIRO: 'Naveteiro',
}

export const ROLE_GROUPS: { id: string; title: string; roles: LiturgicalRole[] }[] = [
  {
    id: 'cortejo',
    title: 'Cortejo',
    roles: ['CRUCIFERARIO', 'CEROFERARIO_1', 'CEROFERARIO_2', 'TURIFERARIO', 'NAVETEIRO'],
  },
  {
    id: 'altar',
    title: 'Altar e apoio',
    roles: ['LIBRIFERO', 'CREDENCIA', 'OBJETOS'],
  },
]

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'JUSTIFIED'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const RAFFLE_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED'] as const
export type RaffleStatus = (typeof RAFFLE_STATUSES)[number]

export const RAFFLE_BLOCK_STATUSES = ['OPEN', 'PARTIAL', 'SETTLED', 'RETURNED'] as const
export type RaffleBlockStatus = (typeof RAFFLE_BLOCK_STATUSES)[number]

export const FUNDRAISING_STATUSES = ['ONGOING', 'CLOSED'] as const
export type FundraisingStatus = (typeof FUNDRAISING_STATUSES)[number]

export const TRANSACTION_TYPES = ['INCOME', 'EXPENSE'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const MEETING_STATUSES = ['SCHEDULED', 'HELD', 'CANCELLED'] as const
export type MeetingStatus = (typeof MEETING_STATUSES)[number]

export const PERMISSIONS = [
  'coroinhas.read',
  'coroinhas.write',
  'scales.read',
  'scales.write',
  'scales.override',
  'attendance.write',
  'raffles.read',
  'raffles.write',
  'fundraising.read',
  'fundraising.write',
  'meetings.read',
  'meetings.write',
  'reports.read',
  'users.manage',
  'settings.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, string> = {
  'coroinhas.read': 'Consultar coroinhas',
  'coroinhas.write': 'Cadastrar e editar coroinhas',
  'scales.read': 'Consultar escalas',
  'scales.write': 'Montar e publicar escalas',
  'scales.override': 'Permitir o mesmo coroinha em duas funções, com justificativa',
  'attendance.write': 'Registrar presenças',
  'raffles.read': 'Consultar rifas',
  'raffles.write': 'Gerenciar rifas e blocos',
  'fundraising.read': 'Consultar arrecadações',
  'fundraising.write': 'Registrar arrecadações e lançamentos',
  'meetings.read': 'Consultar a agenda',
  'meetings.write': 'Organizar reuniões',
  'reports.read': 'Consultar e exportar relatórios',
  'users.manage': 'Gerenciar usuários e permissões',
  'settings.manage': 'Alterar configurações gerais',
}

export const DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [...PERMISSIONS],
  COORDINATOR: PERMISSIONS.filter(
    (permission) => permission !== 'users.manage' && permission !== 'settings.manage',
  ),
  SECRETARY: [
    'coroinhas.read',
    'coroinhas.write',
    'scales.read',
    'scales.write',
    'attendance.write',
    'meetings.read',
    'meetings.write',
    'reports.read',
  ],
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador do sistema',
  COORDINATOR: 'Coordenador',
  SECRETARY: 'Secretário',
}

export const SCALE_STATUS_LABELS: Record<ScaleStatus, string> = {
  DRAFT: 'Em preparação',
  PUBLISHED: 'Publicada',
  COMPLETED: 'Concluída',
}

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Presente',
  ABSENT: 'Ausente',
  LATE: 'Atrasado',
  JUSTIFIED: 'Ausência justificada',
}

export const RAFFLE_STATUS_LABELS: Record<RaffleStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Em andamento',
  CLOSED: 'Encerrada',
}

export const BLOCK_STATUS_LABELS: Record<RaffleBlockStatus, string> = {
  OPEN: 'Em aberto',
  PARTIAL: 'Prestação parcial',
  SETTLED: 'Quitado',
  RETURNED: 'Devolvido',
}

export const FUNDRAISING_STATUS_LABELS: Record<FundraisingStatus, string> = {
  ONGOING: 'Em andamento',
  CLOSED: 'Encerrada',
}

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  SCHEDULED: 'Agendada',
  HELD: 'Realizada',
  CANCELLED: 'Cancelada',
}

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  INCOME: 'Entrada',
  EXPENSE: 'Saída',
}

export type Paginated<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details: unknown
  }
}

export type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole
  status: AccountStatus
  permissions: Permission[]
}

export type CoroinhaSummary = {
  id: string
  fullName: string
  birthDate: string
  phone: string | null
  guardianName: string | null
  guardianPhone: string | null
  joinedAt: string
  status: CoroinhaStatus
  archivedAt: string | null
}

export type ScaleAssignmentView = {
  id: string
  role: LiturgicalRole
  coroinhaId: string
  coroinhaName: string
  overrideReason: string | null
  warnings: string[]
  attendance: AttendanceStatus | null
}

export type CelebrationSummary = {
  id: string
  title: string
  date: string
  time: string
  location: string | null
  status: ScaleStatus
  requiredRoles: number
  filledRoles: number
}

export type RaffleSummary = {
  distributed: number
  sold: number
  unsold: number
  available: number
  expectedAmount: string
  receivedAmount: string
  pendingAmount: string
  completionPercent: number
  goalAmount: string | null
  goalPercent: number | null
  openBlocks: number
}

export type FundraisingTotals = {
  income: string
  expense: string
  balance: string
  goalAmount: string | null
  goalPercent: number | null
  participantCount: number
}

export type CoroinhaDetail = CoroinhaSummary & {
  notes: string | null
  history: {
    scales: {
      celebrationId: string
      title: string
      date: string
      time: string
      role: LiturgicalRole
      status: ScaleStatus
    }[]
    attendance: {
      celebrationId: string
      title: string
      date: string
      status: AttendanceStatus
    }[]
    fundraising: { campaignId: string; name: string; date: string; status: FundraisingStatus }[]
    raffleBlocks: {
      campaignId: string
      campaignName: string
      label: string
      quantity: number
      soldQuantity: number
      status: RaffleBlockStatus
    }[]
  }
}

export type CelebrationDetail = {
  id: string
  title: string
  date: string
  time: string
  location: string | null
  notes: string | null
  status: ScaleStatus
  requiredRoles: number
  filledRoles: number
  roles: { role: LiturgicalRole; enabled: boolean }[]
  assignments: ScaleAssignmentView[]
  balanceAlerts: string[]
}

export type RaffleListItem = {
  id: string
  name: string
  prize: string
  status: RaffleStatus
  startsAt: string
  endsAt: string
  summary: RaffleSummary
}

export type RaffleBlockView = {
  id: string
  label: string
  coroinhaId: string | null
  participantName: string
  quantity: number
  soldQuantity: number
  unsoldQuantity: number
  unsoldReturned: boolean
  amountReceived: string
  pendingAmount: string
  status: RaffleBlockStatus
  notes: string | null
  events: { id: string; action: string; note: string | null; createdAt: string; userName: string }[]
}

export type RaffleDetail = Omit<RaffleListItem, 'summary'> & {
  description: string | null
  unitPrice: string
  totalNumbers: number
  drawAt: string | null
  notes: string | null
  summary: RaffleSummary
  blocks: RaffleBlockView[]
}

export type FundraisingListItem = {
  id: string
  name: string
  category: string
  status: FundraisingStatus
  startsAt: string
  endsAt: string | null
  totals: FundraisingTotals
}

export type FundraisingDetail = FundraisingListItem & {
  description: string | null
  notes: string | null
  participants: { id: string; coroinhaId: string; coroinhaName: string; note: string | null }[]
  transactions: {
    id: string
    type: TransactionType
    amount: string
    date: string
    description: string
    coroinhaId: string | null
    coroinhaName: string | null
    recordedBy: string
    createdAt: string
  }[]
  revisions: { id: string; transactionId: string; note: string | null; createdAt: string; userName: string }[]
}

export type MeetingSummary = {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  location: string | null
  status: MeetingStatus
  soon: boolean
}

export type MeetingDetail = MeetingSummary & {
  agenda: string | null
  notes: string | null
  decisions: string | null
  organizer: { id: string; name: string }
  participants: { id: string; userId: string | null; name: string }[]
}

export type DashboardData = {
  parishName: string
  coroinhasActive: number
  upcomingCelebrations: CelebrationSummary[]
  pendingRoles: number
  attendancePending: number
  rafflesActive: number | null
  raffleReceived: string | null
  fundraisingBalance: string | null
  fundraisingParticipants: number | null
  upcomingMeetings: MeetingSummary[]
  attendanceChart: { label: string; present: number; absent: number }[]
  participationChart: { name: string; count: number }[]
}

export type SettingsView = {
  parishName: string
  celebrationDurationMinutes: number
  balanceWindowDays: number
}

export type UserView = AuthUser & { createdAt: string }

export type AuditView = {
  id: string
  action: string
  entity: string
  entityId: string | null
  createdAt: string
  userName: string | null
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}

export function hasPermission(
  role: UserRole,
  permissions: readonly string[],
  permission: Permission,
): boolean {
  if (role === 'ADMIN') return true
  return permissions.includes(permission)
}

export function effectivePermissions(role: UserRole, permissions: readonly string[]): Permission[] {
  if (role === 'ADMIN') return [...PERMISSIONS]
  return permissions.filter(isPermission)
}
