import { useState } from 'react'
import {
  MapPin,
  MessageCircle,
  Save,
  Locate,
  Wifi,
  WifiOff,
  Smartphone,
  Shield,
  Database,
  Sun,
  Moon,
  Palette,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useApp } from '@/store/AppContext'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function ConfiguracoesPage() {
  const { state, dispatch } = useApp()

  // Location config
  const [locName, setLocName] = useState(state.locationConfig.name)
  const [locLat, setLocLat] = useState(String(state.locationConfig.lat))
  const [locLng, setLocLng] = useState(String(state.locationConfig.lng))
  const [locRadius, setLocRadius] = useState(String(state.locationConfig.radiusMeters))
  const [locSaved, setLocSaved] = useState(false)
  const [gettingLoc, setGettingLoc] = useState(false)

  // WhatsApp config
  const [waProvider, setWaProvider] = useState(state.whatsappConfig.provider)
  const [waApiUrl, setWaApiUrl] = useState(state.whatsappConfig.apiUrl)
  const [waApiKey, setWaApiKey] = useState(state.whatsappConfig.apiKey)
  const [waInstance, setWaInstance] = useState(state.whatsappConfig.instance)
  const [waEnabled, setWaEnabled] = useState(state.whatsappConfig.enabled)
  const [waSaved, setWaSaved] = useState(false)

  // Unit config (OEE target)
  const [targetOrdersPerHour, setTargetOrdersPerHour] = useState('8')
  const [unitSaved, setUnitSaved] = useState(false)

  // Load unit config on mount
  useState(() => {
    api.get<{ targetOrdersPerHour?: number }>('/api/data/unit-config')
      .then(data => {
        if (data?.targetOrdersPerHour) setTargetOrdersPerHour(String(data.targetOrdersPerHour))
      })
      .catch(() => {})
  })

  const saveUnitConfig = async () => {
    const payload = { targetOrdersPerHour: parseInt(targetOrdersPerHour) || 8 }
    try { await api.put('/api/data/unit-config', payload) } catch { /* fallback */ }
    setUnitSaved(true)
    setTimeout(() => setUnitSaved(false), 3000)
  }

  // Current user
  const [userName, setUserName] = useState(state.currentUser.name)
  const [userRole, setUserRole] = useState(state.currentUser.role)
  const [userSaved, setUserSaved] = useState(false)

  const handleGetLocation = () => {
    if (!navigator.geolocation) return
    setGettingLoc(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocLat(String(pos.coords.latitude))
        setLocLng(String(pos.coords.longitude))
        setGettingLoc(false)
      },
      () => setGettingLoc(false),
      { enableHighAccuracy: true },
    )
  }

  const saveLocation = async () => {
    const payload = {
      name: locName,
      lat: parseFloat(locLat) || 0,
      lng: parseFloat(locLng) || 0,
      radiusMeters: parseInt(locRadius) || 150,
    }
    dispatch({ type: 'SET_LOCATION_CONFIG', payload })
    try { await api.put('/api/data/location-config', payload) } catch { /* fallback to localStorage */ }
    setLocSaved(true)
    setTimeout(() => setLocSaved(false), 3000)
  }

  const saveWhatsApp = async () => {
    const payload = {
      provider: waProvider,
      apiUrl: waApiUrl,
      apiKey: waApiKey,
      instance: waInstance,
      enabled: waEnabled,
    }
    dispatch({ type: 'SET_WHATSAPP_CONFIG', payload })
    try { await api.put('/api/data/whatsapp-config', payload) } catch { /* fallback to localStorage */ }
    setWaSaved(true)
    setTimeout(() => setWaSaved(false), 3000)
  }

  const saveUser = () => {
    dispatch({
      type: 'SET_CURRENT_USER',
      payload: { name: userName, role: userRole },
    })
    setUserSaved(true)
    setTimeout(() => setUserSaved(false), 3000)
  }

  const clearAllData = () => {
    if (!confirm('Tem certeza? Isso vai apagar TODOS os dados do sistema.')) return
    const keys = [
      'orion_employees', 'orion_schedules', 'orion_ponto', 'orion_whatsapp_config',
      'orion_whatsapp_messages', 'orion_location_config', 'orion_notifications',
      'orion_productivity', 'orion_weekly_goals', 'orion_current_user',
      'orion_shift_swaps', 'orion_banco_horas', 'orion_feedbacks', 'orion_theme', 'orion_onboarding_done',
    ]
    keys.forEach((k) => localStorage.removeItem(k))
    window.location.reload()
  }

  return (
    <div className="animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Configuracoes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ajuste o sistema para sua operacao</p>
      </div>

      {/* ─── User / Role ─── */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Shield className="h-4 w-4" />
          Perfil do Usuario
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nome</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Funcao</label>
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value as typeof userRole)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground"
            >
              <option value="colaborador">Colaborador</option>
              <option value="supervisor">Supervisor / Lider</option>
              <option value="rh">RH</option>
              <option value="gerente">Gerente</option>
              <option value="admin">Admin (acesso total)</option>
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Isso define o que voce ve no sistema. Colaborador ve apenas sua area; Lider ve escala, ponto e produtividade; RH ve colaboradores, dimensionamento e avaliacoes; Gerente ve tudo.
        </p>
        <button
          onClick={saveUser}
          className="mt-3 flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Save className="h-4 w-4" />
          {userSaved ? 'Salvo!' : 'Salvar Perfil'}
        </button>
      </Card>

      {/* ─── Theme ─── */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Palette className="h-4 w-4" />
          Aparencia
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">Tema</div>
            <div className="text-xs text-muted-foreground">Escolha entre modo escuro ou claro</div>
          </div>
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            <button
              onClick={() => dispatch({ type: 'SET_THEME', payload: 'dark' })}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                state.theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Moon className="h-3.5 w-3.5" /> Escuro
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_THEME', payload: 'light' })}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                state.theme === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Sun className="h-3.5 w-3.5" /> Claro
            </button>
          </div>
        </div>
      </Card>

      {/* ─── Location ─── */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <MapPin className="h-4 w-4" />
          Localizacao da Cozinha (Check-in GPS)
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">Nome do Local</label>
            <input
              type="text"
              value={locName}
              onChange={(e) => setLocName(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Latitude</label>
            <input
              type="text"
              value={locLat}
              onChange={(e) => setLocLat(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Longitude</label>
            <input
              type="text"
              value={locLng}
              onChange={(e) => setLocLng(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Raio de Check-in (metros)</label>
            <input
              type="number"
              value={locRadius}
              onChange={(e) => setLocRadius(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={handleGetLocation}
            disabled={gettingLoc}
            className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Locate className={cn('h-4 w-4', gettingLoc && 'animate-spin')} />
            {gettingLoc ? 'Obtendo...' : 'Usar minha localizacao'}
          </button>
          <button
            onClick={saveLocation}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-4 w-4" />
            {locSaved ? 'Salvo!' : 'Salvar Localizacao'}
          </button>
        </div>
        {state.locationConfig.lat === 0 && state.locationConfig.lng === 0 && (
          <p className="mt-3 text-xs text-warning">
            Localizacao nao configurada. O check-in GPS nao vai funcionar ate voce definir as coordenadas da cozinha.
          </p>
        )}
      </Card>

      {/* ─── Operação / Unidade ─── */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Smartphone className="h-4 w-4" />
          Configuracao da Unidade
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Capacidade por pessoa/hora (pedidos)</label>
            <input
              type="number"
              value={targetOrdersPerHour}
              onChange={e => setTargetOrdersPerHour(e.target.value)}
              min="1" max="100"
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Usado no calculo OEE (Performance = pedidos / capacidade). Default 8 ped/h/pessoa.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={() => void saveUnitConfig()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-4 w-4" />
            {unitSaved ? 'Salvo!' : 'Salvar Config Unidade'}
          </button>
        </div>
      </Card>

      {/* ─── WhatsApp ─── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <MessageCircle className="h-4 w-4" />
            Integracao WhatsApp
          </h3>
          <Badge variant={waEnabled ? 'success' : 'muted'} size="sm">
            {waEnabled ? <><Wifi className="mr-1 h-3 w-3" /> Ativo</> : <><WifiOff className="mr-1 h-3 w-3" /> Inativo</>}
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Provedor</label>
            <select
              value={waProvider}
              onChange={(e) => setWaProvider(e.target.value as typeof waProvider)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground"
            >
              <option value="manual">Manual (Links WhatsApp)</option>
              <option value="evolution">Evolution API</option>
              <option value="zapi">Z-API</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Instancia</label>
            <input
              type="text"
              value={waInstance}
              onChange={(e) => setWaInstance(e.target.value)}
              placeholder="Nome da instancia"
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">URL da API</label>
            <input
              type="text"
              value={waApiUrl}
              onChange={(e) => setWaApiUrl(e.target.value)}
              placeholder="https://api.exemplo.com"
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">API Key</label>
            <input
              type="password"
              value={waApiKey}
              onChange={(e) => setWaApiKey(e.target.value)}
              placeholder="Sua chave de API"
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground font-mono"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={waEnabled}
              onChange={(e) => setWaEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-input accent-primary"
            />
            <span className="text-sm text-foreground">Ativar envio automatico</span>
          </label>
        </div>
        <button
          onClick={saveWhatsApp}
          className="mt-3 flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Save className="h-4 w-4" />
          {waSaved ? 'Salvo!' : 'Salvar WhatsApp'}
        </button>
      </Card>

      {/* ─── System Info ─── */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Database className="h-4 w-4" />
          Sistema
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Armazenamento</span>
            <Badge variant="muted" size="sm">localStorage</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Colaboradores</span>
            <span className="font-medium text-foreground">{state.employees.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Escalas salvas</span>
            <span className="font-medium text-foreground">{state.schedules.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Registros de ponto</span>
            <span className="font-medium text-foreground">{state.pontoRecords.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Registros produtividade</span>
            <span className="font-medium text-foreground">{state.productivityRecords.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Notificacoes</span>
            <span className="font-medium text-foreground">{state.notifications.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Versao</span>
            <Badge variant="default" size="sm">
              <Smartphone className="mr-1 h-3 w-3" />
              PWA v1.0
            </Badge>
          </div>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <button
            onClick={clearAllData}
            className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/20"
          >
            Limpar todos os dados
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            Remove todos os dados do localStorage. Irreversivel.
          </p>
        </div>
      </Card>
    </div>
  )
}
