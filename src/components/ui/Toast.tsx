import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const styles: Record<ToastType, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-primary/30 bg-primary/10 text-primary',
}

let idCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((type: ToastType, message: string) => {
    const id = ++idCounter
    setToasts(prev => [...prev, { id, type, message }])
  }, [])

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <ToastNotification key={t.id} item={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastNotification({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  const Icon = icons[item.type]

  useEffect(() => {
    const timer = setTimeout(() => onRemove(item.id), 4000)
    return () => clearTimeout(timer)
  }, [item.id, onRemove])

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-md animate-fade-in',
        styles[item.type],
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="text-sm font-medium flex-1">{item.message}</span>
      <button onClick={() => onRemove(item.id)} className="shrink-0 opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
