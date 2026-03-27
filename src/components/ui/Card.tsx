import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type CardVariant = 'default' | 'glass' | 'glow'

interface CardProps {
  children: ReactNode
  className?: string
  variant?: CardVariant
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-card border border-border',
  glass: 'glass',
  glow: 'glass glow-primary',
}

export function Card({ children, className, variant = 'default' }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg p-5 hover-lift',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </div>
  )
}
