// ─────────────────────────────────────────────────────────────────────
// Testes de integração: endpoints que aplicam regras CLT
//   - POST /api/schedules/:weekStart/publish — valida interjornada
//   - POST /api/convocations/:id/cancel-by-employer — multa 50%
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'

let app: Express
let adminToken: string

beforeAll(async () => {
  const mod: any = await import('../server.js')
  app = mod.app
  const login = await request(app)
    .post('/api/auth/login')
    .send({ name: 'Lucas', password: 'lucas123' })
  adminToken = login.body.token
})

// Helper: cria uma escala mínima para teste
function makeSchedule(days: any[]) {
  return { days, published: false }
}

describe('POST /api/schedules/:weekStart/publish — validação CLT', () => {
  it('publica escala limpa (sem violações) → 200', async () => {
    const weekStart = '2026-05-11' // segunda
    const schedule = makeSchedule([
      {
        date: '2026-05-11',
        slots: [
          { hour: '09:00-10:00', assignments: [] },
          { hour: '10:00-11:00', assignments: [] },
        ],
      },
    ])

    // Salva a escala primeiro
    await request(app)
      .put(`/api/schedules/${weekStart}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(schedule)

    // Publica
    const res = await request(app)
      .post(`/api/schedules/${weekStart}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(Array.isArray(res.body.warnings)).toBe(true)
  })

  it('bloqueia escala com interjornada violada → 422', async () => {
    const weekStart = '2026-05-18'
    const empId = 'emp-teste-interj'
    // Pega um employee real pra usar o id
    const empResp = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
    const realEmpId = empResp.body[0]?.id
    if (!realEmpId) {
      console.warn('Sem employees, skipando teste')
      return
    }

    const schedule = makeSchedule([
      {
        date: '2026-05-18', // segunda
        slots: [
          { hour: '14:00-15:00', assignments: [{ employeeId: realEmpId }] },
          { hour: '15:00-16:00', assignments: [{ employeeId: realEmpId }] },
          { hour: '16:00-17:00', assignments: [{ employeeId: realEmpId }] },
          { hour: '17:00-18:00', assignments: [{ employeeId: realEmpId }] },
          { hour: '18:00-19:00', assignments: [{ employeeId: realEmpId }] },
          { hour: '19:00-20:00', assignments: [{ employeeId: realEmpId }] },
          { hour: '20:00-21:00', assignments: [{ employeeId: realEmpId }] },
          { hour: '21:00-22:00', assignments: [{ employeeId: realEmpId }] },
          { hour: '22:00-23:00', assignments: [{ employeeId: realEmpId }] },
          // fim: 23h
        ],
      },
      {
        date: '2026-05-19', // terça
        slots: [
          // início: 08h → intervalo 9h → BLOQUEIA (menos de 11h)
          { hour: '08:00-09:00', assignments: [{ employeeId: realEmpId }] },
          { hour: '09:00-10:00', assignments: [{ employeeId: realEmpId }] },
        ],
      },
    ])

    await request(app)
      .put(`/api/schedules/${weekStart}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(schedule)

    const res = await request(app)
      .post(`/api/schedules/${weekStart}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('CLT_VIOLATION')
    expect(Array.isArray(res.body.blockers)).toBe(true)
    expect(res.body.blockers.length).toBeGreaterThanOrEqual(1)
    expect(res.body.blockers[0].rule).toBe('interjornada')
  })

  it('apenas gerente/admin pode publicar', async () => {
    const supLogin = await request(app)
      .post('/api/auth/login')
      .send({ name: 'Supervisor', password: 'super123' })
    const supToken = supLogin.body.token

    const res = await request(app)
      .post('/api/schedules/2026-05-11/publish')
      .set('Authorization', `Bearer ${supToken}`)

    expect(res.status).toBe(403)
  })
})

describe('POST /api/convocations/:id/cancel-by-employer', () => {
  it('retorna 404 para convocação inexistente', async () => {
    const res = await request(app)
      .post('/api/convocations/inexistente-id/cancel-by-employer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'test' })
    expect(res.status).toBe(404)
  })

  it('apenas admin/gerente pode cancelar', async () => {
    const supLogin = await request(app)
      .post('/api/auth/login')
      .send({ name: 'Supervisor', password: 'super123' })
    const supToken = supLogin.body.token

    const res = await request(app)
      .post('/api/convocations/qualquer/cancel-by-employer')
      .set('Authorization', `Bearer ${supToken}`)
      .send({})
    expect(res.status).toBe(403)
  })
})
