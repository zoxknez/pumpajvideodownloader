"use client";
import React from 'react';
import type { UiLanguage, Translation } from '../AuthProvider';

interface Props {
  mode: 'login' | 'register';
  setMode: (m: 'login' | 'register') => void;
  copy: Translation;
  username: string; setUsername: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  confirm: string; setConfirm: (v: string) => void;
  error: string;
  submitting: boolean;
  onSubmit: () => void;
  language: UiLanguage;
  setShowInfo: (b: boolean) => void;
}

export const AuthForm: React.FC<Props> = ({
  mode, setMode, copy,
  username, setUsername,
  email, setEmail,
  password, setPassword,
  confirm, setConfirm,
  error, submitting, onSubmit,
  language, setShowInfo
}) => {
  const activeFormCopy = mode === 'login' ? copy.login : copy.register;
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !submitting) {
      e.preventDefault();
      onSubmit();
    }
  };
  return (
    <div className="flex h-full flex-col">
      <div className="text-center mb-3">
        <span className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500/30 via-blue-500/30 to-purple-500/30 border border-purple-400/50 px-5 py-1.5 text-xs font-black uppercase tracking-wider">
          ✨ {activeFormCopy.badge} ✨
        </span>
        <h2 className="mt-3 text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-100 to-blue-100">
          {activeFormCopy.title}
        </h2>
        <p className="mt-1.5 text-sm text-white/90 leading-relaxed max-w-md mx-auto px-2">
          {activeFormCopy.subtitle}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowInfo(true)}
        className="w-full rounded-xl border border-red-400/50 bg-gradient-to-r from-red-600/20 via-purple-600/20 to-blue-600/20 px-5 py-3 text-center hover:border-red-400/70 transition mb-3"
      >
        <div className="flex items-center justify-center gap-3">
          <span className="text-xl">🇷🇸</span>
          <span className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-red-300 via-white to-blue-300">
            {language === 'sr' ? 'Šta znači PUMPAJ?' : 'What does PUMPAJ mean?'}
          </span>
          <span className="text-xl">💪</span>
        </div>
        <div className="text-[11px] text-white/70 font-semibold">
          {language === 'sr' ? '🔥 Srpski pokret za istinu 🔥' : '🔥 Serbian movement for truth 🔥'}
        </div>
      </button>

      <div className="space-y-2 mb-3">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`👤 ${copy.placeholders.username}`}
          autoComplete="username"
          className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white placeholder-white/60 outline-none focus:border-purple-400/70 focus:ring-4 focus:ring-purple-400/20"
        />
        {mode === 'register' && (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`📧 ${copy.placeholders.email}`}
            autoComplete="email"
            className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white placeholder-white/60 outline-none focus:border-blue-400/70 focus:ring-4 focus:ring-blue-400/20"
          />
        )}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
            placeholder={`🔒 ${copy.placeholders.password}`}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white placeholder-white/60 outline-none focus:border-purple-400/70 focus:ring-4 focus:ring-purple-400/20"
        />
        {mode === 'register' && (
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`🔐 ${copy.placeholders.confirm}`}
            autoComplete="new-password"
            className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-white placeholder-white/60 outline-none focus:border-purple-400/70 focus:ring-4 focus:ring-purple-400/20"
          />
        )}
        {error && (
          <div className="rounded-xl border border-red-400/60 bg-red-900/30 px-4 py-2 text-sm text-red-100 font-semibold" role="alert">
            ⚠️ {error}
          </div>
        )}
      </div>

      <div className="text-center mb-2">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/80">
          <span className="w-1.5 h-1.5 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full animate-pulse" />
          {mode === 'login' ? copy.instructions.login : copy.instructions.register}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-auto">
        <button
          type="button"
          onClick={() => { setMode('login'); onSubmit(); }}
          disabled={submitting}
          className={`rounded-xl border px-5 py-3 font-black text-sm transition ${
            mode === 'login'
              ? 'border-purple-400/60 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 text-white shadow-lg'
              : 'border-purple-400/30 bg-slate-900/60 text-white/80 hover:border-purple-400/50'
          } disabled:opacity-60`}
        >
          <span className="inline-flex items-center gap-2">
            {submitting && mode === 'login' ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {activeFormCopy.submittingLabel}
              </>
            ) : (
              <>
                <span className="text-xl">🔑</span>
                {copy.tabs.login}
              </>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); onSubmit(); }}
          disabled={submitting}
          className={`rounded-xl border px-5 py-3 font-black text-sm transition ${
            mode === 'register'
              ? 'border-blue-400/60 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 text-white shadow-lg'
              : 'border-blue-400/30 bg-slate-900/60 text-white/80 hover:border-blue-400/50'
          } disabled:opacity-60`}
        >
          <span className="inline-flex items-center gap-2">
            {submitting && mode === 'register' ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {activeFormCopy.submittingLabel}
              </>
            ) : (
              <>
                <span className="text-xl">✨</span>
                {copy.tabs.register}
              </>
            )}
          </span>
        </button>
      </div>
    </div>
  );
};
