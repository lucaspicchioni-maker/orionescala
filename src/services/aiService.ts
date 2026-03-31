import type { Employee, PontoRecord } from '@/types'
import type { WeekSchedule } from '@/store/AppContext'
import type { Shift } from '@/types'

export interface RhInsightsResult {
  summary: string
  alerts: { level: 'critical' | 'warning' | 'info'; text: string }[]
  recommendations: string[]
}

export interface ScheduleSuggestResult {
  analysis: string
  problems: string[]
  suggestions: string[]
  priority_slots: string[]
}

export interface AbsenceRiskAIResult {
  riskScore: number
  reasoning: string
  recommendation: string
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? 'Erro na requisição')
  }
  return res.json()
}

export function getRhInsights(payload: {
  employees: { total: number; vacation: number; inactive: number }
  pontoStats: { absences: number; lates: number; totalWorked: number }
  topAbsentees: [string, { absences: number; lates: number }][]
  employeeNames: Record<string, string>
}): Promise<RhInsightsResult> {
  return post('/api/ai/rh-insights', payload)
}

export function getScheduleSuggestions(payload: {
  schedule: WeekSchedule
  employees: Employee[]
  weekStart: string
}): Promise<ScheduleSuggestResult> {
  return post('/api/ai/schedule-suggest', payload)
}

export function getAbsenceRiskAI(payload: {
  employee: Employee
  baseScore: number
  baseReasons: string[]
  upcomingShifts: Shift[]
}): Promise<AbsenceRiskAIResult> {
  return post('/api/ai/absence-risk', payload)
}

export function getWhatsAppMessageAI(payload: {
  type: 'schedule_notify' | 'presence_check' | 'absence_alert' | 'custom'
  employeeName: string
  context?: Record<string, unknown>
}): Promise<{ message: string }> {
  return post('/api/ai/whatsapp-message', payload)
}
