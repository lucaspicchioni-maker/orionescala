import type { PontoRecord } from '@/types'

export interface AbsenceRisk {
  employeeId: string
  riskScore: number // 0-100
  reasons: string[]
}

export function predictAbsenceRisk(pontoRecords: PontoRecord[], employeeId: string): AbsenceRisk {
  const last30 = pontoRecords.filter(p => {
    const d = new Date(p.date)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
    return p.employeeId === employeeId && d >= cutoff
  })

  const reasons: string[] = []
  let score = 0

  // Recent absences
  const absences = last30.filter(p => p.status === 'absent').length
  if (absences >= 3) { score += 40; reasons.push(`${absences} faltas nos ultimos 30 dias`) }
  else if (absences >= 1) { score += 20; reasons.push(`${absences} falta(s) nos ultimos 30 dias`) }

  // Late pattern
  const lates = last30.filter(p => p.status === 'late').length
  if (lates >= 4) { score += 30; reasons.push(`${lates} atrasos nos ultimos 30 dias`) }
  else if (lates >= 2) { score += 15; reasons.push(`${lates} atrasos nos ultimos 30 dias`) }

  // Day-of-week pattern (e.g., always absent on Mondays)
  const absentDays = last30.filter(p => p.status === 'absent').map(p => new Date(p.date).getDay())
  const dayCounts: Record<number, number> = {}
  absentDays.forEach(d => { dayCounts[d] = (dayCounts[d] || 0) + 1 })
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
  for (const [day, count] of Object.entries(dayCounts)) {
    if (count >= 2) { score += 15; reasons.push(`Padrao de falta em ${dayNames[Number(day)]}`) }
  }

  // Declining punctuality
  if (last30.length >= 5) {
    const recent5 = last30.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
    const recentLates = recent5.filter(p => p.status === 'late' || p.status === 'absent').length
    if (recentLates >= 3) { score += 15; reasons.push('Tendencia de queda na pontualidade') }
  }

  return { employeeId, riskScore: Math.min(100, score), reasons }
}
