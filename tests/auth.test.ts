import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'

let app: Express

beforeAll(async () => {
  const mod: any = await import('../server.js')
  app = mod.app
})

describe('POST /api/auth/login', () => {
  it('aceita credenciais válidas do Admin (Lucas)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'Lucas', password: 'lucas123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.role).toBe('admin')
    expect(res.body.user.name).toBe('Lucas')
  })

  it('aceita credenciais válidas da Vivian (gerente)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'Vivian', password: 'vivian123' })
    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('gerente')
  })

  it('aceita credenciais válidas do Supervisor', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'Supervisor', password: 'super123' })
    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('supervisor')
  })

  it('aceita credenciais válidas da Anna (colaborador)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'Anna', password: 'anna1234' })
    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('colaborador')
  })

  it('rejeita senha errada com 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'Lucas', password: 'senha-errada' })
    expect(res.status).toBe(401)
  })

  it('rejeita usuário inexistente com 401 (não leakar user enum)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: 'Inexistente', password: 'qualquercoisa' })
    expect(res.status).toBe(401)
  })

  it('rejeita body incompleto com 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ name: 'Lucas' })
    expect(res.status).toBe(400)
  })
})

describe('Rotas protegidas exigem token', () => {
  it('GET /api/employees sem token retorna 401', async () => {
    const res = await request(app).get('/api/employees')
    expect(res.status).toBe(401)
  })

  it('GET /api/employees com token inválido retorna 401', async () => {
    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
  })

  it('GET /api/employees com token válido de admin retorna 200', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ name: 'Lucas', password: 'lucas123' })
    const token = login.body.token

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
