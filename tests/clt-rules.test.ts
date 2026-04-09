// ─────────────────────────────────────────────────────────────────────
// Testes das regras CLT aplicadas ao regime INTERMITENTE (Art. 452-A)
//
// Cada regra tem casos: canonico (passa), edge por 1 minuto, violação
// grave, e edge case de virada de dia.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll } from 'vitest'

let CLT: any

beforeAll(async () => {
  CLT = await import('../cltRules.js')
})

// ══════════════════════════════════════════════════════════════════════
// R1 — Interjornada 11h (CLT Art. 66) — aplica a todos os regimes
// ══════════════════════════════════════════════════════════════════════

describe('R1 — validateInterjornada', () => {
  it('aceita intervalo de exatamente 11h entre turnos (limite)', () => {
    const shifts = [
      { employeeId: 'e1', date: '2026-04-08', startHour: '08:00', endHour: '18:00' },
      { employeeId: 'e1', date: '2026-04-09', startHour: '05:00', endHour: '14:00' },
      // 18:00 terça → 05:00 quarta = 11h exatas
    ]
    const violations = CLT.validateInterjornada(shifts)
    expect(violations).toEqual([])
  })

  it('bloqueia intervalo de 10h (1h curto)', () => {
    const shifts = [
      { employeeId: 'e1', date: '2026-04-08', startHour: '08:00', endHour: '18:00' },
      { employeeId: 'e1', date: '2026-04-09', startHour: '04:00', endHour: '13:00' },
      // 18:00 terça → 04:00 quarta = 10h (falta 1h)
    ]
    const violations = CLT.validateInterjornada(shifts)
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('interjornada')
    expect(violations[0].severity).toBe('blocking')
    expect(violations[0].employeeId).toBe('e1')
  })

  it('bloqueia quando viola por 1 minuto apenas', () => {
    const shifts = [
      { employeeId: 'e1', date: '2026-04-08', startHour: '08:00', endHour: '18:00' },
      { employeeId: 'e1', date: '2026-04-09', startHour: '04:59', endHour: '13:00' },
      // 18:00 → 04:59 = 10h59 = 659min < 660min
    ]
    const violations = CLT.validateInterjornada(shifts)
    expect(violations).toHaveLength(1)
  })

  it('trata turno noturno (termina no dia seguinte)', () => {
    const shifts = [
      { employeeId: 'e1', date: '2026-04-08', startHour: '22:00', endHour: '06:00' },
      // termina 06:00 de 2026-04-09
      { employeeId: 'e1', date: '2026-04-09', startHour: '17:00', endHour: '23:00' },
      // 06:00 → 17:00 = 11h exatas = OK
    ]
    const violations = CLT.validateInterjornada(shifts)
    expect(violations).toEqual([])
  })

  it('bloqueia turno noturno seguido com descanso insuficiente', () => {
    const shifts = [
      { employeeId: 'e1', date: '2026-04-08', startHour: '22:00', endHour: '06:00' },
      { employeeId: 'e1', date: '2026-04-09', startHour: '16:00', endHour: '22:00' },
      // 06:00 → 16:00 = 10h (falta 1h)
    ]
    const violations = CLT.validateInterjornada(shifts)
    expect(violations).toHaveLength(1)
  })

  it('ignora turnos de colaboradores diferentes', () => {
    const shifts = [
      { employeeId: 'e1', date: '2026-04-08', startHour: '18:00', endHour: '23:00' },
      { employeeId: 'e2', date: '2026-04-09', startHour: '06:00', endHour: '12:00' },
    ]
    const violations = CLT.validateInterjornada(shifts)
    expect(violations).toEqual([])
  })

  it('gera múltiplas violations se houver múltiplas', () => {
    const shifts = [
      { employeeId: 'e1', date: '2026-04-07', startHour: '08:00', endHour: '18:00' },
      { employeeId: 'e1', date: '2026-04-08', startHour: '04:00', endHour: '12:00' }, // viola
      { employeeId: 'e1', date: '2026-04-09', startHour: '18:00', endHour: '22:00' }, // aqui OK (12h->18h)
      { employeeId: 'e1', date: '2026-04-10', startHour: '05:00', endHour: '10:00' }, // viola (22->05 = 7h)
    ]
    const violations = CLT.validateInterjornada(shifts)
    expect(violations).toHaveLength(2)
  })
})

// ══════════════════════════════════════════════════════════════════════
// R2 — DSR 7 dias consecutivos — AVISO no intermitente (não bloqueia)
// ══════════════════════════════════════════════════════════════════════

describe('R2 — validateDSR (aviso no intermitente)', () => {
  it('não avisa quando escala tem folga', () => {
    const shifts = [
      { employeeId: 'e1', date: '2026-04-06', startHour: '08:00', endHour: '14:00' },
      { employeeId: 'e1', date: '2026-04-07', startHour: '08:00', endHour: '14:00' },
      // quarta 08 folga
      { employeeId: 'e1', date: '2026-04-09', startHour: '08:00', endHour: '14:00' },
      { employeeId: 'e1', date: '2026-04-10', startHour: '08:00', endHour: '14:00' },
    ]
    const violations = CLT.validateDSR(shifts)
    expect(violations).toEqual([])
  })

  it('avisa (severity=warning) com 7 dias consecutivos', () => {
    const shifts = Array.from({ length: 7 }, (_, i) => ({
      employeeId: 'e1',
      date: `2026-04-${String(6 + i).padStart(2, '0')}`,
      startHour: '08:00',
      endHour: '14:00',
    }))
    const violations = CLT.validateDSR(shifts)
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('dsr')
    expect(violations[0].severity).toBe('warning')
    expect(violations[0].employeeId).toBe('e1')
  })

  it('6 dias consecutivos é OK', () => {
    const shifts = Array.from({ length: 6 }, (_, i) => ({
      employeeId: 'e1',
      date: `2026-04-${String(6 + i).padStart(2, '0')}`,
      startHour: '08:00',
      endHour: '14:00',
    }))
    const violations = CLT.validateDSR(shifts)
    expect(violations).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════
// R3 — Intrajornada contra ponto real (CLT Art. 71)
// ══════════════════════════════════════════════════════════════════════

describe('R3 — validateIntrajornada', () => {
  it('jornada de 4h não exige intervalo', () => {
    const ponto = { employeeId: 'e1', date: '2026-04-08', workedMinutes: 240, breakMinutes: 0 }
    const violations = CLT.validateIntrajornada([ponto])
    expect(violations).toEqual([])
  })

  it('jornada de 5h exige 15 min de intervalo', () => {
    const ponto = { employeeId: 'e1', date: '2026-04-08', workedMinutes: 300, breakMinutes: 0 }
    const violations = CLT.validateIntrajornada([ponto])
    expect(violations).toHaveLength(1)
    expect(violations[0].details.minBreakMinutes).toBe(15)
  })

  it('jornada de 5h com 15 min de intervalo passa', () => {
    const ponto = { employeeId: 'e1', date: '2026-04-08', workedMinutes: 285, breakMinutes: 15 }
    const violations = CLT.validateIntrajornada([ponto])
    expect(violations).toEqual([])
  })

  it('jornada de 7h exige 60 min', () => {
    const ponto = { employeeId: 'e1', date: '2026-04-08', workedMinutes: 420, breakMinutes: 0 }
    const violations = CLT.validateIntrajornada([ponto])
    expect(violations).toHaveLength(1)
    expect(violations[0].details.minBreakMinutes).toBe(60)
  })

  it('jornada de 6h01min (limite) exige 60 min', () => {
    const ponto = { employeeId: 'e1', date: '2026-04-08', workedMinutes: 361, breakMinutes: 15 }
    const violations = CLT.validateIntrajornada([ponto])
    expect(violations).toHaveLength(1)
    expect(violations[0].details.minBreakMinutes).toBe(60)
  })

  it('jornada de 8h com 60min passa limpa', () => {
    const ponto = { employeeId: 'e1', date: '2026-04-08', workedMinutes: 420, breakMinutes: 60 }
    const violations = CLT.validateIntrajornada([ponto])
    expect(violations).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════
// R4 — Adicional noturno 22h-05h (CLT Art. 73)
// ══════════════════════════════════════════════════════════════════════

describe('R4 — calculateNightMinutes (22h-05h)', () => {
  it('turno 08h-18h = zero minutos noturnos', () => {
    expect(CLT.calculateNightMinutes('08:00', '18:00')).toBe(0)
  })

  it('turno 22h-23h = 60 min noturnos', () => {
    expect(CLT.calculateNightMinutes('22:00', '23:00')).toBe(60)
  })

  it('turno 20h-00h = 120 min noturnos (22-00)', () => {
    expect(CLT.calculateNightMinutes('20:00', '00:00')).toBe(120)
  })

  it('turno 22h-06h = 7h em horario noturno (22-05) + 1h diurna', () => {
    // 22h-05h = 7h = 420 min de noturno
    expect(CLT.calculateNightMinutes('22:00', '06:00')).toBe(420)
  })

  it('turno 00h-05h = 5h noturnos', () => {
    // tudo dentro da janela noturna 22h-05h (considerando que 00h é dentro da janela)
    expect(CLT.calculateNightMinutes('00:00', '05:00')).toBe(300)
  })

  it('turno 00h-08h = 5h noturnos (00-05)', () => {
    expect(CLT.calculateNightMinutes('00:00', '08:00')).toBe(300)
  })

  it('turno 04h-08h = 1h noturna (04-05)', () => {
    expect(CLT.calculateNightMinutes('04:00', '08:00')).toBe(60)
  })
})

describe('R4b — toCLTNightMinutes (hora reduzida 52min30s)', () => {
  it('60 min reais de noturno = 68.57 min CLT (~1h08)', () => {
    const clt = CLT.toCLTNightMinutes(60)
    // 60 * (60 / 52.5) = 68.571
    expect(clt).toBeCloseTo(68.571, 1)
  })

  it('0 min = 0 min CLT', () => {
    expect(CLT.toCLTNightMinutes(0)).toBe(0)
  })

  it('420 min (7h) = 480 min CLT (8h)', () => {
    // 7h * (60/52.5) = 8h exatas
    const clt = CLT.toCLTNightMinutes(420)
    expect(clt).toBeCloseTo(480, 1)
  })
})

// ══════════════════════════════════════════════════════════════════════
// R5 — Domingo/feriado (+100% adicional)
// ══════════════════════════════════════════════════════════════════════

describe('R5 — isHoliday / isSundayOrHoliday', () => {
  it('detecta feriado nacional 01-jan-2026', () => {
    expect(CLT.isHoliday('2026-01-01')).toBe(true)
  })

  it('detecta Tiradentes 21-abr-2026', () => {
    expect(CLT.isHoliday('2026-04-21')).toBe(true)
  })

  it('dia útil não é feriado', () => {
    expect(CLT.isHoliday('2026-04-08')).toBe(false)
  })

  it('domingo é domingoOuFeriado', () => {
    // 2026-04-12 é domingo
    expect(CLT.isSundayOrHoliday('2026-04-12')).toBe(true)
  })

  it('segunda-feira comum não é', () => {
    expect(CLT.isSundayOrHoliday('2026-04-06')).toBe(false)
  })

  it('feriado em dia útil é domingoOuFeriado', () => {
    // 2026-04-21 é terça, Tiradentes
    expect(CLT.isSundayOrHoliday('2026-04-21')).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════
// R6 — Convocação >=3 dias de antecedência (Art. 452-A §1)
// ══════════════════════════════════════════════════════════════════════

describe('R6 — validateConvocationAdvanceNotice (72h mínimo)', () => {
  it('convocação com 72h+ de antecedência passa', () => {
    const sentAt = new Date('2026-04-05T10:00:00Z').toISOString()
    const shiftDate = '2026-04-09' // 4 dias depois
    const result = CLT.validateConvocationAdvanceNotice(sentAt, shiftDate)
    expect(result.valid).toBe(true)
  })

  it('convocação com exatamente 72h passa', () => {
    const sentAt = new Date('2026-04-05T10:00:00Z').toISOString()
    // shift em 2026-04-08 10:00 Brasília = 13:00 UTC, delta = 75h >72h ok
    const shiftDate = '2026-04-08'
    const result = CLT.validateConvocationAdvanceNotice(sentAt, shiftDate)
    expect(result.valid).toBe(true)
  })

  it('convocação com 48h falha', () => {
    const sentAt = new Date('2026-04-06T10:00:00Z').toISOString()
    const shiftDate = '2026-04-08'
    const result = CLT.validateConvocationAdvanceNotice(sentAt, shiftDate)
    expect(result.valid).toBe(false)
    expect(result.hoursNotice).toBeLessThan(72)
  })

  it('convocação para hoje falha', () => {
    const now = new Date().toISOString()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const result = CLT.validateConvocationAdvanceNotice(now, today)
    expect(result.valid).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════
// R7 — Convocação deadline >= 24h (Art. 452-A §2)
// ══════════════════════════════════════════════════════════════════════

describe('R7 — validateConvocationDeadline (24h mínimo)', () => {
  it('deadline 24h após envio passa', () => {
    const sentAt = new Date('2026-04-05T10:00:00Z')
    const deadline = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000)
    const result = CLT.validateConvocationDeadline(sentAt.toISOString(), deadline.toISOString())
    expect(result.valid).toBe(true)
  })

  it('deadline 25h após envio passa', () => {
    const sentAt = new Date('2026-04-05T10:00:00Z')
    const deadline = new Date(sentAt.getTime() + 25 * 60 * 60 * 1000)
    const result = CLT.validateConvocationDeadline(sentAt.toISOString(), deadline.toISOString())
    expect(result.valid).toBe(true)
  })

  it('deadline 23h falha', () => {
    const sentAt = new Date('2026-04-05T10:00:00Z')
    const deadline = new Date(sentAt.getTime() + 23 * 60 * 60 * 1000)
    const result = CLT.validateConvocationDeadline(sentAt.toISOString(), deadline.toISOString())
    expect(result.valid).toBe(false)
  })

  it('deadline 1h falha (caso absurdo)', () => {
    const sentAt = new Date('2026-04-05T10:00:00Z')
    const deadline = new Date(sentAt.getTime() + 60 * 60 * 1000)
    const result = CLT.validateConvocationDeadline(sentAt.toISOString(), deadline.toISOString())
    expect(result.valid).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════
// R8 — Multa 50% por cancelamento após aceite (Art. 452-A §4)
// ══════════════════════════════════════════════════════════════════════

describe('R8 — calculateCancellationPenalty', () => {
  it('turno de 4h com hourlyRate R$ 15 = multa R$ 30 (4h × 15 × 0.5)', () => {
    const penalty = CLT.calculateCancellationPenalty({
      shiftStartHour: '08:00',
      shiftEndHour: '12:00',
      hourlyRate: 15,
    })
    expect(penalty).toBe(30)
  })

  it('turno de 8h com R$ 20 = R$ 80 (8 × 20 × 0.5)', () => {
    const penalty = CLT.calculateCancellationPenalty({
      shiftStartHour: '09:00',
      shiftEndHour: '17:00',
      hourlyRate: 20,
    })
    expect(penalty).toBe(80)
  })

  it('turno noturno 22h-06h com R$ 18 = 8h × 18 × 0.5 = R$ 72', () => {
    const penalty = CLT.calculateCancellationPenalty({
      shiftStartHour: '22:00',
      shiftEndHour: '06:00',
      hourlyRate: 18,
    })
    expect(penalty).toBe(72)
  })

  it('hourlyRate zero retorna 0', () => {
    const penalty = CLT.calculateCancellationPenalty({
      shiftStartHour: '09:00',
      shiftEndHour: '15:00',
      hourlyRate: 0,
    })
    expect(penalty).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════
// R9 — Banco de horas: saldo nunca negativo para intermitente
// ══════════════════════════════════════════════════════════════════════

describe('R9 — clampBalanceForIntermittent', () => {
  it('saldo positivo mantém-se', () => {
    expect(CLT.clampBalanceForIntermittent(120, 'clt_intermitente')).toBe(120)
  })

  it('saldo negativo vira zero para intermitente', () => {
    expect(CLT.clampBalanceForIntermittent(-60, 'clt_intermitente')).toBe(0)
  })

  it('saldo negativo mantém-se para CLT tradicional', () => {
    expect(CLT.clampBalanceForIntermittent(-60, 'clt')).toBe(-60)
  })

  it('undefined contract_type = aplicar floor (seguro)', () => {
    expect(CLT.clampBalanceForIntermittent(-60, undefined)).toBe(0)
  })
})
