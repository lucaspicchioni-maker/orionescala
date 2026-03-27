import { useState } from 'react'
import {
  Target,
  Clock,
  Zap,
  AlertCircle,
  Headphones,
  Users,
  CalendarCheck,
  Timer,
  Thermometer,
  Sparkles,
  Package,
  RotateCcw,
  DollarSign,
  BarChart3,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { ElementType } from 'react'

interface KPIItem {
  label: string
  value: number
  unit: string
  target?: string
  icon: ElementType
  trend: 'up' | 'down' | 'stable'
}

const TABS = [
  { key: 'colaborador', label: 'Colaborador' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'gerente', label: 'Gerente' },
] as const

type TabKey = (typeof TABS)[number]['key']

const KPI_DATA: Record<TabKey, KPIItem[]> = {
  colaborador: [
    {
      label: 'Assiduidade',
      value: 92,
      unit: '%',
      target: '95%',
      icon: Target,
      trend: 'down',
    },
    {
      label: 'Pontualidade',
      value: 88,
      unit: '%',
      target: '95%',
      icon: Clock,
      trend: 'down',
    },
    {
      label: 'Produtividade',
      value: 24,
      unit: 'ped/h',
      target: '30 ped/h',
      icon: Zap,
      trend: 'up',
    },
    {
      label: 'Indice de Erros',
      value: 2.1,
      unit: '%',
      target: '<1%',
      icon: AlertCircle,
      trend: 'down',
    },
    {
      label: 'SLA Atendimento',
      value: 94,
      unit: '%',
      target: '95%',
      icon: Headphones,
      trend: 'up',
    },
  ],
  supervisor: [
    {
      label: 'Assiduidade Media',
      value: 91,
      unit: '%',
      icon: Users,
      trend: 'down',
    },
    {
      label: '% Preenchimento Escala',
      value: 97,
      unit: '%',
      icon: CalendarCheck,
      trend: 'up',
    },
    {
      label: 'Tempo Fechamento Escala',
      value: 4,
      unit: 'h',
      icon: Timer,
      trend: 'stable',
    },
    {
      label: 'Conformidade Limpeza',
      value: 93,
      unit: '%',
      icon: Sparkles,
      trend: 'up',
    },
    {
      label: 'Controle Temperatura',
      value: 100,
      unit: '%',
      icon: Thermometer,
      trend: 'up',
    },
  ],
  gerente: [
    {
      label: 'SLA Operacao',
      value: 94.2,
      unit: '%',
      target: '95%',
      icon: BarChart3,
      trend: 'up',
    },
    {
      label: 'Tempo Processamento',
      value: 12,
      unit: 'min',
      icon: Timer,
      trend: 'stable',
    },
    {
      label: 'Taxa Reembolso',
      value: 0.4,
      unit: '%',
      target: '<0.5%',
      icon: RotateCcw,
      trend: 'up',
    },
    {
      label: 'Custo/Pedido',
      value: 0.86,
      unit: 'R$',
      icon: DollarSign,
      trend: 'stable',
    },
    {
      label: 'Produtividade Media',
      value: 22,
      unit: 'ped/h/pessoa',
      icon: Package,
      trend: 'up',
    },
  ],
}

export default function KPIsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('colaborador')

  const metrics = KPI_DATA[activeTab]

  return (
    <div className="animate-fade-in space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">KPIs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Indicadores de desempenho por nivel
        </p>
      </div>

      {/* Tabs */}
      <Card className="p-0 overflow-hidden">
        <div className="flex border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'relative flex-1 px-4 py-3 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="relative">
            <MetricCard
              label={m.label}
              value={m.value}
              unit={m.unit}
              icon={m.icon}
              trend={m.trend}
              subtitle={m.target ? `Meta: ${m.target}` : undefined}
            />
            {m.target && (
              <Badge
                variant={
                  m.trend === 'up' ? 'success' : m.trend === 'down' ? 'warning' : 'muted'
                }
                size="sm"
                className="absolute right-3 top-3"
              >
                {m.target}
              </Badge>
            )}
          </div>
        ))}
      </div>

      {/* Info card */}
      <Card variant="glass">
        <p className="text-xs text-muted-foreground">
          Os KPIs sao atualizados semanalmente com base nos dados de operacao, presenca e
          qualidade. Metricas em{' '}
          <span className="text-warning">amarelo</span> indicam valores abaixo
          da meta. Metricas em{' '}
          <span className="text-success">verde</span> indicam conformidade.
        </p>
      </Card>
    </div>
  )
}
