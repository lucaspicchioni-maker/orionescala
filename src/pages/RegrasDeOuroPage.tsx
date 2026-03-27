import { useState, useMemo } from 'react'
import { useApp } from '@/store/AppContext'
import { evaluateRules } from '@/services/rulesEngine'
import type { GoldenRule, RuleLayer, RuleSeverity } from '@/types'
import {
  Shield,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Save,
  RotateCcw,
} from 'lucide-react'

const LAYER_CONFIG: Record<RuleLayer, { label: string; color: string; desc: string }> = {
  global: { label: 'Global', color: 'text-accent', desc: 'Aplicavel a todos' },
  expeditor: { label: 'Expeditor', color: 'text-chart-3', desc: 'Regras do colaborador na operacao' },
  supervisor: { label: 'Supervisor', color: 'text-warning', desc: 'Regras de gestao de escala' },
  gerente: { label: 'Gerente', color: 'text-primary', desc: 'Regras de performance e produtividade' },
}

const SEVERITY_CONFIG: Record<RuleSeverity, { label: string; icon: typeof AlertTriangle; color: string; bg: string }> = {
  bloqueante: { label: 'Bloqueante', icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
  alerta: { label: 'Alerta', icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  informativo: { label: 'Informativo', icon: Info, color: 'text-muted-foreground', bg: 'bg-muted/30' },
}

function RuleConfigInput({ label, value, onChange, unit, type = 'number' }: {
  label: string; value: number | boolean | undefined; onChange: (v: number | boolean) => void; unit?: string; type?: string
}) {
  if (type === 'toggle') {
    return (
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <span className="text-muted-foreground">{label}</span>
      </label>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <input
        type="number"
        value={typeof value === 'number' ? value : ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-20 rounded border border-border bg-secondary px-2 py-1 text-sm text-foreground text-right"
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  )
}

export default function RegrasDeOuroPage() {
  const { state, dispatch } = useApp()
  const role = state.currentUser.role
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<GoldenRule | null>(null)
  const [activeLayer, setActiveLayer] = useState<RuleLayer | 'all'>('all')
  const [showViolations, setShowViolations] = useState(true)

  const isManager = role === 'supervisor' || role === 'gerente' || role === 'admin'

  // Evaluate current violations
  const { violations } = useMemo(
    () => evaluateRules(state, state.currentWeek),
    [state],
  )

  const filteredRules = activeLayer === 'all'
    ? state.goldenRules
    : state.goldenRules.filter(r => r.layer === activeLayer)

  const violationsByRule = useMemo(() => {
    const map: Record<string, number> = {}
    violations.forEach(v => { map[v.ruleId] = (map[v.ruleId] || 0) + 1 })
    return map
  }, [violations])

  const bloqueantes = violations.filter(v => v.severity === 'bloqueante').length
  const alertas = violations.filter(v => v.severity === 'alerta').length

  function saveRuleEdit() {
    if (!editingRule) return
    dispatch({ type: 'UPDATE_GOLDEN_RULE', payload: editingRule })
    setEditingRule(null)
  }

  function toggleRule(ruleId: string) {
    const rule = state.goldenRules.find(r => r.id === ruleId)
    if (!rule) return
    dispatch({ type: 'UPDATE_GOLDEN_RULE', payload: { ...rule, enabled: !rule.enabled } })
  }

  const empMap = useMemo(() => {
    const m: Record<string, string> = {}
    state.employees.forEach(e => { m[e.id] = e.name })
    return m
  }, [state.employees])

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:p-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Shield className="h-5 w-5 text-primary" />
          Regras de Ouro
        </h2>
        <p className="text-sm text-muted-foreground">
          Condicionantes que travam contextos por layer — cada regra conectada com sua responsabilidade
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-foreground">{state.goldenRules.filter(r => r.enabled).length}</div>
          <div className="text-[11px] text-muted-foreground">Regras Ativas</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className={`text-2xl font-bold ${bloqueantes > 0 ? 'text-destructive' : 'text-success'}`}>{bloqueantes}</div>
          <div className="text-[11px] text-muted-foreground">Bloqueantes</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className={`text-2xl font-bold ${alertas > 0 ? 'text-warning' : 'text-success'}`}>{alertas}</div>
          <div className="text-[11px] text-muted-foreground">Alertas</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-success">{state.goldenRules.filter(r => r.enabled).length - Object.keys(violationsByRule).length}</div>
          <div className="text-[11px] text-muted-foreground">Em Conformidade</div>
        </div>
      </div>

      {/* Layer filter */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {(['all', 'global', 'expeditor', 'supervisor', 'gerente'] as const).map(layer => (
          <button
            key={layer}
            onClick={() => setActiveLayer(layer)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeLayer === layer
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {layer === 'all' ? 'Todas' : LAYER_CONFIG[layer].label}
            {layer !== 'all' && (
              <span className="ml-1 opacity-60">
                ({state.goldenRules.filter(r => r.layer === layer).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Rules list */}
      <div className="space-y-2">
        {filteredRules.map(rule => {
          const layerCfg = LAYER_CONFIG[rule.layer]
          const sevCfg = SEVERITY_CONFIG[rule.severity]
          const SevIcon = sevCfg.icon
          const vCount = violationsByRule[rule.id] || 0
          const isExpanded = expandedRule === rule.id
          const isEditing = editingRule?.id === rule.id

          return (
            <div
              key={rule.id}
              className={`rounded-xl border bg-card overflow-hidden transition-all ${
                vCount > 0 ? 'border-destructive/30' : rule.enabled ? 'border-border' : 'border-border/50 opacity-60'
              }`}
            >
              {/* Rule header */}
              <div className="flex items-center gap-3 p-3 sm:p-4">
                {/* Toggle */}
                {isManager && (
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={`h-5 w-5 shrink-0 rounded-full border-2 transition-all ${
                      rule.enabled ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`}
                  >
                    {rule.enabled && <CheckCircle className="h-4 w-4 text-primary-foreground" style={{ margin: '-1px' }} />}
                  </button>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{rule.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${layerCfg.color} bg-secondary`}>
                      {layerCfg.label}
                    </span>
                    <span className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${sevCfg.color} ${sevCfg.bg}`}>
                      <SevIcon className="h-3 w-3" /> {sevCfg.label}
                    </span>
                    {vCount > 0 && (
                      <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {vCount} violacao{vCount > 1 ? 'es' : ''}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{rule.description}</p>
                </div>

                <button
                  onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                  className="shrink-0 rounded p-1 hover:bg-secondary"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-border px-3 pb-3 pt-3 sm:px-4 space-y-3">
                  {/* Current config */}
                  {!isEditing ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Configuracao atual:</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(rule.config).filter(([, v]) => v !== undefined).map(([key, val]) => (
                          <span key={key} className="rounded bg-secondary px-2 py-1 text-xs text-foreground">
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}:{' '}
                            <strong>{typeof val === 'boolean' ? (val ? 'Sim' : 'Nao') : val}</strong>
                          </span>
                        ))}
                      </div>
                      {isManager && (
                        <button
                          onClick={() => setEditingRule({ ...rule })}
                          className="mt-2 text-xs text-primary hover:underline"
                        >
                          Editar parametros
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs font-medium text-muted-foreground">Editar parametros:</div>
                      <div className="flex flex-wrap gap-3">
                        {editingRule.config.maxWeeklyHours !== undefined && (
                          <RuleConfigInput label="Max horas/semana" value={editingRule.config.maxWeeklyHours} unit="h" onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, maxWeeklyHours: v as number } } : r)} />
                        )}
                        {editingRule.config.maxOvertimeHours !== undefined && (
                          <RuleConfigInput label="Max extras" value={editingRule.config.maxOvertimeHours} unit="h" onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, maxOvertimeHours: v as number } } : r)} />
                        )}
                        {editingRule.config.breakAfterHours !== undefined && (
                          <RuleConfigInput label="Intervalo apos" value={editingRule.config.breakAfterHours} unit="h" onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, breakAfterHours: v as number } } : r)} />
                        )}
                        {editingRule.config.requireBreak !== undefined && (
                          <RuleConfigInput label="Intervalo obrigatorio" value={editingRule.config.requireBreak} type="toggle" onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, requireBreak: v as boolean } } : r)} />
                        )}
                        {editingRule.config.minStaffPerSlot !== undefined && (
                          <RuleConfigInput label="Min pessoas/slot" value={editingRule.config.minStaffPerSlot} onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, minStaffPerSlot: v as number } } : r)} />
                        )}
                        {editingRule.config.maxLateMinutes !== undefined && (
                          <RuleConfigInput label="Max atraso" value={editingRule.config.maxLateMinutes} unit="min" onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, maxLateMinutes: v as number } } : r)} />
                        )}
                        {editingRule.config.maxAbsencesPerMonth !== undefined && (
                          <RuleConfigInput label="Max faltas/mes" value={editingRule.config.maxAbsencesPerMonth} onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, maxAbsencesPerMonth: v as number } } : r)} />
                        )}
                        {editingRule.config.maxUnfilledSlots !== undefined && (
                          <RuleConfigInput label="Max vagas abertas" value={editingRule.config.maxUnfilledSlots} onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, maxUnfilledSlots: v as number } } : r)} />
                        )}
                        {editingRule.config.minProductivityPerHour !== undefined && (
                          <RuleConfigInput label="Min produtividade" value={editingRule.config.minProductivityPerHour} unit="ped/h" onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, minProductivityPerHour: v as number } } : r)} />
                        )}
                        {editingRule.config.maxProductivityPerHour !== undefined && (
                          <RuleConfigInput label="Max produtividade" value={editingRule.config.maxProductivityPerHour} unit="ped/h" onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, maxProductivityPerHour: v as number } } : r)} />
                        )}
                        {editingRule.config.maxErrorRate !== undefined && (
                          <RuleConfigInput label="Max taxa erros" value={editingRule.config.maxErrorRate} unit="%" onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, maxErrorRate: v as number } } : r)} />
                        )}
                        {editingRule.config.minSlaCompliance !== undefined && (
                          <RuleConfigInput label="Min SLA" value={editingRule.config.minSlaCompliance} unit="%" onChange={v => setEditingRule(r => r ? { ...r, config: { ...r.config, minSlaCompliance: v as number } } : r)} />
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveRuleEdit} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                          <Save className="h-3.5 w-3.5" /> Salvar
                        </button>
                        <button onClick={() => setEditingRule(null)} className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs text-foreground">
                          <RotateCcw className="h-3.5 w-3.5" /> Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Violations for this rule */}
                  {vCount > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-destructive">Violacoes esta semana:</div>
                      {violations.filter(v => v.ruleId === rule.id).map(v => (
                        <div key={v.id} className="flex items-start gap-2 rounded-lg bg-destructive/5 px-3 py-2 text-xs">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                          <div>
                            <span className="text-foreground">{v.description}</span>
                            {v.employeeId && (
                              <span className="ml-1 text-muted-foreground">({empMap[v.employeeId] || v.employeeId})</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Current week violations summary */}
      <div>
        <button
          onClick={() => setShowViolations(!showViolations)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          {showViolations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Painel de Violacoes — Semana Atual ({violations.length})
        </button>
        {showViolations && violations.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {violations.map(v => {
              const sevCfg = SEVERITY_CONFIG[v.severity]
              const SevIcon = sevCfg.icon
              return (
                <div key={v.id} className={`flex items-start gap-2 rounded-lg ${sevCfg.bg} px-3 py-2.5`}>
                  <SevIcon className={`mt-0.5 h-4 w-4 shrink-0 ${sevCfg.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{v.ruleName}</span>
                      <span className={`text-[10px] ${LAYER_CONFIG[v.layer].color}`}>{LAYER_CONFIG[v.layer].label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{v.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {showViolations && violations.length === 0 && (
          <div className="mt-2 rounded-xl border border-success/30 bg-success/5 p-4 text-center">
            <CheckCircle className="mx-auto mb-1 h-6 w-6 text-success" />
            <p className="text-sm font-medium text-success">Tudo em conformidade!</p>
            <p className="text-xs text-muted-foreground">Nenhuma violacao de regra nesta semana.</p>
          </div>
        )}
      </div>
    </div>
  )
}
