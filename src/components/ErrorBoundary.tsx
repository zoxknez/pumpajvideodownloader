import { Component, ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message?: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: unknown): State {
    const msg = err instanceof Error ? err.message : String(err);
    return { hasError: true, message: msg };
  }
  componentDidCatch(err: unknown) {
    console.error('UI error', err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen grid place-items-center bg-slate-900 text-slate-200 p-6">
          <div className="max-w-lg w-full bg-slate-800/70 border border-slate-700 rounded-xl p-6">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-slate-400 text-sm mb-4">{this.state.message}</p>
            <button className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600" onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
