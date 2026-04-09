import { describe, it, expect, beforeAll } from 'vitest'

let parseSlotMinutes: (hourStr: string) => number | null
let computeWeekStart: (dateStr: string) => string

beforeAll(async () => {
  const mod: any = await import('../server.js')
  parseSlotMinutes = mod.parseSlotMinutes
  computeWeekStart = mod.computeWeekStart
})

describe('parseSlotMinutes — regex robusto', () => {
  it('aceita formato canônico HH:MM-HH:MM', () => {
    expect(parseSlotMinutes('09:00-15:00')).toBe(6 * 60)
    expect(parseSlotMinutes('10:00-11:00')).toBe(60)
  })

  it('aceita espaços ao redor do hífen', () => {
    expect(parseSlotMinutes('09:00 - 15:00')).toBe(6 * 60)
    expect(parseSlotMinutes('09:00  -  15:00')).toBe(6 * 60)
  })

  it('aceita hora sem zero à esquerda', () => {
    expect(parseSlotMinutes('9:00-15:00')).toBe(6 * 60)
    expect(parseSlotMinutes('9:30-10:00')).toBe(30)
  })

  it('turno noturno (endMin <= startMin)', () => {
    // 22:00-06:00 = 8h
    expect(parseSlotMinutes('22:00-06:00')).toBe(8 * 60)
    // 23:00-01:00 = 2h
    expect(parseSlotMinutes('23:00-01:00')).toBe(2 * 60)
    // 00:00-08:00 = 8h
    expect(parseSlotMinutes('00:00-08:00')).toBe(8 * 60)
  })

  it('retorna null pra formatos inválidos', () => {
    expect(parseSlotMinutes('invalid')).toBeNull()
    expect(parseSlotMinutes('')).toBeNull()
    expect(parseSlotMinutes('09:00')).toBeNull()
    expect(parseSlotMinutes('09-15')).toBeNull()
    expect(parseSlotMinutes(null as any)).toBeNull()
    expect(parseSlotMinutes(undefined as any)).toBeNull()
  })

  it('turno de 1 minuto (edge)', () => {
    expect(parseSlotMinutes('09:00-09:01')).toBe(1)
  })
})

describe('computeWeekStart — segunda-feira da semana', () => {
  it('quarta-feira retorna a segunda anterior', () => {
    // 2026-04-08 é quarta → segunda é 2026-04-06
    expect(computeWeekStart('2026-04-08')).toBe('2026-04-06')
  })

  it('segunda-feira retorna ela mesma', () => {
    expect(computeWeekStart('2026-04-06')).toBe('2026-04-06')
  })

  it('domingo retorna segunda DA MESMA semana (ISO: domingo é último dia)', () => {
    // 2026-04-12 é domingo → segunda da mesma semana ISO é 2026-04-06
    expect(computeWeekStart('2026-04-12')).toBe('2026-04-06')
  })

  it('sábado retorna segunda anterior', () => {
    // 2026-04-11 é sábado → segunda é 2026-04-06
    expect(computeWeekStart('2026-04-11')).toBe('2026-04-06')
  })

  it('virada de mês funciona corretamente', () => {
    // 2026-05-01 é sexta → segunda é 2026-04-27
    expect(computeWeekStart('2026-05-01')).toBe('2026-04-27')
  })
})
