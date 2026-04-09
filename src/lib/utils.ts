import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

// ── Timezone helpers (America/Sao_Paulo) ────────────────────────────────
// Retorna a hora atual em São Paulo (0-23), independente do timezone do device.
export function brHour(): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false,
  })
  return parseInt(fmt.format(new Date()), 10)
}

export function greetingBR(): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const h = brHour()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// Retorna a data atual (ou de um Date específico) em São Paulo no formato YYYY-MM-DD.
// Use SEMPRE isto em vez de `new Date().toISOString().split('T')[0]`, que retorna UTC.
// Entre 21h e 00h de Brasília o UTC já virou pro dia seguinte — bug silencioso.
export function todayBR(date?: Date): string {
  const d = date ?? new Date()
  // en-CA retorna YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
