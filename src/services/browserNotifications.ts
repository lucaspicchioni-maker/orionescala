// ─────────────────────────────────────────────────────────────────────
// Browser Notification API — notificações nativas do OS.
// Funciona quando o app está aberto (PWA em foreground).
// Para notificações com app fechado, precisaria de Web Push + VAPID (v2).
// ─────────────────────────────────────────────────────────────────────

/**
 * Pede permissão pro browser mostrar notificações.
 * Retorna 'granted', 'denied' ou 'default'.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

/**
 * Checa se o browser suporta e tem permissão.
 */
export function canNotify(): boolean {
  return 'Notification' in window && Notification.permission === 'granted'
}

/**
 * Envia notificação nativa do browser.
 * Se o usuário clicou, foca na aba do app.
 */
export function notify(title: string, options?: {
  body?: string
  icon?: string
  tag?: string
  url?: string
}) {
  if (!canNotify()) return

  const notification = new Notification(title, {
    body: options?.body,
    icon: options?.icon || '/icons/pwa-192x192.png',
    tag: options?.tag, // deduplicação — mesma tag substitui a anterior
    badge: '/icons/pwa-192x192.png',
  })

  if (options?.url) {
    notification.onclick = () => {
      window.focus()
      window.location.href = options.url!
      notification.close()
    }
  }
}

/**
 * Notifica que a escala foi publicada (chamada após publish).
 */
export function notifySchedulePublished(weekLabel: string, totalPeople: number) {
  notify(`Escala ${weekLabel} publicada`, {
    body: `${totalPeople} colaborador${totalPeople === 1 ? '' : 'es'} convocado${totalPeople === 1 ? '' : 's'}. Confira os turnos.`,
    tag: `schedule-${weekLabel}`,
    url: '/escala',
  })
}

/**
 * Notifica convocação (para colaborador).
 */
export function notifyConvocation(shiftDate: string, shiftHours: string) {
  notify('Nova convocação', {
    body: `Turno ${shiftDate}: ${shiftHours}. Confirme no app.`,
    tag: `convocation-${shiftDate}`,
    url: '/convocacoes',
  })
}

/**
 * Notifica override CLT (para RH).
 */
export function notifyOverrideCLT(weekStart: string, byName: string) {
  notify('Override CLT registrado', {
    body: `${byName} publicou escala ${weekStart} com violação. Revise no audit log.`,
    tag: `clt-override-${weekStart}`,
    url: '/clt-overrides',
  })
}
