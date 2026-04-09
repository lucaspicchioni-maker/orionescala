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
          <div className="w-full max-w-lg rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <h2 className="text-lg font-bold text-foreground">Erro ao carregar esta página</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Algo deu errado ao renderizar esta tela. Os dados estão salvos —
              você pode tentar recarregar ou voltar ao início.
            </p>
            {this.state.error && (
              <details className="mt-4 rounded-md bg-card/50 p-3 text-left text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  Detalhes técnicos
                </summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div className="mt-5 flex gap-2 justify-center">
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
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
