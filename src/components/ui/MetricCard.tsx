import { useEffect, useRef, useState, type ElementType } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from './Card'

type Trend = 'up' | 'down' | 'stable'

interface MetricCardProps {
  label: string
  value: number
  unit?: string
  trend?: Trend
  icon?: ElementType
  subtitle?: string
  className?: string
}

const trendConfig: Record<Trend, { icon: ElementType; color: string }> = {
  up: { icon: TrendingUp, color: 'text-success' },
  down: { icon: TrendingDown, color: 'text-destructive' },
  stable: { icon: Minus, color: 'text-muted-foreground' },
}

function useAnimatedNumber(target: number, duration = 800) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const from = 0

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(from + (target - from) * eased)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}

function formatDisplay(value: number, target: number): string {
  if (Number.isInteger(target)) {
    return Math.round(value).toLocaleString('pt-BR')
  }
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function MetricCard({
  label,
  value,
  unit,
  trend = 'stable',
  icon: Icon,
  subtitle,
  className,
}: MetricCardProps) {
  const animated = useAnimatedNumber(value)
  const { icon: TrendIcon, color: trendColor } = trendConfig[trend]

  return (
    <Card variant="glass" className={cn('animate-fade-in', className)}>
      <div className="flex items-start justify-between">
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-[18px] w-[18px] text-primary" />
          </div>
        )}
        <div className={cn('flex items-center gap-1', trendColor)}>
          <TrendIcon className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4">
        <span className="text-2xl font-bold tracking-tight text-foreground">
          {formatDisplay(animated, value)}
        </span>
        {unit && (
          <span className="ml-1 text-sm text-muted-foreground">{unit}</span>
        )}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{label}</p>

      {subtitle && (
        <p className="mt-0.5 text-xs text-muted-foreground/70">{subtitle}</p>
      )}
    </Card>
  )
}
