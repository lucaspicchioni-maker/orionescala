import type { Employee, PontoRecord, ProductivityRecord, EmployeeBadge } from '@/types'

export function computePunctualityStreak(pontoRecords: PontoRecord[], employeeId: string): number {
  // Sort records by date desc, count consecutive days with status 'on_time'
  const records = pontoRecords
    .filter(p => p.employeeId === employeeId && (p.status === 'on_time' || p.status === 'late' || p.status === 'absent'))
    .sort((a, b) => b.date.localeCompare(a.date))

  let streak = 0
  for (const r of records) {
    if (r.status === 'on_time') streak++
    else break
  }
  return streak
}

export function computeWeeklyBadges(
  employees: Employee[],
  pontoRecords: PontoRecord[],
  productivityRecords: ProductivityRecord[],
  weekStart: string
): EmployeeBadge[] {
  const badges: EmployeeBadge[] = []
  const weekPonto = pontoRecords.filter(p => {
    const d = new Date(p.date)
    const ws = new Date(weekStart)
    const we = new Date(ws); we.setDate(we.getDate() + 7)
    return d >= ws && d < we
  })
  const weekProd = productivityRecords.filter(p => p.weekStart === weekStart)
  const activeEmployees = employees.filter(e => e.status === 'ativo')

  for (const emp of activeEmployees) {
    const empPonto = weekPonto.filter(p => p.employeeId === emp.id)
    const empProd = weekProd.find(p => p.employeeId === emp.id)

    // Perfect attendance
    if (empPonto.length > 0 && empPonto.every(p => p.status === 'on_time')) {
      badges.push({ id: `${emp.id}-${weekStart}-assiduidade`, employeeId: emp.id, type: 'assiduidade_100', weekStart, awardedAt: new Date().toISOString(), label: 'Assiduidade 100%', description: 'Presente e pontual todos os dias da semana' })
    }

    // Zero errors
    if (empProd && empProd.totalErrors === 0 && empProd.totalOrders > 0) {
      badges.push({ id: `${emp.id}-${weekStart}-zero_erros`, employeeId: emp.id, type: 'zero_erros', weekStart, awardedAt: new Date().toISOString(), label: 'Zero Erros', description: 'Nenhum erro na semana' })
    }

    // Streak badges
    const streak = computePunctualityStreak(pontoRecords, emp.id)
    if (streak >= 20) {
      badges.push({ id: `${emp.id}-${weekStart}-streak20`, employeeId: emp.id, type: 'streak_20', weekStart, awardedAt: new Date().toISOString(), label: 'Streak 20 dias', description: '20 dias consecutivos pontual' })
    } else if (streak >= 10) {
      badges.push({ id: `${emp.id}-${weekStart}-streak10`, employeeId: emp.id, type: 'streak_10', weekStart, awardedAt: new Date().toISOString(), label: 'Streak 10 dias', description: '10 dias consecutivos pontual' })
    } else if (streak >= 5) {
      badges.push({ id: `${emp.id}-${weekStart}-streak5`, employeeId: emp.id, type: 'streak_5', weekStart, awardedAt: new Date().toISOString(), label: 'Streak 5 dias', description: '5 dias consecutivos pontual' })
    }
  }

  // Top productivity
  if (weekProd.length > 0) {
    const sorted = [...weekProd].sort((a, b) => b.ordersPerHour - a.ordersPerHour)
    if (sorted[0]) {
      badges.push({ id: `${sorted[0].employeeId}-${weekStart}-top_prod`, employeeId: sorted[0].employeeId, type: 'top_produtividade', weekStart, awardedAt: new Date().toISOString(), label: 'Top Produtividade', description: 'Maior produtividade da semana' })
    }
  }

  return badges
}
