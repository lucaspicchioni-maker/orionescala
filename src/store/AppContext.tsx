import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Employee, PontoRecord, WhatsAppConfig, WhatsAppMessage, LocationConfig, ScheduledNotification, ProductivityRecord, WeeklyGoal, ShiftSwapRequest, BancoHorasEntry, FeedbackRecord, GoldenRule, AvailabilityDeclaration, EmployeeBadge, ShiftFeedback, Announcement } from '@/types'
import { employees as defaultEmployees } from '@/data/employees'
import { api, hasToken } from '@/lib/api'
import { computeWeeklyBadges } from '@/services/badgeEngine'

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
  availabilities: AvailabilityDeclaration[]
  badges: EmployeeBadge[]
  shiftFeedbacks: ShiftFeedback[]
  announcements: Announcement[]
  theme: 'dark' | 'light'
  onboardingDone: boolean
  currentWeek: string
  currentUser: { role: 'colaborador' | 'supervisor' | 'gerente' | 'rh' | 'admin'; name: string }
  loading: boolean
  apiReady: boolean
}

// ── Actions ─────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD_EMPLOYEE'; payload: Employee }
  | { type: 'UPDATE_EMPLOYEE'; payload: Employee }
  | { type: 'DELETE_EMPLOYEE'; payload: string }
  | { type: 'SET_EMPLOYEES'; payload: Employee[] }
  | { type: 'SET_SCHEDULE'; payload: WeekSchedule }
  | { type: 'SET_SCHEDULES'; payload: WeekSchedule[] }
  | { type: 'UPDATE_SLOT'; payload: { weekStart: string; date: string; hour: string; slot: SlotData } }
  | { type: 'PUBLISH_SCHEDULE'; payload: string }
  | { type: 'SET_CURRENT_WEEK'; payload: string }
  | { type: 'SET_CURRENT_USER'; payload: AppState['currentUser'] }
  | { type: 'ADD_PONTO'; payload: PontoRecord }
  | { type: 'UPDATE_PONTO'; payload: PontoRecord }
  | { type: 'SET_PONTO_RECORDS'; payload: PontoRecord[] }
  | { type: 'SET_WHATSAPP_CONFIG'; payload: WhatsAppConfig }
  | { type: 'ADD_WHATSAPP_MESSAGE'; payload: WhatsAppMessage }
  | { type: 'UPDATE_ASSIGNMENT_STATUS'; payload: { weekStart: string; date: string; hour: string; assignmentId: string; status: Assignment['status'] } }
  | { type: 'SET_LOCATION_CONFIG'; payload: LocationConfig }
  | { type: 'ADD_NOTIFICATIONS'; payload: ScheduledNotification[] }
  | { type: 'UPDATE_NOTIFICATION'; payload: ScheduledNotification }
  | { type: 'ADD_PRODUCTIVITY_RECORD'; payload: ProductivityRecord }
  | { type: 'UPDATE_PRODUCTIVITY_RECORD'; payload: ProductivityRecord }
  | { type: 'SET_PRODUCTIVITY_RECORDS'; payload: ProductivityRecord[] }
  | { type: 'SET_WEEKLY_GOAL'; payload: WeeklyGoal }
  | { type: 'SET_WEEKLY_GOALS'; payload: WeeklyGoal[] }
  | { type: 'ADD_SHIFT_SWAP'; payload: ShiftSwapRequest }
  | { type: 'UPDATE_SHIFT_SWAP'; payload: ShiftSwapRequest }
  | { type: 'SET_SHIFT_SWAPS'; payload: ShiftSwapRequest[] }
  | { type: 'ADD_BANCO_HORAS'; payload: BancoHorasEntry }
  | { type: 'SET_BANCO_HORAS'; payload: BancoHorasEntry[] }
  | { type: 'ADD_FEEDBACK'; payload: FeedbackRecord }
  | { type: 'UPDATE_FEEDBACK'; payload: FeedbackRecord }
  | { type: 'SET_FEEDBACKS'; payload: FeedbackRecord[] }
  | { type: 'SET_GOLDEN_RULES'; payload: GoldenRule[] }
  | { type: 'UPDATE_GOLDEN_RULE'; payload: GoldenRule }
  | { type: 'ADD_AVAILABILITY'; payload: AvailabilityDeclaration }
  | { type: 'UPDATE_AVAILABILITY'; payload: AvailabilityDeclaration }
  | { type: 'SET_AVAILABILITIES'; payload: AvailabilityDeclaration[] }
  | { type: 'ADD_BADGES'; payload: EmployeeBadge[] }
  | { type: 'SET_BADGES'; payload: EmployeeBadge[] }
  | { type: 'ADD_SHIFT_FEEDBACK'; payload: ShiftFeedback }
  | { type: 'SET_SHIFT_FEEDBACKS'; payload: ShiftFeedback[] }
  | { type: 'ADD_ANNOUNCEMENT'; payload: Announcement }
  | { type: 'UPDATE_ANNOUNCEMENT'; payload: Announcement }
  | { type: 'SET_ANNOUNCEMENTS'; payload: Announcement[] }
  | { type: 'MARK_ANNOUNCEMENT_READ'; payload: { announcementId: string; employeeId: string } }
  | { type: 'SET_THEME'; payload: 'dark' | 'light' }
  | { type: 'SET_ONBOARDING_DONE'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_API_READY'; payload: boolean }

// ── Helpers ─────────────────────────────────────────────────────────────

const LS_CURRENT_USER = 'orion_current_user'
const LS_WHATSAPP_CONFIG = 'orion_whatsapp_config'
const LS_LOCATION_CONFIG = 'orion_location_config'
const LS_GOLDEN_RULES = 'orion_golden_rules'
const LS_THEME = 'orion_theme'
const LS_ONBOARDING = 'orion_onboarding_done'

const defaultLocationConfig: LocationConfig = {
  name: 'Cozinha Orion - Rua Grao Mogol 99, Sion, BH',
  lat: -19.9365,
  lng: -43.9345,
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
  { id: 'rule-max-weekly-hours', name: 'Limite de Horas Semanais', description: 'Colaborador nao pode ultrapassar X horas na semana', layer: 'global', severity: 'bloqueante', enabled: true, config: { maxWeeklyHours: 44 } },
  { id: 'rule-max-overtime', name: 'Limite de Horas Extras', description: 'Maximo de horas extras permitidas por semana', layer: 'global', severity: 'alerta', enabled: true, config: { maxOvertimeHours: 10 } },
  { id: 'rule-break-required', name: 'Intervalo Obrigatorio', description: 'Turnos acima de X horas exigem intervalo sinalizado', layer: 'global', severity: 'bloqueante', enabled: true, config: { requireBreak: true, breakAfterHours: 5 } },
  { id: 'rule-min-staff', name: 'Minimo de Colaboradores', description: 'Minimo de pessoas escaladas por slot de horario', layer: 'global', severity: 'bloqueante', enabled: true, config: { minStaffPerSlot: 2 } },
  { id: 'rule-exp-no-late', name: 'Atraso Zero', description: 'Expeditor nao pode atrasar mais que X minutos', layer: 'expeditor', severity: 'bloqueante', enabled: true, config: { maxLateMinutes: 5 } },
  { id: 'rule-exp-no-absence', name: 'Presenca Obrigatoria', description: 'Expeditor nao pode faltar mais que X vezes no mes', layer: 'expeditor', severity: 'bloqueante', enabled: true, config: { maxAbsencesPerMonth: 1 } },
  { id: 'rule-sup-no-unfilled', name: 'Escala Completa', description: 'Nao pode ter slots sem cobertura na escala publicada', layer: 'supervisor', severity: 'bloqueante', enabled: true, config: { maxUnfilledSlots: 0 } },
  { id: 'rule-ger-productivity-min', name: 'Produtividade Minima', description: 'Produtividade da equipe nao pode ficar abaixo de X pedidos/hora', layer: 'gerente', severity: 'alerta', enabled: true, config: { minProductivityPerHour: 15 } },
  { id: 'rule-ger-productivity-max', name: 'Produtividade Maxima (Sobrecarga)', description: 'Produtividade acima de X indica sobrecarga da equipe', layer: 'gerente', severity: 'alerta', enabled: true, config: { maxProductivityPerHour: 40 } },
  { id: 'rule-ger-error-rate', name: 'Taxa de Erros Maxima', description: 'Taxa de erros da equipe nao pode ultrapassar X%', layer: 'gerente', severity: 'alerta', enabled: true, config: { maxErrorRate: 5 } },
  { id: 'rule-ger-sla', name: 'SLA Minimo', description: 'Compliance de SLA nao pode ficar abaixo de X%', layer: 'gerente', severity: 'bloqueante', enabled: true, config: { minSlaCompliance: 85 } },
]

const defaultUser: AppState['currentUser'] = { role: 'colaborador', name: '' }

function getInitialState(): AppState {
  const currentUser = loadFromStorage<AppState['currentUser']>(LS_CURRENT_USER, defaultUser)
  return {
    employees: defaultEmployees,
    schedules: [],
    pontoRecords: [],
    whatsappConfig: loadFromStorage<WhatsAppConfig>(LS_WHATSAPP_CONFIG, defaultWhatsAppConfig),
    whatsappMessages: [],
    locationConfig: loadFromStorage<LocationConfig>(LS_LOCATION_CONFIG, defaultLocationConfig),
    notifications: [],
    productivityRecords: [],
    weeklyGoals: [],
    shiftSwaps: [],
    bancoHoras: [],
    feedbacks: [],
    goldenRules: loadFromStorage<GoldenRule[]>(LS_GOLDEN_RULES, defaultGoldenRules),
    availabilities: [],
    badges: [],
    shiftFeedbacks: [],
    announcements: [],
    theme: loadFromStorage<'dark' | 'light'>(LS_THEME, 'dark'),
    onboardingDone: loadFromStorage<boolean>(LS_ONBOARDING, false),
    currentWeek: getMonday(),
    currentUser,
    loading: false,
    apiReady: false,
  }
}

// ── Reducer ─────────────────────────────────────────────────────────────

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_EMPLOYEES':
      return { ...state, employees: action.payload }
    case 'ADD_EMPLOYEE':
      return { ...state, employees: [...state.employees, action.payload] }
    case 'UPDATE_EMPLOYEE':
      return { ...state, employees: state.employees.map(e => e.id === action.payload.id ? action.payload : e) }
    case 'DELETE_EMPLOYEE':
      return { ...state, employees: state.employees.filter(e => e.id !== action.payload) }
    case 'SET_SCHEDULES':
      return { ...state, schedules: action.payload }
    case 'SET_SCHEDULE': {
      const exists = state.schedules.some(s => s.weekStart === action.payload.weekStart)
      return {
        ...state,
        schedules: exists
          ? state.schedules.map(s => s.weekStart === action.payload.weekStart ? action.payload : s)
          : [...state.schedules, action.payload],
      }
    }
    case 'UPDATE_SLOT': {
      const { weekStart, date, hour, slot } = action.payload
      return {
        ...state,
        schedules: state.schedules.map(s => {
          if (s.weekStart !== weekStart) return s
          return {
            ...s,
            days: s.days.map(d => {
              if (d.date !== date) return d
              return { ...d, slots: d.slots.map(sl => (sl.hour === hour ? slot : sl)) }
            }),
          }
        }),
      }
    }
    case 'PUBLISH_SCHEDULE':
      return { ...state, schedules: state.schedules.map(s => s.weekStart === action.payload ? { ...s, published: true, publishedAt: new Date().toISOString() } : s) }
    case 'SET_CURRENT_WEEK':
      return { ...state, currentWeek: action.payload }
    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload }
    case 'SET_PONTO_RECORDS':
      return { ...state, pontoRecords: action.payload }
    case 'ADD_PONTO':
      return { ...state, pontoRecords: [...state.pontoRecords, action.payload] }
    case 'UPDATE_PONTO':
      return { ...state, pontoRecords: state.pontoRecords.map(p => p.id === action.payload.id ? action.payload : p) }
    case 'SET_WHATSAPP_CONFIG':
      return { ...state, whatsappConfig: action.payload }
    case 'ADD_WHATSAPP_MESSAGE':
      return { ...state, whatsappMessages: [...state.whatsappMessages, action.payload] }
    case 'SET_LOCATION_CONFIG':
      return { ...state, locationConfig: action.payload }
    case 'ADD_NOTIFICATIONS':
      return { ...state, notifications: [...state.notifications, ...action.payload] }
    case 'UPDATE_NOTIFICATION':
      return { ...state, notifications: state.notifications.map(n => n.id === action.payload.id ? action.payload : n) }
    case 'ADD_PRODUCTIVITY_RECORD':
      return { ...state, productivityRecords: [...state.productivityRecords, action.payload] }
    case 'UPDATE_PRODUCTIVITY_RECORD':
      return { ...state, productivityRecords: state.productivityRecords.map(r => r.id === action.payload.id ? action.payload : r) }
    case 'SET_PRODUCTIVITY_RECORDS':
      return { ...state, productivityRecords: action.payload }
    case 'SET_WEEKLY_GOAL': {
      const exists = state.weeklyGoals.some(g => g.weekStart === action.payload.weekStart)
      return { ...state, weeklyGoals: exists ? state.weeklyGoals.map(g => g.weekStart === action.payload.weekStart ? action.payload : g) : [...state.weeklyGoals, action.payload] }
    }
    case 'SET_WEEKLY_GOALS':
      return { ...state, weeklyGoals: action.payload }
    case 'ADD_SHIFT_SWAP':
      return { ...state, shiftSwaps: [...state.shiftSwaps, action.payload] }
    case 'UPDATE_SHIFT_SWAP':
      return { ...state, shiftSwaps: state.shiftSwaps.map(s => s.id === action.payload.id ? action.payload : s) }
    case 'SET_SHIFT_SWAPS':
      return { ...state, shiftSwaps: action.payload }
    case 'ADD_BANCO_HORAS':
      return { ...state, bancoHoras: [...state.bancoHoras, action.payload] }
    case 'SET_BANCO_HORAS':
      return { ...state, bancoHoras: action.payload }
    case 'ADD_FEEDBACK':
      return { ...state, feedbacks: [...state.feedbacks, action.payload] }
    case 'UPDATE_FEEDBACK':
      return { ...state, feedbacks: state.feedbacks.map(f => f.id === action.payload.id ? action.payload : f) }
    case 'SET_FEEDBACKS':
      return { ...state, feedbacks: action.payload }
    case 'SET_GOLDEN_RULES':
      return { ...state, goldenRules: action.payload }
    case 'UPDATE_GOLDEN_RULE':
      return { ...state, goldenRules: state.goldenRules.map(r => r.id === action.payload.id ? action.payload : r) }
    case 'ADD_AVAILABILITY': {
      const existsAvail = state.availabilities.some(a => a.employeeId === action.payload.employeeId && a.weekStart === action.payload.weekStart)
      return { ...state, availabilities: existsAvail ? state.availabilities.map(a => a.employeeId === action.payload.employeeId && a.weekStart === action.payload.weekStart ? action.payload : a) : [...state.availabilities, action.payload] }
    }
    case 'UPDATE_AVAILABILITY':
      return { ...state, availabilities: state.availabilities.map(a => a.id === action.payload.id ? action.payload : a) }
    case 'SET_AVAILABILITIES':
      return { ...state, availabilities: action.payload }
    case 'ADD_BADGES':
      return { ...state, badges: [...state.badges, ...action.payload] }
    case 'SET_BADGES':
      return { ...state, badges: action.payload }
    case 'ADD_SHIFT_FEEDBACK':
      return { ...state, shiftFeedbacks: [...state.shiftFeedbacks, action.payload] }
    case 'SET_SHIFT_FEEDBACKS':
      return { ...state, shiftFeedbacks: action.payload }
    case 'ADD_ANNOUNCEMENT':
      return { ...state, announcements: [...state.announcements, action.payload] }
    case 'UPDATE_ANNOUNCEMENT':
      return { ...state, announcements: state.announcements.map(a => a.id === action.payload.id ? action.payload : a) }
    case 'SET_ANNOUNCEMENTS':
      return { ...state, announcements: action.payload }
    case 'MARK_ANNOUNCEMENT_READ':
      return { ...state, announcements: state.announcements.map(a => a.id === action.payload.announcementId && !a.readBy.includes(action.payload.employeeId) ? { ...a, readBy: [...a.readBy, action.payload.employeeId] } : a) }
    case 'SET_THEME':
      return { ...state, theme: action.payload }
    case 'SET_ONBOARDING_DONE':
      return { ...state, onboardingDone: action.payload }
    case 'UPDATE_ASSIGNMENT_STATUS': {
      const { weekStart, date, hour, assignmentId, status } = action.payload
      return {
        ...state,
        schedules: state.schedules.map(s => {
          if (s.weekStart !== weekStart) return s
          return {
            ...s,
            days: s.days.map(d => {
              if (d.date !== date) return d
              return {
                ...d,
                slots: d.slots.map(sl => {
                  if (sl.hour !== hour) return sl
                  return { ...sl, assignments: sl.assignments.map(a => a.id === assignmentId ? { ...a, status, confirmedAt: status === 'confirmed' ? new Date().toISOString() : a.confirmedAt } : a) }
                }),
              }
            }),
          }
        }),
      }
    }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_API_READY':
      return { ...state, apiReady: action.payload }
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
  const prevWeekRef = useRef(state.currentWeek)

  // Load data from API on mount if user is logged in
  const loadFromApi = useCallback(async () => {
    if (!hasToken()) return
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const [emps, schedulesList, pontoList, annList, swapList] = await Promise.all([
        api.get<Employee[]>('/api/employees').catch(() => null),
        api.get<WeekSchedule[]>('/api/schedules').catch(() => null),
        api.get<PontoRecord[]>('/api/ponto').catch(() => null),
        api.get<Announcement[]>('/api/announcements').catch(() => null),
        api.get<ShiftSwapRequest[]>('/api/shift-swaps').catch(() => null),
      ])
      if (emps) dispatch({ type: 'SET_EMPLOYEES', payload: emps })
      if (schedulesList) dispatch({ type: 'SET_SCHEDULES', payload: schedulesList })
      if (pontoList) dispatch({ type: 'SET_PONTO_RECORDS', payload: pontoList })
      if (annList) dispatch({ type: 'SET_ANNOUNCEMENTS', payload: annList })
      if (swapList) dispatch({ type: 'SET_SHIFT_SWAPS', payload: swapList })
      dispatch({ type: 'SET_API_READY', payload: true })
    } catch {
      // API not available, use local data
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [])

  useEffect(() => {
    loadFromApi()
  }, [loadFromApi])

  // Sync employees to API on change
  useEffect(() => {
    if (!state.apiReady) return
    // We sync individual operations via the pages that dispatch
  }, [state.employees, state.apiReady])

  // Persist to localStorage only for data without API endpoints
  useEffect(() => { localStorage.setItem(LS_CURRENT_USER, JSON.stringify(state.currentUser)) }, [state.currentUser])
  useEffect(() => { localStorage.setItem(LS_WHATSAPP_CONFIG, JSON.stringify(state.whatsappConfig)) }, [state.whatsappConfig])
  useEffect(() => { localStorage.setItem(LS_LOCATION_CONFIG, JSON.stringify(state.locationConfig)) }, [state.locationConfig])
  useEffect(() => { localStorage.setItem(LS_GOLDEN_RULES, JSON.stringify(state.goldenRules)) }, [state.goldenRules])
  useEffect(() => {
    localStorage.setItem(LS_THEME, JSON.stringify(state.theme))
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])
  useEffect(() => { localStorage.setItem(LS_ONBOARDING, JSON.stringify(state.onboardingDone)) }, [state.onboardingDone])

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-badges on week change
  useEffect(() => {
    if (prevWeekRef.current !== state.currentWeek) {
      const previousWeek = prevWeekRef.current
      prevWeekRef.current = state.currentWeek
      // Compute badges for the week that just ended
      const newBadges = computeWeeklyBadges(
        state.employees,
        state.pontoRecords,
        state.productivityRecords,
        previousWeek,
      )
      // Only add badges that don't already exist
      const existingIds = new Set(state.badges.map(b => b.id))
      const uniqueNew = newBadges.filter(b => !existingIds.has(b.id))
      if (uniqueNew.length > 0) {
        dispatch({ type: 'ADD_BADGES', payload: uniqueNew })
      }
    }
  }, [state.currentWeek, state.employees, state.pontoRecords, state.productivityRecords, state.badges])

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
