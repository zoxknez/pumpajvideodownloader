/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/ToastProvider';
import { SettingsProvider } from './components/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, LoginGate } from './components/AuthProvider';
import './index.css';
import { initRandomSingleBounce } from './lib/singleBounce';

function Root() {
  useEffect(() => {
    // Cycle bounce on elements with the .attention-icon class
    const dispose = initRandomSingleBounce('.attention-icon', 3200);
    return () => dispose();
  }, []);
  return (
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <SettingsProvider>
            <ToastProvider>
              <LoginGate>
                <App />
              </LoginGate>
            </ToastProvider>
          </SettingsProvider>
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
