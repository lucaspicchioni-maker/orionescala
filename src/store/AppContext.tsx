import { createContext, useContext, useReducer, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { Employee, PontoRecord, WhatsAppConfig, WhatsAppMessage, LocationConfig, ScheduledNotification, ProductivityRecord, WeeklyGoal, ShiftSwapRequest, BancoHorasEntry, FeedbackRecord, GoldenRule } from '@/types'
import { employees as defaultEmployees } from '@/data/employees'

// ── Schedule Types ──────────────────────────────────────────────────────

export interface Assignment {
  id: string
  employeeId: string
  status: 'pending' | 'confirmed' | 'declined' | 'absent' | 'present'
  confirmedAt: string | null
}

export interface SlotData {
  hour: string // '09:00-10:00'
  requiredPeople: number
  assignments: Assignment[]
}

export interface ScheduleDayData {
  date: string
  dayOfWeek: string // 'segunda', etc.
  slots: SlotData[]
}

export interface WeekSchedule {
  weekStart: string // ISO date
  days: ScheduleDayData[]
  published: boolean
  publishedAt: string | null
}

// ── App State ───────────────────────────────────────────────────────────

export interface AppState {
  employees: Employee[]
  schedules: WeekSchedule[]
  pontoRecords: PontoRecord[]
  whatsappConfig: WhatsAppConfig
  whatsappMessages: WhatsAppMessage[]
  locationConfig: LocationConfig
  notifications: ScheduledNotification[]
  productivityRecords: ProductivityRecord[]
  weeklyGoals: WeeklyGoal[]
  shiftSwaps: ShiftSwapRequest[]
  bancoHoras: BancoHorasEntry[]
  feedbacks: FeedbackRecord[]
  goldenRules: GoldenRule[]
  theme: 'dark' | 'light'
  onboardingDone: boolean
  currentWeek: string // ISO date of Monday
  currentUser: { role: 'colaborador' | 'supervisor' | 'gerente'; name: string }
}

// ── Actions ─────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD_EMPLOYEE'; payload: Employee }
  | { type: 'UPDATE_EMPLOYEE'; payload: Employee }
  | { type: 'DELETE_EMPLOYEE'; payload: string }
  | { type: 'SET_SCHEDULE'; payload: WeekSchedule }
  | { type: 'UPDATE_SLOT'; payload: { weekStart: string; date: string; hour: string; slot: SlotData } }
  | { type: 'PUBLISH_SCHEDULE'; payload: string }
  | { type: 'SET_CURRENT_WEEK'; payload: string }
  | { type: 'SET_CURRENT_USER'; payload: AppState['currentUser'] }
  | { type: 'ADD_PONTO'; payload: PontoRecord }
  | { type: 'UPDATE_PONTO'; payload: PontoRecord }
  | { type: 'SET_WHATSAPP_CONFIG'; payload: WhatsAppConfig }
  | { type: 'ADD_WHATSAPP_MESSAGE'; payload: WhatsAppMessage }
  | { type: 'UPDATE_ASSIGNMENT_STATUS'; payload: { weekStart: string; date: string; hour: string; assignmentId: string; status: Assignment['status'] } }
  | { type: 'SET_LOCATION_CONFIG'; payload: LocationConfig }
  | { type: 'ADD_NOTIFICATIONS'; payload: ScheduledNotification[] }
  | { type: 'UPDATE_NOTIFICATION'; payload: ScheduledNotification }
  | { type: 'ADD_PRODUCTIVITY_RECORD'; payload: ProductivityRecord }
  | { type: 'UPDATE_PRODUCTIVITY_RECORD'; payload: ProductivityRecord }
  | { type: 'SET_WEEKLY_GOAL'; payload: WeeklyGoal }
  | { type: 'ADD_SHIFT_SWAP'; payload: ShiftSwapRequest }
  | { type: 'UPDATE_SHIFT_SWAP'; payload: ShiftSwapRequest }
  | { type: 'ADD_BANCO_HORAS'; payload: BancoHorasEntry }
  | { type: 'ADD_FEEDBACK'; payload: FeedbackRecord }
  | { type: 'UPDATE_FEEDBACK'; payload: FeedbackRecord }
  | { type: 'SET_GOLDEN_RULES'; payload: GoldenRule[] }
  | { type: 'UPDATE_GOLDEN_RULE'; payload: GoldenRule }
  | { type: 'SET_THEME'; payload: 'dark' | 'light' }
  | { type: 'SET_ONBOARDING_DONE'; payload: boolean }

// ── Helpers ─────────────────────────────────────────────────────────────

const LS_EMPLOYEES = 'orion_employees'
const LS_SCHEDULES = 'orion_schedules'
const LS_CURRENT_USER = 'orion_current_user'
const LS_PONTO = 'orion_ponto'
const LS_WHATSAPP_CONFIG = 'orion_whatsapp_config'
const LS_WHATSAPP_MESSAGES = 'orion_whatsapp_messages'
const LS_LOCATION_CONFIG = 'orion_location_config'
const LS_NOTIFICATIONS = 'orion_notifications'
const LS_PRODUCTIVITY = 'orion_productivity'
const LS_WEEKLY_GOALS = 'orion_weekly_goals'
const LS_SHIFT_SWAPS = 'orion_shift_swaps'
const LS_BANCO_HORAS = 'orion_banco_horas'
const LS_FEEDBACKS = 'orion_feedbacks'
const LS_GOLDEN_RULES = 'orion_golden_rules'
const LS_THEME = 'orion_theme'
const LS_ONBOARDING = 'orion_onboarding_done'

// Default: placeholder coordinates — user must configure with real kitchen location
const defaultLocationConfig: LocationConfig = {
  name: 'Cozinha Orion',
  lat: 0,
  lng: 0,
  radiusMeters: 150,
}

const defaultWhatsAppConfig: WhatsAppConfig = {
  provider: 'manual',
  apiUrl: '',
  apiKey: '',
  instance: '',
  enabled: false,
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // ignore parse errors
  }
  return fallback
}

function getMonday(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setDate(diff))
  return monday.toISOString().split('T')[0]
}

const defaultGoldenRules: GoldenRule[] = [
  // ── Global ──
  {
    id: 'rule-max-weekly-hours',
    name: 'Limite de Horas Semanais',
    description: 'Colaborador nao pode ultrapassar X horas na semana',
    layer: 'global',
    severity: 'bloqueante',
    enabled: true,
    config: { maxWeeklyHours: 44 },
  },
  {
    id: 'rule-max-overtime',
    name: 'Limite de Horas Extras',
    description: 'Maximo de horas extras permitidas por semana',
    layer: 'global',
    severity: 'alerta',
    enabled: true,
    config: { maxOvertimeHours: 10 },
  },
  {
    id: 'rule-break-required',
    name: 'Intervalo Obrigatorio',
    description: 'Turnos acima de X horas exigem intervalo sinalizado',
    layer: 'global',
    severity: 'bloqueante',
    enabled: true,
    config: { requireBreak: true, breakAfterHours: 5 },
  },
  {
    id: 'rule-min-staff',
    name: 'Minimo de Colaboradores',
    description: 'Minimo de pessoas escaladas por slot de horario',
    layer: 'global',
    severity: 'bloqueante',
    enabled: true,
    config: { minStaffPerSlot: 2 },
  },
  // ── Expeditor (colaborador) ──
  {
    id: 'rule-exp-no-late',
    name: 'Atraso Zero',
    description: 'Expeditor nao pode atrasar mais que X minutos',
    layer: 'expeditor',
    severity: 'bloqueante',
    enabled: true,
    config: { maxLateMinutes: 5 },
  },
  {
    id: 'rule-exp-no-absence',
    name: 'Presenca Obrigatoria',
    description: 'Expeditor nao pode faltar mais que X vezes no mes',
    layer: 'expeditor',
    severity: 'bloqueante',
    enabled: true,
    config: { maxAbsencesPerMonth: 1 },
  },
  // ── Supervisor ──
  {
    id: 'rule-sup-no-unfilled',
    name: 'Escala Completa',
    description: 'Nao pode ter slots sem cobertura na escala publicada',
    layer: 'supervisor',
    severity: 'bloqueante',
    enabled: true,
    config: { maxUnfilledSlots: 0 },
  },
  // ── Gerente ──
  {
    id: 'rule-ger-productivity-min',
    name: 'Produtividade Minima',
    description: 'Produtividade da equipe nao pode ficar abaixo de X pedidos/hora',
    layer: 'gerente',
    severity: 'alerta',
    enabled: true,
    config: { minProductivityPerHour: 15 },
  },
  {
    id: 'rule-ger-productivity-max',
    name: 'Produtividade Maxima (Sobrecarga)',
    description: 'Produtividade acima de X indica sobrecarga da equipe',
    layer: 'gerente',
    severity: 'alerta',
    enabled: true,
    config: { maxProductivityPerHour: 40 },
  },
  {
    id: 'rule-ger-error-rate',
    name: 'Taxa de Erros Maxima',
    description: 'Taxa de erros da equipe nao pode ultrapassar X%',
    layer: 'gerente',
    severity: 'alerta',
    enabled: true,
    config: { maxErrorRate: 5 },
  },
  {
    id: 'rule-ger-sla',
    name: 'SLA Minimo',
    description: 'Compliance de SLA nao pode ficar abaixo de X%',
    layer: 'gerente',
    severity: 'bloqueante',
    enabled: true,
    config: { minSlaCompliance: 85 },
  },
]

const defaultUser: AppState['currentUser'] = { role: 'gerente', name: 'Gerente' }

function getInitialState(): AppState {
  return {
    employees: loadFromStorage<Employee[]>(LS_EMPLOYEES, defaultEmployees),
    schedules: loadFromStorage<WeekSchedule[]>(LS_SCHEDULES, []),
    pontoRecords: loadFromStorage<PontoRecord[]>(LS_PONTO, []),
    whatsappConfig: loadFromStorage<WhatsAppConfig>(LS_WHATSAPP_CONFIG, defaultWhatsAppConfig),
    whatsappMessages: loadFromStorage<WhatsAppMessage[]>(LS_WHATSAPP_MESSAGES, []),
    locationConfig: loadFromStorage<LocationConfig>(LS_LOCATION_CONFIG, defaultLocationConfig),
    notifications: loadFromStorage<ScheduledNotification[]>(LS_NOTIFICATIONS, []),
    productivityRecords: loadFromStorage<ProductivityRecord[]>(LS_PRODUCTIVITY, []),
    weeklyGoals: loadFromStorage<WeeklyGoal[]>(LS_WEEKLY_GOALS, []),
    shiftSwaps: loadFromStorage<ShiftSwapRequest[]>(LS_SHIFT_SWAPS, []),
    bancoHoras: loadFromStorage<BancoHorasEntry[]>(LS_BANCO_HORAS, []),
    feedbacks: loadFromStorage<FeedbackRecord[]>(LS_FEEDBACKS, []),
    goldenRules: loadFromStorage<GoldenRule[]>(LS_GOLDEN_RULES, defaultGoldenRules),
    theme: loadFromStorage<'dark' | 'light'>(LS_THEME, 'dark'),
    onboardingDone: loadFromStorage<boolean>(LS_ONBOARDING, false),
    currentWeek: getMonday(),
    currentUser: loadFromStorage<AppState['currentUser']>(LS_CURRENT_USER, defaultUser),
  }
}

// ── Reducer ─────────────────────────────────────────────────────────────

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_EMPLOYEE':
      return { ...state, employees: [...state.employees, action.payload] }

    case 'UPDATE_EMPLOYEE':
      return {
        ...state,
        employees: state.employees.map((e) =>
          e.id === action.payload.id ? action.payload : e,
        ),
      }

    case 'DELETE_EMPLOYEE':
      return {
        ...state,
        employees: state.employees.filter((e) => e.id !== action.payload),
      }

    case 'SET_SCHEDULE': {
      const exists = state.schedules.some(
        (s) => s.weekStart === action.payload.weekStart,
      )
      return {
        ...state,
        schedules: exists
          ? state.schedules.map((s) =>
              s.weekStart === action.payload.weekStart ? action.payload : s,
            )
          : [...state.schedules, action.payload],
      }
    }

    case 'UPDATE_SLOT': {
      const { weekStart, date, hour, slot } = action.payload
      return {
        ...state,
        schedules: state.schedules.map((s) => {
          if (s.weekStart !== weekStart) return s
          return {
            ...s,
            days: s.days.map((d) => {
              if (d.date !== date) return d
              return {
                ...d,
                slots: d.slots.map((sl) => (sl.hour === hour ? slot : sl)),
              }
            }),
          }
        }),
      }
    }

    case 'PUBLISH_SCHEDULE':
      return {
        ...state,
        schedules: state.schedules.map((s) =>
          s.weekStart === action.payload
            ? { ...s, published: true, publishedAt: new Date().toISOString() }
            : s,
        ),
      }

    case 'SET_CURRENT_WEEK':
      return { ...state, currentWeek: action.payload }

    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload }

    case 'ADD_PONTO':
      return { ...state, pontoRecords: [...state.pontoRecords, action.payload] }

    case 'UPDATE_PONTO':
      return {
        ...state,
        pontoRecords: state.pontoRecords.map((p) =>
          p.id === action.payload.id ? action.payload : p,
        ),
      }

    case 'SET_WHATSAPP_CONFIG':
      return { ...state, whatsappConfig: action.payload }

    case 'ADD_WHATSAPP_MESSAGE':
      return { ...state, whatsappMessages: [...state.whatsappMessages, action.payload] }

    case 'SET_LOCATION_CONFIG':
      return { ...state, locationConfig: action.payload }

    case 'ADD_NOTIFICATIONS':
      return { ...state, notifications: [...state.notifications, ...action.payload] }

    case 'UPDATE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.payload.id ? action.payload : n,
        ),
      }

    case 'ADD_PRODUCTIVITY_RECORD':
      return { ...state, productivityRecords: [...state.productivityRecords, action.payload] }

    case 'UPDATE_PRODUCTIVITY_RECORD':
      return {
        ...state,
        productivityRecords: state.productivityRecords.map((r) =>
          r.id === action.payload.id ? action.payload : r,
        ),
      }

    case 'SET_WEEKLY_GOAL': {
      const exists = state.weeklyGoals.some((g) => g.weekStart === action.payload.weekStart)
      return {
        ...state,
        weeklyGoals: exists
          ? state.weeklyGoals.map((g) =>
              g.weekStart === action.payload.weekStart ? action.payload : g,
            )
          : [...state.weeklyGoals, action.payload],
      }
    }

    case 'ADD_SHIFT_SWAP':
      return { ...state, shiftSwaps: [...state.shiftSwaps, action.payload] }

    case 'UPDATE_SHIFT_SWAP':
      return {
        ...state,
        shiftSwaps: state.shiftSwaps.map((s) =>
          s.id === action.payload.id ? action.payload : s,
        ),
      }

    case 'ADD_BANCO_HORAS':
      return { ...state, bancoHoras: [...state.bancoHoras, action.payload] }

    case 'ADD_FEEDBACK':
      return { ...state, feedbacks: [...state.feedbacks, action.payload] }

    case 'UPDATE_FEEDBACK':
      return {
        ...state,
        feedbacks: state.feedbacks.map((f) =>
          f.id === action.payload.id ? action.payload : f,
        ),
      }

    case 'SET_GOLDEN_RULES':
      return { ...state, goldenRules: action.payload }

    case 'UPDATE_GOLDEN_RULE':
      return {
        ...state,
        goldenRules: state.goldenRules.map((r) =>
          r.id === action.payload.id ? action.payload : r,
        ),
      }

    case 'SET_THEME':
      return { ...state, theme: action.payload }

    case 'SET_ONBOARDING_DONE':
      return { ...state, onboardingDone: action.payload }

    case 'UPDATE_ASSIGNMENT_STATUS': {
      const { weekStart, date, hour, assignmentId, status } = action.payload
      return {
        ...state,
        schedules: state.schedules.map((s) => {
          if (s.weekStart !== weekStart) return s
          return {
            ...s,
            days: s.days.map((d) => {
              if (d.date !== date) return d
              return {
                ...d,
                slots: d.slots.map((sl) => {
                  if (sl.hour !== hour) return sl
                  return {
                    ...sl,
                    assignments: sl.assignments.map((a) =>
                      a.id === assignmentId ? { ...a, status, confirmedAt: status === 'confirmed' ? new Date().toISOString() : a.confirmedAt } : a,
                    ),
                  }
                }),
              }
            }),
          }
        }),
      }
    }

    default:
      return state
  }
}

// ── Context ─────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState
  dispatch: (action: Action) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, getInitialState)

  // Persist to localStorage on changes
  useEffect(() => {
    localStorage.setItem(LS_EMPLOYEES, JSON.stringify(state.employees))
  }, [state.employees])

  useEffect(() => {
    localStorage.setItem(LS_SCHEDULES, JSON.stringify(state.schedules))
  }, [state.schedules])

  useEffect(() => {
    localStorage.setItem(LS_CURRENT_USER, JSON.stringify(state.currentUser))
  }, [state.currentUser])

  useEffect(() => {
    localStorage.setItem(LS_PONTO, JSON.stringify(state.pontoRecords))
  }, [state.pontoRecords])

  useEffect(() => {
    localStorage.setItem(LS_WHATSAPP_CONFIG, JSON.stringify(state.whatsappConfig))
  }, [state.whatsappConfig])

  useEffect(() => {
    localStorage.setItem(LS_WHATSAPP_MESSAGES, JSON.stringify(state.whatsappMessages))
  }, [state.whatsappMessages])

  useEffect(() => {
    localStorage.setItem(LS_LOCATION_CONFIG, JSON.stringify(state.locationConfig))
  }, [state.locationConfig])

  useEffect(() => {
    localStorage.setItem(LS_NOTIFICATIONS, JSON.stringify(state.notifications))
  }, [state.notifications])

  useEffect(() => {
    localStorage.setItem(LS_PRODUCTIVITY, JSON.stringify(state.productivityRecords))
  }, [state.productivityRecords])

  useEffect(() => {
    localStorage.setItem(LS_WEEKLY_GOALS, JSON.stringify(state.weeklyGoals))
  }, [state.weeklyGoals])

  useEffect(() => {
    localStorage.setItem(LS_SHIFT_SWAPS, JSON.stringify(state.shiftSwaps))
  }, [state.shiftSwaps])

  useEffect(() => {
    localStorage.setItem(LS_BANCO_HORAS, JSON.stringify(state.bancoHoras))
  }, [state.bancoHoras])

  useEffect(() => {
    localStorage.setItem(LS_FEEDBACKS, JSON.stringify(state.feedbacks))
  }, [state.feedbacks])

  useEffect(() => {
    localStorage.setItem(LS_GOLDEN_RULES, JSON.stringify(state.goldenRules))
  }, [state.goldenRules])

  useEffect(() => {
    localStorage.setItem(LS_THEME, JSON.stringify(state.theme))
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

  useEffect(() => {
    localStorage.setItem(LS_ONBOARDING, JSON.stringify(state.onboardingDone))
  }, [state.onboardingDone])

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return ctx
}
