import { describe, it, expect } from 'vitest'
import { calculateOEE, calculateCostPerOrder } from '../src/services/opsMetrics'

// Fixtures minimas
const emp1 = { id: 'e1', name: 'Anna', hourlyRate: 20, nickname: 'Anna', phone: '', role: 'colaborador', status: 'ativo' as const, admissionDate: '2025-01-01' }
const emp2 = { id: 'e2', name: 'Miguel', hourlyRate: 15, nickname: 'Miguel', phone: '', role: 'colaborador', status: 'ativo' as const, admissionDate: '2025-01-01' }

function buildSchedule(weekStart: string, assignments: Array<{ date: string; hour: string; employeeIds: string[] }>) {
  const days: any[] = []
  const byDate = new Map<string, any[]>()
  for (const a of assignments) {
    if (!byDate.has(a.date)) byDate.set(a.date, [])
    byDate.get(a.date)!.push({
      hour: a.hour,
      requiredPeople: a.employeeIds.length,
      assignments: a.employeeIds.map(id => ({ id: `${a.date}-${a.hour}-${id}`, employeeId: id, status: 'pending' })),
    })
  }
  for (const [date, slots] of byDate) {
    days.push({ date, dayOfWeek: 'segunda', slots })
  }
  return { weekStart, published: false, publishedAt: null, days } as any
}

describe('calculateOEE', () => {
  it('OEE zero quando não há escala', () => {
    const r = calculateOEE({ schedule: null, pontoRecords: [], productivityRecords: [] })
    expect(r.oee).toBe(0)
    expect(r.classification).toBe('crítico')
  })

  it('escalou 8h, trabalhou 8h, fez 64 pedidos (capacidade: 64) e 0 erros → OEE 100%', () => {
    const schedule = buildSchedule('2026-06-01', [
      { date: '2026-06-01', hour: '09:00-10:00', employeeIds: ['e1'] },
      { date: '2026-06-01', hour: '10:00-11:00', employeeIds: ['e1'] },
      { date: '2026-06-01', hour: '11:00-12:00', employeeIds: ['e1'] },
      { date: '2026-06-01', hour: '12:00-13:00', employeeIds: ['e1'] },
      { date: '2026-06-01', hour: '13:00-14:00', employeeIds: ['e1'] },
      { date: '2026-06-01', hour: '14:00-15:00', employeeIds: ['e1'] },
      { date: '2026-06-01', hour: '15:00-16:00', employeeIds: ['e1'] },
      { date: '2026-06-01', hour: '16:00-17:00', employeeIds: ['e1'] },
    ])
    const ponto = [{ employeeId: 'e1', date: '2026-06-01', workedMinutes: 8 * 60, status: 'on_time' } as any]
    const prod = [{ employeeId: 'e1', weekStart: '2026-06-01', date: '2026-06-01', totalOrders: 64, totalErrors: 0, errorCost: 0 } as any]

    const r = calculateOEE({ schedule, pontoRecords: ponto, productivityRecords: prod })
    expect(r.scheduledHours).toBe(8)
    expect(r.workedHours).toBe(8)
    expect(r.availability).toBe(1)
    expect(r.performance).toBeCloseTo(1, 2)
    expect(r.quality).toBe(1)
    expect(r.oee).toBeCloseTo(1, 2)
    expect(r.classification).toBe('classe mundial')
  })

  it('escalou 10h, trabalhou 8h → availability 80%', () => {
    const schedule = buildSchedule('2026-06-01',
      Array.from({ length: 10 }, (_, i) => ({
        date: '2026-06-01',
        hour: `${String(9 + i).padStart(2, '0')}:00-${String(10 + i).padStart(2, '0')}:00`,
        employeeIds: ['e1'],
      })),
    )
    const ponto = [{ employeeId: 'e1', date: '2026-06-01', workedMinutes: 8 * 60, status: 'on_time' } as any]
    const r = calculateOEE({ schedule, pontoRecords: ponto, productivityRecords: [] })
    expect(r.availability).toBe(0.8)
  })

  it('performance cai quando faz menos pedidos que a capacidade', () => {
    const schedule = buildSchedule('2026-06-01',
      Array.from({ length: 8 }, (_, i) => ({
        date: '2026-06-01',
        hour: `${String(9 + i).padStart(2, '0')}:00-${String(10 + i).padStart(2, '0')}:00`,
        employeeIds: ['e1'],
      })),
    )
    const ponto = [{ employeeId: 'e1', date: '2026-06-01', workedMinutes: 8 * 60, status: 'on_time' } as any]
    // Capacidade = 8h × 8 = 64. Fez 32 = 50%
    const prod = [{ employeeId: 'e1', weekStart: '2026-06-01', date: '2026-06-01', totalOrders: 32, totalErrors: 0, errorCost: 0 } as any]
    const r = calculateOEE({ schedule, pontoRecords: ponto, productivityRecords: prod })
    expect(r.performance).toBeCloseTo(0.5, 2)
  })

  it('quality cai com erros', () => {
    const schedule = buildSchedule('2026-06-01',
      Array.from({ length: 8 }, (_, i) => ({
        date: '2026-06-01',
        hour: `${String(9 + i).padStart(2, '0')}:00-${String(10 + i).padStart(2, '0')}:00`,
        employeeIds: ['e1'],
      })),
    )
    const ponto = [{ employeeId: 'e1', date: '2026-06-01', workedMinutes: 8 * 60, status: 'on_time' } as any]
    // 100 pedidos, 5 erros → quality 95%
    const prod = [{ employeeId: 'e1', weekStart: '2026-06-01', date: '2026-06-01', totalOrders: 100, totalErrors: 5, errorCost: 50 } as any]
    const r = calculateOEE({ schedule, pontoRecords: ponto, productivityRecords: prod })
    expect(r.quality).toBe(0.95)
  })

  it('classificação segue faixas', () => {
    // Caso saudável: OEE ~ 0.7
    const schedule = buildSchedule('2026-06-01',
      Array.from({ length: 8 }, (_, i) => ({
        date: '2026-06-01',
        hour: `${String(9 + i).padStart(2, '0')}:00-${String(10 + i).padStart(2, '0')}:00`,
        employeeIds: ['e1'],
      })),
    )
    // 8h escaladas, 8h trabalhadas (avail 1.0)
    // capacidade 64, fez 48 (perf 0.75)
    // 48 pedidos, 2 erros (qual 0.958)
    // OEE = 1.0 × 0.75 × 0.958 = 0.719
    const ponto = [{ employeeId: 'e1', date: '2026-06-01', workedMinutes: 8 * 60, status: 'on_time' } as any]
    const prod = [{ employeeId: 'e1', weekStart: '2026-06-01', date: '2026-06-01', totalOrders: 48, totalErrors: 2, errorCost: 0 } as any]
    const r = calculateOEE({ schedule, pontoRecords: ponto, productivityRecords: prod })
    expect(r.oee).toBeGreaterThan(0.60)
    expect(r.oee).toBeLessThan(0.85)
    expect(r.classification).toBe('saudável')
  })
})

describe('calculateCostPerOrder', () => {
  it('cost/order zero quando não há pedidos', () => {
    const r = calculateCostPerOrder({
      schedule: null,
      pontoRecords: [],
      productivityRecords: [],
      employees: [],
    })
    expect(r.costPerOrder).toBe(0)
    expect(r.totalOrders).toBe(0)
  })

  it('8h escaladas × R$ 20/h = R$ 160 folha, 100 pedidos = R$ 1.60/pedido', () => {
    const schedule = buildSchedule('2026-06-01',
      Array.from({ length: 8 }, (_, i) => ({
        date: '2026-06-01',
        hour: `${String(9 + i).padStart(2, '0')}:00-${String(10 + i).padStart(2, '0')}:00`,
        employeeIds: ['e1'],
      })),
    )
    const prod = [{ employeeId: 'e1', weekStart: '2026-06-01', date: '2026-06-01', totalOrders: 100, totalErrors: 0, errorCost: 0 } as any]
    const r = calculateCostPerOrder({
      schedule,
      pontoRecords: [{ employeeId: 'e1', date: '2026-06-01', workedMinutes: 8 * 60, status: 'on_time' } as any],
      productivityRecords: prod,
      employees: [emp1 as any],
    })
    expect(r.breakdown.folhaHoras).toBe(160)
    expect(r.costPerOrder).toBeCloseTo(1.60, 2)
  })

  it('soma custo de erros no breakdown', () => {
    const schedule = buildSchedule('2026-06-01', [
      { date: '2026-06-01', hour: '09:00-10:00', employeeIds: ['e1'] },
    ])
    const prod = [{ employeeId: 'e1', weekStart: '2026-06-01', date: '2026-06-01', totalOrders: 10, totalErrors: 1, errorCost: 25 } as any]
    const r = calculateCostPerOrder({
      schedule,
      pontoRecords: [{ employeeId: 'e1', date: '2026-06-01', workedMinutes: 60, status: 'on_time' } as any],
      productivityRecords: prod,
      employees: [emp1 as any],
    })
    expect(r.breakdown.folhaHoras).toBe(20)
    expect(r.breakdown.erros).toBe(25)
    expect(r.totalCost).toBe(45)
    expect(r.costPerOrder).toBe(4.5)
  })

  it('múltiplos colaboradores somam o custo corretamente', () => {
    const schedule = buildSchedule('2026-06-01', [
      { date: '2026-06-01', hour: '09:00-10:00', employeeIds: ['e1', 'e2'] },
      { date: '2026-06-01', hour: '10:00-11:00', employeeIds: ['e1', 'e2'] },
    ])
    // Anna (20/h) × 2h + Miguel (15/h) × 2h = 40 + 30 = 70
    const prod = [{ employeeId: 'e1', weekStart: '2026-06-01', date: '2026-06-01', totalOrders: 35, totalErrors: 0, errorCost: 0 } as any]
    const r = calculateCostPerOrder({
      schedule,
      pontoRecords: [],
      productivityRecords: prod,
      employees: [emp1 as any, emp2 as any],
    })
    expect(r.breakdown.folhaHoras).toBe(70)
    expect(r.costPerOrder).toBe(2) // 70 / 35 = 2.00
  })
})
