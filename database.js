import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'orion.db')

// Ensure data directory exists
import fs from 'fs'
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    nickname TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'auxiliar',
    status TEXT NOT NULL DEFAULT 'ativo',
    admission_date TEXT,
    termination_date TEXT,
    contract_type TEXT DEFAULT 'clt',
    hourly_rate REAL NOT NULL DEFAULT 0,
    monthly_cost REAL NOT NULL DEFAULT 0,
    cpf TEXT DEFAULT '',
    pis TEXT DEFAULT '',
    ctps TEXT DEFAULT '',
    rg TEXT DEFAULT '',
    bank_account TEXT DEFAULT '',
    address TEXT DEFAULT '',
    emergency_contact TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS schedules (
    week_start TEXT PRIMARY KEY,
    published INTEGER DEFAULT 0,
    published_at TEXT,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ponto_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    scheduled_start TEXT,
    scheduled_end TEXT,
    check_in TEXT,
    check_out TEXT,
    check_in_location TEXT,
    check_out_location TEXT,
    check_in_distance REAL,
    check_out_distance REAL,
    late_minutes INTEGER DEFAULT 0,
    early_leave_minutes INTEGER DEFAULT 0,
    worked_minutes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    notes TEXT DEFAULT '',
    UNIQUE(employee_id, date)
  );

  CREATE TABLE IF NOT EXISTS convocations (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    week_start TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    shift_start TEXT NOT NULL,
    shift_end TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    deadline TEXT,
    responded_at TEXT,
    response TEXT,
    presence_notif_sent_at TEXT,
    presence_deadline TEXT,
    presence_response TEXT,
    noshow_fine REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(employee_id, shift_date, shift_start)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    message TEXT NOT NULL,
    week_start TEXT DEFAULT '',
    date TEXT DEFAULT '',
    hour TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    channel TEXT DEFAULT 'whatsapp'
  );

  CREATE TABLE IF NOT EXISTS app_data (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- ── Banco de Horas (passivo trabalhista crítico) ──────────────────────────
  CREATE TABLE IF NOT EXISTS banco_horas (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    week_start TEXT NOT NULL,
    scheduled_minutes INTEGER NOT NULL DEFAULT 0,
    worked_minutes INTEGER NOT NULL DEFAULT 0,
    balance_minutes INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'regular',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(employee_id, date)
  );

  -- ── Produtividade ─────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS productivity_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    week_start TEXT NOT NULL,
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_errors INTEGER NOT NULL DEFAULT 0,
    error_cost REAL NOT NULL DEFAULT 0,
    avg_expedition_time REAL NOT NULL DEFAULT 0,
    sla_compliance REAL NOT NULL DEFAULT 0,
    orders_per_hour REAL NOT NULL DEFAULT 0,
    hours_worked REAL NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(employee_id, date)
  );

  -- ── Metas Semanais ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS weekly_goals (
    id TEXT PRIMARY KEY,
    week_start TEXT NOT NULL UNIQUE,
    team_orders_target INTEGER NOT NULL DEFAULT 0,
    team_max_errors INTEGER NOT NULL DEFAULT 0,
    team_max_error_cost REAL NOT NULL DEFAULT 0,
    team_avg_expedition_target REAL NOT NULL DEFAULT 0,
    team_sla_target REAL NOT NULL DEFAULT 0,
    individual_orders_per_hour_target REAL NOT NULL DEFAULT 0,
    individual_max_errors INTEGER NOT NULL DEFAULT 0,
    individual_sla_target REAL NOT NULL DEFAULT 0,
    individual_expedition_target REAL NOT NULL DEFAULT 0,
    team_prize REAL NOT NULL DEFAULT 0,
    individual_prize REAL NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ── Trocas de Turno ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS shift_swaps (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    target_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    requester_shift TEXT NOT NULL,
    target_shift TEXT NOT NULL,
    reason TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
    resolved_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ── Disponibilidade ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS availabilities (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    slots TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    submitted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(employee_id, week_start)
  );

  -- ── Avaliações 360 ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS feedbacks (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    evaluator_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    week_start TEXT NOT NULL,
    score_proatividade INTEGER NOT NULL DEFAULT 0,
    score_trabalho_equipe INTEGER NOT NULL DEFAULT 0,
    score_comunicacao INTEGER NOT NULL DEFAULT 0,
    score_qualidade INTEGER NOT NULL DEFAULT 0,
    score_pontualidade INTEGER NOT NULL DEFAULT 0,
    strengths TEXT DEFAULT '',
    improvements TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(evaluator_id, employee_id, week_start)
  );

  -- ── Feedback do Colaborador sobre o Turno ─────────────────────────────────
  CREATE TABLE IF NOT EXISTS shift_feedbacks (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    week_start TEXT NOT NULL,
    score_organizacao INTEGER NOT NULL DEFAULT 0,
    score_equipamentos INTEGER NOT NULL DEFAULT 0,
    score_comunicacao_lider INTEGER NOT NULL DEFAULT 0,
    score_clima_equipe INTEGER NOT NULL DEFAULT 0,
    score_carga_trabalho INTEGER NOT NULL DEFAULT 0,
    comments TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(employee_id, date)
  );

  -- ── Badges / Gamificação ──────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS badges (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    week_start TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT DEFAULT '',
    awarded_at TEXT DEFAULT (datetime('now')),
    UNIQUE(employee_id, type, week_start)
  );

  -- ── Mural de Avisos ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_by TEXT NOT NULL,
    target_roles TEXT NOT NULL DEFAULT '[]',
    priority TEXT NOT NULL DEFAULT 'normal',
    expires_at TEXT,
    read_by TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ── Log de Mensagens WhatsApp ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'sent',
    sent_at TEXT DEFAULT (datetime('now'))
  );

  -- ── Férias ────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS vacation_requests (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_by TEXT NOT NULL,
    approved_by TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ── EPIs ──────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS epis (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    delivered_at TEXT NOT NULL,
    expires_at TEXT,
    returned_at TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- ── Pesquisa de Clima ─────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS climate_surveys (
    id TEXT PRIMARY KEY,
    week TEXT NOT NULL,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    highlights TEXT DEFAULT '',
    improvements TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(week, employee_id)
  );

  -- Audit log de overrides CLT (gerente/admin publica escala com violação)
  -- Cada linha representa uma publicação com violations — rastro legal.
  CREATE TABLE IF NOT EXISTS clt_overrides (
    id TEXT PRIMARY KEY,
    week_start TEXT NOT NULL,
    overridden_by_id TEXT NOT NULL,
    overridden_by_name TEXT NOT NULL,
    overridden_by_role TEXT NOT NULL,
    justification TEXT NOT NULL,
    violations_json TEXT NOT NULL,
    blockers_count INTEGER NOT NULL DEFAULT 0,
    warnings_count INTEGER NOT NULL DEFAULT 0,
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`)

// ── Índices de performance ────────────────────────────────────────────────────

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_ponto_employee_id ON ponto_records(employee_id);
  CREATE INDEX IF NOT EXISTS idx_ponto_date ON ponto_records(date);
  CREATE INDEX IF NOT EXISTS idx_ponto_employee_date ON ponto_records(employee_id, date);

  CREATE INDEX IF NOT EXISTS idx_conv_week_start ON convocations(week_start);
  CREATE INDEX IF NOT EXISTS idx_conv_employee_id ON convocations(employee_id);
  CREATE INDEX IF NOT EXISTS idx_conv_status ON convocations(status);
  CREATE INDEX IF NOT EXISTS idx_conv_status_deadline ON convocations(status, deadline);
  CREATE INDEX IF NOT EXISTS idx_conv_status_presence ON convocations(status, presence_deadline);

  CREATE INDEX IF NOT EXISTS idx_notif_employee_id ON notifications(employee_id);
  CREATE INDEX IF NOT EXISTS idx_notif_status_scheduled ON notifications(status, scheduled_for);

  CREATE INDEX IF NOT EXISTS idx_banco_horas_employee ON banco_horas(employee_id);
  CREATE INDEX IF NOT EXISTS idx_banco_horas_week ON banco_horas(employee_id, week_start);

  CREATE INDEX IF NOT EXISTS idx_prod_employee ON productivity_records(employee_id);
  CREATE INDEX IF NOT EXISTS idx_prod_week_start ON productivity_records(week_start);

  CREATE INDEX IF NOT EXISTS idx_swaps_requester ON shift_swaps(requester_id);
  CREATE INDEX IF NOT EXISTS idx_swaps_status ON shift_swaps(status);

  CREATE INDEX IF NOT EXISTS idx_avail_week_start ON availabilities(week_start);
  CREATE INDEX IF NOT EXISTS idx_avail_employee ON availabilities(employee_id);

  CREATE INDEX IF NOT EXISTS idx_feedback_employee ON feedbacks(employee_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_week ON feedbacks(week_start);

  CREATE INDEX IF NOT EXISTS idx_shift_feedback_week ON shift_feedbacks(week_start);

  CREATE INDEX IF NOT EXISTS idx_badges_employee ON badges(employee_id);

  CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at);
  CREATE INDEX IF NOT EXISTS idx_announcements_expires_at ON announcements(expires_at);

  CREATE INDEX IF NOT EXISTS idx_wa_employee ON whatsapp_messages(employee_id);
  CREATE INDEX IF NOT EXISTS idx_wa_sent_at ON whatsapp_messages(sent_at);

  CREATE INDEX IF NOT EXISTS idx_vacation_employee ON vacation_requests(employee_id);
  CREATE INDEX IF NOT EXISTS idx_vacation_status ON vacation_requests(status);

  CREATE INDEX IF NOT EXISTS idx_epi_employee ON epis(employee_id);
  CREATE INDEX IF NOT EXISTS idx_epi_expires ON epis(expires_at);

  CREATE INDEX IF NOT EXISTS idx_survey_week ON climate_surveys(week);
  CREATE INDEX IF NOT EXISTS idx_survey_employee ON climate_surveys(employee_id);

  CREATE INDEX IF NOT EXISTS idx_clt_overrides_week ON clt_overrides(week_start);
  CREATE INDEX IF NOT EXISTS idx_clt_overrides_reviewed ON clt_overrides(reviewed_at);
`)

// ── Migrações para banco existente (ADD COLUMN IF NOT EXISTS via try/catch) ──

const migrations = [
  `ALTER TABLE employees ADD COLUMN email TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN termination_date TEXT`,
  `ALTER TABLE employees ADD COLUMN notes TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN ctps TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN rg TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN address TEXT DEFAULT ''`,
  `ALTER TABLE employees ADD COLUMN emergency_contact TEXT DEFAULT ''`,
]
for (const sql of migrations) {
  try { db.exec(sql) } catch { /* column already exists */ }
}

// ── Seed default users if none exist ────────────────────────────────────────
// Em desenvolvimento: usa fallbacks conhecidos para facilitar testes.
// Em produção: se SEED_*_PASSWORD não definido, gera senha aleatória e loga UMA VEZ.
// Nunca commitar senhas reais no repositório (é público).

const IS_PROD = process.env.NODE_ENV === 'production'
const devFallbacks = {
  SEED_ADMIN_PASSWORD:      'lucas123',
  SEED_VIVIAN_PASSWORD:     'vivian123',
  SEED_SUPERVISOR_PASSWORD: 'super123',
  SEED_RH_PASSWORD:         'rh1234',
  SEED_MIGUEL_PASSWORD:     'miguel123',
  SEED_ANNA_PASSWORD:       'anna1234',
}
const genPass = (envKey) => {
  if (process.env[envKey]) return process.env[envKey]
  if (!IS_PROD) return devFallbacks[envKey]
  return randomUUID().slice(0, 12) // produção sem env var: aleatória
}

const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get()
if (userCount.c === 0) {
  const defaultUsers = [
    { name: 'Lucas',      role: 'admin',      password: genPass('SEED_ADMIN_PASSWORD') },
    { name: 'Vivian',     role: 'gerente',     password: genPass('SEED_VIVIAN_PASSWORD') },
    { name: 'Supervisor', role: 'supervisor',  password: genPass('SEED_SUPERVISOR_PASSWORD') },
    { name: 'RH',         role: 'rh',          password: genPass('SEED_RH_PASSWORD') },
    { name: 'Miguel',     role: 'colaborador', password: genPass('SEED_MIGUEL_PASSWORD') },
    { name: 'Anna',       role: 'colaborador', password: genPass('SEED_ANNA_PASSWORD') },
  ]
  const insert = db.prepare('INSERT INTO users (id, name, role, password_hash) VALUES (?, ?, ?, ?)')
  console.log('\n══════════════════════════════════════════════════════')
  console.log('✅ USUARIOS PADRAO CRIADOS — GUARDE ESTAS SENHAS:')
  console.log('══════════════════════════════════════════════════════')
  for (const u of defaultUsers) {
    insert.run(randomUUID(), u.name, u.role, bcrypt.hashSync(u.password, 10))
    console.log(`   ${u.name.padEnd(12)} (${u.role.padEnd(12)}): ${u.password}`)
  }
  console.log('══════════════════════════════════════════════════════')
  if (IS_PROD) {
    console.log('⚠️  Para senhas fixas, configure as variáveis SEED_*_PASSWORD no Railway.')
  }
  console.log('')
}

// ── Garantir que Vivian existe com role gerente ──────────────────────────────

const vivian = db.prepare("SELECT * FROM users WHERE name = 'Vivian' COLLATE NOCASE").get()
if (!vivian) {
  const password = genPass('SEED_VIVIAN_PASSWORD')
  db.prepare('INSERT INTO users (id, name, role, password_hash) VALUES (?, ?, ?, ?)').run(
    randomUUID(), 'Vivian', 'gerente', bcrypt.hashSync(password, 10)
  )
  console.log(`✅ Usuário Vivian criado com role gerente. Senha: ${password}`)
} else if (vivian.role !== 'gerente') {
  db.prepare("UPDATE users SET role = 'gerente' WHERE name = 'Vivian' COLLATE NOCASE").run()
  console.log('✅ Role da Vivian corrigido para gerente.')
}

// ── Seed colaboradores if none exist ────────────────────────────────────────

const empCount = db.prepare('SELECT COUNT(*) as c FROM employees').get()
if (empCount.c === 0) {
  try {
    // Seeds ficam em /app/seeds/ (fora do volume montado em /app/data/ no Railway)
    const seedPath = path.join(__dirname, 'seeds', 'seed-colaboradores.json')
    const colaboradores = JSON.parse(fs.readFileSync(seedPath, 'utf-8'))
    const insertEmp = db.prepare(`
      INSERT INTO employees (id, name, role, contract_type, hourly_rate, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const insertMany = db.transaction((list) => {
      for (const c of list) {
        insertEmp.run(randomUUID(), c.name, c.role, c.contract_type, c.hourly_rate, c.status)
      }
    })
    insertMany(colaboradores)
    console.log(`✅ ${colaboradores.length} colaboradores inseridos do seed`)
  } catch (err) {
    console.error('⚠️  Falha ao carregar seed de colaboradores:', err.message)
  }
}

// ── Linkar users colaborador ao employee correspondente por nome ──────────
// Sem isso, o middleware requireOwnerOrRole bloqueia colaboradores nos
// proprios dados (req.user.employeeId === null nao bate com resourceId).
try {
  const allColabUsers = db.prepare(
    "SELECT id, name, employee_id FROM users WHERE role = 'colaborador'"
  ).all()
  console.log(`🔍 Link diagnostic: ${allColabUsers.length} user(s) colaborador no banco`)

  const unlinkedColabs = db.prepare(`
    SELECT u.id as user_id, u.name as user_name, e.id as employee_id
    FROM users u
    JOIN employees e ON LOWER(TRIM(e.name)) = LOWER(TRIM(u.name))
    WHERE u.role = 'colaborador' AND (u.employee_id IS NULL OR u.employee_id = '')
  `).all()

  console.log(`🔍 Link diagnostic: ${unlinkedColabs.length} unlinked colaborador(es) found via JOIN`)

  if (unlinkedColabs.length > 0) {
    const linkStmt = db.prepare('UPDATE users SET employee_id = ? WHERE id = ?')
    const linkMany = db.transaction((rows) => {
      for (const row of rows) {
        linkStmt.run(row.employee_id, row.user_id)
      }
    })
    linkMany(unlinkedColabs)
    console.log(`✅ ${unlinkedColabs.length} user(s) colaborador linkados a employees: ${unlinkedColabs.map(r => r.user_name).join(', ')}`)
  } else if (allColabUsers.length > 0) {
    // Existem colaboradores mas nao achou pra linkar — diagnostico detalhado
    for (const cu of allColabUsers) {
      const empMatch = db.prepare('SELECT id, name FROM employees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(cu.name)
      console.log(`🔍   ${cu.name} (emp_id=${cu.employee_id || 'NULL'}) -> employee match: ${empMatch ? empMatch.id : 'NONE'}`)
    }
  }
} catch (err) {
  console.error('❌ Erro ao linkar users colaborador a employees:', err?.message || err)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getDb() { return db }

// ── Users ────────────────────────────────────────────────────────────────────

export const users = {
  findByName: (name) => db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(name),
  findById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  create: ({ name, role, password, employeeId }) => {
    const id = randomUUID()
    db.prepare('INSERT INTO users (id, name, role, password_hash, employee_id) VALUES (?, ?, ?, ?, ?)').run(
      id, name, role, bcrypt.hashSync(password, 10), employeeId || null
    )
    return id
  },
  verifyPassword: (user, password) => bcrypt.compareSync(password, user.password_hash),
}

// ── Employees ─────────────────────────────────────────────────────────────────

export const employees = {
  getAll: () => db.prepare('SELECT * FROM employees ORDER BY name').all(),
  getById: (id) => db.prepare('SELECT * FROM employees WHERE id = ?').get(id),
  create: (data) => {
    const id = data.id || randomUUID()
    db.prepare(`INSERT INTO employees
      (id, name, nickname, phone, email, role, status, admission_date, termination_date,
       contract_type, hourly_rate, monthly_cost, cpf, pis, ctps, rg, bank_account,
       address, emergency_contact, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name, data.nickname || '', data.phone || '', data.email || '',
      data.role || 'auxiliar', data.status || 'ativo',
      data.admissionDate || null, data.terminationDate || null,
      data.contractType || 'clt', data.hourlyRate || 0, data.monthlyCost || 0,
      data.cpf || '', data.pis || '', data.ctps || '', data.rg || '',
      data.bankAccount || '', data.address || '', data.emergencyContact || '', data.notes || ''
    )
    return id
  },
  update: (id, data) => {
    db.prepare(`UPDATE employees SET
      name=?, nickname=?, phone=?, email=?, role=?, status=?,
      admission_date=?, termination_date=?, contract_type=?,
      hourly_rate=?, monthly_cost=?, cpf=?, pis=?, ctps=?, rg=?,
      bank_account=?, address=?, emergency_contact=?, notes=?
      WHERE id=?`).run(
      data.name, data.nickname || '', data.phone || '', data.email || '',
      data.role, data.status, data.admissionDate || null, data.terminationDate || null,
      data.contractType || 'clt', data.hourlyRate || 0, data.monthlyCost || 0,
      data.cpf || '', data.pis || '', data.ctps || '', data.rg || '',
      data.bankAccount || '', data.address || '', data.emergencyContact || '', data.notes || '', id
    )
  },
  delete: (id) => db.prepare('DELETE FROM employees WHERE id = ?').run(id),
  toFrontend: (row) => ({
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    phone: row.phone,
    email: row.email || '',
    role: row.role,
    status: row.status,
    admissionDate: row.admission_date,
    terminationDate: row.termination_date || null,
    contractType: row.contract_type,
    hourlyRate: row.hourly_rate,
    monthlyCost: row.monthly_cost,
    cpf: row.cpf,
    pis: row.pis,
    ctps: row.ctps || '',
    rg: row.rg || '',
    bankAccount: row.bank_account,
    address: row.address || '',
    emergencyContact: row.emergency_contact || '',
    notes: row.notes || '',
  }),
}

// ── Schedules ─────────────────────────────────────────────────────────────────

export const schedules = {
  getAll: () => db.prepare('SELECT * FROM schedules ORDER BY week_start DESC').all().map(r => {
    const parsed = JSON.parse(r.data)
    return { ...parsed, weekStart: r.week_start, published: !!r.published, publishedAt: r.published_at }
  }),
  getByWeek: (weekStart) => {
    const row = db.prepare('SELECT * FROM schedules WHERE week_start = ?').get(weekStart)
    if (!row) return null
    const parsed = JSON.parse(row.data)
    return { ...parsed, published: !!row.published, publishedAt: row.published_at }
  },
  upsert: (weekStart, scheduleData) => {
    const { published, publishedAt, ...rest } = scheduleData
    db.prepare(`INSERT INTO schedules (week_start, published, published_at, data)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(week_start) DO UPDATE SET
        published=excluded.published, published_at=excluded.published_at, data=excluded.data`
    ).run(weekStart, published ? 1 : 0, publishedAt || null, JSON.stringify({ ...rest, weekStart }))
  },
}

// ── Ponto Records ─────────────────────────────────────────────────────────────

export const ponto = {
  getAll: () => db.prepare('SELECT * FROM ponto_records ORDER BY date DESC').all().map(ponto.toFrontend),
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM ponto_records WHERE employee_id=? ORDER BY date DESC').all(employeeId).map(ponto.toFrontend),
  getByDate: (date) => db.prepare('SELECT * FROM ponto_records WHERE date=?').all(date).map(ponto.toFrontend),
  upsert: (record) => {
    db.prepare(`INSERT INTO ponto_records
      (id, employee_id, date, scheduled_start, scheduled_end, check_in, check_out,
       check_in_location, check_out_location, check_in_distance, check_out_distance,
       late_minutes, early_leave_minutes, worked_minutes, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        check_in=excluded.check_in, check_out=excluded.check_out,
        check_in_location=excluded.check_in_location, check_out_location=excluded.check_out_location,
        check_in_distance=excluded.check_in_distance, check_out_distance=excluded.check_out_distance,
        late_minutes=excluded.late_minutes, early_leave_minutes=excluded.early_leave_minutes,
        worked_minutes=excluded.worked_minutes, status=excluded.status, notes=excluded.notes`
    ).run(
      record.id, record.employeeId, record.date,
      record.scheduledStart, record.scheduledEnd,
      record.checkIn, record.checkOut,
      record.checkInLocation ? JSON.stringify(record.checkInLocation) : null,
      record.checkOutLocation ? JSON.stringify(record.checkOutLocation) : null,
      record.checkInDistance, record.checkOutDistance,
      record.lateMinutes, record.earlyLeaveMinutes, record.workedMinutes,
      record.status, record.notes
    )
  },
  toFrontend: (row) => ({
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    checkIn: row.check_in,
    checkOut: row.check_out,
    checkInLocation: row.check_in_location ? JSON.parse(row.check_in_location) : null,
    checkOutLocation: row.check_out_location ? JSON.parse(row.check_out_location) : null,
    checkInDistance: row.check_in_distance,
    checkOutDistance: row.check_out_distance,
    lateMinutes: row.late_minutes,
    earlyLeaveMinutes: row.early_leave_minutes,
    workedMinutes: row.worked_minutes,
    status: row.status,
    notes: row.notes,
  }),
}

// ── Convocations ──────────────────────────────────────────────────────────────

export const convocations = {
  getByWeek: (weekStart) => db.prepare('SELECT * FROM convocations WHERE week_start=? ORDER BY shift_date, shift_start').all(weekStart),
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM convocations WHERE employee_id=? ORDER BY shift_date DESC').all(employeeId),
  getById: (id) => db.prepare('SELECT * FROM convocations WHERE id=?').get(id),
  getByToken: (token) => db.prepare('SELECT * FROM convocations WHERE token=?').get(token),
  getExpiredPending: () => db.prepare(`SELECT * FROM convocations WHERE status='pending' AND deadline < datetime('now')`).all(),
  getPendingPresence: () => db.prepare(`SELECT * FROM convocations WHERE status='confirmed' AND presence_deadline < datetime('now') AND presence_response IS NULL AND presence_notif_sent_at IS NOT NULL`).all(),
  getDuePresenceReminders: () => db.prepare(`SELECT * FROM convocations WHERE status='confirmed' AND presence_notif_sent_at IS NULL AND presence_deadline <= datetime('now', '+2 hours') AND presence_deadline > datetime('now')`).all(),
  create: (data) => {
    // CLT Art. 452-A §2: prazo mínimo de 24h para resposta
    // Usamos 24h como default (era 12h antes — não conforme)
    db.prepare(`INSERT OR IGNORE INTO convocations
      (id, employee_id, week_start, shift_date, shift_start, shift_end, token, status, sent_at, deadline, presence_deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now', '+24 hours'), ?)`
    ).run(data.id, data.employeeId, data.weekStart, data.shiftDate, data.shiftStart, data.shiftEnd, data.token, data.presenceDeadline)
  },
  cancelByEmployer: (id, fine, reason) => {
    db.prepare(`UPDATE convocations
      SET status='cancelled_by_employer', noshow_fine=?, response=?, responded_at=datetime('now')
      WHERE id=? AND status IN ('confirmed', 'pending')`
    ).run(fine, reason || 'cancelled by employer', id)
  },
  updateStatus: (id, status, response) => {
    db.prepare(`UPDATE convocations SET status=?, response=?, responded_at=datetime('now') WHERE id=?`).run(status, response, id)
  },
  updatePresenceResponse: (id, response) => {
    const status = response === 'presente' ? 'present' : 'absent'
    db.prepare('UPDATE convocations SET presence_response=?, status=? WHERE id=?').run(response, status, id)
  },
  markPresenceNotifSent: (id) => {
    db.prepare(`UPDATE convocations SET presence_notif_sent_at=datetime('now') WHERE id=?`).run(id)
  },
  applyNoshowFine: (id, fine) => {
    db.prepare(`UPDATE convocations SET noshow_fine=?, status='absent' WHERE id=?`).run(fine, id)
  },
}

// ── Banco de Horas ────────────────────────────────────────────────────────────

export const bancoHoras = {
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM banco_horas WHERE employee_id=? ORDER BY date DESC').all(employeeId),
  getByWeek: (weekStart) => db.prepare('SELECT * FROM banco_horas WHERE week_start=? ORDER BY date').all(weekStart),
  getSaldo: (employeeId) => {
    const row = db.prepare('SELECT COALESCE(SUM(balance_minutes), 0) as saldo FROM banco_horas WHERE employee_id=?').get(employeeId)
    return row?.saldo || 0
  },
  upsert: (record) => {
    const id = record.id || randomUUID()
    db.prepare(`INSERT INTO banco_horas
      (id, employee_id, date, week_start, scheduled_minutes, worked_minutes, balance_minutes, type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        scheduled_minutes=excluded.scheduled_minutes, worked_minutes=excluded.worked_minutes,
        balance_minutes=excluded.balance_minutes, type=excluded.type, notes=excluded.notes`
    ).run(id, record.employeeId, record.date, record.weekStart,
      record.scheduledMinutes || 0, record.workedMinutes || 0,
      record.balanceMinutes || 0, record.type || 'regular', record.notes || '')
    return id
  },
  toFrontend: (row) => ({
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    weekStart: row.week_start,
    scheduledMinutes: row.scheduled_minutes,
    workedMinutes: row.worked_minutes,
    balanceMinutes: row.balance_minutes,
    type: row.type,
    notes: row.notes,
  }),
}

// ── Productivity Records ───────────────────────────────────────────────────────

export const productivity = {
  getByWeek: (weekStart) => db.prepare('SELECT * FROM productivity_records WHERE week_start=? ORDER BY employee_id').all(weekStart),
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM productivity_records WHERE employee_id=? ORDER BY date DESC').all(employeeId),
  upsert: (record) => {
    const id = record.id || randomUUID()
    db.prepare(`INSERT INTO productivity_records
      (id, employee_id, date, week_start, total_orders, total_errors, error_cost,
       avg_expedition_time, sla_compliance, orders_per_hour, hours_worked, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        total_orders=excluded.total_orders, total_errors=excluded.total_errors,
        error_cost=excluded.error_cost, avg_expedition_time=excluded.avg_expedition_time,
        sla_compliance=excluded.sla_compliance, orders_per_hour=excluded.orders_per_hour,
        hours_worked=excluded.hours_worked, notes=excluded.notes`
    ).run(id, record.employeeId, record.date, record.weekStart,
      record.totalOrders || 0, record.totalErrors || 0, record.errorCost || 0,
      record.avgExpeditionTime || 0, record.slaCompliance || 0,
      record.ordersPerHour || 0, record.hoursWorked || 0, record.notes || '')
    return id
  },
  toFrontend: (row) => ({
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    weekStart: row.week_start,
    totalOrders: row.total_orders,
    totalErrors: row.total_errors,
    errorCost: row.error_cost,
    avgExpeditionTime: row.avg_expedition_time,
    slaCompliance: row.sla_compliance,
    ordersPerHour: row.orders_per_hour,
    hoursWorked: row.hours_worked,
    notes: row.notes,
  }),
}

// ── Weekly Goals ──────────────────────────────────────────────────────────────

export const weeklyGoals = {
  getByWeek: (weekStart) => db.prepare('SELECT * FROM weekly_goals WHERE week_start=?').get(weekStart),
  upsert: (data) => {
    const id = data.id || randomUUID()
    db.prepare(`INSERT INTO weekly_goals
      (id, week_start, team_orders_target, team_max_errors, team_max_error_cost,
       team_avg_expedition_target, team_sla_target, individual_orders_per_hour_target,
       individual_max_errors, individual_sla_target, individual_expedition_target,
       team_prize, individual_prize, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(week_start) DO UPDATE SET
        team_orders_target=excluded.team_orders_target, team_max_errors=excluded.team_max_errors,
        team_max_error_cost=excluded.team_max_error_cost, team_avg_expedition_target=excluded.team_avg_expedition_target,
        team_sla_target=excluded.team_sla_target, individual_orders_per_hour_target=excluded.individual_orders_per_hour_target,
        individual_max_errors=excluded.individual_max_errors, individual_sla_target=excluded.individual_sla_target,
        individual_expedition_target=excluded.individual_expedition_target,
        team_prize=excluded.team_prize, individual_prize=excluded.individual_prize`
    ).run(id, data.weekStart, data.teamOrdersTarget || 0, data.teamMaxErrors || 0,
      data.teamMaxErrorCost || 0, data.teamAvgExpeditionTarget || 0, data.teamSlaTarget || 0,
      data.individualOrdersPerHourTarget || 0, data.individualMaxErrors || 0,
      data.individualSlaTarget || 0, data.individualExpeditionTarget || 0,
      data.teamPrize || 0, data.individualPrize || 0, data.createdBy || 'system')
    return id
  },
  toFrontend: (row) => !row ? null : ({
    id: row.id, weekStart: row.week_start,
    teamOrdersTarget: row.team_orders_target, teamMaxErrors: row.team_max_errors,
    teamMaxErrorCost: row.team_max_error_cost, teamAvgExpeditionTarget: row.team_avg_expedition_target,
    teamSlaTarget: row.team_sla_target, individualOrdersPerHourTarget: row.individual_orders_per_hour_target,
    individualMaxErrors: row.individual_max_errors, individualSlaTarget: row.individual_sla_target,
    individualExpeditionTarget: row.individual_expedition_target,
    teamPrize: row.team_prize, individualPrize: row.individual_prize,
  }),
}

// ── Shift Swaps ───────────────────────────────────────────────────────────────

export const shiftSwaps = {
  getAll: () => db.prepare('SELECT * FROM shift_swaps ORDER BY created_at DESC').all(),
  getPending: () => db.prepare(`SELECT * FROM shift_swaps WHERE status='pending' ORDER BY created_at DESC`).all(),
  getByEmployee: (id) => db.prepare('SELECT * FROM shift_swaps WHERE requester_id=? OR target_id=? ORDER BY created_at DESC').all(id, id),
  create: (data) => {
    const id = randomUUID()
    db.prepare(`INSERT INTO shift_swaps
      (id, requester_id, target_id, date, requester_shift, target_shift, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(id, data.requesterId, data.targetId, data.date, data.requesterShift, data.targetShift, data.reason || '')
    return id
  },
  resolve: (id, status, resolvedBy) => {
    db.prepare(`UPDATE shift_swaps SET status=?, resolved_by=?, resolved_at=datetime('now') WHERE id=?`).run(status, resolvedBy, id)
  },
  toFrontend: (row) => ({
    id: row.id, requesterId: row.requester_id, targetId: row.target_id,
    date: row.date, requesterShift: row.requester_shift, targetShift: row.target_shift,
    reason: row.reason, status: row.status, resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at, createdAt: row.created_at,
  }),
}

// ── Availabilities ────────────────────────────────────────────────────────────

export const availabilities = {
  getByWeek: (weekStart) => db.prepare('SELECT * FROM availabilities WHERE week_start=?').all(weekStart),
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM availabilities WHERE employee_id=? ORDER BY week_start DESC').all(employeeId),
  getByEmployeeWeek: (employeeId, weekStart) => db.prepare('SELECT * FROM availabilities WHERE employee_id=? AND week_start=?').get(employeeId, weekStart),
  upsert: (data) => {
    const id = data.id || randomUUID()
    db.prepare(`INSERT INTO availabilities (id, employee_id, week_start, slots, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, week_start) DO UPDATE SET
        slots=excluded.slots, status=excluded.status, submitted_at=excluded.submitted_at`
    ).run(id, data.employeeId, data.weekStart, JSON.stringify(data.slots || []),
      data.status || 'draft', data.submittedAt || null)
    return id
  },
  toFrontend: (row) => ({
    id: row.id, employeeId: row.employee_id, weekStart: row.week_start,
    slots: JSON.parse(row.slots || '[]'), status: row.status,
    submittedAt: row.submitted_at, createdAt: row.created_at,
  }),
}

// ── Feedbacks (Avaliação 360) ─────────────────────────────────────────────────

export const feedbacks = {
  getByWeek: (weekStart) => db.prepare('SELECT * FROM feedbacks WHERE week_start=?').all(weekStart),
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM feedbacks WHERE employee_id=? ORDER BY week_start DESC').all(employeeId),
  upsert: (data) => {
    const id = data.id || randomUUID()
    db.prepare(`INSERT INTO feedbacks
      (id, employee_id, evaluator_id, week_start, score_proatividade, score_trabalho_equipe,
       score_comunicacao, score_qualidade, score_pontualidade, strengths, improvements, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(evaluator_id, employee_id, week_start) DO UPDATE SET
        score_proatividade=excluded.score_proatividade, score_trabalho_equipe=excluded.score_trabalho_equipe,
        score_comunicacao=excluded.score_comunicacao, score_qualidade=excluded.score_qualidade,
        score_pontualidade=excluded.score_pontualidade, strengths=excluded.strengths,
        improvements=excluded.improvements, notes=excluded.notes`
    ).run(id, data.employeeId, data.evaluatorId, data.weekStart,
      data.scoreProatividade || 0, data.scoreTrabalhoEquipe || 0,
      data.scoreComunicacao || 0, data.scoreQualidade || 0, data.scorePontualidade || 0,
      data.strengths || '', data.improvements || '', data.notes || '')
    return id
  },
  toFrontend: (row) => ({
    id: row.id, employeeId: row.employee_id, evaluatorId: row.evaluator_id,
    weekStart: row.week_start, scoreProatividade: row.score_proatividade,
    scoreTrabalhoEquipe: row.score_trabalho_equipe, scoreComunicacao: row.score_comunicacao,
    scoreQualidade: row.score_qualidade, scorePontualidade: row.score_pontualidade,
    strengths: row.strengths, improvements: row.improvements, notes: row.notes,
    createdAt: row.created_at,
  }),
}

// ── Shift Feedbacks ───────────────────────────────────────────────────────────

export const shiftFeedbacks = {
  getByWeek: (weekStart) => db.prepare('SELECT * FROM shift_feedbacks WHERE week_start=?').all(weekStart),
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM shift_feedbacks WHERE employee_id=? ORDER BY date DESC').all(employeeId),
  getByEmployeeDate: (employeeId, date) => db.prepare('SELECT id FROM shift_feedbacks WHERE employee_id=? AND date=?').get(employeeId, date),
  upsert: (data) => {
    const id = data.id || randomUUID()
    db.prepare(`INSERT INTO shift_feedbacks
      (id, employee_id, date, week_start, score_organizacao, score_equipamentos,
       score_comunicacao_lider, score_clima_equipe, score_carga_trabalho, comments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        score_organizacao=excluded.score_organizacao, score_equipamentos=excluded.score_equipamentos,
        score_comunicacao_lider=excluded.score_comunicacao_lider, score_clima_equipe=excluded.score_clima_equipe,
        score_carga_trabalho=excluded.score_carga_trabalho, comments=excluded.comments`
    ).run(id, data.employeeId, data.date, data.weekStart,
      data.scoreOrganizacao || 0, data.scoreEquipamentos || 0,
      data.scoreComunicacaoLider || 0, data.scoreClimaEquipe || 0,
      data.scoreCargaTrabalho || 0, data.comments || '')
    return id
  },
  toFrontend: (row) => ({
    id: row.id, employeeId: row.employee_id, date: row.date, weekStart: row.week_start,
    scoreOrganizacao: row.score_organizacao, scoreEquipamentos: row.score_equipamentos,
    scoreComunicacaoLider: row.score_comunicacao_lider, scoreClimaEquipe: row.score_clima_equipe,
    scoreCargaTrabalho: row.score_carga_trabalho, comments: row.comments, createdAt: row.created_at,
  }),
}

// ── Badges ────────────────────────────────────────────────────────────────────

export const badges = {
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM badges WHERE employee_id=? ORDER BY awarded_at DESC').all(employeeId),
  getByWeek: (weekStart) => db.prepare('SELECT * FROM badges WHERE week_start=?').all(weekStart),
  award: (data) => {
    const id = randomUUID()
    db.prepare(`INSERT OR IGNORE INTO badges (id, employee_id, type, week_start, label, description)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.employeeId, data.type, data.weekStart, data.label, data.description || '')
  },
  toFrontend: (row) => ({
    id: row.id, employeeId: row.employee_id, type: row.type, weekStart: row.week_start,
    label: row.label, description: row.description, awardedAt: row.awarded_at,
  }),
}

// ── Announcements (Mural) ─────────────────────────────────────────────────────

export const announcements = {
  getAll: () => db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all(),
  getActive: () => db.prepare(`SELECT * FROM announcements WHERE expires_at IS NULL OR expires_at > datetime('now') ORDER BY created_at DESC`).all(),
  getById: (id) => db.prepare('SELECT * FROM announcements WHERE id=?').get(id),
  create: (data) => {
    const id = randomUUID()
    db.prepare(`INSERT INTO announcements (id, title, body, created_by, target_roles, priority, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, data.title, data.body, data.createdBy, JSON.stringify(data.targetRoles || []),
      data.priority || 'normal', data.expiresAt || null)
    return id
  },
  delete: (id) => db.prepare('DELETE FROM announcements WHERE id=?').run(id),
  markRead: (id, employeeId) => {
    const row = db.prepare('SELECT read_by FROM announcements WHERE id=?').get(id)
    if (!row) return
    const readBy = JSON.parse(row.read_by || '[]')
    if (!readBy.includes(employeeId)) {
      readBy.push(employeeId)
      db.prepare('UPDATE announcements SET read_by=? WHERE id=?').run(JSON.stringify(readBy), id)
    }
  },
  toFrontend: (row) => ({
    id: row.id, title: row.title, body: row.body, createdBy: row.created_by,
    targetRoles: JSON.parse(row.target_roles || '[]'), priority: row.priority,
    expiresAt: row.expires_at, readBy: JSON.parse(row.read_by || '[]'), createdAt: row.created_at,
  }),
}

// ── WhatsApp Messages ─────────────────────────────────────────────────────────

export const whatsappMessages = {
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM whatsapp_messages WHERE employee_id=? ORDER BY sent_at DESC LIMIT 50').all(employeeId),
  getRecent: (limit = 100) => db.prepare('SELECT * FROM whatsapp_messages ORDER BY sent_at DESC LIMIT ?').all(limit),
  log: (data) => {
    const id = randomUUID()
    db.prepare(`INSERT INTO whatsapp_messages (id, employee_id, phone, message, type, status)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.employeeId, data.phone, data.message, data.type || 'manual', data.status || 'sent')
    return id
  },
  toFrontend: (row) => ({
    id: row.id, employeeId: row.employee_id, phone: row.phone,
    message: row.message, type: row.type, status: row.status, sentAt: row.sent_at,
  }),
}

// ── Vacation Requests ─────────────────────────────────────────────────────────

export const vacationRequests = {
  getAll: () => db.prepare('SELECT * FROM vacation_requests ORDER BY created_at DESC').all(),
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM vacation_requests WHERE employee_id=? ORDER BY created_at DESC').all(employeeId),
  create: (data) => {
    const id = randomUUID()
    db.prepare(`INSERT INTO vacation_requests (id, employee_id, start_date, end_date, days, status, requested_by, notes)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(id, data.employeeId, data.startDate, data.endDate, data.days, data.requestedBy, data.notes || '')
    return id
  },
  updateStatus: (id, status, approvedBy) => {
    db.prepare('UPDATE vacation_requests SET status=?, approved_by=? WHERE id=?').run(status, approvedBy || null, id)
  },
  toFrontend: (row) => ({
    id: row.id, employeeId: row.employee_id, startDate: row.start_date,
    endDate: row.end_date, days: row.days, status: row.status,
    requestedBy: row.requested_by, approvedBy: row.approved_by,
    notes: row.notes, createdAt: row.created_at,
  }),
}

// ── EPIs ──────────────────────────────────────────────────────────────────────

export const epis = {
  getAll: () => db.prepare('SELECT * FROM epis ORDER BY delivered_at DESC').all(),
  getByEmployee: (employeeId) => db.prepare('SELECT * FROM epis WHERE employee_id=? ORDER BY delivered_at DESC').all(employeeId),
  getExpiringSoon: (days = 30) => db.prepare(
    `SELECT * FROM epis WHERE expires_at IS NOT NULL AND returned_at IS NULL
     AND expires_at <= date('now', '+' || ? || ' days') ORDER BY expires_at ASC`
  ).all(days),
  create: (data) => {
    const id = randomUUID()
    db.prepare(`INSERT INTO epis (id, employee_id, name, type, delivered_at, expires_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, data.employeeId, data.name, data.type, data.deliveredAt, data.expiresAt || null, data.notes || '')
    return id
  },
  update: (id, data) => {
    db.prepare('UPDATE epis SET name=?, type=?, delivered_at=?, expires_at=?, returned_at=?, notes=? WHERE id=?').run(
      data.name, data.type, data.deliveredAt, data.expiresAt || null, data.returnedAt || null, data.notes || '', id
    )
  },
  delete: (id) => db.prepare('DELETE FROM epis WHERE id=?').run(id),
  toFrontend: (row) => ({
    id: row.id, employeeId: row.employee_id, name: row.name, type: row.type,
    deliveredAt: row.delivered_at, expiresAt: row.expires_at,
    returnedAt: row.returned_at, notes: row.notes, createdAt: row.created_at,
  }),
}

// ── Climate Surveys ───────────────────────────────────────────────────────────

export const climateSurveys = {
  getAll: () => db.prepare('SELECT * FROM climate_surveys ORDER BY created_at DESC').all(),
  getByWeek: (week) => db.prepare('SELECT * FROM climate_surveys WHERE week=?').all(week),
  getByEmployeeAndWeek: (employeeId, week) =>
    db.prepare('SELECT * FROM climate_surveys WHERE employee_id=? AND week=?').get(employeeId, week),
  create: (data) => {
    const id = randomUUID()
    db.prepare(`INSERT OR REPLACE INTO climate_surveys (id, week, employee_id, score, highlights, improvements)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.week, data.employeeId, data.score, data.highlights || '', data.improvements || '')
    return id
  },
  getResults: (week) => {
    const rows = db.prepare('SELECT * FROM climate_surveys WHERE week=?').all(week)
    if (!rows.length) return { week, avgScore: 0, totalResponses: 0, scoreDistribution: {}, highlights: [], improvements: [] }
    const avgScore = rows.reduce((s, r) => s + r.score, 0) / rows.length
    const dist = {}
    for (const r of rows) dist[r.score] = (dist[r.score] || 0) + 1
    return {
      week, avgScore: Math.round(avgScore * 10) / 10,
      totalResponses: rows.length,
      scoreDistribution: dist,
      highlights: rows.map(r => r.highlights).filter(Boolean),
      improvements: rows.map(r => r.improvements).filter(Boolean),
    }
  },
  toFrontend: (row) => ({
    id: row.id, week: row.week, employeeId: row.employee_id,
    score: row.score, highlights: row.highlights, improvements: row.improvements,
    createdAt: row.created_at,
  }),
}

// ── App Data (generic KV) ──────────────────────────────────────────────────────

export const appData = {
  get: (key, fallback = null) => {
    const row = db.prepare('SELECT value FROM app_data WHERE key=?').get(key)
    return row ? JSON.parse(row.value) : fallback
  },
  set: (key, value) => {
    db.prepare(`INSERT INTO app_data (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    ).run(key, JSON.stringify(value))
  },
}

// ── Audit log de overrides CLT ─────────────────────────────────────────
export const cltOverrides = {
  create: ({ weekStart, userId, userName, userRole, justification, violations }) => {
    const id = randomUUID()
    const blockers = (violations || []).filter(v => v.severity === 'blocking').length
    const warnings = (violations || []).filter(v => v.severity === 'warning').length
    db.prepare(`INSERT INTO clt_overrides
      (id, week_start, overridden_by_id, overridden_by_name, overridden_by_role,
       justification, violations_json, blockers_count, warnings_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, weekStart, userId, userName, userRole, justification,
          JSON.stringify(violations || []), blockers, warnings)
    return id
  },
  listUnreviewed: () => db.prepare(`
    SELECT * FROM clt_overrides WHERE reviewed_at IS NULL ORDER BY created_at DESC
  `).all(),
  listAll: (limit = 100) => db.prepare(`
    SELECT * FROM clt_overrides ORDER BY created_at DESC LIMIT ?
  `).all(limit),
  markReviewed: (id, reviewerName) => {
    db.prepare(`UPDATE clt_overrides
      SET reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`
    ).run(reviewerName, id)
  },
  toFrontend: (row) => ({
    id: row.id,
    weekStart: row.week_start,
    overriddenById: row.overridden_by_id,
    overriddenByName: row.overridden_by_name,
    overriddenByRole: row.overridden_by_role,
    justification: row.justification,
    violations: JSON.parse(row.violations_json || '[]'),
    blockersCount: row.blockers_count,
    warningsCount: row.warnings_count,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }),
}

export default db
