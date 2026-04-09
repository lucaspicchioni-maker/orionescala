import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'

let app: Express
let adminToken: string
let annaToken: string
let miguelToken: string
let annaEmployeeId: string
let miguelEmployeeId: string

beforeAll(async () => {
  const mod: any = await import('../server.js')
  app = mod.app

  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ name: 'Lucas', password: 'lucas123' })
  adminToken = adminLogin.body.token

  const annaLogin = await request(app)
    .post('/api/auth/login')
    .send({ name: 'Anna', password: 'anna1234' })
  annaToken = annaLogin.body.token
  annaEmployeeId = annaLogin.body.user.employeeId

  const miguelLogin = await request(app)
    .post('/api/auth/login')
    .send({ name: 'Miguel', password: 'miguel123' })
  miguelToken = miguelLogin.body.token
  miguelEmployeeId = miguelLogin.body.user.employeeId
})

// ── Pre-condição crítica: seed DEVE linkar colaborador a employee ─────────
describe('Seed integrity: colaborador-user linkado a employee', () => {
  it('Anna (colaborador) tem employeeId não-nulo no JWT', () => {
    expect(annaEmployeeId).toBeTruthy()
    expect(typeof annaEmployeeId).toBe('string')
  })

  it('Miguel (colaborador) tem employeeId não-nulo no JWT', () => {
    expect(miguelEmployeeId).toBeTruthy()
    expect(typeof miguelEmployeeId).toBe('string')
  })

  it('Anna e Miguel têm employeeIds diferentes', () => {
    expect(annaEmployeeId).not.toBe(miguelEmployeeId)
  })
})

// ── Ownership enforcement: colaborador só acessa os próprios dados ─────
describe('Ownership: colaborador pode ler os próprios dados', () => {
  it('Anna lê o próprio banco-horas/employee/:id (200)', async () => {
    const res = await request(app)
      .get(`/api/banco-horas/employee/${annaEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('Anna lê o próprio saldo de banco de horas (200)', async () => {
    const res = await request(app)
      .get(`/api/banco-horas/saldo/${annaEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('saldo')
  })

  it('Anna lê a própria produtividade (200)', async () => {
    const res = await request(app)
      .get(`/api/productivity/employee/${annaEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(200)
  })

  it('Anna lê os próprios shift-swaps (200)', async () => {
    const res = await request(app)
      .get(`/api/shift-swaps/employee/${annaEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(200)
  })

  it('Anna lê a própria disponibilidade (200)', async () => {
    const res = await request(app)
      .get(`/api/availabilities/employee/${annaEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(200)
  })

  it('Anna pode lançar ponto em nome próprio (2xx)', async () => {
    const res = await request(app)
      .post('/api/ponto')
      .set('Authorization', `Bearer ${annaToken}`)
      .send({
        employeeId: annaEmployeeId,
        date: '2026-04-08',
        status: 'on_time',
      })
    expect(res.status).toBe(200)
  })
})

describe('Ownership: colaborador NÃO pode ler dados alheios', () => {
  it('Anna NÃO pode ler banco-horas do Miguel (403)', async () => {
    const res = await request(app)
      .get(`/api/banco-horas/employee/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode ler saldo do Miguel (403)', async () => {
    const res = await request(app)
      .get(`/api/banco-horas/saldo/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode ler produtividade do Miguel (403)', async () => {
    const res = await request(app)
      .get(`/api/productivity/employee/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode ler shift-swaps do Miguel (403)', async () => {
    const res = await request(app)
      .get(`/api/shift-swaps/employee/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode ler disponibilidade do Miguel (403)', async () => {
    const res = await request(app)
      .get(`/api/availabilities/employee/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(403)
  })

  it('Miguel NÃO pode ler banco-horas da Anna (403) — teste inverso', async () => {
    const res = await request(app)
      .get(`/api/banco-horas/employee/${annaEmployeeId}`)
      .set('Authorization', `Bearer ${miguelToken}`)
    expect(res.status).toBe(403)
  })
})

describe('Ownership: colaborador NÃO pode escrever em nome alheio', () => {
  it('Anna NÃO pode solicitar férias em nome do Miguel (403)', async () => {
    const res = await request(app)
      .post('/api/vacations')
      .set('Authorization', `Bearer ${annaToken}`)
      .send({
        employeeId: miguelEmployeeId,
        startDate: '2026-05-01',
        endDate: '2026-05-10',
        days: 10,
      })
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode avaliar turno em nome do Miguel (403)', async () => {
    const res = await request(app)
      .post('/api/shift-feedbacks')
      .set('Authorization', `Bearer ${annaToken}`)
      .send({
        employeeId: miguelEmployeeId,
        weekStart: '2026-04-06',
        rating: 5,
      })
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode responder pesquisa em nome do Miguel (403)', async () => {
    const res = await request(app)
      .post('/api/surveys')
      .set('Authorization', `Bearer ${annaToken}`)
      .send({
        week: '2026-04-06',
        employeeId: miguelEmployeeId,
        score: 5,
      })
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode criar troca de turno em nome do Miguel (403)', async () => {
    const res = await request(app)
      .post('/api/shift-swaps')
      .set('Authorization', `Bearer ${annaToken}`)
      .send({
        employeeId: miguelEmployeeId,
        requestedDate: '2026-04-10',
        reason: 'teste',
      })
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode sobrescrever disponibilidade do Miguel (403)', async () => {
    const res = await request(app)
      .put('/api/availabilities')
      .set('Authorization', `Bearer ${annaToken}`)
      .send({
        employeeId: miguelEmployeeId,
        weekStart: '2026-04-06',
        slots: [],
      })
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode lançar ponto em nome do Miguel (403)', async () => {
    const res = await request(app)
      .post('/api/ponto')
      .set('Authorization', `Bearer ${annaToken}`)
      .send({
        employeeId: miguelEmployeeId,
        date: '2026-04-08',
        status: 'on_time',
      })
    expect(res.status).toBe(403)
  })
})

describe('Ownership: admin tem acesso amplo', () => {
  it('Admin pode ler produtividade de qualquer colaborador (200)', async () => {
    const res = await request(app)
      .get(`/api/productivity/employee/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })

  it('Admin pode ler banco-horas de qualquer colaborador (200)', async () => {
    const res = await request(app)
      .get(`/api/banco-horas/employee/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })
})
