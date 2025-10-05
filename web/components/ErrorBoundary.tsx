'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('Uncaught error in ErrorBoundary', error, info);
    }
  }

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      return fallback?.(error) ?? (
        <div className="rounded-3xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100">
          <h2 className="text-lg font-semibold">Nešto je pošlo po zlu</h2>
          <p className="mt-2 opacity-90">
            Pokušajte ponovo osvežavanjem stranice. Ako problem ostane, proverite logove servera.
          </p>
        </div>
      );
    }

    return children;
  }
}
