import { Component, ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import Button from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

// Catches JS errors thrown during render anywhere in its subtree and shows a small recovery
// UI instead of leaving the whole app blank/white — which is exactly what happened before
// this existed. Each major screen (a tab's internal page, a banner) gets wrapped separately
// so one broken panel can't take down the rest of the browser.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Surface it to the main process log file too, so it shows up in logs/main.log
    // instead of only ever being visible in a DevTools console someone has to open.
    console.error(`[Tora UI error${this.props.label ? ` — ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-surface-0 text-center p-10">
          <AlertOctagon size={32} className="text-red-400/70 mb-4" strokeWidth={1.5} />
          <p className="text-[14px] font-medium text-ink mb-1">Un problème est survenu dans cette vue</p>
          <p className="text-[12px] text-muted max-w-md mb-3">Cette partie de Tora n'a pas pu s'afficher. Réessayez ; si le problème persiste, redémarrez l'application.</p>
          <details className="text-[12px] text-subtle max-w-md mb-5">
            <summary className="cursor-pointer">Détails techniques</summary>
            <p className="mt-2 font-mono break-words">{this.state.message || 'Erreur inconnue'}</p>
          </details>
          <Button aria-label="Réessayer d'afficher la vue" onClick={() => this.setState({ hasError: false, message: undefined })}>
            Réessayer
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
