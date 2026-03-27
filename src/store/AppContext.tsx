import { createContext, useContext, useReducer, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { Employee, PontoRecord, WhatsAppConfig, WhatsAppMessage } from '@/types'
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

// ── Helpers ─────────────────────────────────────────────────────────────

const LS_EMPLOYEES = 'orion_employees'
const LS_SCHEDULES = 'orion_schedules'
const LS_CURRENT_USER = 'orion_current_user'
const LS_PONTO = 'orion_ponto'
const LS_WHATSAPP_CONFIG = 'orion_whatsapp_config'
const LS_WHATSAPP_MESSAGES = 'orion_whatsapp_messages'

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

const defaultUser: AppState['currentUser'] = { role: 'gerente', name: 'Gerente' }

function getInitialState(): AppState {
  return {
    employees: loadFromStorage<Employee[]>(LS_EMPLOYEES, defaultEmployees),
    schedules: loadFromStorage<WeekSchedule[]>(LS_SCHEDULES, []),
    pontoRecords: loadFromStorage<PontoRecord[]>(LS_PONTO, []),
    whatsappConfig: loadFromStorage<WhatsAppConfig>(LS_WHATSAPP_CONFIG, defaultWhatsAppConfig),
    whatsappMessages: loadFromStorage<WhatsAppMessage[]>(LS_WHATSAPP_MESSAGES, []),
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
