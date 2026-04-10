import { describe, it, expect, beforeAll } from 'vitest'

let normalizePhone: (raw: string) => string | null
let sendWhatsApp: (config: any, payload: any) => Promise<{ ok: boolean; error?: string; providerId?: string | null; status?: string }>

beforeAll(async () => {
  const mod: any = await import('../whatsappSender.js')
  normalizePhone = mod.normalizePhone
  sendWhatsApp = mod.sendWhatsApp
})

describe('normalizePhone', () => {
  it('aceita telefone formatado brasileiro', () => {
    expect(normalizePhone('(11) 99999-8888')).toBe('5511999998888')
  })

  it('aceita só dígitos', () => {
    expect(normalizePhone('11999998888')).toBe('5511999998888')
  })

  it('aceita com código do país', () => {
    expect(normalizePhone('+5511999998888')).toBe('5511999998888')
  })

  it('aceita com espaços', () => {
    expect(normalizePhone('11 9 9999 8888')).toBe('5511999998888')
  })

  it('retorna null pra telefone vazio', () => {
    expect(normalizePhone('')).toBeNull()
  })

  it('retorna null pra muito curto', () => {
    expect(normalizePhone('123')).toBeNull()
  })
})

describe('sendWhatsApp — validações de entrada', () => {
  it('retorna error se config não definida', async () => {
    const r = await sendWhatsApp(null as any, { phone: '11999998888', message: 'oi' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Config')
  })

  it('retorna error se provider desativado', async () => {
    const r = await sendWhatsApp(
      { provider: 'zapi', enabled: false, apiUrl: '', apiKey: '', instance: '' },
      { phone: '11999998888', message: 'oi' },
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('desativada')
  })

  it('retorna error se mensagem vazia', async () => {
    const r = await sendWhatsApp(
      { provider: 'zapi', enabled: true, apiUrl: 'http://x', apiKey: 'k', instance: 'i' },
      { phone: '11999998888', message: '' },
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('vazia')
  })

  it('retorna error se telefone vazio', async () => {
    const r = await sendWhatsApp(
      { provider: 'zapi', enabled: true, apiUrl: 'http://x', apiKey: 'k', instance: 'i' },
      { phone: '', message: 'oi' },
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Telefone')
  })

  it('modo manual retorna erro explicativo', async () => {
    const r = await sendWhatsApp(
      { provider: 'manual', enabled: true, apiUrl: '', apiKey: '', instance: '' },
      { phone: '11999998888', message: 'oi' },
    )
    expect(r.ok).toBe(false)
    expect(r.error).toContain('manual')
  })
})
