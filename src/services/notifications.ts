import type { ScheduledNotification, NotificationType } from '@/types'
import type { WeekSchedule } from '@/store/AppContext'

interface NotificationTemplate {
  type: NotificationType
  offsetHours: number // hours before shift start (negative = after)
  channel: 'whatsapp' | 'in_app'
  buildMessage: (employeeName: string, date: string, startHour: string, endHour: string) => string
}

const TEMPLATES: NotificationTemplate[] = [
  {
    type: 'schedule_published',
    offsetHours: 0, // immediate when schedule is published
    channel: 'in_app',
    buildMessage: (_name, date, start, end) =>
      `Sua escala foi publicada! ${date}: ${start} - ${end}. Confirme sua presenca.`,
  },
  {
    type: 'shift_reminder',
    offsetHours: 2, // 2h before shift
    channel: 'whatsapp',
    buildMessage: (name, _date, start, _end) =>
      `Ola ${name}! Lembrete: seu turno comeca em 2 horas (${start}). Nao se atrase!`,
  },
  {
    type: 'shift_start',
    offsetHours: 0, // at shift start
    channel: 'in_app',
    buildMessage: (_name, _date, start, _end) =>
      `Seu turno comecou (${start}). Faca seu check-in pelo app.`,
  },
  {
    type: 'shift_end',
    offsetHours: -0.5, // 30min before end
    channel: 'in_app',
    buildMessage: (_name, _date, _start, end) =>
      `Seu turno termina em 30 minutos (${end}). Lembre de fazer check-out.`,
  },
]

function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Generates all scheduled notifications for a published schedule.
 * Called once when the schedule is published.
 */
export function generateNotificationsForSchedule(
  schedule: WeekSchedule,
  employeeNames: Record<string, string>,
): ScheduledNotification[] {
  const notifications: ScheduledNotification[] = []

  for (const day of schedule.days) {
    // Group assignments by employee to find their shift start/end
    const employeeShifts = new Map<string, { start: string; end: string; hours: string[] }>()

    for (const slot of day.slots) {
      for (const assignment of slot.assignments) {
        const existing = employeeShifts.get(assignment.employeeId)
        const startHour = slot.hour.split('-')[0]
        const endHour = slot.hour.split('-')[1]

        if (existing) {
          existing.hours.push(startHour)
          // Update end to the latest slot
          existing.end = endHour
        } else {
          employeeShifts.set(assignment.employeeId, {
            start: startHour,
            end: endHour,
            hours: [startHour],
          })
        }
      }
    }

    // Create notifications for each employee's shift
    for (const [employeeId, shift] of employeeShifts) {
      const name = employeeNames[employeeId] || 'Colaborador'

      const shiftHours = shift.hours.length

      for (const template of TEMPLATES) {
        // Calculate when to send
        const [startH, startM] = shift.start.split(':').map(Number)
        let scheduledFor: string

        if (template.type === 'schedule_published') {
          scheduledFor = new Date().toISOString()
        } else if (template.type === 'shift_end') {
          const [endH, endM] = shift.end.split(':').map(Number)
          const endDate = new Date(day.date + 'T00:00:00')
          endDate.setHours(endH, endM, 0, 0)
          endDate.setMinutes(endDate.getMinutes() - 30)
          scheduledFor = endDate.toISOString()
        } else {
          const shiftDate = new Date(day.date + 'T00:00:00')
          shiftDate.setHours(startH, startM, 0, 0)
          shiftDate.setHours(shiftDate.getHours() - template.offsetHours)
          scheduledFor = shiftDate.toISOString()
        }

        const dateBR = formatDateBR(day.date)

        notifications.push({
          id: crypto.randomUUID(),
          employeeId,
          type: template.type,
          scheduledFor,
          message: template.buildMessage(name, dateBR, shift.start, shift.end),
          weekStart: schedule.weekStart,
          date: day.date,
          hour: shift.start,
          status: 'pending',
          sentAt: null,
          channel: template.channel,
        })
      }

      // Break notification for shifts >= 5 hours
      if (shiftHours >= 5) {
        const [startH, startM] = shift.start.split(':').map(Number)
        // Notify ~2.5h into the shift (halfway) to take a break
        const breakDate = new Date(day.date + 'T00:00:00')
        breakDate.setHours(startH, startM, 0, 0)
        breakDate.setMinutes(breakDate.getMinutes() + Math.floor(shiftHours / 2) * 60)

        notifications.push({
          id: crypto.randomUUID(),
          employeeId,
          type: 'break_required',
          scheduledFor: breakDate.toISOString(),
          message: `${name}, seu turno tem ${shiftHours}h (${shift.start}-${shift.end}). Sinalize seu horario de intervalo no app!`,
          weekStart: schedule.weekStart,
          date: day.date,
          hour: shift.start,
          status: 'pending',
          sentAt: null,
          channel: 'whatsapp',
        })
      }
    }
  }

  return notifications
}

/**
 * Returns notifications that are due to be sent (scheduledFor <= now).
 */
export function getDueNotifications(
  notifications: ScheduledNotification[],
): ScheduledNotification[] {
  const now = new Date().toISOString()
  return notifications.filter(
    (n) => n.status === 'pending' && n.scheduledFor <= now,
  )
}
