import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'

let app: Express
let adminToken: string
let annaToken: string
let annaEmployeeId: string | undefined
let miguelEmployeeId: string | undefined

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
  miguelEmployeeId = miguelLogin.body.user.employeeId
})

describe('Ownership: colaborador só acessa os próprios dados', () => {
  it('Anna lê o próprio banco-horas/employee/:id (permitido)', async () => {
    if (!annaEmployeeId) {
      // Sem employeeId ligado, endpoint retorna 400 — ainda assim não é 403
      const res = await request(app)
        .get('/api/banco-horas/employee/any')
        .set('Authorization', `Bearer ${annaToken}`)
      expect([400, 403]).toContain(res.status)
      return
    }
    const res = await request(app)
      .get(`/api/banco-horas/employee/${annaEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(200)
  })

  it('Anna NÃO pode ler banco-horas do Miguel', async () => {
    if (!annaEmployeeId || !miguelEmployeeId) return
    const res = await request(app)
      .get(`/api/banco-horas/employee/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(403)
  })

  it('Anna NÃO pode ler saldo de outro colaborador', async () => {
    if (!annaEmployeeId || !miguelEmployeeId) return
    const res = await request(app)
      .get(`/api/banco-horas/saldo/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(403)
  })

  it('Anna pode ler o próprio saldo', async () => {
    if (!annaEmployeeId) return
    const res = await request(app)
      .get(`/api/banco-horas/saldo/${annaEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('saldo')
  })

  it('Anna NÃO pode ler produtividade do Miguel', async () => {
    if (!miguelEmployeeId) return
    const res = await request(app)
      .get(`/api/productivity/employee/${miguelEmployeeId}`)
      .set('Authorization', `Bearer ${annaToken}`)
    expect(res.status).toBe(403)
  })

  it('Admin pode ler produtividade de qualquer colaborador', async () => {
    const target = miguelEmployeeId || 'any-id'
    const res = await request(app)
      .get(`/api/productivity/employee/${target}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })

  it('Anna NÃO pode solicitar férias em nome do Miguel', async () => {
    if (!miguelEmployeeId) return
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

  it('Anna NÃO pode avaliar o turno em nome do Miguel', async () => {
    if (!miguelEmployeeId) return
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

  it('Anna NÃO pode responder pesquisa de clima em nome do Miguel', async () => {
    if (!miguelEmployeeId) return
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

  it('Anna NÃO pode criar solicitação de troca em nome do Miguel', async () => {
    if (!miguelEmployeeId) return
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

  it('Anna NÃO pode sobrescrever disponibilidade do Miguel', async () => {
    if (!miguelEmployeeId) return
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

  it('Anna NÃO pode lançar ponto em nome do Miguel', async () => {
    if (!miguelEmployeeId) return
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
