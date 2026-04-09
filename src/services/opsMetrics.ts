// ─────────────────────────────────────────────────────────────────────
// Métricas operacionais para o dashboard do gerente.
// Funções puras, testáveis, sem acesso a state/API.
//
// Referência: Tiago (especialista de performance) sugeriu OEE adaptado
// pra cloud kitchen + cost per order como norte do gerente.
// ─────────────────────────────────────────────────────────────────────
import type { Employee, PontoRecord, ProductivityRecord } from '@/types'
import type { WeekSchedule } from '@/store/AppContext'

export interface OEEResult {
  oee: number              // 0..1 — score geral
  availability: number     // 0..1 — horas trabalhadas / escaladas
  performance: number      // 0..1 — pedidos reais / capacidade teórica
  quality: number          // 0..1 — pedidos sem erro / totais
  classification: 'crítico' | 'médio' | 'saudável' | 'classe mundial'
  scheduledHours: number
  workedHours: number
  totalOrders: number
  totalErrors: number
  targetCapacity: number
}

export interface CostPerOrderResult {
  costPerOrder: number     // R$ por pedido
  totalCost: number        // R$
  totalOrders: number
  breakdown: {
    folhaHoras: number     // custo de horas escaladas (folha base)
    erros: number          // custo de erros (reembolsos etc)
    horasExtras: number    // estimativa HE (se workedHours > scheduledHours)
  }
}

/**
 * Calcula OEE para uma semana.
 *
 * @param targetOrdersPerHour Capacidade teórica de pedidos/pessoa/hora.
 *   Default 8 é baseado em cloud kitchen média (varia 6-12). Deve ser
 *   configurável por unidade — por enquanto hardcoded.
 */
export function calculateOEE(params: {
  schedule: WeekSchedule | undefined | null
  pontoRecords: PontoRecord[]
  productivityRecords: ProductivityRecord[]
  targetOrdersPerHour?: number
}): OEEResult {
  const { schedule, pontoRecords, productivityRecords, targetOrdersPerHour = 8 } = params

  // 1) Horas escaladas = soma de slots atribuídos na escala da semana
  let scheduledHours = 0
  if (schedule && schedule.days) {
    for (const day of schedule.days) {
      for (const slot of day.slots || []) {
        scheduledHours += (slot.assignments?.length || 0) // cada slot = 1h, conta por pessoa
      }
    }
  }

  // 2) Horas trabalhadas = soma de workedMinutes / 60 dos registros de ponto da semana
  const weekDates: string[] = schedule?.days?.map((d: { date: string }) => d.date) ?? []
  const weekPonto = pontoRecords.filter(p => weekDates.includes(p.date))
  const workedMinutes = weekPonto.reduce((s, p) => s + (p.workedMinutes || 0), 0)
  const workedHours = workedMinutes / 60

  // 3) Total de pedidos e erros da semana (somente da week)
  const weekStart = schedule?.weekStart
  const weekProd = productivityRecords.filter(r => r.weekStart === weekStart)
  const totalOrders = weekProd.reduce((s, r) => s + (r.totalOrders || 0), 0)
  const totalErrors = weekProd.reduce((s, r) => s + (r.totalErrors || 0), 0)

  // 4) Capacidade teórica = horas escaladas × targetOrdersPerHour
  const targetCapacity = scheduledHours * targetOrdersPerHour

  // 5) Componentes OEE
  // Availability: se não escalou nada, availability = 0 (não operou)
  const availability = scheduledHours > 0 ? Math.min(1, workedHours / scheduledHours) : 0

  // Performance: se não tem capacidade (não escalou), performance = 0
  const performance = targetCapacity > 0 ? Math.min(1, totalOrders / targetCapacity) : 0

  // Quality: se não teve pedidos, quality = 1 (nada pra errar — neutro)
  const quality = totalOrders > 0 ? (totalOrders - totalErrors) / totalOrders : 1

  const oee = availability * performance * quality

  let classification: OEEResult['classification']
  if (oee >= 0.85) classification = 'classe mundial'
  else if (oee >= 0.60) classification = 'saudável'
  else if (oee >= 0.40) classification = 'médio'
  else classification = 'crítico'

  return {
    oee,
    availability,
    performance,
    quality,
    classification,
    scheduledHours: Math.round(scheduledHours * 10) / 10,
    workedHours: Math.round(workedHours * 10) / 10,
    totalOrders,
    totalErrors,
    targetCapacity: Math.round(targetCapacity),
  }
}

/**
 * Calcula Cost per Order — métrica financeira chave.
 * Inclui: folha (horas × R$/h), erros (reembolso) e estimativa de HE.
 */
export function calculateCostPerOrder(params: {
  schedule: WeekSchedule | undefined | null
  pontoRecords: PontoRecord[]
  productivityRecords: ProductivityRecord[]
  employees: Employee[]
}): CostPerOrderResult {
  const { schedule, pontoRecords, productivityRecords, employees } = params
  const empMap = new Map(employees.map(e => [e.id, e]))

  // 1) Custo da folha: horas escaladas × hourly rate de cada colaborador
  let folhaHoras = 0
  if (schedule && schedule.days) {
    for (const day of schedule.days) {
      for (const slot of day.slots || []) {
        for (const assignment of slot.assignments || []) {
          const emp = empMap.get(assignment.employeeId)
          if (emp) folhaHoras += emp.hourlyRate || 0
        }
      }
    }
  }

  // 2) Custo de erros (reembolsos)
  const weekStart = schedule?.weekStart
  const weekProd = productivityRecords.filter(r => r.weekStart === weekStart)
  const erros = weekProd.reduce((s, r) => s + (r.errorCost || 0), 0)
  const totalOrders = weekProd.reduce((s, r) => s + (r.totalOrders || 0), 0)

  // 3) Horas extras estimadas: se trabalhou mais que escalado, conta como HE (1.5x)
  const weekDates: string[] = schedule?.days?.map((d: { date: string }) => d.date) ?? []
  const weekPonto = pontoRecords.filter(p => weekDates.includes(p.date))
  let horasExtrasMin = 0
  for (const p of weekPonto) {
    const emp = empMap.get(p.employeeId)
    if (!emp) continue
    // Aproximação: se workedMinutes excede 8h/dia, excedente é HE
    const workedToday = p.workedMinutes || 0
    if (workedToday > 8 * 60) {
      horasExtrasMin += (workedToday - 8 * 60)
    }
  }
  const horasExtras = (horasExtrasMin / 60) * 0.5 * // adicional 50%
    (employees.reduce((s, e) => s + (e.hourlyRate || 0), 0) / Math.max(1, employees.length)) // avg hourly

  const totalCost = folhaHoras + erros + horasExtras
  const costPerOrder = totalOrders > 0 ? totalCost / totalOrders : 0

  return {
    costPerOrder: Math.round(costPerOrder * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalOrders,
    breakdown: {
      folhaHoras: Math.round(folhaHoras * 100) / 100,
      erros: Math.round(erros * 100) / 100,
      horasExtras: Math.round(horasExtras * 100) / 100,
    },
  }
}
