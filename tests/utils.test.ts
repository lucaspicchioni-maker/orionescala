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
