"use client";
import React from 'react';
import { LANGUAGE_SEQUENCE } from '../AuthProvider';
import type { UiLanguage } from '../AuthProvider';

interface Props {
  language: UiLanguage;
  onChange: (lang: UiLanguage) => void;
  copy: any; // narrowed usage internally only
}

export const LanguageSwitch: React.FC<Props> = ({ language, onChange, copy }) => {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/20 bg-slate-900/60 p-1" aria-label={copy.language.switchLabel}>
      {LANGUAGE_SEQUENCE.map((code) => {
        const option = copy.language.options[code];
        const isActive = language === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            className={`rounded px-2 py-1 text-sm font-black transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
              isActive
                ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white shadow'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
            aria-pressed={isActive}
            aria-label={`${copy.language.switchTo} ${option.title}`}
            title={option.title}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
};
