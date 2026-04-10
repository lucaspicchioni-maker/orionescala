// ─────────────────────────────────────────────────────────────────────
// WhatsApp sender — abstrai os providers (Z-API, Evolution, manual).
//
// Usage:
//   import { sendWhatsApp } from './whatsappSender.js'
//   await sendWhatsApp(config, { phone, message })
//
// Retorna: { ok: true, providerId, status } ou { ok: false, error }
// ─────────────────────────────────────────────────────────────────────

/**
 * Normaliza o número do telefone para o formato esperado pelos providers.
 * Aceita: (11) 99999-8888, 11999998888, +5511999998888
 * Devolve: 5511999998888
 */
function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 10) return null
  // Se já começa com 55 (Brasil), mantém
  if (digits.startsWith('55') && digits.length >= 12) return digits
  // Senão adiciona 55
  return '55' + digits
}

/**
 * Envio via Z-API — https://developer.z-api.io
 * config: { apiUrl, apiKey, instance }
 */
async function sendViaZAPI(config, { phone, message }) {
  const phoneNorm = normalizePhone(phone)
  if (!phoneNorm) return { ok: false, error: 'Telefone inválido' }

  // Z-API URL format: https://api.z-api.io/instances/{instance}/token/{token}/send-text
  const baseUrl = config.apiUrl.replace(/\/$/, '')
  const url = `${baseUrl}/instances/${config.instance}/token/${config.apiKey}/send-text`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': config.apiKey,
      },
      body: JSON.stringify({
        phone: phoneNorm,
        message,
      }),
      signal: AbortSignal.timeout(10000),
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: body.error || body.message || `HTTP ${response.status}`,
      }
    }

    return {
      ok: true,
      providerId: body.messageId || body.id || null,
      status: 'sent',
    }
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Erro de rede ao chamar Z-API',
    }
  }
}

/**
 * Envio via Evolution API — https://doc.evolution-api.com
 * config: { apiUrl, apiKey, instance }
 */
async function sendViaEvolution(config, { phone, message }) {
  const phoneNorm = normalizePhone(phone)
  if (!phoneNorm) return { ok: false, error: 'Telefone inválido' }

  const baseUrl = config.apiUrl.replace(/\/$/, '')
  const url = `${baseUrl}/message/sendText/${config.instance}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey,
      },
      body: JSON.stringify({
        number: phoneNorm,
        text: message,
      }),
      signal: AbortSignal.timeout(10000),
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        error: body.error || body.message || `HTTP ${response.status}`,
      }
    }

    return {
      ok: true,
      providerId: body.key?.id || body.messageId || null,
      status: 'sent',
    }
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Erro de rede ao chamar Evolution API',
    }
  }
}

/**
 * Envia mensagem de WhatsApp pelo provider configurado.
 *
 * @param config WhatsAppConfig
 * @param payload { phone: string, message: string }
 */
export async function sendWhatsApp(config, payload) {
  if (!config) return { ok: false, error: 'Config WhatsApp não definida' }
  if (!config.enabled) return { ok: false, error: 'Integração WhatsApp desativada' }
  if (!payload?.phone) return { ok: false, error: 'Telefone não informado' }
  if (!payload?.message) return { ok: false, error: 'Mensagem vazia' }

  switch (config.provider) {
    case 'zapi':
      return sendViaZAPI(config, payload)
    case 'evolution':
      return sendViaEvolution(config, payload)
    case 'manual':
      return { ok: false, error: 'Provider em modo manual — abra o link wa.me' }
    default:
      return { ok: false, error: `Provider desconhecido: ${config.provider}` }
  }
}

// Export helper pra testes
export { normalizePhone }
