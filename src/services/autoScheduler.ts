import type { Employee, AvailabilityDeclaration, GoldenRule, DayOfWeek } from '@/types'
import { HOUR_RANGES, MIN_SHIFT_HOURS } from '@/types'
import type { WeekSchedule, ScheduleDayData, SlotData, Assignment } from '@/store/AppContext'

// ── Helpers ──────────────────────────────────────────────────────────

const DAY_NAMES: DayOfWeek[] = [
  'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo',
]

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function getRuleConfig<T>(rules: GoldenRule[], ruleId: string, key: string, fallback: T): T {
  const rule = rules.find(r => r.id === ruleId && r.enabled)
  if (!rule) return fallback
  const value = (rule.config as Record<string, unknown>)[key]
  return value !== undefined ? (value as T) : fallback
}

// ── Main Generator ───────────────────────────────────────────────────

export function generateScheduleSuggestion(
  weekStart: string,
  employees: Employee[],
  availabilities: AvailabilityDeclaration[],
  rules: GoldenRule[],
  existingSchedule?: WeekSchedule,
): WeekSchedule {
  const minStaffPerSlot = getRuleConfig<number>(rules, 'rule-min-staff', 'minStaffPerSlot', 2)
  const maxWeeklyHours = getRuleConfig<number>(rules, 'rule-max-weekly-hours', 'maxWeeklyHours', 44)

  const activeEmployees = employees.filter(e => e.status === 'ativo')

  // Track assigned hours per employee across the whole week
  const weeklyHours: Record<string, number> = {}
  for (const emp of activeEmployees) {
    weeklyHours[emp.id] = 0
  }

  // Track assignments per employee per day (for gap-filling later)
  // dayIndex -> employeeId -> Set of slot indices assigned
  const dayAssignments: Map<number, Map<string, Set<number>>>  = new Map()

  // Build availability lookup: employeeId -> day -> Set of hour ranges
  const availLookup = buildAvailabilityLookup(weekStart, availabilities)

  // ── Step 1-2: Create 7-day schedule with empty slots ──

  const days: ScheduleDayData[] = DAY_NAMES.map((dayName, dayIdx) => {
    const date = addDays(weekStart, dayIdx)

    // Carry over existing slot config (requiredPeople) if available
    const existingDay = existingSchedule?.days.find(d => d.date === date)

    const slots: SlotData[] = HOUR_RANGES.map(hourRange => {
      const existingSlot = existingDay?.slots.find(s => s.hour === hourRange)
      return {
        hour: hourRange,
        requiredPeople: existingSlot?.requiredPeople ?? minStaffPerSlot,
        assignments: [],
      }
    })

    return { date, dayOfWeek: dayName, slots }
  })

  // ── Step 5: Greedy assignment ──

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx]
    const dayName = day.dayOfWeek as DayOfWeek
    dayAssignments.set(dayIdx, new Map())

    for (let slotIdx = 0; slotIdx < day.slots.length; slotIdx++) {
      const slot = day.slots[slotIdx]
      const needed = slot.requiredPeople

      if (needed <= 0) continue

      // 5a. Find available employees
      const candidates = activeEmployees.filter(emp => {
        // Skip employees already at max weekly hours
        if (weeklyHours[emp.id] >= maxWeeklyHours) return false

        // Skip employees already assigned to this slot
        if (slot.assignments.some(a => a.employeeId === emp.id)) return false

        return true
      })

      // 5b-c. Score candidates
      const scored = candidates.map(emp => {
        let score = 0

        // Prefer employees with fewer assigned hours (balance workload)
        // Lower hours = higher score
        score += (maxWeeklyHours - weeklyHours[emp.id])

        // Prefer employees who declared availability for this slot (+50 bonus)
        const empAvail = availLookup.get(emp.id)
        if (empAvail) {
          const daySlots = empAvail.get(dayName)
          if (daySlots && daySlots.has(slot.hour)) {
            score += 50
          }
        }

        // Small tiebreaker: prefer leaders/supervisors slightly less
        // so auxiliares get more hours first (they typically need them)
        if (emp.role === 'auxiliar') score += 5

        return { emp, score }
      })

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score)

      // 5d. Assign top-scored employees
      const toAssign = scored.slice(0, needed)
      for (const { emp } of toAssign) {
        const assignment: Assignment = {
          id: crypto.randomUUID(),
          employeeId: emp.id,
          status: 'pending',
          confirmedAt: null,
        }
        slot.assignments.push(assignment)
        weeklyHours[emp.id] += 1 // each slot = 1 hour

        // Track for gap-filling
        const empMap = dayAssignments.get(dayIdx)!
        if (!empMap.has(emp.id)) {
          empMap.set(emp.id, new Set())
        }
        empMap.get(emp.id)!.add(slotIdx)
      }
    }
  }

  // ── Step 6: Enforce MIN_SHIFT_HOURS (fill gaps for consecutive shifts) ──

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx]
    const empMap = dayAssignments.get(dayIdx)!

    for (const [empId, assignedSlots] of empMap.entries()) {
      if (assignedSlots.size === 0) continue

      const sortedSlots = Array.from(assignedSlots).sort((a, b) => a - b)
      const minSlot = sortedSlots[0]
      const maxSlot = sortedSlots[sortedSlots.length - 1]
      const currentSpan = maxSlot - minSlot + 1

      // If span is already >= MIN_SHIFT_HOURS, check for internal gaps only
      // If span < MIN_SHIFT_HOURS, extend to meet minimum
      const targetSpan = Math.max(currentSpan, MIN_SHIFT_HOURS)

      // Determine range to fill
      let startSlot = minSlot
      let endSlot = minSlot + targetSpan - 1

      // Clamp to valid slot range
      if (endSlot >= day.slots.length) {
        endSlot = day.slots.length - 1
        startSlot = Math.max(0, endSlot - targetSpan + 1)
      }

      // Fill gaps in the range (only if employee isn't already there and won't exceed weekly limit)
      for (let s = startSlot; s <= endSlot; s++) {
        if (assignedSlots.has(s)) continue
        if (weeklyHours[empId] >= maxWeeklyHours) break

        const slot = day.slots[s]
        // Don't double-assign
        if (slot.assignments.some(a => a.employeeId === empId)) continue

        const assignment: Assignment = {
          id: crypto.randomUUID(),
          employeeId: empId,
          status: 'pending',
          confirmedAt: null,
        }
        slot.assignments.push(assignment)
        weeklyHours[empId] += 1
        assignedSlots.add(s)
      }
    }
  }

  // ── Step 7: Return unpublished schedule ──

  return {
    weekStart,
    days,
    published: false,
    publishedAt: null,
  }
}

// ── Availability Lookup Builder ──────────────────────────────────────

function buildAvailabilityLookup(
  weekStart: string,
  availabilities: AvailabilityDeclaration[],
): Map<string, Map<DayOfWeek, Set<string>>> {
  const lookup = new Map<string, Map<DayOfWeek, Set<string>>>()

  // Only consider submitted declarations for this specific week
  const weekDeclarations = availabilities.filter(
    a => a.weekStart === weekStart && a.status === 'submitted',
  )

  for (const decl of weekDeclarations) {
    if (!lookup.has(decl.employeeId)) {
      lookup.set(decl.employeeId, new Map())
    }
    const empMap = lookup.get(decl.employeeId)!

    for (const slot of decl.slots) {
      if (!empMap.has(slot.day)) {
        empMap.set(slot.day, new Set())
      }
      const daySet = empMap.get(slot.day)!
      for (const hour of slot.hours) {
        daySet.add(hour)
      }
    }
  }

  return lookup
}
