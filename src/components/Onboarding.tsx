import { useState } from 'react'
import { useApp } from '@/store/AppContext'
import { Calendar, Clock, TrendingUp, Bell, ChevronRight, Check } from 'lucide-react'

interface Step {
  icon: typeof Calendar
  title: string
  description: string
  roles: ('colaborador' | 'supervisor' | 'gerente' | 'rh')[]
}

const STEPS: Step[] = [
  {
    icon: Calendar,
    title: 'Escala Inteligente',
    description: 'Gerencie escalas semanais com alocacao por hora. Publique e notifique automaticamente.',
    roles: ['supervisor', 'gerente'],
  },
  {
    icon: Calendar,
    title: 'Sua Escala',
    description: 'Veja seus turnos da semana, confirme presenca e solicite trocas diretamente pelo app.',
    roles: ['colaborador'],
  },
  {
    icon: Clock,
    title: 'Ponto Digital',
    description: 'Check-in com geolocalizacao. Registre entrada e saida com validacao automatica de local.',
    roles: ['colaborador', 'supervisor', 'gerente'],
  },
  {
    icon: TrendingUp,
    title: 'Produtividade & Metas',
    description: 'Acompanhe pedidos, erros, SLA e tempo de expedicao. Bata metas e ganhe premios!',
    roles: ['colaborador', 'supervisor', 'gerente'],
  },
  {
    icon: Bell,
    title: 'Notificacoes',
    description: 'Receba alertas de turno, lembretes e notificacoes de escala pelo app e WhatsApp.',
    roles: ['colaborador', 'supervisor', 'gerente'],
  },
]

export function Onboarding() {
  const { state, dispatch } = useApp()
  const [currentStep, setCurrentStep] = useState(0)

  if (state.onboardingDone) return null

  const role = state.currentUser.role
  const filteredSteps = role === 'admin' ? STEPS.filter(s => s.roles.includes('gerente')) : STEPS.filter(s => s.roles.includes(role))
  const step = filteredSteps[currentStep]
  const isLast = currentStep === filteredSteps.length - 1

  function next() {
    if (isLast) {
      dispatch({ type: 'SET_ONBOARDING_DONE', payload: true })
    } else {
      setCurrentStep(c => c + 1)
    }
  }

  function skip() {
    dispatch({ type: 'SET_ONBOARDING_DONE', payload: true })
  }

  if (!step) return null
  const Icon = step.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
      <div className="w-full max-w-sm space-y-6 text-center animate-fade-in">
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {filteredSteps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep ? 'w-6 bg-primary' : i < currentStep ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="h-10 w-10 text-primary" />
        </div>

        {/* Content */}
        <div>
          <h2 className="text-xl font-bold text-foreground">{step.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={next}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            {isLast ? (
              <>
                <Check className="h-4 w-4" /> Comecar!
              </>
            ) : (
              <>
                Proximo <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
          {!isLast && (
            <button
              onClick={skip}
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Pular tutorial
            </button>
          )}
        </div>

        {/* Role badge */}
        <div className="text-[11px] text-muted-foreground">
          Voce esta logado como <span className="font-medium text-primary">{role}</span>
        </div>
      </div>
    </div>
  )
}
