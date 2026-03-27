import type { GoldenRule, RuleViolation, WeekHighlight } from '@/types'
import type { AppState } from '@/store/AppContext'

/**
 * Evaluates all enabled golden rules against current state and returns violations + highlights.
 */
export function evaluateRules(
  state: AppState,
  weekStart: string,
): { violations: RuleViolation[]; highlights: WeekHighlight[] } {
  const violations: RuleViolation[] = []
  const highlights: WeekHighlight[] = []
  const enabledRules = state.goldenRules.filter(r => r.enabled)

  const schedule = state.schedules.find(s => s.weekStart === weekStart)
  const weekPonto = state.pontoRecords.filter(p => {
    const d = new Date(p.date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const ws = new Date(new Date(p.date + 'T00:00:00').setDate(diff)).toISOString().split('T')[0]
    return ws === weekStart
  })
  const weekProductivity = state.productivityRecords.filter(r => r.weekStart === weekStart)

  const empMap: Record<string, string> = {}
  state.employees.forEach(e => { empMap[e.id] = e.name })

  for (const rule of enabledRules) {
    evaluateRule(rule, state, weekStart, schedule, weekPonto, weekProductivity, empMap, violations, highlights)
  }

  // Auto-generate positive highlights
  generatePositiveHighlights(state, weekStart, weekPonto, weekProductivity, empMap, highlights)

  return { violations, highlights }
}

function evaluateRule(
  rule: GoldenRule,
  state: AppState,
  weekStart: string,
  schedule: AppState['schedules'][0] | undefined,
  weekPonto: AppState['pontoRecords'],
  weekProductivity: AppState['productivityRecords'],
  empMap: Record<string, string>,
  violations: RuleViolation[],
  _highlights: WeekHighlight[],
) {
  const cfg = rule.config

  // ── Max Weekly Hours ──
  if (cfg.maxWeeklyHours !== undefined) {
    // Calculate hours per employee from ponto
    const empHours: Record<string, number> = {}
    weekPonto.forEach(p => {
      empHours[p.employeeId] = (empHours[p.employeeId] || 0) + p.workedMinutes / 60
    })
    for (const [empId, hours] of Object.entries(empHours)) {
      if (hours > cfg.maxWeeklyHours) {
        violations.push({
          id: crypto.randomUUID(),
          ruleId: rule.id,
          ruleName: rule.name,
          layer: rule.layer,
          severity: rule.severity,
          employeeId: empId,
          date: weekStart,
          weekStart,
          description: `${empMap[empId] || empId} trabalhou ${hours.toFixed(1)}h na semana (limite: ${cfg.maxWeeklyHours}h)`,
          value: hours,
          threshold: cfg.maxWeeklyHours,
          unit: 'horas',
        })
      }
    }
  }

  // ── Max Overtime ──
  if (cfg.maxOvertimeHours !== undefined && cfg.maxWeeklyHours === undefined) {
    // Use scheduled vs worked difference
    const empOvertime: Record<string, number> = {}
    state.bancoHoras.filter(b => b.weekStart === weekStart && b.balanceMinutes > 0).forEach(b => {
      empOvertime[b.employeeId] = (empOvertime[b.employeeId] || 0) + b.balanceMinutes / 60
    })
    for (const [empId, ot] of Object.entries(empOvertime)) {
      if (ot > cfg.maxOvertimeHours) {
        violations.push({
          id: crypto.randomUUID(),
          ruleId: rule.id,
          ruleName: rule.name,
          layer: rule.layer,
          severity: rule.severity,
          employeeId: empId,
          date: weekStart,
          weekStart,
          description: `${empMap[empId] || empId} fez ${ot.toFixed(1)}h extras (limite: ${cfg.maxOvertimeHours}h)`,
          value: ot,
          threshold: cfg.maxOvertimeHours,
          unit: 'horas extras',
        })
      }
    }
  }

  // ── Min Staff Per Slot ──
  if (cfg.minStaffPerSlot !== undefined && schedule) {
    for (const day of schedule.days) {
      for (const slot of day.slots) {
        if (slot.assignments.length < cfg.minStaffPerSlot && slot.requiredPeople > 0) {
          violations.push({
            id: crypto.randomUUID(),
            ruleId: rule.id,
            ruleName: rule.name,
            layer: rule.layer,
            severity: rule.severity,
            employeeId: null,
            date: day.date,
            weekStart,
            description: `${day.dayOfWeek} ${slot.hour}: ${slot.assignments.length} pessoa(s) escalada(s), minimo ${cfg.minStaffPerSlot}`,
            value: slot.assignments.length,
            threshold: cfg.minStaffPerSlot,
            unit: 'pessoas',
          })
        }
      }
    }
  }

  // ── Max Late Minutes (Expeditor) ──
  if (cfg.maxLateMinutes !== undefined) {
    weekPonto.filter(p => p.lateMinutes > cfg.maxLateMinutes!).forEach(p => {
      violations.push({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        ruleName: rule.name,
        layer: rule.layer,
        severity: rule.severity,
        employeeId: p.employeeId,
        date: p.date,
        weekStart,
        description: `${empMap[p.employeeId] || p.employeeId} atrasou ${p.lateMinutes}min em ${p.date} (limite: ${cfg.maxLateMinutes}min)`,
        value: p.lateMinutes,
        threshold: cfg.maxLateMinutes!,
        unit: 'minutos',
      })
    })
  }

  // ── Max Absences Per Month ──
  if (cfg.maxAbsencesPerMonth !== undefined) {
    const month = weekStart.substring(0, 7)
    const monthPonto = state.pontoRecords.filter(p => p.date.startsWith(month))
    const empAbsences: Record<string, number> = {}
    monthPonto.filter(p => p.status === 'absent').forEach(p => {
      empAbsences[p.employeeId] = (empAbsences[p.employeeId] || 0) + 1
    })
    for (const [empId, count] of Object.entries(empAbsences)) {
      if (count > cfg.maxAbsencesPerMonth) {
        violations.push({
          id: crypto.randomUUID(),
          ruleId: rule.id,
          ruleName: rule.name,
          layer: rule.layer,
          severity: rule.severity,
          employeeId: empId,
          date: weekStart,
          weekStart,
          description: `${empMap[empId] || empId} tem ${count} falta(s) no mes (limite: ${cfg.maxAbsencesPerMonth})`,
          value: count,
          threshold: cfg.maxAbsencesPerMonth,
          unit: 'faltas',
        })
      }
    }
  }

  // ── Max Unfilled Slots (Supervisor) ──
  if (cfg.maxUnfilledSlots !== undefined && schedule && schedule.published) {
    let unfilled = 0
    for (const day of schedule.days) {
      for (const slot of day.slots) {
        if (slot.requiredPeople > 0 && slot.assignments.length < slot.requiredPeople) {
          unfilled += (slot.requiredPeople - slot.assignments.length)
        }
      }
    }
    if (unfilled > cfg.maxUnfilledSlots) {
      violations.push({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        ruleName: rule.name,
        layer: rule.layer,
        severity: rule.severity,
        employeeId: null,
        date: weekStart,
        weekStart,
        description: `Escala publicada com ${unfilled} vaga(s) sem cobertura`,
        value: unfilled,
        threshold: cfg.maxUnfilledSlots,
        unit: 'vagas',
      })
    }
  }

  // ── Productivity Min/Max (Gerente) ──
  if (cfg.minProductivityPerHour !== undefined && weekProductivity.length > 0) {
    const totalOrders = weekProductivity.reduce((s, r) => s + r.totalOrders, 0)
    const totalHours = weekProductivity.reduce((s, r) => s + r.hoursWorked, 0)
    const avgProd = totalHours > 0 ? totalOrders / totalHours : 0
    if (avgProd < cfg.minProductivityPerHour) {
      violations.push({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        ruleName: rule.name,
        layer: rule.layer,
        severity: rule.severity,
        employeeId: null,
        date: weekStart,
        weekStart,
        description: `Produtividade media: ${avgProd.toFixed(1)} ped/h (minimo: ${cfg.minProductivityPerHour})`,
        value: avgProd,
        threshold: cfg.minProductivityPerHour,
        unit: 'pedidos/hora',
      })
    }
  }

  if (cfg.maxProductivityPerHour !== undefined && weekProductivity.length > 0) {
    const totalOrders = weekProductivity.reduce((s, r) => s + r.totalOrders, 0)
    const totalHours = weekProductivity.reduce((s, r) => s + r.hoursWorked, 0)
    const avgProd = totalHours > 0 ? totalOrders / totalHours : 0
    if (avgProd > cfg.maxProductivityPerHour) {
      violations.push({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        ruleName: rule.name,
        layer: rule.layer,
        severity: rule.severity,
        employeeId: null,
        date: weekStart,
        weekStart,
        description: `Produtividade media: ${avgProd.toFixed(1)} ped/h (maximo: ${cfg.maxProductivityPerHour}) — possivel sobrecarga`,
        value: avgProd,
        threshold: cfg.maxProductivityPerHour,
        unit: 'pedidos/hora',
      })
    }
  }

  // ── Error Rate (Gerente) ──
  if (cfg.maxErrorRate !== undefined && weekProductivity.length > 0) {
    const totalOrders = weekProductivity.reduce((s, r) => s + r.totalOrders, 0)
    const totalErrors = weekProductivity.reduce((s, r) => s + r.totalErrors, 0)
    const errorRate = totalOrders > 0 ? (totalErrors / totalOrders) * 100 : 0
    if (errorRate > cfg.maxErrorRate) {
      violations.push({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        ruleName: rule.name,
        layer: rule.layer,
        severity: rule.severity,
        employeeId: null,
        date: weekStart,
        weekStart,
        description: `Taxa de erros: ${errorRate.toFixed(1)}% (maximo: ${cfg.maxErrorRate}%)`,
        value: errorRate,
        threshold: cfg.maxErrorRate,
        unit: '%',
      })
    }
  }

  // ── SLA (Gerente) ──
  if (cfg.minSlaCompliance !== undefined && weekProductivity.length > 0) {
    const avgSla = weekProductivity.reduce((s, r) => s + r.slaCompliance, 0) / weekProductivity.length
    if (avgSla < cfg.minSlaCompliance) {
      violations.push({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        ruleName: rule.name,
        layer: rule.layer,
        severity: rule.severity,
        employeeId: null,
        date: weekStart,
        weekStart,
        description: `SLA medio: ${avgSla.toFixed(1)}% (minimo: ${cfg.minSlaCompliance}%)`,
        value: avgSla,
        threshold: cfg.minSlaCompliance,
        unit: '%',
      })
    }
  }
}

function generatePositiveHighlights(
  _state: AppState,
  _weekStart: string,
  weekPonto: AppState['pontoRecords'],
  weekProductivity: AppState['productivityRecords'],
  empMap: Record<string, string>,
  highlights: WeekHighlight[],
) {
  // Zero absences
  const absences = weekPonto.filter(p => p.status === 'absent').length
  if (weekPonto.length > 0 && absences === 0) {
    highlights.push({
      type: 'positive',
      layer: 'expeditor',
      title: 'Zero Faltas',
      description: 'Nenhuma falta registrada nesta semana!',
    })
  }

  // All on time
  const lateCount = weekPonto.filter(p => p.lateMinutes > 5).length
  if (weekPonto.length > 0 && lateCount === 0) {
    highlights.push({
      type: 'positive',
      layer: 'expeditor',
      title: 'Pontualidade Perfeita',
      description: 'Todos os check-ins foram no horario!',
    })
  }

  // Best performer
  if (weekProductivity.length > 0) {
    const byEmployee: Record<string, { orders: number; hours: number }> = {}
    weekProductivity.forEach(r => {
      if (!byEmployee[r.employeeId]) byEmployee[r.employeeId] = { orders: 0, hours: 0 }
      byEmployee[r.employeeId].orders += r.totalOrders
      byEmployee[r.employeeId].hours += r.hoursWorked
    })
    let bestId = ''
    let bestProd = 0
    for (const [id, data] of Object.entries(byEmployee)) {
      const prod = data.hours > 0 ? data.orders / data.hours : 0
      if (prod > bestProd) { bestProd = prod; bestId = id }
    }
    if (bestId) {
      highlights.push({
        type: 'positive',
        layer: 'gerente',
        title: 'Destaque de Produtividade',
        description: `${empMap[bestId] || bestId} teve a melhor produtividade: ${bestProd.toFixed(1)} ped/h`,
        metric: bestProd,
        unit: 'ped/h',
        employeeId: bestId,
      })
    }

    // Zero errors employee
    const zeroErrors = weekProductivity
      .filter(r => r.totalErrors === 0)
      .map(r => r.employeeId)
    const uniqueZero = [...new Set(zeroErrors)]
    if (uniqueZero.length > 0) {
      highlights.push({
        type: 'positive',
        layer: 'expeditor',
        title: 'Zero Erros',
        description: `${uniqueZero.map(id => empMap[id] || id).join(', ')} nao cometeram nenhum erro!`,
      })
    }

    // High SLA
    const avgSla = weekProductivity.reduce((s, r) => s + r.slaCompliance, 0) / weekProductivity.length
    if (avgSla >= 95) {
      highlights.push({
        type: 'positive',
        layer: 'gerente',
        title: 'SLA Excelente',
        description: `Media de SLA: ${avgSla.toFixed(1)}%`,
        metric: avgSla,
        unit: '%',
      })
    }
  }

  // Negative highlights from data
  if (absences > 0) {
    highlights.push({
      type: 'negative',
      layer: 'expeditor',
      title: `${absences} Falta(s) na Semana`,
      description: 'Houve ausencias que impactaram a operacao',
      metric: absences,
      unit: 'faltas',
    })
  }

  if (lateCount > 0) {
    highlights.push({
      type: 'negative',
      layer: 'expeditor',
      title: `${lateCount} Atraso(s)`,
      description: 'Colaboradores atrasaram mais de 5min',
      metric: lateCount,
      unit: 'atrasos',
    })
  }

  if (weekProductivity.length > 0) {
    const totalErrors = weekProductivity.reduce((s, r) => s + r.totalErrors, 0)
    const totalErrorCost = weekProductivity.reduce((s, r) => s + r.errorCost, 0)
    if (totalErrors > 0) {
      highlights.push({
        type: 'negative',
        layer: 'gerente',
        title: `${totalErrors} Erros (R$${totalErrorCost.toFixed(0)} reembolso)`,
        description: 'Erros geraram custo de reembolso na semana',
        metric: totalErrorCost,
        unit: 'R$',
      })
    }
  }
}
