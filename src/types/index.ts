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

export interface PontoRecord {
  id: string
  employeeId: string
  date: string // ISO date YYYY-MM-DD
  scheduledStart: string | null // "09:00"
  scheduledEnd: string | null // "15:00"
  checkIn: string | null // ISO datetime
  checkOut: string | null // ISO datetime
  lateMinutes: number // minutes late for check-in
  earlyLeaveMinutes: number // minutes left early
  workedMinutes: number // actual worked time
  status: 'pending' | 'on_time' | 'late' | 'absent' | 'partial'
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
