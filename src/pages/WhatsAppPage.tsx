import { useState, useMemo } from 'react'
import { MessageCircle, Send, Settings, Users, History, CheckCheck, Clock, AlertCircle, Sparkles } from 'lucide-react'
import { getWhatsAppMessageAI } from '@/services/aiService'
import { Card } from '@/components/ui/Card'
import { useApp } from '@/store/AppContext'
import { cn } from '@/lib/utils'
import type { WhatsAppConfig, WhatsAppMessage } from '@/types'

type Tab = 'config' | 'enviar' | 'historico'

const TEMPLATES = [
  {
    id: 'escala_publicada',
    label: 'Escala publicada',
    message: 'Ola {nome}, sua escala da semana {semana} foi publicada. Confira no sistema.',
    type: 'schedule_notify' as const,
  },
  {
    id: 'lembrete_turno',
    label: 'Lembrete de turno',
    message: 'Ola {nome}, seu turno comeca em 30 min ({horario}). Nao esqueca o check-in!',
    type: 'presence_check' as const,
  },
  {
    id: 'alerta_falta',
    label: 'Alerta de falta',
    message: 'Alerta: {nome} nao fez check-in para o turno de {horario}.',
    type: 'absence_alert' as const,
  },
  {
    id: 'personalizado',
    label: 'Personalizado',
    message: '',
    type: 'custom' as const,
  },
]

const STATUS_CONFIG: Record<WhatsAppMessage['status'], { label: string; color: string; icon: typeof CheckCheck }> = {
  sent: { label: 'Enviado', color: 'bg-blue-500/20 text-blue-400', icon: Send },
  delivered: { label: 'Entregue', color: 'bg-emerald-500/20 text-emerald-400', icon: CheckCheck },
  read: { label: 'Lido', color: 'bg-green-500/20 text-green-400', icon: CheckCheck },
  failed: { label: 'Falhou', color: 'bg-red-500/20 text-red-400', icon: AlertCircle },
}

export default function WhatsAppPage() {
  const { state, dispatch } = useApp()
  const { employees, whatsappConfig, whatsappMessages, currentWeek } = state

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'ativo'),
    [employees],
  )

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<Tab>('config')

  // ── Config form state ──
  const [configForm, setConfigForm] = useState<WhatsAppConfig>({ ...whatsappConfig })

  // ── Send state ──
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set())
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0].id)
  const [customMessage, setCustomMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)

  async function generateWithAI() {
    if (selectedEmployees.size === 0) return
    setAiGenerating(true)
    try {
      const firstEmpId = [...selectedEmployees][0]
      const emp = activeEmployees.find(e => e.id === firstEmpId)
      if (!emp) return
      const { message } = await getWhatsAppMessageAI({
        type: currentTemplate?.type ?? 'custom',
        employeeName: emp.name,
        context: { week: currentWeek, template: currentTemplate?.label },
      })
      setCustomMessage(message)
      setSelectedTemplate('personalizado')
    } finally {
      setAiGenerating(false)
    }
  }

  // ── Config handlers ──
  function handleSaveConfig() {
    dispatch({ type: 'SET_WHATSAPP_CONFIG', payload: configForm })
  }

  // ── Send handlers ──
  function toggleEmployee(id: string) {
    setSelectedEmployees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedEmployees.size === activeEmployees.length) {
      setSelectedEmployees(new Set())
    } else {
      setSelectedEmployees(new Set(activeEmployees.map((e) => e.id)))
    }
  }

  const currentTemplate = TEMPLATES.find((t) => t.id === selectedTemplate)!

  function generateMessage(employeeName: string): string {
    if (selectedTemplate === 'personalizado') return customMessage
    return currentTemplate.message
      .replace('{nome}', employeeName)
      .replace('{semana}', currentWeek)
      .replace('{horario}', '—')
  }

  const previewMessages = useMemo(() => {
    return activeEmployees
      .filter((e) => selectedEmployees.has(e.id))
      .map((e) => ({
        employee: e,
        message: generateMessage(e.name),
      }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployees, selectedTemplate, customMessage, activeEmployees, currentWeek])

  function handleSend() {
    if (previewMessages.length === 0) return
    setSending(true)

    setTimeout(() => {
      previewMessages.forEach(({ employee, message }) => {
        const msg: WhatsAppMessage = {
          id: `wamsg-${Date.now()}-${employee.id}`,
          employeeId: employee.id,
          phone: employee.phone,
          message,
          sentAt: new Date().toISOString(),
          status: 'sent',
          type: currentTemplate.type,
        }
        dispatch({ type: 'ADD_WHATSAPP_MESSAGE', payload: msg })
      })

      setSelectedEmployees(new Set())
      setSending(false)
      setActiveTab('historico')
    }, 800)
  }

  // ── Sorted messages ──
  const sortedMessages = useMemo(
    () => [...whatsappMessages].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [whatsappMessages],
  )

  // ── Tabs ──
  const tabs: { id: Tab; label: string; icon: typeof Settings }[] = [
    { id: 'config', label: 'Configuracao', icon: Settings },
    { id: 'enviar', label: 'Enviar', icon: Send },
    { id: 'historico', label: 'Historico', icon: History },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-500/20">
          <MessageCircle className="w-6 h-6 text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>
          <p className="text-sm text-muted">Integracao e envio de mensagens</p>
        </div>
        {whatsappConfig.enabled && (
          <span className="ml-auto px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
            Ativo
          </span>
        )}
        {!whatsappConfig.enabled && (
          <span className="ml-auto px-3 py-1 rounded-full text-xs font-medium bg-zinc-500/20 text-zinc-400">
            Inativo
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-card border border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-card-hover',
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Configuracao ── */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-foreground mb-4">Configuracao da API</h2>

            <div className="space-y-4">
              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Provedor</label>
                <select
                  value={configForm.provider}
                  onChange={(e) => setConfigForm({ ...configForm, provider: e.target.value as WhatsAppConfig['provider'] })}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="evolution">Evolution API</option>
                  <option value="zapi">Z-API</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              {/* API URL */}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">API URL</label>
                <input
                  type="url"
                  value={configForm.apiUrl}
                  onChange={(e) => setConfigForm({ ...configForm, apiUrl: e.target.value })}
                  placeholder="https://api.example.com"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">API Key</label>
                <input
                  type="password"
                  value={configForm.apiKey}
                  onChange={(e) => setConfigForm({ ...configForm, apiKey: e.target.value })}
                  placeholder="Sua chave de API"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Instance ID */}
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Instance ID</label>
                <input
                  type="text"
                  value={configForm.instance}
                  onChange={(e) => setConfigForm({ ...configForm, instance: e.target.value })}
                  placeholder="ID da instancia"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Enable toggle */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-foreground">Ativar integracao</span>
                <button
                  onClick={() => setConfigForm({ ...configForm, enabled: !configForm.enabled })}
                  className={cn(
                    'relative w-12 h-6 rounded-full transition-colors',
                    configForm.enabled ? 'bg-green-500' : 'bg-zinc-600',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                      configForm.enabled && 'translate-x-6',
                    )}
                  />
                </button>
              </div>

              {/* Save */}
              <button
                onClick={handleSaveConfig}
                className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
              >
                Salvar Configuracao
              </button>
            </div>
          </Card>

          {/* Templates (read-only) */}
          <Card>
            <h2 className="text-lg font-semibold text-foreground mb-4">Templates de Mensagens</h2>
            <div className="space-y-3">
              {TEMPLATES.filter((t) => t.id !== 'personalizado').map((template) => (
                <div key={template.id} className="p-3 rounded-lg bg-background border border-border">
                  <p className="text-sm font-medium text-foreground mb-1">{template.label}</p>
                  <p className="text-xs text-muted font-mono">{template.message}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── TAB: Enviar ── */}
      {activeTab === 'enviar' && (
        <div className="space-y-6">
          {/* Select employees */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Selecionar Colaboradores
              </h2>
              <button
                onClick={toggleAll}
                className="text-xs text-primary hover:underline"
              >
                {selectedEmployees.size === activeEmployees.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {activeEmployees.map((emp) => (
                <label
                  key={emp.id}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors',
                    selectedEmployees.has(emp.id)
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-card-hover',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedEmployees.has(emp.id)}
                    onChange={() => toggleEmployee(emp.id)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{emp.name}</p>
                    <p className="text-xs text-muted">{emp.phone}</p>
                  </div>
                </label>
              ))}
            </div>

            {activeEmployees.length === 0 && (
              <p className="text-sm text-muted text-center py-4">Nenhum colaborador ativo encontrado.</p>
            )}
          </Card>

          {/* Select template */}
          <Card>
            <h2 className="text-lg font-semibold text-foreground mb-4">Template</h2>
            <div className="space-y-3">
              {TEMPLATES.map((template) => (
                <label
                  key={template.id}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    selectedTemplate === template.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-card-hover',
                  )}
                >
                  <input
                    type="radio"
                    name="template"
                    value={template.id}
                    checked={selectedTemplate === template.id}
                    onChange={() => setSelectedTemplate(template.id)}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{template.label}</p>
                    {template.id !== 'personalizado' && (
                      <p className="text-xs text-muted mt-0.5 font-mono">{template.message}</p>
                    )}
                  </div>
                </label>
              ))}

              {selectedTemplate === 'personalizado' && (
                <div className="space-y-2">
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Digite sua mensagem personalizada... Use {nome} para o nome do colaborador."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
                  />
                  <button
                    onClick={generateWithAI}
                    disabled={aiGenerating || selectedEmployees.size === 0}
                    className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {aiGenerating ? 'Gerando...' : 'Gerar com IA'}
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* Preview */}
          {previewMessages.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-foreground mb-4">Preview ({previewMessages.length})</h2>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {previewMessages.map(({ employee, message }) => (
                  <div key={employee.id} className="p-2.5 rounded-lg bg-background border border-border">
                    <p className="text-xs font-medium text-primary mb-1">{employee.name} — {employee.phone}</p>
                    <p className="text-xs text-foreground">{message}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={previewMessages.length === 0 || sending}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all',
              previewMessages.length > 0 && !sending
                ? 'bg-green-600 text-white hover:bg-green-500 shadow-lg'
                : 'bg-zinc-700 text-zinc-400 cursor-not-allowed',
            )}
          >
            <Send className="w-4 h-4" />
            {sending ? 'Enviando...' : `Enviar para ${previewMessages.length} colaborador(es)`}
          </button>
        </div>
      )}

      {/* ── TAB: Historico ── */}
      {activeTab === 'historico' && (
        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Historico de Mensagens
          </h2>

          {sortedMessages.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">Nenhuma mensagem enviada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 px-3 text-muted font-medium">Colaborador</th>
                    <th className="text-left py-2.5 px-3 text-muted font-medium">Mensagem</th>
                    <th className="text-left py-2.5 px-3 text-muted font-medium">Enviado</th>
                    <th className="text-left py-2.5 px-3 text-muted font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMessages.map((msg) => {
                    const emp = employees.find((e) => e.id === msg.employeeId)
                    const statusCfg = STATUS_CONFIG[msg.status]
                    const StatusIcon = statusCfg.icon
                    const sentDate = new Date(msg.sentAt)

                    return (
                      <tr key={msg.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-foreground">{emp?.name ?? '—'}</p>
                          <p className="text-xs text-muted">{msg.phone}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="text-foreground truncate max-w-xs">{msg.message}</p>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-muted">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-xs">
                              {sentDate.toLocaleDateString('pt-BR')} {sentDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.color)}>
                            <StatusIcon className="w-3 h-3" />
                            {statusCfg.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
