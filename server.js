import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import compression from 'compression'
import {
  users, employees, schedules, ponto, convocations, appData, getDb,
  bancoHoras, productivity, weeklyGoals, shiftSwaps, availabilities,
  feedbacks, shiftFeedbacks, badges, announcements, whatsappMessages,
  vacationRequests, epis, climateSurveys,
} from './database.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000
const distPath = path.join(__dirname, 'dist')
const indexPath = path.join(distPath, 'index.html')
const APP_URL = process.env.APP_URL || 'https://orionescala-production.up.railway.app'

// ── JWT Secret (obrigatorio em producao) ────────────────────────────────
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET nao definida em producao. Configure no Railway e reinicie.')
  process.exit(1)
}
const _JWT_SECRET = process.env.JWT_SECRET || 'orion-dev-secret-nao-usar-em-producao'
if (!process.env.JWT_SECRET) {
  console.warn('WARN: JWT_SECRET nao definida. Usando secret de desenvolvimento — NAO USE EM PRODUCAO.')
}

// ── Security middleware ─────────────────────────────────────────────────
app.use(compression())
app.use(helmet({ contentSecurityPolicy: false })) // CSP off para SPA com inline scripts
app.use(cors({
  origin: APP_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}))
app.use(express.json({ limit: '512kb' }))

// ── RBAC helper ─────────────────────────────────────────────────────────
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    next()
  }
}

// Permite acesso se (a) role está na lista de "elevated", OU
// (b) usuário é colaborador E o employeeId do recurso é o dele.
// Usa req.params[idParam] ou req.body.employeeId para identificar o recurso.
function requireOwnerOrRole(idParam, ...elevatedRoles) {
  return (req, res, next) => {
    const role = req.user?.role
    if (!role) return res.status(401).json({ error: 'Nao autenticado' })
    if (elevatedRoles.includes(role)) return next()
    // Role não elevado: precisa ser o próprio
    const resourceEmployeeId = req.params[idParam] || req.body?.employeeId
    if (!resourceEmployeeId) {
      return res.status(400).json({ error: 'employeeId obrigatorio' })
    }
    if (req.user.employeeId !== resourceEmployeeId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    next()
  }
}

// ── Rate limiting ───────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 30,
  message: { error: 'Limite de requisicoes AI atingido. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
})

// ── Auth Middleware ─────────────────────────────────────────────────────

const PUBLIC_PATHS = [
  '/health',
  '/api/auth/login',
  '/api/convocations/confirm',
  '/api/convocations/presence',
]

function authMiddleware(req, res, next) {
  // Skip for non-API routes (static files, SPA)
  if (!req.path.startsWith('/api/')) return next()

  // Skip for public API paths
  if (PUBLIC_PATHS.some(p => req.path.startsWith(p))) return next()

  // Also allow GET /api/convocations/token/:token (public lookup)
  if (req.path.match(/^\/api\/convocations\/token\/.+/) && req.method === 'GET') return next()

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao fornecido' })
  }

  try {
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, _JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Token invalido ou expirado' })
  }
}

app.use(authMiddleware)

// ── Banco de Horas: atualiza automaticamente ao salvar ponto ─────────────
// Regex robusto: aceita "09:00-15:00", "09:00 - 15:00", "9:00-15:00"
const SLOT_HOUR_REGEX = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/

function parseSlotMinutes(hourStr) {
  if (typeof hourStr !== 'string') return null
  const match = hourStr.match(SLOT_HOUR_REGEX)
  if (!match) return null
  const startMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
  let endMin = parseInt(match[3], 10) * 60 + parseInt(match[4], 10)
  if (endMin <= startMin) endMin += 24 * 60 // turno noturno
  return endMin - startMin
}

function computeWeekStart(dateStr) {
  // dateStr = "YYYY-MM-DD". Interpreta como meio-dia UTC pra evitar DST edge cases.
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  d.setUTCDate(diff)
  return d.toISOString().split('T')[0]
}

function syncBancoHoras(pontoRecord) {
  try {
    if (!pontoRecord.employeeId || !pontoRecord.date) return

    const weekStart = computeWeekStart(pontoRecord.date)
    const workedMinutes = pontoRecord.workedMinutes || 0

    // Minutos escalados: busca turno na escala publicada da semana
    let scheduledMinutes = 0
    let parseFailures = 0
    const schedRow = getDb().prepare('SELECT data FROM schedules WHERE week_start = ? AND published = 1').get(weekStart)
    if (schedRow) {
      try {
        const schedData = JSON.parse(schedRow.data)
        for (const dayObj of schedData.days || []) {
          if (dayObj.date !== pontoRecord.date) continue
          for (const slot of dayObj.slots || []) {
            const assigned = (slot.assignments || []).find(a => a.employeeId === pontoRecord.employeeId)
            if (!assigned) continue
            const mins = parseSlotMinutes(slot.hour)
            if (mins == null) {
              parseFailures++
              console.error(`[syncBancoHoras] slot.hour malformado: "${slot.hour}" (emp=${pontoRecord.employeeId} date=${pontoRecord.date})`)
              continue
            }
            scheduledMinutes += mins
          }
        }
      } catch (e) {
        console.error('[syncBancoHoras] escala malformada para week', weekStart, e?.message || e)
      }
    }

    if (parseFailures > 0) {
      console.error(`[syncBancoHoras] ${parseFailures} slot(s) com formato inválido — banco de horas pode estar incorreto para ${pontoRecord.employeeId} em ${pontoRecord.date}`)
    }

    const balanceMinutes = workedMinutes - scheduledMinutes
    bancoHoras.upsert({
      employeeId: pontoRecord.employeeId,
      date: pontoRecord.date,
      weekStart,
      scheduledMinutes,
      workedMinutes,
      balanceMinutes,
      type: balanceMinutes > 0 ? 'extra' : balanceMinutes < 0 ? 'deficit' : 'regular',
      notes: 'auto',
    })
  } catch (err) {
    console.error('[syncBancoHoras]', err?.message || err)
  }
}

// Transação atômica: grava ponto + sincroniza banco de horas juntos.
// Se syncBancoHoras falhar, o ponto também é revertido.
function savePontoAtomic(record) {
  const tx = getDb().transaction((rec) => {
    ponto.upsert(rec)
    syncBancoHoras(rec)
  })
  tx(record)
}

// ── Health ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).send('ok')
})

// ── Auth Routes ─────────────────────────────────────────────────────────

// Dummy hash to prevent timing oracle (always run bcrypt even for unknown users)
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuvuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'

app.post('/api/auth/login', loginLimiter, (req, res) => {
  try {
    const { name, password } = req.body
    if (!name || !password) {
      return res.status(400).json({ error: 'Nome e senha obrigatorios' })
    }

    const user = users.findByName(name)
    const passwordOk = user
      ? users.verifyPassword(user, password)
      : (users.verifyPassword({ password_hash: DUMMY_HASH }, password), false)

    if (!user || !passwordOk) {
      return res.status(401).json({ error: 'Credenciais invalidas' })
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role, employeeId: user.employee_id },
      _JWT_SECRET,
      { expiresIn: '8h' }
    )

    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role, employeeId: user.employee_id },
    })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/auth/logout', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  try {
    const user = users.findById(req.user.id)
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' })
    res.json({
      id: user.id,
      name: user.name,
      role: user.role,
      employeeId: user.employee_id,
    })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Users management ────────────────────────────────────────────────────

app.get('/api/users', requireRole('admin'), (_req, res) => {
  try {
    const db = getDb()
    const all = db.prepare('SELECT id, name, role, employee_id FROM users ORDER BY name').all()
    res.json(all)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/users', requireRole('admin'), (req, res) => {
  try {
    const { name, role, password, employeeId } = req.body
    if (!name || !role || !password) return res.status(400).json({ error: 'nome, role e password obrigatorios' })
    const existing = users.findByName(name)
    if (existing) return res.status(409).json({ error: 'Ja existe um usuario com este nome' })
    const id = users.create({ name, role, password, employeeId })
    res.status(201).json({ id, name, role, employeeId: employeeId || null })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/users/:id/password', requireRole('admin'), (req, res) => {
  try {
    const { password } = req.body
    if (!password || password.length < 4) return res.status(400).json({ error: 'Senha muito curta (minimo 4 caracteres)' })
    const db = getDb()
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' })
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
  try {
    const db = getDb()
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Employees CRUD ──────────────────────────────────────────────────────

app.get('/api/employees', requireRole('admin', 'gerente', 'supervisor', 'rh'), (_req, res) => {
  try {
    const all = employees.getAll().map(employees.toFrontend)
    res.json(all)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/employees', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    const { name, role, status, hourlyRate } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'nome obrigatorio' })
    const validRoles = ['auxiliar', 'lider', 'supervisor', 'gerente']
    if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'role invalido' })
    if (hourlyRate !== undefined && (isNaN(Number(hourlyRate)) || Number(hourlyRate) < 0)) return res.status(400).json({ error: 'hourlyRate invalido' })
    const id = employees.create(req.body)
    const emp = employees.getById(id)
    res.json(employees.toFrontend(emp))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/employees/:id', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    employees.update(req.params.id, req.body)
    const emp = employees.getById(req.params.id)
    if (!emp) return res.status(404).json({ error: 'Colaborador nao encontrado' })
    res.json(employees.toFrontend(emp))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.delete('/api/employees/:id', requireRole('admin', 'gerente'), (req, res) => {
  try {
    employees.delete(req.params.id)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Schedules ───────────────────────────────────────────────────────────

app.get('/api/schedules', requireRole('admin', 'gerente', 'supervisor', 'rh'), (_req, res) => {
  try {
    const all = schedules.getAll()
    res.json(all)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/schedules/:weekStart', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    const schedule = schedules.getByWeek(req.params.weekStart)
    if (!schedule) return res.status(404).json({ error: 'Escala nao encontrada' })
    res.json(schedule)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/schedules/:weekStart', requireRole('admin', 'gerente'), (req, res) => {
  try {
    schedules.upsert(req.params.weekStart, { ...req.body, weekStart: req.params.weekStart })
    const schedule = schedules.getByWeek(req.params.weekStart)
    res.json(schedule)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Publish Schedule + Create Convocations ──────────────────────────────

app.post('/api/schedules/:weekStart/publish', requireRole('admin', 'gerente'), (req, res) => {
  try {
    const { weekStart } = req.params
    const schedule = schedules.getByWeek(weekStart)
    if (!schedule) return res.status(404).json({ error: 'Escala nao encontrada' })

    // Verify minimum 3 days in advance
    const now = new Date()
    const wsDate = new Date(weekStart + 'T00:00:00')
    const diffMs = wsDate.getTime() - now.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    // Allow publishing if week hasn't started yet or has just started
    // 3-day advance check (relaxed for testing — warn but don't block)
    const advanceWarning = diffDays < 3

    // Mark as published
    schedules.upsert(weekStart, { ...schedule, published: true, publishedAt: new Date().toISOString() })

    // Group consecutive slots per employee per day into shifts
    const messages = []
    const allEmployees = employees.getAll()

    if (schedule.days) {
      for (const day of schedule.days) {
        // Build employee -> hours map
        const empHours = {}
        for (const slot of (day.slots || [])) {
          for (const assignment of (slot.assignments || [])) {
            if (assignment.employeeId) {
              if (!empHours[assignment.employeeId]) empHours[assignment.employeeId] = []
              empHours[assignment.employeeId].push(slot.hour)
            }
          }
        }

        // Group consecutive hours into shifts
        for (const [empId, hours] of Object.entries(empHours)) {
          const sortedHours = hours.sort()
          const shifts = []
          let shiftStart = null
          let prevEnd = null

          for (const hourRange of sortedHours) {
            const [start, end] = hourRange.split('-')
            if (shiftStart === null) {
              shiftStart = start
              prevEnd = end
            } else if (start === prevEnd) {
              prevEnd = end
            } else {
              shifts.push({ start: shiftStart, end: prevEnd })
              shiftStart = start
              prevEnd = end
            }
          }
          if (shiftStart !== null) {
            shifts.push({ start: shiftStart, end: prevEnd })
          }

          // Create convocation for each shift
          const emp = allEmployees.find(e => e.id === empId)
          const empName = emp ? emp.name : empId

          for (const shift of shifts) {
            const token = randomUUID()
            const shiftDate = day.date
            const presenceDeadlineStr = `${shiftDate}T${shift.start}:00`
            // presence deadline = 2h before shift start
            const presDeadline = new Date(presenceDeadlineStr)
            presDeadline.setHours(presDeadline.getHours() - 2)

            convocations.create({
              id: randomUUID(),
              employeeId: empId,
              weekStart,
              shiftDate,
              shiftStart: shift.start,
              shiftEnd: shift.end,
              token,
              presenceDeadline: presDeadline.toISOString().replace('T', ' ').substring(0, 19),
            })

            const dayLabel = new Date(shiftDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
            const confirmUrl = `${APP_URL}/confirmar?token=${token}`

            const message = `Ola ${empName}! Voce foi convocado(a) para trabalhar:\n\n` +
              `Data: ${dayLabel}\n` +
              `Horario: ${shift.start} - ${shift.end}\n\n` +
              `Confirme em ate 12h:\n${confirmUrl}\n\n` +
              `Apos aceitar, no-show resulta em multa de 50% do valor do turno (Art. 452-A CLT).`

            const phone = emp ? emp.phone : ''
            if (phone) {
              whatsappMessages.log({ employeeId: empId, phone, message, type: 'convocation' })
            }

            messages.push({
              employeeId: empId,
              employeeName: empName,
              phone,
              shiftDate,
              shiftStart: shift.start,
              shiftEnd: shift.end,
              message,
              confirmUrl,
              // token omitido do response por segurança
            })
          }
        }
      }
    }

    res.json({
      ok: true,
      advanceWarning,
      totalConvocations: messages.length,
      messages,
    })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Ponto ───────────────────────────────────────────────────────────────

app.get('/api/ponto', requireRole('admin', 'gerente', 'supervisor', 'rh'), (_req, res) => {
  try {
    res.json(ponto.getAll())
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/ponto', requireRole('admin', 'gerente', 'supervisor', 'colaborador'), (req, res) => {
  try {
    const { employeeId, date, status } = req.body
    if (!employeeId || !date || !status) return res.status(400).json({ error: 'employeeId, date e status obrigatorios' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date formato invalido (YYYY-MM-DD)' })
    const validStatuses = ['on_time', 'late', 'absent', 'extra']
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'status invalido' })
    if (req.user.role === 'colaborador' && req.user.employeeId !== employeeId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    const record = { ...req.body, id: req.body.id || randomUUID() }
    savePontoAtomic(record)
    res.json(record)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/ponto/:id', requireRole('admin', 'gerente', 'supervisor'), (req, res) => {
  try {
    const record = { ...req.body, id: req.params.id }
    savePontoAtomic(record)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Convocations ────────────────────────────────────────────────────────

app.get('/api/convocations/:weekStart', requireRole('admin', 'gerente', 'supervisor', 'colaborador', 'rh'), (req, res) => {
  try {
    const all = convocations.getByWeek(req.params.weekStart)
    const allEmps = employees.getAll()
    const enriched = all.map(c => {
      const emp = allEmps.find(e => e.id === c.employee_id)
      return {
        id: c.id,
        employeeId: c.employee_id,
        employeeName: emp ? emp.name : c.employee_id,
        weekStart: c.week_start,
        shiftDate: c.shift_date,
        shiftStart: c.shift_start,
        shiftEnd: c.shift_end,
        token: c.token,
        status: c.status,
        sentAt: c.sent_at,
        deadline: c.deadline,
        respondedAt: c.responded_at,
        response: c.response,
        presenceDeadline: c.presence_deadline,
        presenceResponse: c.presence_response,
        noshowFine: c.noshow_fine,
      }
    })
    res.json(enriched)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// Public: lookup convocation by token
app.get('/api/convocations/token/:token', (req, res) => {
  try {
    const c = convocations.getByToken(req.params.token)
    if (!c) return res.status(404).json({ error: 'Convocacao nao encontrada' })
    const emp = employees.getById(c.employee_id)
    res.json({
      id: c.id,
      employeeName: emp ? emp.name : 'Colaborador',
      weekStart: c.week_start,
      shiftDate: c.shift_date,
      shiftStart: c.shift_start,
      shiftEnd: c.shift_end,
      status: c.status,
      deadline: c.deadline,
      respondedAt: c.responded_at,
      response: c.response,
      presenceDeadline: c.presence_deadline,
      presenceResponse: c.presence_response,
    })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// Public: confirm or decline convocation
app.post('/api/convocations/confirm', (req, res) => {
  try {
    const { token, response } = req.body
    if (!token || !['sim', 'nao'].includes(response)) {
      return res.status(400).json({ error: 'Token e resposta (sim/nao) obrigatorios' })
    }

    const c = convocations.getByToken(token)
    if (!c) return res.status(404).json({ error: 'Convocacao nao encontrada' })

    if (c.status !== 'pending') {
      return res.json({ ok: true, alreadyResponded: true, status: c.status })
    }

    // Check deadline
    const now = new Date()
    const deadline = new Date(c.deadline)
    if (now > deadline) {
      return res.json({ ok: false, expired: true, status: c.status })
    }

    const newStatus = response === 'sim' ? 'confirmed' : 'declined'
    convocations.updateStatus(c.id, newStatus, response)

    res.json({ ok: true, status: newStatus })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// Public: confirm presence (2h before shift)
app.post('/api/convocations/presence', (req, res) => {
  try {
    const { token, response } = req.body
    if (!token || !['presente', 'ausente'].includes(response)) {
      return res.status(400).json({ error: 'Token e resposta (presente/ausente) obrigatorios' })
    }

    const c = convocations.getByToken(token)
    if (!c) return res.status(404).json({ error: 'Convocacao nao encontrada' })

    if (c.status !== 'confirmed') {
      return res.json({ ok: false, error: 'Convocacao nao esta confirmada', status: c.status })
    }

    if (c.presence_response) {
      return res.json({ ok: true, alreadyResponded: true, presenceResponse: c.presence_response })
    }

    convocations.updatePresenceResponse(c.id, response)
    res.json({ ok: true, status: response === 'presente' ? 'present' : 'absent' })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// Authenticated: collaborator responds to own convocation by id
app.post('/api/convocations/:id/respond', requireRole('admin', 'gerente', 'supervisor', 'colaborador'), (req, res) => {
  try {
    const { response } = req.body
    if (!['sim', 'nao'].includes(response)) {
      return res.status(400).json({ error: 'Resposta deve ser sim ou nao' })
    }
    const c = convocations.getById(req.params.id)
    if (!c) return res.status(404).json({ error: 'Convocacao nao encontrada' })

    // Only the own collaborator (or managers) can respond
    const user = req.user
    if (user.role === 'colaborador' && c.employee_id !== user.employeeId) {
      return res.status(403).json({ error: 'Sem permissao' })
    }

    if (c.status !== 'pending') {
      return res.json({ ok: true, alreadyResponded: true, status: c.status })
    }

    const now = new Date()
    const deadline = new Date(c.deadline)
    if (now > deadline) {
      return res.json({ ok: false, expired: true, status: c.status })
    }

    const newStatus = response === 'sim' ? 'confirmed' : 'declined'
    convocations.updateStatus(c.id, newStatus, response)
    res.json({ ok: true, status: newStatus })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── App Data (generic KV) ───────────────────────────────────────────────

const ALLOWED_KV_KEYS = new Set(['settings', 'whatsapp-config', 'location-config', 'notification-prefs', 'golden-rules'])

app.get('/api/data/:key', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    if (!ALLOWED_KV_KEYS.has(req.params.key)) return res.status(400).json({ error: 'Chave nao permitida' })
    const value = appData.get(req.params.key)
    res.json(value)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/data/:key', requireRole('admin', 'gerente'), (req, res) => {
  try {
    if (!ALLOWED_KV_KEYS.has(req.params.key)) return res.status(400).json({ error: 'Chave nao permitida' })
    appData.set(req.params.key, req.body)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/data/:key/merge', requireRole('admin', 'gerente'), (req, res) => {
  try {
    if (!ALLOWED_KV_KEYS.has(req.params.key)) return res.status(400).json({ error: 'Chave nao permitida' })
    const existing = appData.get(req.params.key, [])
    const incoming = req.body
    if (!Array.isArray(existing) || !Array.isArray(incoming)) {
      return res.status(400).json({ error: 'Merge requer arrays' })
    }
    const merged = [...existing]
    for (const item of incoming) {
      const idx = merged.findIndex(e => e.id === item.id)
      if (idx >= 0) merged[idx] = item
      else merged.push(item)
    }
    appData.set(req.params.key, merged)
    res.json(merged)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Claude AI Routes ────────────────────────────────────────────────────

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

if (anthropic) {
  app.post('/api/ai/rh-insights', aiLimiter, async (req, res) => {
    try {
      const { employees: empData, pontoStats, topAbsentees, employeeNames } = req.body
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        system: `Voce e um especialista em RH para empresas de food delivery com contratacao intermitente (CLT).
Analise dados operacionais e gere insights acionaveis em portugues.
Seja direto, use dados concretos. Foque no que o gerente pode fazer agora.`,
        messages: [{
          role: 'user',
          content: `Analise estes dados de RH e retorne JSON:

Equipe: ${empData?.total ?? 0} ativos, ${empData?.vacation ?? 0} ferias, ${empData?.inactive ?? 0} inativos
Ultimos 30 dias: ${pontoStats?.absences ?? 0} faltas, ${pontoStats?.lates ?? 0} atrasos, ${Math.round((pontoStats?.totalWorked ?? 0) / 60)}h trabalhadas
Top absenteismo: ${topAbsentees?.map(([id, s]) => `${employeeNames?.[id] ?? id}: ${s.absences} faltas`).join(', ') || 'nenhum'}

Retorne APENAS JSON valido:
{
  "summary": "resumo executivo em 2 frases",
  "alerts": [{"level": "critical|warning|info", "text": "alerta especifico"}],
  "recommendations": ["acao concreta 1", "acao concreta 2", "acao concreta 3"]
}`,
        }],
      })
      const textBlock = response.content.find(b => b.type === 'text')
      const text = textBlock?.text ?? '{}'
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text, alerts: [], recommendations: [] }
      res.json(parsed)
    } catch (err) {
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  })

  app.post('/api/ai/schedule-suggest', aiLimiter, async (req, res) => {
    try {
      const { schedule, employees: emps, weekStart } = req.body
      const slotSummary = schedule?.days?.map(day => {
        const underStaffed = day.slots?.filter(s => s.assignments?.length < s.requiredPeople).map(s => s.hour)
        return `${day.dayOfWeek} (${day.date}): ${underStaffed?.length ?? 0} slots descobertos`
      }).join('\n') ?? 'Sem dados'
      const empSummary = emps?.map(e => `${e.name} (${e.role}) - status: ${e.status}`).join(', ') ?? 'Sem colaboradores'

      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        system: `Voce e um especialista em escala de trabalho intermitente para food delivery.
Regras CLT: minimo 3h/turno, maximo 44h semanais, convocacao com 3 dias de antecedencia.
Picos de demanda: almoco (11h-14h) e jantar (18h-22h). Responda em portugues.`,
        messages: [{
          role: 'user',
          content: `Analise a escala da semana ${weekStart}:
Equipe: ${empSummary}
Status por dia:
${slotSummary}
Retorne APENAS JSON valido:
{
  "analysis": "analise geral em 2-3 frases",
  "problems": ["problema critico 1"],
  "suggestions": ["sugestao acionavel 1"],
  "priority_slots": ["hora/dia mais critico"]
}`,
        }],
      })
      const textBlock = response.content.find(b => b.type === 'text')
      const text = textBlock?.text ?? '{}'
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: text, problems: [], suggestions: [], priority_slots: [] }
      res.json(parsed)
    } catch (err) {
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  })

  app.post('/api/ai/absence-risk', aiLimiter, async (req, res) => {
    try {
      const { employee, baseScore, baseReasons, upcomingShifts } = req.body
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Colaborador: ${employee?.name}, funcao: ${employee?.role}
Score base de risco: ${baseScore}/100
Motivos identificados: ${baseReasons?.join(', ') || 'nenhum'}
Proximos turnos: ${upcomingShifts?.map(s => `${s.date} ${s.startHour}-${s.endHour}`).join(', ') || 'nenhum'}
Retorne APENAS JSON valido:
{
  "riskScore": ${baseScore},
  "reasoning": "explicacao em 1 frase do risco",
  "recommendation": "acao recomendada para o supervisor"
}`,
        }],
      })
      const textBlock = response.content.find(b => b.type === 'text')
      const text = textBlock?.text ?? '{}'
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { riskScore: baseScore, reasoning: '', recommendation: '' }
      res.json(parsed)
    } catch (err) {
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  })

  app.post('/api/ai/whatsapp-message', aiLimiter, async (req, res) => {
    try {
      const { type, employeeName, context } = req.body
      const typeInstructions = {
        schedule_notify: 'Notificacao de escala publicada. Inclua prazo de resposta (1 dia util) e aviso da multa de 50% por no-show apos aceite.',
        presence_check: 'Lembrete de turno em breve. Seja motivador e direto.',
        absence_alert: 'Alerta de ausencia nao confirmada. Tom urgente mas respeitoso.',
        custom: 'Mensagem geral. Tom profissional e amigavel.',
      }
      const instruction = typeInstructions[type] ?? typeInstructions.custom
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        system: 'Voce escreve mensagens de WhatsApp curtas (max 3 paragrafos) para colaboradores de food delivery. Use emoji com moderacao. Sem saudacoes longas.',
        messages: [{
          role: 'user',
          content: `Crie mensagem para ${employeeName}. Tipo: ${instruction}
Contexto adicional: ${JSON.stringify(context ?? {})}
Retorne APENAS o texto da mensagem, sem JSON, sem formatacao extra.`,
        }],
      })
      const textBlock = response.content.find(b => b.type === 'text')
      res.json({ message: textBlock?.text ?? '' })
    } catch (err) {
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  })
} else {
  app.use('/api/ai', (_req, res) => {
    res.status(503).json({ error: 'ANTHROPIC_API_KEY nao configurada no servidor.' })
  })
}

// ── Banco de Horas ──────────────────────────────────────────────────────

app.get('/api/banco-horas/employee/:id', requireOwnerOrRole('id', 'admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(bancoHoras.getByEmployee(req.params.id).map(bancoHoras.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/banco-horas/week/:weekStart', requireRole('admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(bancoHoras.getByWeek(req.params.weekStart).map(bancoHoras.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/banco-horas/saldo/:employeeId', requireOwnerOrRole('employeeId', 'admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json({ saldo: bancoHoras.getSaldo(req.params.employeeId) })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/banco-horas', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    const id = bancoHoras.upsert(req.body)
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Productivity ────────────────────────────────────────────────────────

app.get('/api/productivity/week/:weekStart', requireRole('admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(productivity.getByWeek(req.params.weekStart).map(productivity.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/productivity/employee/:id', requireOwnerOrRole('id', 'admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(productivity.getByEmployee(req.params.id).map(productivity.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/productivity', requireRole('admin', 'gerente', 'supervisor'), (req, res) => {
  try {
    const { weekStart, totalOrders, employeeId } = req.body
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ error: 'weekStart invalido (YYYY-MM-DD)' })
    }
    if (totalOrders !== undefined && (typeof totalOrders !== 'number' || totalOrders < 0)) {
      return res.status(400).json({ error: 'totalOrders deve ser numero >= 0' })
    }
    if (!employeeId) return res.status(400).json({ error: 'employeeId obrigatorio' })
    const id = productivity.upsert(req.body)
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Weekly Goals ────────────────────────────────────────────────────────

app.get('/api/goals/:weekStart', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    const row = weeklyGoals.getByWeek(req.params.weekStart)
    res.json(weeklyGoals.toFrontend(row))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/goals/:weekStart', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    const id = weeklyGoals.upsert({ ...req.body, weekStart: req.params.weekStart, createdBy: req.user.name })
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Shift Swaps ─────────────────────────────────────────────────────────

app.get('/api/shift-swaps', requireRole('admin', 'gerente', 'supervisor'), (req, res) => {
  try {
    res.json(shiftSwaps.getPending().map(shiftSwaps.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/shift-swaps/employee/:id', requireOwnerOrRole('id', 'admin', 'gerente', 'supervisor'), (req, res) => {
  try {
    res.json(shiftSwaps.getByEmployee(req.params.id).map(shiftSwaps.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/shift-swaps', requireRole('admin', 'gerente', 'supervisor', 'colaborador'), (req, res) => {
  try {
    const { employeeId, requestedDate, reason } = req.body
    if (!employeeId) return res.status(400).json({ error: 'employeeId obrigatorio' })
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return res.status(400).json({ error: 'requestedDate invalido (YYYY-MM-DD)' })
    }
    if (reason !== undefined && typeof reason !== 'string') {
      return res.status(400).json({ error: 'reason deve ser string' })
    }
    // Colaborador só cria troca para si mesmo
    if (req.user.role === 'colaborador' && req.user.employeeId !== employeeId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    const id = shiftSwaps.create(req.body)
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/shift-swaps/:id/resolve', requireRole('admin', 'gerente', 'supervisor'), (req, res) => {
  try {
    shiftSwaps.resolve(req.params.id, req.body.status, req.user.name)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Availabilities ──────────────────────────────────────────────────────

app.get('/api/availabilities/week/:weekStart', requireRole('admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(availabilities.getByWeek(req.params.weekStart).map(availabilities.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/availabilities/employee/:id', requireOwnerOrRole('id', 'admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(availabilities.getByEmployee(req.params.id).map(availabilities.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/availabilities', requireRole('admin', 'gerente', 'supervisor', 'colaborador'), (req, res) => {
  try {
    const { employeeId } = req.body
    // Colaborador só pode atualizar a própria disponibilidade
    if (req.user.role === 'colaborador' && req.user.employeeId !== employeeId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    const id = availabilities.upsert(req.body)
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Feedbacks (Avaliação 360) ───────────────────────────────────────────

app.get('/api/feedbacks/week/:weekStart', requireRole('admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(feedbacks.getByWeek(req.params.weekStart).map(feedbacks.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/feedbacks/employee/:id', requireOwnerOrRole('id', 'admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(feedbacks.getByEmployee(req.params.id).map(feedbacks.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/feedbacks', requireRole('admin', 'gerente', 'supervisor'), (req, res) => {
  try {
    const { weekStart, employeeId, scores } = req.body
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ error: 'weekStart invalido (YYYY-MM-DD)' })
    }
    if (!employeeId) return res.status(400).json({ error: 'employeeId obrigatorio' })
    if (scores !== undefined && typeof scores !== 'object') {
      return res.status(400).json({ error: 'scores deve ser objeto' })
    }
    const id = feedbacks.upsert({ ...req.body, evaluatorId: req.user.id })
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Shift Feedbacks ─────────────────────────────────────────────────────

app.get('/api/shift-feedbacks/week/:weekStart', requireRole('admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(shiftFeedbacks.getByWeek(req.params.weekStart).map(shiftFeedbacks.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/shift-feedbacks', requireRole('admin', 'gerente', 'supervisor', 'colaborador'), (req, res) => {
  try {
    const { employeeId, date, weekStart, rating } = req.body
    if (!employeeId) return res.status(400).json({ error: 'employeeId obrigatorio' })
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ error: 'weekStart invalido (YYYY-MM-DD)' })
    }
    if (rating !== undefined && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'rating deve ser numero entre 1 e 5' })
    }
    // Colaborador só avalia o próprio turno
    if (req.user.role === 'colaborador' && req.user.employeeId !== employeeId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    const feedbackDate = date || new Date().toISOString().split('T')[0]
    const existing = shiftFeedbacks.getByEmployeeDate(employeeId, feedbackDate)
    if (existing) return res.status(409).json({ error: 'Voce ja avaliou seu turno hoje' })
    const id = shiftFeedbacks.upsert({ ...req.body, date: feedbackDate })
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Badges ──────────────────────────────────────────────────────────────

app.get('/api/badges/employee/:id', requireOwnerOrRole('id', 'admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    res.json(badges.getByEmployee(req.params.id).map(badges.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/badges/week/:weekStart', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    res.json(badges.getByWeek(req.params.weekStart).map(badges.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/badges', requireRole('admin', 'gerente', 'supervisor'), (req, res) => {
  try {
    badges.award(req.body)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Announcements (Mural) ───────────────────────────────────────────────

app.get('/api/announcements', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    res.json(announcements.getActive().map(announcements.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/announcements', requireRole('admin', 'gerente'), (req, res) => {
  try {
    const id = announcements.create({ ...req.body, createdBy: req.user.name })
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.delete('/api/announcements/:id', requireRole('admin', 'gerente'), (req, res) => {
  try {
    announcements.delete(req.params.id)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/announcements/:id/read', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    const { employeeId } = req.body
    // Colaborador só marca como lido pra ele mesmo
    if (req.user.role === 'colaborador' && req.user.employeeId !== employeeId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    if (employeeId) announcements.markRead(req.params.id, employeeId)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── WhatsApp Log ────────────────────────────────────────────────────────

app.get('/api/whatsapp/messages', requireRole('admin', 'gerente'), (req, res) => {
  try {
    res.json(whatsappMessages.getRecent(100).map(whatsappMessages.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/whatsapp/messages/:employeeId', requireRole('admin', 'gerente'), (req, res) => {
  try {
    res.json(whatsappMessages.getByEmployee(req.params.employeeId).map(whatsappMessages.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/whatsapp/log', requireRole('admin', 'gerente'), (req, res) => {
  try {
    const id = whatsappMessages.log(req.body)
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Férias ──────────────────────────────────────────────────────────────────

app.get('/api/vacations', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    const role = req.user.role
    const employeeId = req.user.employeeId
    if (role === 'colaborador' && employeeId) {
      res.json(vacationRequests.getByEmployee(employeeId).map(vacationRequests.toFrontend))
    } else {
      res.json(vacationRequests.getAll().map(vacationRequests.toFrontend))
    }
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/vacations', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    const { employeeId, startDate, endDate, days, notes } = req.body
    if (!employeeId || !startDate || !endDate || !days) return res.status(400).json({ error: 'Dados incompletos' })
    // Colaborador só solicita férias pra si mesmo
    if (req.user.role === 'colaborador' && req.user.employeeId !== employeeId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    const id = vacationRequests.create({ employeeId, startDate, endDate, days, notes, requestedBy: req.user.name })
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/vacations/:id/approve', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    vacationRequests.updateStatus(req.params.id, 'approved', req.user.name)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/vacations/:id/reject', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    vacationRequests.updateStatus(req.params.id, 'rejected', req.user.name)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── EPIs ─────────────────────────────────────────────────────────────────────

app.get('/api/epis', requireRole('admin', 'gerente', 'rh', 'supervisor'), (req, res) => {
  try {
    const allEpis = epis.getAll().map(epis.toFrontend)
    res.json(allEpis)
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/epis/expiring', requireRole('admin', 'gerente', 'rh', 'supervisor'), (req, res) => {
  try {
    res.json(epis.getExpiringSoon(30).map(epis.toFrontend))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/epis', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    const { employeeId, name, type, deliveredAt, expiresAt, notes } = req.body
    if (!employeeId || !name || !type || !deliveredAt) return res.status(400).json({ error: 'Dados incompletos' })
    const id = epis.create({ employeeId, name, type, deliveredAt, expiresAt, notes })
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.put('/api/epis/:id', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    epis.update(req.params.id, req.body)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.delete('/api/epis/:id', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    epis.delete(req.params.id)
    res.json({ ok: true })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Pesquisa de Clima ────────────────────────────────────────────────────────

app.get('/api/surveys', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    const role = req.user.role
    const employeeId = req.user.employeeId
    if (role === 'colaborador' && employeeId) {
      res.json(climateSurveys.getByWeek(req.query.week || '').map(climateSurveys.toFrontend).filter(s => s.employeeId === employeeId))
    } else {
      const week = req.query.week
      res.json(week ? climateSurveys.getByWeek(week).map(climateSurveys.toFrontend) : climateSurveys.getAll().map(climateSurveys.toFrontend))
    }
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.post('/api/surveys', requireRole('admin', 'gerente', 'supervisor', 'rh', 'colaborador'), (req, res) => {
  try {
    const { week, employeeId, score, highlights, improvements } = req.body
    if (!week || !employeeId || !score) return res.status(400).json({ error: 'Dados incompletos' })
    // Colaborador só responde pesquisa como ele mesmo
    if (req.user.role === 'colaborador' && req.user.employeeId !== employeeId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }
    const existing = climateSurveys.getByEmployeeAndWeek(employeeId, week)
    if (existing) return res.status(409).json({ error: 'Voce ja respondeu esta semana' })
    const id = climateSurveys.create({ week, employeeId, score, highlights, improvements })
    res.json({ id })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/surveys/results', requireRole('admin', 'gerente', 'rh'), (req, res) => {
  try {
    const week = req.query.week || ''
    res.json(climateSurveys.getResults(week))
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

app.get('/api/surveys/check/:week/:employeeId', requireOwnerOrRole('employeeId', 'admin', 'gerente', 'supervisor', 'rh'), (req, res) => {
  try {
    const row = climateSurveys.getByEmployeeAndWeek(req.params.employeeId, req.params.week)
    res.json({ answered: !!row, survey: row ? climateSurveys.toFrontend(row) : null })
  } catch (err) { console.error('[API]', req.method, req.path, err?.message || err); res.status(500).json({ error: 'Erro interno do servidor' }) }
})

// ── Automated Jobs (every 60s) ──────────────────────────────────────────

function runAutomatedJobs() {
  try {
    // 1. Expire pending convocations past deadline
    const expired = convocations.getExpiredPending()
    for (const c of expired) {
      convocations.updateStatus(c.id, 'expired', 'expired')
    }

    // 2. Send presence reminders 2h before shift (mark as sent)
    const dueReminders = convocations.getDuePresenceReminders()
    for (const c of dueReminders) {
      convocations.markPresenceNotifSent(c.id)
    }

    // 3. Expire confirmed convocations past presence deadline with no response
    const pendingPresence = convocations.getPendingPresence()
    for (const c of pendingPresence) {
      // Apply no-show fine
      const emp = employees.getById(c.employee_id)
      if (emp) {
        const hours = calculateShiftHours(c.shift_start, c.shift_end)
        const fine = hours * emp.hourly_rate * 0.5
        convocations.applyNoshowFine(c.id, fine)
      } else {
        convocations.applyNoshowFine(c.id, 0)
      }
    }
  } catch (err) {
    console.error('[AutoJobs]', err.message)
  }
}

function calculateShiftHours(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let startMin = sh * 60 + (sm || 0)
  let endMin = eh * 60 + (em || 0)
  if (endMin <= startMin) endMin += 24 * 60 // overnight
  return (endMin - startMin) / 60
}

setInterval(runAutomatedJobs, 60000)

// ── Static files ────────────────────────────────────────────────────────

if (!fs.existsSync(indexPath)) {
  console.error('WARN: dist/index.html not found. Run `npm run build` first.')
}

app.use(express.static(distPath))

app.use((_req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.status(500).send('Build artifacts not found. Check deploy logs.')
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Orion Escala running on port ${PORT}`)
  console.log(`Claude AI: ${anthropic ? 'enabled' : 'disabled (no API key)'}`)
  // Run jobs once on startup
  runAutomatedJobs()
})
