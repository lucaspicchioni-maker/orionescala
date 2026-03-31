import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Clock, AlertTriangle, Loader2, Zap, Calendar, MapPin } from 'lucide-react'

interface ConvocationData {
  id: string
  employeeName: string
  shiftDate: string
  shiftStart: string
  shiftEnd: string
  status: string
  deadline: string
  presenceDeadline: string
  response: string | null
  presenceResponse: string | null
}

type PageState = 'loading' | 'ready' | 'expired' | 'already_responded' | 'success' | 'error' | 'not_found'

export default function ConfirmarPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const type = searchParams.get('type') // 'presence' for presence confirmation
  const [pageState, setPageState] = useState<PageState>('loading')
  const [convocation, setConvocation] = useState<ConvocationData | null>(null)
  const [responseStatus, setResponseStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setPageState('not_found')
      return
    }
    fetchConvocation()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function fetchConvocation() {
    try {
      const res = await fetch(`/api/convocations/token/${token}`)
      if (!res.ok) {
        setPageState('not_found')
        return
      }
      const data: ConvocationData = await res.json()
      setConvocation(data)

      if (type === 'presence') {
        if (data.presenceResponse) {
          setResponseStatus(data.presenceResponse)
          setPageState('already_responded')
        } else if (data.status !== 'confirmed') {
          setPageState('error')
          setErrorMsg('Esta convocacao nao esta confirmada.')
        } else {
          setPageState('ready')
        }
      } else {
        if (data.status !== 'pending') {
          setResponseStatus(data.response || data.status)
          setPageState('already_responded')
        } else {
          const now = new Date()
          const deadline = new Date(data.deadline)
          if (now > deadline) {
            setPageState('expired')
          } else {
            setPageState('ready')
          }
        }
      }
    } catch {
      setPageState('error')
      setErrorMsg('Erro ao carregar convocacao.')
    }
  }

  async function handleResponse(response: string) {
    if (!token) return
    setSubmitting(true)

    try {
      const endpoint = type === 'presence' ? '/api/convocations/presence' : '/api/convocations/confirm'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, response }),
      })
      const data = await res.json()

      if (data.ok) {
        setResponseStatus(response)
        setPageState('success')
      } else if (data.expired) {
        setPageState('expired')
      } else if (data.alreadyResponded) {
        setResponseStatus(data.presenceResponse || data.status || response)
        setPageState('already_responded')
      } else {
        setErrorMsg(data.error || 'Erro ao registrar resposta.')
        setPageState('error')
      }
    } catch {
      setErrorMsg('Erro de conexao. Tente novamente.')
      setPageState('error')
    } finally {
      setSubmitting(false)
    }
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  }

  function calculateDuration(start: string, end: string): string {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    let startMin = sh * 60 + (sm || 0)
    let endMin = eh * 60 + (em || 0)
    if (endMin <= startMin) endMin += 24 * 60
    const total = endMin - startMin
    const hours = Math.floor(total / 60)
    const mins = total % 60
    return mins > 0 ? `${hours}h${mins}min` : `${hours}h`
  }

  function formatDeadline(deadline: string): string {
    const d = new Date(deadline)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const isPresence = type === 'presence'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Zap className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mt-3 text-gradient text-2xl font-black">Orion Escala</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPresence ? 'Confirmacao de Presenca' : 'Confirmacao de Convocacao'}
          </p>
        </div>

        {/* Loading */}
        {pageState === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        )}

        {/* Not found */}
        {pageState === 'not_found' && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-warning" />
            <h2 className="mt-4 text-lg font-bold text-foreground">Link invalido</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link de convocacao nao foi encontrado ou ja expirou.
            </p>
          </div>
        )}

        {/* Expired */}
        {pageState === 'expired' && convocation && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Clock className="mx-auto h-12 w-12 text-warning" />
            <h2 className="mt-4 text-lg font-bold text-foreground">Prazo expirado</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              O prazo para responder esta convocacao ja expirou.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Prazo era: {formatDeadline(convocation.deadline)}
            </p>
          </div>
        )}

        {/* Already responded */}
        {pageState === 'already_responded' && convocation && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-success" />
            <h2 className="mt-4 text-lg font-bold text-foreground">Ja respondido</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Voce ja respondeu esta convocacao.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              Status: {responseStatus}
            </div>
          </div>
        )}

        {/* Success */}
        {pageState === 'success' && convocation && (
          <div className="rounded-xl border border-success/30 bg-success/5 p-8 text-center animate-fade-in">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-10 w-10 text-success" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-foreground">
              {responseStatus === 'sim' || responseStatus === 'presente'
                ? 'Confirmado!'
                : 'Resposta registrada'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {responseStatus === 'sim'
                ? 'Sua presenca esta confirmada. Voce recebera um lembrete 2h antes do turno.'
                : responseStatus === 'presente'
                  ? 'Presenca confirmada! Bom turno!'
                  : 'Sua resposta foi registrada. Obrigado por avisar.'}
            </p>
            {(responseStatus === 'sim' || responseStatus === 'presente') && (
              <div className="mt-4 rounded-lg bg-card border border-border p-4">
                <p className="text-sm font-medium text-foreground">
                  {formatDate(convocation.shiftDate)}
                </p>
                <p className="text-lg font-bold text-primary">
                  {convocation.shiftStart} - {convocation.shiftEnd}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {pageState === 'error' && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-lg font-bold text-foreground">Erro</h2>
            <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
          </div>
        )}

        {/* Ready — show convocation details and buttons */}
        {pageState === 'ready' && convocation && (
          <div className="space-y-4 animate-fade-in">
            {/* Shift info card */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-bold text-foreground">{convocation.employeeName}</h2>

              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">
                      {formatDate(convocation.shiftDate)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {convocation.shiftStart} - {convocation.shiftEnd}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Duracao: {calculateDuration(convocation.shiftStart, convocation.shiftEnd)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-primary shrink-0" />
                  <p className="text-sm text-muted-foreground">Cozinha Orion</p>
                </div>

                {!isPresence && (
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Prazo: {formatDeadline(convocation.deadline)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleResponse(isPresence ? 'presente' : 'sim')}
                disabled={submitting}
                className="flex flex-col items-center gap-2 rounded-xl bg-success/10 border-2 border-success/30 px-4 py-6 text-success transition-all hover:bg-success/20 active:scale-95 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <CheckCircle className="h-8 w-8" />
                )}
                <span className="text-sm font-bold">
                  {isPresence ? 'Estou Presente' : 'Confirmar'}
                </span>
              </button>

              <button
                onClick={() => handleResponse(isPresence ? 'ausente' : 'nao')}
                disabled={submitting}
                className="flex flex-col items-center gap-2 rounded-xl bg-destructive/10 border-2 border-destructive/30 px-4 py-6 text-destructive transition-all hover:bg-destructive/20 active:scale-95 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <XCircle className="h-8 w-8" />
                )}
                <span className="text-sm font-bold">
                  {isPresence ? 'Nao Posso' : 'Recusar'}
                </span>
              </button>
            </div>

            {!isPresence && (
              <p className="text-center text-xs text-muted-foreground">
                Ao confirmar e nao comparecer, aplica-se multa de 50% do valor do turno (Art. 452-A CLT).
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
