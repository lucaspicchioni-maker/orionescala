import type { WhatsAppConfig, WhatsAppMessage } from '@/types'

export function buildScheduleMessage(
  employeeName: string,
  weekRange: string,
  hours: number,
  shifts: { day: string; start: string; end: string }[],
): string {
  const shiftLines = shifts
    .map((s) => `  ${s.day}: ${s.start} - ${s.end}`)
    .join('\n')

  return (
    `Ola ${employeeName}! Sua escala da semana ${weekRange} foi publicada.\n\n` +
    `Seus turnos:\n${shiftLines}\n\n` +
    `Total: ${hours}h\n\n` +
    `Voce tem 12h para confirmar. Responda SIM para confirmar ou NAO para recusar.`
  )
}

export function buildPresenceCheckMessage(employeeName: string, day: string, hour: string): string {
  return (
    `Ola ${employeeName}! Lembrete: seu turno comeca em 2h (${day} as ${hour}).\n\n` +
    `Confirma presenca? Responda SIM ou NAO.`
  )
}

export function buildAbsenceAlertMessage(
  employeeName: string,
  day: string,
  hour: string,
): string {
  return (
    `ALERTA: ${employeeName} nao confirmou presenca para ${day} as ${hour}.\n` +
    `Slot aberto - necessario substituto.`
  )
}

export function buildDesistenceAlertMessage(
  employeeName: string,
  day: string,
): string {
  return (
    `ALERTA: ${employeeName} desistiu do turno de ${day}.\n` +
    `Slot reaberto - buscar substituto urgente.`
  )
}

export async function sendWhatsAppMessage(
  config: WhatsAppConfig,
  phone: string,
  message: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!config.enabled || config.provider === 'manual') {
    return { success: false, error: 'WhatsApp automatico nao configurado' }
  }

  const cleanPhone = phone.replace(/\D/g, '')
  if (!cleanPhone) {
    return { success: false, error: 'Telefone invalido' }
  }

  try {
    if (config.provider === 'evolution') {
      const response = await fetch(
        `${config.apiUrl}/message/sendText/${config.instance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: config.apiKey,
          },
          body: JSON.stringify({
            number: `55${cleanPhone}@s.whatsapp.net`,
            text: message,
          }),
        },
      )

      if (!response.ok) {
        const err = await response.text()
        return { success: false, error: `Evolution API error: ${err}` }
      }

      const data = await response.json()
      return { success: true, messageId: data.key?.id }
    }

    if (config.provider === 'zapi') {
      const response = await fetch(
        `${config.apiUrl}/send-text`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': config.apiKey,
          },
          body: JSON.stringify({
            phone: `55${cleanPhone}`,
            message,
          }),
        },
      )

      if (!response.ok) {
        const err = await response.text()
        return { success: false, error: `Z-API error: ${err}` }
      }

      const data = await response.json()
      return { success: true, messageId: data.messageId }
    }

    return { success: false, error: 'Provider nao suportado' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function buildWhatsAppManualLink(phone: string, message: string): string {
  const cleanPhone = phone.replace(/\D/g, '')
  return `https://wa.me/${cleanPhone ? `55${cleanPhone}` : ''}?text=${encodeURIComponent(message)}`
}

export function createMessageRecord(
  employeeId: string,
  phone: string,
  message: string,
  type: WhatsAppMessage['type'],
  status: WhatsAppMessage['status'] = 'sent',
): WhatsAppMessage {
  return {
    id: crypto.randomUUID(),
    employeeId,
    phone,
    message,
    sentAt: new Date().toISOString(),
    status,
    type,
  }
}
