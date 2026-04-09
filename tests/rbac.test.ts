import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'

let app: Express
const tokens: Record<string, string> = {}

const USERS = [
  { name: 'Lucas',      password: 'lucas123',  role: 'admin' },
  { name: 'Vivian',     password: 'vivian123', role: 'gerente' },
  { name: 'Supervisor', password: 'super123',  role: 'supervisor' },
  { name: 'RH',         password: 'rh1234',    role: 'rh' },
  { name: 'Anna',       password: 'anna1234',  role: 'colaborador' },
]

beforeAll(async () => {
  const mod: any = await import('../server.js')
  app = mod.app

  // Login todos pra obter tokens
  for (const u of USERS) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: u.name, password: u.password })
    if (res.status !== 200) {
      throw new Error(`Falha no login de ${u.name}: ${res.status} ${JSON.stringify(res.body)}`)
    }
    tokens[u.role] = res.body.token
  }
})

function withToken(req: request.Test, role: string) {
  return req.set('Authorization', `Bearer ${tokens[role]}`)
}

// ── Helper: espera que role tenha acesso (2xx/4xx que não seja 401/403) ─
function expectAllowed(status: number, context: string) {
  expect(status, `${context} — esperava permitido, veio ${status}`).not.toBe(401)
  expect(status, `${context} — esperava permitido, veio 403`).not.toBe(403)
}

function expectDenied(status: number, context: string) {
  expect(status, `${context} — esperava 403 mas veio ${status}`).toBe(403)
}

// ────────────────────────────────────────────────────────────────────────
// Matriz de acesso crítica — o coração da auditoria BMAD
// ────────────────────────────────────────────────────────────────────────

describe('RBAC: /api/users (só admin)', () => {
  it('admin: permitido', async () => {
    const res = await withToken(request(app).get('/api/users'), 'admin')
    expectAllowed(res.status, 'admin GET /api/users')
  })
  it('gerente: negado', async () => {
    const res = await withToken(request(app).get('/api/users'), 'gerente')
    expectDenied(res.status, 'gerente GET /api/users')
  })
  it('supervisor: negado', async () => {
    const res = await withToken(request(app).get('/api/users'), 'supervisor')
    expectDenied(res.status, 'supervisor GET /api/users')
  })
  it('rh: negado', async () => {
    const res = await withToken(request(app).get('/api/users'), 'rh')
    expectDenied(res.status, 'rh GET /api/users')
  })
  it('colaborador: negado', async () => {
    const res = await withToken(request(app).get('/api/users'), 'colaborador')
    expectDenied(res.status, 'colaborador GET /api/users')
  })
})

describe('RBAC: /api/banco-horas/week/:weekStart (admin/gerente/supervisor/rh)', () => {
  const url = '/api/banco-horas/week/2026-04-06'
  it('admin: permitido', async () => {
    const res = await withToken(request(app).get(url), 'admin')
    expectAllowed(res.status, 'admin GET banco-horas/week')
  })
  it('gerente: permitido', async () => {
    const res = await withToken(request(app).get(url), 'gerente')
    expectAllowed(res.status, 'gerente GET banco-horas/week')
  })
  it('supervisor: permitido', async () => {
    const res = await withToken(request(app).get(url), 'supervisor')
    expectAllowed(res.status, 'supervisor GET banco-horas/week')
  })
  it('rh: permitido', async () => {
    const res = await withToken(request(app).get(url), 'rh')
    expectAllowed(res.status, 'rh GET banco-horas/week')
  })
  it('colaborador: NEGADO (evita vazamento de dados salariais)', async () => {
    const res = await withToken(request(app).get(url), 'colaborador')
    expectDenied(res.status, 'colaborador GET banco-horas/week')
  })
})

describe('RBAC: POST /api/banco-horas (só admin/gerente/rh)', () => {
  it('admin: permitido', async () => {
    const res = await withToken(request(app).post('/api/banco-horas').send({}), 'admin')
    expectAllowed(res.status, 'admin POST banco-horas')
  })
  it('supervisor: NEGADO (supervisor não lança banco de horas manualmente)', async () => {
    const res = await withToken(request(app).post('/api/banco-horas').send({}), 'supervisor')
    expectDenied(res.status, 'supervisor POST banco-horas')
  })
  it('colaborador: NEGADO', async () => {
    const res = await withToken(request(app).post('/api/banco-horas').send({}), 'colaborador')
    expectDenied(res.status, 'colaborador POST banco-horas')
  })
})

describe('RBAC: /api/productivity/week/:weekStart (admin/gerente/supervisor/rh)', () => {
  const url = '/api/productivity/week/2026-04-06'
  it('colaborador: NEGADO', async () => {
    const res = await withToken(request(app).get(url), 'colaborador')
    expectDenied(res.status, 'colaborador GET productivity/week')
  })
  it('supervisor: permitido', async () => {
    const res = await withToken(request(app).get(url), 'supervisor')
    expectAllowed(res.status, 'supervisor GET productivity/week')
  })
})

describe('RBAC: POST /api/productivity (só admin/gerente/supervisor)', () => {
  it('rh: NEGADO (RH não lança produtividade)', async () => {
    const res = await withToken(request(app).post('/api/productivity').send({
      weekStart: '2026-04-06', employeeId: 'x',
    }), 'rh')
    expectDenied(res.status, 'rh POST productivity')
  })
  it('colaborador: NEGADO', async () => {
    const res = await withToken(request(app).post('/api/productivity').send({
      weekStart: '2026-04-06', employeeId: 'x',
    }), 'colaborador')
    expectDenied(res.status, 'colaborador POST productivity')
  })
})

describe('RBAC: /api/shift-swaps GET (só admin/gerente/supervisor)', () => {
  it('colaborador: NEGADO na listagem geral', async () => {
    const res = await withToken(request(app).get('/api/shift-swaps'), 'colaborador')
    expectDenied(res.status, 'colaborador GET shift-swaps')
  })
  it('rh: NEGADO', async () => {
    const res = await withToken(request(app).get('/api/shift-swaps'), 'rh')
    expectDenied(res.status, 'rh GET shift-swaps')
  })
  it('supervisor: permitido', async () => {
    const res = await withToken(request(app).get('/api/shift-swaps'), 'supervisor')
    expectAllowed(res.status, 'supervisor GET shift-swaps')
  })
})

describe('RBAC: PUT /api/shift-swaps/:id/resolve (só admin/gerente/supervisor)', () => {
  it('colaborador: NEGADO (não aprova a própria troca)', async () => {
    const res = await withToken(
      request(app).put('/api/shift-swaps/fake-id/resolve').send({ status: 'approved' }),
      'colaborador',
    )
    expectDenied(res.status, 'colaborador PUT shift-swaps/resolve')
  })
})

describe('RBAC: POST /api/announcements (só admin/gerente)', () => {
  it('supervisor: NEGADO', async () => {
    const res = await withToken(
      request(app).post('/api/announcements').send({ title: 'x', body: 'y' }),
      'supervisor',
    )
    expectDenied(res.status, 'supervisor POST announcements')
  })
  it('colaborador: NEGADO', async () => {
    const res = await withToken(
      request(app).post('/api/announcements').send({ title: 'x', body: 'y' }),
      'colaborador',
    )
    expectDenied(res.status, 'colaborador POST announcements')
  })
})

describe('RBAC: /api/whatsapp/messages (só admin/gerente)', () => {
  it('supervisor: NEGADO', async () => {
    const res = await withToken(request(app).get('/api/whatsapp/messages'), 'supervisor')
    expectDenied(res.status, 'supervisor GET whatsapp')
  })
  it('colaborador: NEGADO', async () => {
    const res = await withToken(request(app).get('/api/whatsapp/messages'), 'colaborador')
    expectDenied(res.status, 'colaborador GET whatsapp')
  })
})

describe('RBAC: /api/surveys/results (só admin/gerente/rh)', () => {
  it('supervisor: NEGADO', async () => {
    const res = await withToken(request(app).get('/api/surveys/results'), 'supervisor')
    expectDenied(res.status, 'supervisor GET surveys/results')
  })
  it('colaborador: NEGADO (não vê resultado agregado de clima)', async () => {
    const res = await withToken(request(app).get('/api/surveys/results'), 'colaborador')
    expectDenied(res.status, 'colaborador GET surveys/results')
  })
  it('rh: permitido', async () => {
    const res = await withToken(request(app).get('/api/surveys/results'), 'rh')
    expectAllowed(res.status, 'rh GET surveys/results')
  })
})

describe('RBAC: /api/epis (só admin/gerente/rh/supervisor — colaborador não vê gestão de EPIs)', () => {
  it('colaborador: NEGADO', async () => {
    const res = await withToken(request(app).get('/api/epis'), 'colaborador')
    expectDenied(res.status, 'colaborador GET epis')
  })
})

describe('RBAC: /api/goals PUT (só admin/gerente/rh)', () => {
  it('supervisor: NEGADO', async () => {
    const res = await withToken(
      request(app).put('/api/goals/2026-04-06').send({ targetOrders: 100 }),
      'supervisor',
    )
    expectDenied(res.status, 'supervisor PUT goals')
  })
  it('colaborador: NEGADO', async () => {
    const res = await withToken(
      request(app).put('/api/goals/2026-04-06').send({ targetOrders: 100 }),
      'colaborador',
    )
    expectDenied(res.status, 'colaborador PUT goals')
  })
})
