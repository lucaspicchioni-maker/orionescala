export interface Employee {
  id: string
  name: string
  nickname: string
  phone: string
  role: 'auxiliar' | 'lider' | 'supervisor' | 'gerente'
  status: 'ativo' | 'inativo' | 'ferias'
  hourlyRate: number
  monthlyCost: number
}

export interface HourlyDemand {
  hour: string // "09:00-10:00"
  orders: number
  people: number
  ordersPerPerson: number
  costPerHour: number
  costPerOrder: number
  employeeCosts: { employeeId: string; cost: number }[]
}

export interface DayDemand {
  day: string // "segunda", "terca", etc.
  dayLabel: string
  hours: HourlyDemand[]
  totalOrders: number
  totalCost: number
  avgCostPerOrder: number
  peakPeople: number
}

export interface WeekDemand {
  weekLabel: string // "Semana 1 - Fev"
  startDate: string
  endDate: string
  days: DayDemand[]
  totalOrders: number
  totalCost: number
  avgCPP: number
}

export interface ScheduleSlot {
  hour: string
  employeeId: string | null
  status: 'open' | 'assigned' | 'confirmed' | 'absent' | 'urgent'
}

export interface ScheduleDay {
  day: string
  date: string
  slots: ScheduleSlot[][]
  published: boolean
  locked: boolean
}

export interface Shift {
  employeeId: string
  day: string
  date: string
  startHour: string
  endHour: string
  totalHours: number
  status: 'pending_schedule' | 'notified' | 'confirmed' | 'declined' | 'pending_presence' | 'present' | 'absent'
  notif1SentAt: string | null
  notif1Deadline: string | null
  notif2SentAt: string | null
}

export interface PayrollEntry {
  employeeId: string
  weekStart: string
  weekEnd: string
  scheduledHours: number
  workedHours: number
  absences: number
  attendanceRate: number
  totalPay: number
  bonus: number
}

export interface KPIMetric {
  label: string
  value: number | string
  target?: number | string
  unit: string
  trend?: 'up' | 'down' | 'stable'
  category: 'financeiro' | 'qualidade' | 'operacional' | 'pessoas'
}

// ── Ponto (Time Clock) ──────────────────────────────────────────────

export interface GeoLocation {
  lat: number
  lng: number
  accuracy: number // meters
  timestamp: string
}

export interface LocationConfig {
  name: string // "Cozinha Orion"
  lat: number
  lng: number
  radiusMeters: number // max distance allowed for check-in
}

export interface PontoRecord {
  id: string
  employeeId: string
  date: string // ISO date YYYY-MM-DD
  scheduledStart: string | null // "09:00"
  scheduledEnd: string | null // "15:00"
  checkIn: string | null // ISO datetime
  checkOut: string | null // ISO datetime
  checkInLocation: GeoLocation | null
  checkOutLocation: GeoLocation | null
  checkInDistance: number | null // meters from kitchen
  checkOutDistance: number | null
  lateMinutes: number // minutes late for check-in
  earlyLeaveMinutes: number // minutes left early
  workedMinutes: number // actual worked time
  status: 'pending' | 'on_time' | 'late' | 'absent' | 'partial' | 'location_rejected'
  notes: string
}

// ── WhatsApp Config ─────────────────────────────────────────────────

export interface WhatsAppConfig {
  provider: 'evolution' | 'zapi' | 'manual'
  apiUrl: string
  apiKey: string
  instance: string
  enabled: boolean
}

export interface WhatsAppMessage {
  id: string
  employeeId: string
  phone: string
  message: string
  sentAt: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  type: 'schedule_notify' | 'schedule_confirm' | 'presence_check' | 'absence_alert' | 'custom'
}

// ── Employee KPI Data (calculated) ──────────────────────────────────

export interface EmployeeKPIData {
  employeeId: string
  period: string // week key or month key
  assiduidade: number // % present days / scheduled days
  pontualidade: number // % on-time check-ins / total check-ins
  produtividade: number // orders per hour (manual or from admin.orion)
  indiceErros: number // error rate % (manual input)
  sla: number // % SLA compliance (manual input)
  totalScore: number
  scheduledHours: number
  workedHours: number
  totalCheckIns: number
  onTimeCheckIns: number
  lateCheckIns: number
  absences: number
}

// ── Notifications ───────────────────────────────────────────────────

export type NotificationType =
  | 'schedule_published'    // Escala publicada, confirme
  | 'shift_reminder'        // Seu turno comeca em 2h
  | 'shift_start'           // Seu turno comecou, faca check-in
  | 'shift_end'             // Seu turno termina em 30min
  | 'absence_alert'         // Colaborador nao apareceu
  | 'confirmation_deadline' // Prazo de confirmacao expirando
  | 'schedule_change'       // Mudanca na sua escala
  | 'break_required'        // Turno 5h+, sinalize intervalo

export interface ScheduledNotification {
  id: string
  employeeId: string
  type: NotificationType
  scheduledFor: string // ISO datetime when to send
  message: string
  weekStart: string
  date: string // shift date
  hour: string // shift hour
  status: 'pending' | 'sent' | 'cancelled'
  sentAt: string | null
  channel: 'whatsapp' | 'in_app'
}

export type DayOfWeek = 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado'

export const DAY_LABELS: Record<DayOfWeek, string> = {
  domingo: 'Domingo',
  segunda: 'Segunda',
  terca: 'Terça',
  quarta: 'Quarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
  sabado: 'Sábado',
}

export const HOURS = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
  '23:00', '00:00',
]

export const HOUR_RANGES = HOURS.map((h, i) => {
  const next = HOURS[i + 1] || '01:00'
  return `${h}-${next}`
})

export const MAX_ORDERS_PER_PERSON = 35
export const MIN_LUNCH_PEOPLE = 2
export const MIN_SHIFT_HOURS = 3

// ── Productivity & Goals ────────────────────────────────────────────

/** Daily productivity record per employee — entered by supervisor */
export interface ProductivityRecord {
  id: string
  employeeId: string
  date: string // YYYY-MM-DD
  weekStart: string
  // Core metrics
  totalOrders: number
  totalErrors: number
  errorCost: number // R$ reimbursement cost from errors
  avgExpeditionTime: number // seconds average per order
  slaCompliance: number // % of orders within SLA target time
  // Derived
  ordersPerHour: number
  hoursWorked: number
  notes: string
}

/** Weekly goal configuration — set by lider/supervisor */
export interface WeeklyGoal {
  id: string
  weekStart: string
  // Team goals
  teamOrdersTarget: number
  teamMaxErrors: number // max errors allowed
  teamMaxErrorCost: number // R$ max reimbursement
  teamAvgExpeditionTarget: number // seconds
  teamSlaTarget: number // %
  // Individual goals
  individualOrdersPerHourTarget: number
  individualMaxErrors: number
  individualSlaTarget: number // %
  individualExpeditionTarget: number // seconds
  // Prizes
  teamPrize: number // R$ bonus per person if team hits all targets
  individualPrize: number // R$ bonus if individual hits all targets
  // Meta
  createdAt: string
  createdBy: string
}

/** Prize status for display */
export interface PrizeResult {
  employeeId: string
  weekStart: string
  individualMet: boolean
  teamMet: boolean
  individualPrize: number
  teamPrize: number
  totalPrize: number
  details: {
    metric: string
    target: number
    actual: number
    unit: string
    met: boolean
  }[]
}

// ── Shift Swap ─────────────────────────────────────────────────────

export interface ShiftSwapRequest {
  id: string
  requesterId: string
  targetId: string
  date: string // YYYY-MM-DD
  requesterShift: string // "09:00-15:00"
  targetShift: string // "15:00-22:00"
  reason: string
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null // leader who approved/rejected
}

// ── Banco de Horas ─────────────────────────────────────────────────

export interface BancoHorasEntry {
  id: string
  employeeId: string
  date: string
  weekStart: string
  scheduledMinutes: number
  workedMinutes: number
  balanceMinutes: number // positive = extra, negative = deficit
  type: 'regular' | 'overtime' | 'absence' | 'adjustment'
  notes: string
}

// ── Feedback / Avaliação ───────────────────────────────────────────

export interface FeedbackRecord {
  id: string
  employeeId: string
  weekStart: string
  evaluatorId: string
  scores: {
    proatividade: number // 1-5
    trabalhoEquipe: number
    comunicacao: number
    qualidade: number
    pontualidade: number
  }
  strengths: string
  improvements: string
  notes: string
  createdAt: string
}
