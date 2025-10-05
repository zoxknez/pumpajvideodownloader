'use client';

import { useState, useEffect } from 'react';

export default function ClearCache() {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState({ message: 'Spremno za čišćenje cache-a i reload aplikacije', type: 'info' });
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    addLog('Cache cleaner ready');
  }, []);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    setLogs(prev => [...prev, `${icon} ${message}`]);
  };

  const clearAllCache = async () => {
    setClearing(true);
    setStatus({ message: 'Čišćenje cache-a...', type: 'info' });

    try {
      // 1. Clear localStorage
      addLog('Clearing localStorage...');
      try {
        const apiOverride = localStorage.getItem('pumpaj:apiBaseOverride');
        if (apiOverride) {
          addLog('Found API override: ' + apiOverride, 'info');
        }
        localStorage.clear();
        addLog('localStorage cleared', 'success');
      } catch (e: any) {
        addLog('localStorage error: ' + e.message, 'error');
      }

      // 2. Clear sessionStorage
      addLog('Clearing sessionStorage...');
      try {
        sessionStorage.clear();
        addLog('sessionStorage cleared', 'success');
      } catch (e: any) {
        addLog('sessionStorage error: ' + e.message, 'error');
      }

      // 3. Clear cookies
      addLog('Clearing cookies...');
      try {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
          const name = cookie.split('=')[0].trim();
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;';
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=.pumpajvideodl.com;';
        }
        addLog(`${cookies.length} cookies cleared`, 'success');
      } catch (e: any) {
        addLog('Cookies error: ' + e.message, 'error');
      }

      // 4. Clear Cache Storage
      addLog('Clearing Cache Storage...');
      try {
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          addLog(`${cacheNames.length} caches deleted`, 'success');
        }
      } catch (e: any) {
        addLog('Cache Storage error: ' + e.message, 'error');
      }

      // 5. Clear IndexedDB
      addLog('Clearing IndexedDB...');
      try {
        if ('indexedDB' in window) {
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            if (db.name) {
              indexedDB.deleteDatabase(db.name);
            }
          }
          addLog(`${dbs.length} databases deleted`, 'success');
        }
      } catch (e: any) {
        addLog('IndexedDB error: ' + e.message, 'error');
      }

      // 6. Success
      setStatus({ message: '✅ Cache uspešno obrisan! Reload za 2 sekunde...', type: 'success' });
      addLog('All cache cleared successfully!', 'success');

      // 7. Hard reload
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);

    } catch (error: any) {
      setStatus({ message: '❌ Greška: ' + error.message, type: 'error' });
      addLog('Fatal error: ' + error.message, 'error');
      setClearing(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '600px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: '100%'
      }}>
        <h1 style={{ color: '#667eea', marginBottom: '20px', fontSize: '32px' }}>
          🧹 Force Cache Clear
        </h1>

        <div style={{
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '20px',
          background: status.type === 'info' ? '#e3f2fd' : status.type === 'success' ? '#e8f5e9' : '#ffebee',
          border: `2px solid ${status.type === 'info' ? '#2196f3' : status.type === 'success' ? '#4caf50' : '#f44336'}`,
          color: status.type === 'info' ? '#1976d2' : status.type === 'success' ? '#2e7d32' : '#c62828'
        }}>
          {status.message}
        </div>

        <button
          onClick={clearAllCache}
          disabled={clearing}
          style={{
            width: '100%',
            padding: '16px 32px',
            fontSize: '18px',
            fontWeight: 'bold',
            color: 'white',
            background: '#667eea',
            border: 'none',
            borderRadius: '8px',
            cursor: clearing ? 'not-allowed' : 'pointer',
            marginBottom: '12px',
            opacity: clearing ? 0.5 : 1,
            transition: 'all 0.2s'
          }}
        >
          {clearing ? '⏳ Čišćenje u toku...' : '🔄 Clear Cache & Reload'}
        </button>

        <button
          onClick={() => window.location.href = '/'}
          style={{
            width: '100%',
            padding: '16px 32px',
            fontSize: '18px',
            fontWeight: 'bold',
            color: 'white',
            background: '#4caf50',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            marginBottom: '20px',
            transition: 'all 0.2s'
          }}
        >
          ✅ Idi na App
        </button>

        {logs.length > 0 && (
          <div style={{
            maxHeight: '300px',
            overflowY: 'auto',
            background: '#f5f5f5',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontFamily: 'monospace',
            fontSize: '14px'
          }}>
            {logs.map((log, i) => (
              <div key={i} style={{ marginBottom: '8px', color: '#333' }}>
                {log}
              </div>
            ))}
          </div>
        )}

        <ul style={{
          listStyle: 'none',
          padding: 0,
          color: '#666'
        }}>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
            ✓ Briše localStorage i sessionStorage
          </li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
            ✓ Briše sve cookies
          </li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
            ✓ Briše Cache Storage API
          </li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
            ✓ Briše IndexedDB
          </li>
          <li style={{ padding: '8px 0' }}>
            ✓ Hard reload stranice
          </li>
        </ul>
      </div>
    </div>
  );
}
