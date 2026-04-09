import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// ── Timezone helpers (src/lib/utils.ts) ─────────────────────────────
describe('greetingBR / brHour', () => {
  it('retorna Bom dia antes das 12h de São Paulo', async () => {
    const { greetingBR } = await import('../src/lib/utils')
    // Mocka Date para 8h no Brasil = 11h UTC
    const fake = new Date('2026-04-08T11:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(fake)
    expect(greetingBR()).toBe('Bom dia')
    vi.useRealTimers()
  })

  it('retorna Boa tarde entre 12h e 18h de São Paulo', async () => {
    const { greetingBR } = await import('../src/lib/utils')
    // 14h Brasil = 17h UTC
    const fake = new Date('2026-04-08T17:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(fake)
    expect(greetingBR()).toBe('Boa tarde')
    vi.useRealTimers()
  })

  it('retorna Boa noite a partir das 18h de São Paulo', async () => {
    const { greetingBR } = await import('../src/lib/utils')
    // 21h Brasil = 00h UTC do dia seguinte
    const fake = new Date('2026-04-09T00:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(fake)
    expect(greetingBR()).toBe('Boa noite')
    vi.useRealTimers()
  })
})

describe('todayBR — data de hoje em São Paulo', () => {
  it('retorna a data corrente de São Paulo mesmo quando UTC já virou', async () => {
    const { todayBR } = await import('../src/lib/utils')
    // 22h Brasília dia 8 = 01h UTC dia 9
    // toISOString().split('T')[0] daria "2026-04-09" (ERRADO)
    // todayBR() deve dar "2026-04-08" (CORRETO)
    const fakeAt2200BR = new Date('2026-04-09T01:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(fakeAt2200BR)
    expect(todayBR()).toBe('2026-04-08')
    vi.useRealTimers()
  })

  it('retorna data correta no meio-dia SP', async () => {
    const { todayBR } = await import('../src/lib/utils')
    // 12h Brasília = 15h UTC
    const fake = new Date('2026-04-08T15:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(fake)
    expect(todayBR()).toBe('2026-04-08')
    vi.useRealTimers()
  })

  it('aceita Date argumento opcional', async () => {
    const { todayBR } = await import('../src/lib/utils')
    const specific = new Date('2026-06-15T15:00:00Z')
    expect(todayBR(specific)).toBe('2026-06-15')
  })
})
