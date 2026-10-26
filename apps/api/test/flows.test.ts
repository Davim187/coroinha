import { DEFAULT_PERMISSIONS, LITURGICAL_ROLES } from '@coroinha/contracts'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../src/auth'
import { buildApp } from '../src/app'

const prisma = new PrismaClient()
const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

async function login(role: 'ADMIN' | 'COORDINATOR' | 'SECRETARY') {
  const email = `${role.toLowerCase()}@teste.local`
  await prisma.user.create({
    data: {
      name: role,
      email,
      passwordHash: await hashPassword('SenhaSegura1'),
      role,
      permissions: DEFAULT_PERMISSIONS[role],
    },
  })
  const app = await buildApp({ logger: false })
  apps.push(app)
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'SenhaSegura1' },
  })
  expect(response.statusCode).toBe(200)
  return { app, token: response.json().accessToken as string }
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` }
}

describe('fluxos integrados', () => {
  it('rejeita secretário em rifas e permite administrador', async () => {
    const secretary = await login('SECRETARY')
    const denied = await secretary.app.inject({ method: 'POST', url: '/api/raffles', headers: auth(secretary.token), payload: {} })
    expect(denied.statusCode).toBe(403)
    const admin = await login('ADMIN')
    const users = await admin.app.inject({ method: 'GET', url: '/api/users', headers: auth(admin.token) })
    expect(users.statusCode).toBe(200)
    const secretaryUsers = await secretary.app.inject({ method: 'GET', url: '/api/users', headers: auth(secretary.token) })
    expect(secretaryUsers.statusCode).toBe(403)
  })

  it('cadastra coroinha, monta as oito funções, publica e registra presença', async () => {
    const { app, token } = await login('COORDINATOR')
    const headers = auth(token)
    const first = await app.inject({
      method: 'POST',
      url: '/api/coroinhas',
      headers,
      payload: { fullName: 'Ana Clara Souza', birthDate: '2014-05-02', joinedAt: '2024-02-01', status: 'ACTIVE', phone: '11999998888' },
    })
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/coroinhas',
      headers,
      payload: { fullName: 'ana clara souza', birthDate: '2014-05-02', joinedAt: '2024-02-01', status: 'ACTIVE' },
    })
    expect(first.statusCode).toBe(200)
    expect(duplicate.statusCode).toBe(409)
    const second = await app.inject({
      method: 'POST',
      url: '/api/coroinhas',
      headers,
      payload: { fullName: 'Bruno Lima', birthDate: '2013-08-09', joinedAt: '2024-02-01', status: 'ACTIVE' },
    })
    const celebration = await app.inject({
      method: 'POST',
      url: '/api/celebrations',
      headers,
      payload: { title: 'Missa dominical', date: '2026-11-01', time: '19:00', location: 'Matriz' },
    })
    expect(celebration.json().roles).toHaveLength(8)
    expect(celebration.json().roles.map((role: { role: string }) => role.role)).toEqual([...LITURGICAL_ROLES])
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/celebrations/${celebration.json().id}/assignments`,
      headers,
      payload: {
        assignments: [
          { role: 'CRUCIFERARIO', coroinhaId: first.json().id },
          { role: 'LIBRIFERO', coroinhaId: second.json().id },
        ],
      },
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().filledRoles).toBe(2)
    const repeated = await app.inject({
      method: 'PUT',
      url: `/api/celebrations/${celebration.json().id}/assignments`,
      headers,
      payload: {
        assignments: [
          { role: 'CRUCIFERARIO', coroinhaId: first.json().id },
          { role: 'LIBRIFERO', coroinhaId: first.json().id, overrideReason: 'Faltou o librífero titular nesta celebração.' },
        ],
      },
    })
    expect(repeated.statusCode).toBe(200)
    const published = await app.inject({ method: 'POST', url: `/api/celebrations/${celebration.json().id}/publish`, headers })
    expect(published.json().status).toBe('PUBLISHED')
    const ids = published.json().assignments.map((item: { id: string }) => item.id)
    const attendance = await app.inject({
      method: 'PUT',
      url: `/api/celebrations/${celebration.json().id}/attendance`,
      headers,
      payload: {
        items: [
          { assignmentId: ids[0], status: 'PRESENT' },
          { assignmentId: ids[1], status: 'JUSTIFIED', notes: 'Chegou de viagem.' },
        ],
      },
    })
    expect(attendance.statusCode).toBe(200)
    const removed = await app.inject({ method: 'DELETE', url: `/api/celebrations/${celebration.json().id}`, headers })
    expect(removed.statusCode).toBe(200)
    const gone = await app.inject({ method: 'GET', url: `/api/celebrations/${celebration.json().id}`, headers })
    expect(gone.statusCode).toBe(404)
  })

  it('controla bloco de rifa e conta participantes da arrecadação', async () => {
    const { app, token } = await login('COORDINATOR')
    const headers = auth(token)
    const person = await app.inject({
      method: 'POST',
      url: '/api/coroinhas',
      headers,
      payload: { fullName: 'Carla Mendes', birthDate: '2015-01-10', joinedAt: '2025-03-01', status: 'ACTIVE' },
    })
    const raffle = await app.inject({
      method: 'POST',
      url: '/api/raffles',
      headers,
      payload: {
        name: 'Rifa da páscoa',
        prize: 'Cesta',
        unitPrice: '2,50',
        blockCount: 3,
        miniBlockSize: 10,
        firstNumber: 21,
        firstBlock: 1,
        startsAt: '2026-03-01',
        endsAt: '2026-03-20',
        status: 'ACTIVE',
      },
    })
    const overflow = await app.inject({
      method: 'POST',
      url: `/api/raffles/${raffle.json().id}/blocks`,
      headers,
      payload: { label: 'A', participantName: 'Carla Mendes', coroinhaId: person.json().id, quantity: 40, soldQuantity: 0, unsoldQuantity: 0, amountReceived: '0' },
    })
    expect(overflow.statusCode).toBe(422)
    const block = await app.inject({
      method: 'POST',
      url: `/api/raffles/${raffle.json().id}/blocks`,
      headers,
      payload: { label: 'A', participantName: 'Carla Mendes', coroinhaId: person.json().id, quantity: 10, soldQuantity: 10, unsoldQuantity: 0, amountReceived: '20,00' },
    })
    expect(block.json().summary.available).toBe(20)
    expect(block.json().joinedBlocks).toHaveLength(3)
    expect(block.json().joinedBlocks[0].soldQuantity).toBe(10)
    expect(block.json().joinedBlocks[0].startNumber).toBe(21)
    expect(block.json().blocks[0].startNumber).toBe(21)
    expect(block.json().blocks[0].endNumber).toBe(30)
    expect(block.json().summary.pendingAmount).toBe('5.00')
    const campaign = await app.inject({
      method: 'POST',
      url: '/api/fundraisings',
      headers,
      payload: { name: 'Campanha do livro', category: 'Campanha', startsAt: '2026-04-01', status: 'ONGOING' },
    })
    await app.inject({ method: 'POST', url: `/api/fundraisings/${campaign.json().id}/participants`, headers, payload: { coroinhaId: person.json().id } })
    const again = await app.inject({ method: 'POST', url: `/api/fundraisings/${campaign.json().id}/participants`, headers, payload: { coroinhaId: person.json().id } })
    expect(again.statusCode).toBe(409)
    const updated = await app.inject({
      method: 'POST',
      url: `/api/fundraisings/${campaign.json().id}/transactions`,
      headers,
      payload: { type: 'INCOME', amount: '35,00', date: '2026-04-02', description: 'Contribuição da família', coroinhaId: person.json().id },
    })
    expect(updated.json().totals.participantCount).toBe(1)
    expect(updated.json().totals.balance).toBe('35.00')
    const meeting = await app.inject({
      method: 'POST',
      url: '/api/meetings',
      headers,
      payload: { title: 'Reunião de escala', date: '2026-11-02', startTime: '18:00', endTime: '19:00', status: 'SCHEDULED', agenda: 'Rever a missa de domingo', participants: [{ name: 'Coordenação' }] },
    })
    expect(meeting.statusCode).toBe(200)
    expect(meeting.json().soon).toBe(false)
    const removedRaffle = await app.inject({ method: 'DELETE', url: `/api/raffles/${raffle.json().id}`, headers })
    expect(removedRaffle.statusCode).toBe(200)
    const removedFundraising = await app.inject({ method: 'DELETE', url: `/api/fundraisings/${campaign.json().id}`, headers })
    expect(removedFundraising.statusCode).toBe(200)
    const removedMeeting = await app.inject({ method: 'DELETE', url: `/api/meetings/${meeting.json().id}`, headers })
    expect(removedMeeting.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/raffles/${raffle.json().id}`, headers })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: `/api/fundraisings/${campaign.json().id}`, headers })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: `/api/meetings/${meeting.json().id}`, headers })).statusCode).toBe(404)
  })
})
