import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Captura erros em runtime das páginas filhas e exibe uma tela de erro
 * amigável em vez de o React desmontar a árvore inteira.
 *
 * Use em nível de rota: envolve cada <Route element={...}> para que um erro
 * numa página não derrube o AppShell inteiro.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="w-full max-w-2xl rounded-xl border border-destructive/40 bg-destructive/5 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-8 w-8 shrink-0 text-destructive" />
              <div className="flex-1">
                <h2 className="text-lg font-bold text-foreground">Erro ao carregar esta página</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Algo deu errado ao renderizar esta tela. Isto é um bug.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="mt-4 rounded-lg bg-card/80 p-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                  Erro
                </p>
                <p className="mt-1 font-mono text-sm text-foreground break-words">
                  {this.state.error.message || String(this.state.error)}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Stack trace
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-tight text-muted-foreground">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RotateCcw className="h-4 w-4" /> Tentar novamente
              </button>
              <a
                href="/"
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/80 transition-colors"
              >
                Voltar ao início
              </a>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(
                    `${this.state.error?.message}\n\n${this.state.errorInfo?.componentStack ?? ''}`,
                  )
                }}
                className="rounded-lg bg-secondary/50 px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                Copiar erro
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
