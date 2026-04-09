// ─────────────────────────────────────────────────────────────────────
// Regras CLT aplicadas ao sistema Orion Escala.
// Foco: regime INTERMITENTE (CLT Art. 452-A), com fallback a CLT padrão.
//
// Funções puras (sem acesso a DB, sem side effects) para facilitar testes.
//
// Referências legais:
//  - Art. 66    — Interjornada (11h)
//  - Art. 67    — DSR (24h semanais)
//  - Art. 71    — Intervalo intrajornada
//  - Art. 73    — Adicional noturno
//  - Art. 452-A — Contrato intermitente (convocação, cancelamento)
//  - CF  Art. 7º XVI — Adicional HE >=50%
// ─────────────────────────────────────────────────────────────────────
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Calendário de feriados ───────────────────────────────────────────
let _holidays = null
function loadHolidays() {
  if (_holidays) return _holidays
  try {
    const raw = fs.readFileSync(
      path.join(__dirname, 'seeds', 'feriados-br.json'),
      'utf-8',
    )
    const data = JSON.parse(raw)
    _holidays = new Set()
    for (const year of Object.keys(data)) {
      if (year.startsWith('_')) continue
      for (const h of data[year]) _holidays.add(h.date)
    }
  } catch (err) {
    console.error('[cltRules] erro ao carregar feriados:', err?.message || err)
    _holidays = new Set()
  }
  return _holidays
}

export function isHoliday(dateStr) {
  return loadHolidays().has(dateStr)
}

export function isSundayOrHoliday(dateStr) {
  if (isHoliday(dateStr)) return true
  // Interpreta dateStr como meio-dia UTC para não sofrer com DST/fuso
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.getUTCDay() === 0 // 0 = domingo
}

// ── Helpers de hora ──────────────────────────────────────────────────
function parseHHMM(hhmm) {
  if (typeof hhmm !== 'string') return null
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

// Converte {date, startHour, endHour} em {startEpoch, endEpoch} usando
// meio-dia UTC como âncora. Se endHour < startHour, assume que termina
// no dia seguinte.
function shiftToEpoch(shift) {
  const baseMs = new Date(shift.date + 'T00:00:00Z').getTime()
  const startMin = parseHHMM(shift.startHour)
  let endMin = parseHHMM(shift.endHour)
  if (startMin == null || endMin == null) return null
  if (endMin <= startMin) endMin += 24 * 60 // turno noturno cruza meia-noite
  return {
    startEpoch: baseMs + startMin * 60 * 1000,
    endEpoch: baseMs + endMin * 60 * 1000,
    durationMinutes: endMin - startMin,
  }
}

// ══════════════════════════════════════════════════════════════════════
// R1 — Interjornada (CLT Art. 66) — 11h mínimo entre turnos
// ══════════════════════════════════════════════════════════════════════

const MIN_INTERJORNADA_MINUTES = 11 * 60

export function validateInterjornada(shifts) {
  const byEmp = new Map()
  for (const s of shifts) {
    const ep = shiftToEpoch(s)
    if (!ep) continue
    if (!byEmp.has(s.employeeId)) byEmp.set(s.employeeId, [])
    byEmp.get(s.employeeId).push({ ...s, ...ep })
  }
  const violations = []
  for (const [empId, arr] of byEmp.entries()) {
    arr.sort((a, b) => a.startEpoch - b.startEpoch)
    for (let i = 1; i < arr.length; i++) {
      const gapMs = arr[i].startEpoch - arr[i - 1].endEpoch
      const gapMinutes = gapMs / (60 * 1000)
      if (gapMinutes < MIN_INTERJORNADA_MINUTES) {
        violations.push({
          rule: 'interjornada',
          severity: 'blocking',
          employeeId: empId,
          date: arr[i].date,
          message: `Interjornada de ${Math.floor(gapMinutes / 60)}h${Math.round(gapMinutes % 60)}min é inferior ao mínimo legal de 11h (CLT Art. 66).`,
          details: {
            previousShiftEnd: arr[i - 1].date + ' ' + arr[i - 1].endHour,
            nextShiftStart: arr[i].date + ' ' + arr[i].startHour,
            gapMinutes,
            minRequired: MIN_INTERJORNADA_MINUTES,
          },
        })
      }
    }
  }
  return violations
}

// ══════════════════════════════════════════════════════════════════════
// R2 — DSR 7 dias consecutivos — AVISO no intermitente
// ══════════════════════════════════════════════════════════════════════

export function validateDSR(shifts) {
  const byEmpDates = new Map()
  for (const s of shifts) {
    if (!byEmpDates.has(s.employeeId)) byEmpDates.set(s.employeeId, new Set())
    byEmpDates.get(s.employeeId).add(s.date)
  }
  const violations = []
  for (const [empId, dates] of byEmpDates.entries()) {
    const sorted = [...dates].sort()
    let streak = 1
    let streakStart = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] + 'T12:00:00Z')
      const curr = new Date(sorted[i] + 'T12:00:00Z')
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000))
      if (diffDays === 1) {
        streak++
        if (streak >= 7) {
          violations.push({
            rule: 'dsr',
            severity: 'warning',
            employeeId: empId,
            date: sorted[i],
            message: `Colaborador escalado ${streak} dias consecutivos (desde ${streakStart}). Recomenda-se folga semanal (CLT Art. 67).`,
            details: { streak, streakStart, streakEnd: sorted[i] },
          })
          break
        }
      } else {
        streak = 1
        streakStart = sorted[i]
      }
    }
  }
  return violations
}

// ══════════════════════════════════════════════════════════════════════
// R3 — Intervalo intrajornada validado contra ponto real (CLT Art. 71)
// ══════════════════════════════════════════════════════════════════════
// Jornada  <=4h → 0 min obrigatório
// Jornada  4h-6h → 15 min
// Jornada  >6h → 60 min

export function requiredBreakMinutes(workedMinutes) {
  if (workedMinutes <= 240) return 0
  if (workedMinutes <= 360) return 15
  return 60
}

export function validateIntrajornada(pontoRecords) {
  const violations = []
  for (const p of pontoRecords) {
    const worked = p.workedMinutes || 0
    const breakMin = p.breakMinutes || 0
    const required = requiredBreakMinutes(worked + breakMin)
    // OBS: worked pode não incluir o break dependendo do ponto;
    // usamos o total da jornada (work + break) pra determinar a regra
    if (breakMin < required) {
      violations.push({
        rule: 'intrajornada',
        severity: 'warning',
        employeeId: p.employeeId,
        date: p.date,
        message: `Jornada de ${Math.floor((worked + breakMin) / 60)}h${(worked + breakMin) % 60}min exigiria ${required} min de intervalo; registrado: ${breakMin} min (CLT Art. 71).`,
        details: {
          workedMinutes: worked,
          breakMinutes: breakMin,
          minBreakMinutes: required,
        },
      })
    }
  }
  return violations
}

// ══════════════════════════════════════════════════════════════════════
// R4 — Adicional noturno 22h-05h (CLT Art. 73)
// ══════════════════════════════════════════════════════════════════════
// Janela noturna: [22:00, 29:00) — 29h = 05h do dia seguinte.

const NIGHT_START_MIN = 22 * 60
const NIGHT_END_MIN = 29 * 60 // 05h do dia seguinte

export function calculateNightMinutes(startHHMM, endHHMM) {
  const startMin = parseHHMM(startHHMM)
  let endMin = parseHHMM(endHHMM)
  if (startMin == null || endMin == null) return 0
  if (endMin <= startMin) endMin += 24 * 60

  // Intersecção com [22, 29) — janela da noite do mesmo dia
  let night = 0
  const nightA1 = Math.max(startMin, NIGHT_START_MIN)
  const nightA2 = Math.min(endMin, NIGHT_END_MIN)
  if (nightA2 > nightA1) night += nightA2 - nightA1

  // Intersecção com [22+24, 29+24) — caso turno cruze duas madrugadas
  const nightB1 = Math.max(startMin, NIGHT_START_MIN + 24 * 60)
  const nightB2 = Math.min(endMin, NIGHT_END_MIN + 24 * 60)
  if (nightB2 > nightB1) night += nightB2 - nightB1

  // Caso especial: turno começa antes das 22h do dia anterior (não aplicável aqui)
  // E se o turno começa no início do dia (ex: 00h-05h), cai no intervalo [0, 5)
  // que NÃO é coberto por [22, 29). Precisamos considerar [0, 5) como noturno também.
  const earlyStart = Math.max(startMin, 0)
  const earlyEnd = Math.min(endMin, 5 * 60)
  if (earlyEnd > earlyStart && startMin < 22 * 60) night += earlyEnd - earlyStart

  return night
}

// Converte minutos reais de trabalho noturno para minutos CLT (hora
// reduzida 52min30s = 60min → fator 60/52.5 = 1.142857...)
export function toCLTNightMinutes(realMinutes) {
  return realMinutes * (60 / 52.5)
}

// ══════════════════════════════════════════════════════════════════════
// R5 — Domingo/Feriado (+100% adicional)
// (isHoliday e isSundayOrHoliday definidos acima)
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// R6 — Convocação ≥3 dias de antecedência (Art. 452-A §1)
// ══════════════════════════════════════════════════════════════════════

const MIN_CONVOCATION_NOTICE_HOURS = 72

export function validateConvocationAdvanceNotice(sentAtISO, shiftDate) {
  const sent = new Date(sentAtISO)
  // Shift assume 00:00 local São Paulo. Usamos meio-dia UTC como proxy seguro
  // (qualquer hora do dia na prática cai bem dentro de 72h se for 3 dias depois)
  const shift = new Date(shiftDate + 'T12:00:00Z')
  const hoursNotice = (shift.getTime() - sent.getTime()) / (60 * 60 * 1000)
  return {
    valid: hoursNotice >= MIN_CONVOCATION_NOTICE_HOURS,
    hoursNotice,
    minRequired: MIN_CONVOCATION_NOTICE_HOURS,
  }
}

// ══════════════════════════════════════════════════════════════════════
// R7 — Deadline de resposta ≥24h (Art. 452-A §2)
// ══════════════════════════════════════════════════════════════════════

const MIN_RESPONSE_DEADLINE_HOURS = 24

export function validateConvocationDeadline(sentAtISO, deadlineISO) {
  const sent = new Date(sentAtISO)
  const deadline = new Date(deadlineISO)
  const hoursWindow = (deadline.getTime() - sent.getTime()) / (60 * 60 * 1000)
  return {
    valid: hoursWindow >= MIN_RESPONSE_DEADLINE_HOURS,
    hoursWindow,
    minRequired: MIN_RESPONSE_DEADLINE_HOURS,
  }
}

// ══════════════════════════════════════════════════════════════════════
// R8 — Multa 50% por cancelamento após aceite (Art. 452-A §4)
// ══════════════════════════════════════════════════════════════════════

export function calculateCancellationPenalty({ shiftStartHour, shiftEndHour, hourlyRate }) {
  if (!hourlyRate || hourlyRate <= 0) return 0
  const startMin = parseHHMM(shiftStartHour)
  let endMin = parseHHMM(shiftEndHour)
  if (startMin == null || endMin == null) return 0
  if (endMin <= startMin) endMin += 24 * 60
  const hours = (endMin - startMin) / 60
  return Math.round(hours * hourlyRate * 0.5 * 100) / 100
}

// ══════════════════════════════════════════════════════════════════════
// R9 — Saldo de banco de horas nunca negativo para intermitente
// ══════════════════════════════════════════════════════════════════════

export function clampBalanceForIntermittent(balanceMinutes, contractType) {
  if (contractType === 'clt') return balanceMinutes
  // 'clt_intermitente', undefined, null, ou qualquer outro → aplica floor
  return Math.max(0, balanceMinutes)
}
