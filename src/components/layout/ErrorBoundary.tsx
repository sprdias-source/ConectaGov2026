import { Component, type ReactNode } from 'react'
import { AlertOctagon, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Rede de seguranca final: se qualquer componente da arvore lancar uma
 * excecao nao tratada durante o render (ex: um campo inesperado vindo do
 * banco, um calculo com dado nulo que nao previmos), o React por padrao
 * desmonta a arvore inteira e mostra uma tela branca, sem nenhuma
 * explicacao - inaceitavel em um sistema usado para gerir dinheiro real.
 *
 * Esta Error Boundary garante que o usuario sempre veja uma mensagem
 * clara e um caminho de recuperacao (recarregar), em vez de uma tela
 * branca sem explicacao. Os dados em si nunca sao perdidos por isso -
 * eles vivem no banco, nao na memoria do navegador.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[ErrorBoundary] Erro nao tratado capturado:', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-base-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-base-900 border border-negative-500/30 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-negative-500/15 flex items-center justify-center mx-auto mb-4">
              <AlertOctagon className="w-6 h-6 text-negative-400" />
            </div>
            <h2 className="font-display font-bold text-base-100 mb-2">Algo deu errado nesta tela</h2>
            <p className="text-[13px] text-base-400 mb-1">
              Seus dados estão seguros — eles ficam guardados no banco de dados, não nesta página.
            </p>
            <p className="text-[12px] text-base-500 mb-5 font-mono bg-base-850 rounded-lg p-2 break-words">
              {this.state.error.message}
            </p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 text-base-950 font-bold text-sm px-4 py-2.5 rounded-lg transition"
            >
              <RefreshCw className="w-4 h-4" /> Recarregar o sistema
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
