// ─────────────────────────────────────────────────────────────────────
// Previsão de demanda por hora — baseada em histórico de pedidos.
//
// Input: array de { dayOfWeek, hour, orders } (histórico agregado)
// Output: previsão por slot (média + tendência simples)
//
// Pode ser alimentado por import CSV do iFood, ou por lançamentos
// manuais de produtividade com data/hora.
// ─────────────────────────────────────────────────────────────────────

export interface DemandHistoryEntry {
  dayOfWeek: string  // 'segunda', 'terca', etc.
  hour: string       // '11:00', '12:00', etc.
  orders: number
  date: string       // 'YYYY-MM-DD' — pra ponderar recência
}

export interface DemandForecastSlot {
  dayOfWeek: string
  hour: string
  avgOrders: number     // média histórica
  predictedOrders: number // com peso de recência
  confidence: 'low' | 'medium' | 'high'
  dataPoints: number    // quantas semanas de dado
  suggestedPeople: number // com base no targetOrdersPerHour
}

/**
 * Calcula previsão de demanda por slot.
 *
 * Usa média ponderada: dados mais recentes pesam mais.
 * Pesos: semana passada = 4x, 2 semanas atrás = 2x, 3+ = 1x
 */
export function forecastDemand(
  history: DemandHistoryEntry[],
  targetOrdersPerHour: number = 8,
): DemandForecastSlot[] {
  // Agrupa por dayOfWeek × hour
  const bySlot = new Map<string, DemandHistoryEntry[]>()
  for (const entry of history) {
    const key = `${entry.dayOfWeek}|${entry.hour}`
    if (!bySlot.has(key)) bySlot.set(key, [])
    bySlot.get(key)!.push(entry)
  }

  const now = Date.now()
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000

  const results: DemandForecastSlot[] = []

  for (const [key, entries] of bySlot) {
    const [dayOfWeek, hour] = key.split('|')

    // Pondera por recência
    let weightedSum = 0
    let totalWeight = 0
    for (const entry of entries) {
      const entryDate = new Date(entry.date + 'T12:00:00Z').getTime()
      const weeksAgo = Math.floor((now - entryDate) / WEEK_MS)
      const weight = weeksAgo <= 1 ? 4 : weeksAgo <= 2 ? 2 : 1
      weightedSum += entry.orders * weight
      totalWeight += weight
    }

    const predictedOrders = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
    const avgOrders = Math.round(entries.reduce((s, e) => s + e.orders, 0) / entries.length)

    const confidence: 'low' | 'medium' | 'high' =
      entries.length >= 4 ? 'high' :
      entries.length >= 2 ? 'medium' : 'low'

    const suggestedPeople = targetOrdersPerHour > 0
      ? Math.ceil(predictedOrders / targetOrdersPerHour)
      : 0

    results.push({
      dayOfWeek,
      hour,
      avgOrders,
      predictedOrders,
      confidence,
      dataPoints: entries.length,
      suggestedPeople,
    })
  }

  // Ordena por dia e hora
  const dayOrder: Record<string, number> = {
    segunda: 0, terca: 1, quarta: 2, quinta: 3, sexta: 4, sabado: 5, domingo: 6,
  }
  results.sort((a, b) => {
    const dayDiff = (dayOrder[a.dayOfWeek] ?? 99) - (dayOrder[b.dayOfWeek] ?? 99)
    if (dayDiff !== 0) return dayDiff
    return a.hour.localeCompare(b.hour)
  })

  return results
}

/**
 * Converte dados de produtividade existentes em DemandHistoryEntry[].
 * Útil quando não tem import CSV do iFood — usa os lançamentos que
 * já estão no sistema pra gerar previsão.
 */
export function productivityToDemandHistory(
  records: Array<{ date: string; totalOrders: number }>,
): DemandHistoryEntry[] {
  const dayNames: Record<number, string> = {
    0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta',
    4: 'quinta', 5: 'sexta', 6: 'sabado',
  }

  return records.map(r => {
    const d = new Date(r.date + 'T12:00:00Z')
    const dayOfWeek = dayNames[d.getUTCDay()] || 'segunda'
    // Sem info de hora, distribui uniformemente nas 12h de operação (09-21h)
    // Isso é uma aproximação — o import CSV do iFood vai ter hora real
    return {
      dayOfWeek,
      hour: '12:00', // placeholder central
      orders: r.totalOrders,
      date: r.date,
    }
  })
}
