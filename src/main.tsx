import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── PWA Service Worker — auto update ──────────────────────────────────
// Usa o helper do vite-plugin-pwa que já conversa com o workbox gerado.
// Com skipWaiting + clientsClaim no config, o novo SW assume o controle
// imediatamente. Este bloco adicional detecta quando há um bundle novo
// e força reload da página para garantir que o código mais recente roda.
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Nova versão encontrada — atualiza imediatamente (sem prompt)
        // Os dados críticos são persistidos via API, então reload é seguro.
        console.log('[PWA] Nova versão detectada, atualizando...')
        updateSW(true)
      },
      onOfflineReady() {
        console.log('[PWA] App pronto para uso offline.')
      },
      onRegisteredSW(swUrl) {
        console.log('[PWA] Service Worker registrado:', swUrl)
      },
      onRegisterError(error) {
        console.error('[PWA] Erro ao registrar SW:', error)
      },
    })
  }).catch(err => {
    console.error('[PWA] Falha ao carregar registro do SW:', err)
  })
}
