import {
  ACCOUNT_STATUSES,
  ATTENDANCE_STATUSES,
  COROINHA_STATUSES,
  FUNDRAISING_STATUSES,
  LITURGICAL_ROLES,
  MEETING_STATUSES,
  PERMISSIONS,
  RAFFLE_STATUSES,
  TRANSACTION_TYPES,
  USER_ROLES,
} from '@coroinha/contracts'
import { z } from 'zod'

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida.')

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido.')

export const passwordSchema = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres.')
  .max(72, 'A senha deve ter no máximo 72 caracteres.')
  .regex(/[A-Za-zÀ-ÿ]/, 'A senha deve conter letras.')
  .regex(/[0-9]/, 'A senha deve conter números.')

export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,2})?$/, 'Informe um valor monetário válido.')

const blankToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value

export const optionalText = (max: number) =>
  z.preprocess(
    blankToNull,
    z.string().trim().max(max, `Use no máximo ${max} caracteres.`).nullable().optional(),
  )

const phone = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .refine((value) => {
      if (!value) return true
      const digits = value.replace(/\D/g, '')
      return digits.length >= 10 && digits.length <= 13
    }, 'Informe um telefone com DDD.'),
)

export const loginSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe a senha.'),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: passwordSchema,
})

export const resetPasswordSchema = z.object({
  password: passwordSchema,
})

export const userBodySchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome.').max(120),
  email: z.string().trim().email('Informe um e-mail válido.').max(160),
  password: passwordSchema.optional(),
  role: z.enum(USER_ROLES),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
})

export const createUserSchema = userBodySchema.extend({
  password: passwordSchema,
})

export const coroinhaBodySchema = z
  .object({
    fullName: z.string().trim().min(3, 'Informe o nome completo.').max(160),
    birthDate: dateSchema,
    phone,
    guardianName: optionalText(160),
    guardianPhone: phone,
    joinedAt: dateSchema,
    notes: optionalText(2000),
    status: z.enum(COROINHA_STATUSES),
  })
  .superRefine((value, context) => {
    if (value.joinedAt < value.birthDate) {
      context.addIssue({
        code: 'custom',
        path: ['joinedAt'],
        message: 'A entrada na pastoral não pode ser anterior ao nascimento.',
      })
    }
  })

export const celebrationBodySchema = z.object({
  title: z.string().trim().min(3, 'Informe o nome da celebração.').max(160),
  date: dateSchema,
  time: timeSchema,
  location: optionalText(160),
  notes: optionalText(2000),
})

export const roleSettingsSchema = z.object({
  roles: z.record(z.enum(LITURGICAL_ROLES), z.boolean()),
})

export const assignmentInputSchema = z.object({
  role: z.enum(LITURGICAL_ROLES),
  coroinhaId: z.string().min(1),
  overrideReason: z.string().trim().max(300).nullable().optional(),
})

export const assignmentsSchema = z.object({
  assignments: z.array(assignmentInputSchema),
})

export const duplicateScaleSchema = celebrationBodySchema
  .pick({ date: true, time: true })
  .extend({
    title: z.string().trim().min(3).max(160).optional(),
    copyAssignments: z.boolean().default(false),
  })

export const attendanceItemSchema = z.object({
  assignmentId: z.string().min(1),
  status: z.enum(ATTENDANCE_STATUSES),
  notes: optionalText(500),
})

export const attendanceSchema = z.object({
  items: z.array(attendanceItemSchema).min(1, 'Não há coroinhas escalados para registrar.'),
})

export const raffleBodySchema = z
  .object({
    name: z.string().trim().min(3, 'Informe o nome da rifa.').max(160),
    description: optionalText(2000),
    prize: z.string().trim().min(2, 'Informe o prêmio.').max(200),
    unitPrice: moneySchema,
    totalNumbers: z.number().int().positive('Informe a quantidade de números.'),
    startsAt: dateSchema,
    endsAt: dateSchema,
    drawAt: dateSchema.nullable().optional(),
    goalAmount: moneySchema.nullable().optional(),
    notes: optionalText(2000),
    status: z.enum(RAFFLE_STATUSES),
  })
  .superRefine((value, context) => {
    if (value.endsAt < value.startsAt) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'O encerramento não pode ser anterior ao início.',
      })
    }
    if (value.drawAt && value.drawAt < value.startsAt) {
      context.addIssue({
        code: 'custom',
        path: ['drawAt'],
        message: 'O sorteio não pode ser anterior ao início.',
      })
    }
  })

export const raffleBlockSchema = z.object({
  label: z.string().trim().min(1, 'Identifique o bloco.').max(40),
  coroinhaId: z.string().min(1).nullable().optional(),
  participantName: z.string().trim().min(3, 'Informe o responsável.').max(160),
  quantity: z.number().int().positive('Informe a quantidade do bloco.'),
  soldQuantity: z.number().int().min(0),
  unsoldQuantity: z.number().int().min(0),
  amountReceived: moneySchema,
  notes: optionalText(1000),
  correctionNote: z.string().trim().max(300).nullable().optional(),
})

export const fundraisingBodySchema = z
  .object({
    name: z.string().trim().min(3, 'Informe o nome da arrecadação.').max(160),
    description: optionalText(2000),
    category: z.string().trim().min(2, 'Informe a categoria.').max(80),
    startsAt: dateSchema,
    endsAt: dateSchema.nullable().optional(),
    goalAmount: moneySchema.nullable().optional(),
    notes: optionalText(2000),
    status: z.enum(FUNDRAISING_STATUSES),
  })
  .superRefine((value, context) => {
    if (value.endsAt && value.endsAt < value.startsAt) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'O encerramento não pode ser anterior ao início.',
      })
    }
  })

export const participantSchema = z.object({
  coroinhaId: z.string().min(1),
  note: optionalText(300),
})

export const transactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount: moneySchema,
  date: dateSchema,
  description: z.string().trim().min(3, 'Descreva o lançamento.').max(300),
  coroinhaId: z.string().min(1).nullable().optional(),
  addParticipant: z.boolean().optional(),
  correctionNote: z.string().trim().max(300).nullable().optional(),
})

export const meetingParticipantSchema = z.object({
  userId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(3, 'Informe o nome do participante.').max(160),
})

export const meetingBodySchema = z
  .object({
    title: z.string().trim().min(3, 'Informe o título.').max(160),
    agenda: optionalText(4000),
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    location: optionalText(160),
    notes: optionalText(2000),
    decisions: optionalText(4000),
    status: z.enum(MEETING_STATUSES),
    participants: z.array(meetingParticipantSchema).default([]),
  })
  .superRefine((value, context) => {
    if (value.endTime <= value.startTime) {
      context.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'O término deve ser depois do início.',
      })
    }
  })

export const settingsSchema = z.object({
  parishName: z.string().trim().min(3, 'Informe o nome da pastoral.').max(160),
  celebrationDurationMinutes: z.number().int().min(30).max(240),
  balanceWindowDays: z.number().int().min(7).max(365),
})

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().max(120).optional(),
})

export const reportQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  status: z.string().optional(),
  format: z.enum(['json', 'csv']).default('json'),
  coroinhaId: z.string().optional(),
})

export const listQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  archived: z.enum(['false', 'true', 'all']).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  pending: z.enum(['0', '1']).optional(),
  when: z.enum(['upcoming', 'past', 'all']).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type CoroinhaBody = z.infer<typeof coroinhaBodySchema>
export type CelebrationBody = z.infer<typeof celebrationBodySchema>
export type RaffleBody = z.infer<typeof raffleBodySchema>
export type RaffleBlockBody = z.infer<typeof raffleBlockSchema>
export type FundraisingBody = z.infer<typeof fundraisingBodySchema>
export type MeetingBody = z.infer<typeof meetingBodySchema>
export type SettingsBody = z.infer<typeof settingsSchema>
