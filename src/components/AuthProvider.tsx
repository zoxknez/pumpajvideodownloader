/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../lib/api';

export type Plan = 'FREE' | 'PREMIUM';
export type Policy = {
  plan: Plan;
  maxHeight: number;
  maxAudioKbps: number;
  playlistMax: number;
  batchMax: number;
  concurrentJobs: number;
  allowSubtitles: boolean;
  allowChapters: boolean;
  allowMetadata: boolean;
  speedLimitKbps?: number;
};

type User = { id: string; email?: string; username?: string; plan: Plan } | null;
type LoginPayload = { username: string; password: string };
type RegisterPayload = { username: string; password: string; email?: string };

const POLICY_DEFAULTS: Record<Plan, Policy> = {
  FREE: {
    plan: 'FREE',
    maxHeight: 720,
    maxAudioKbps: 128,
    playlistMax: 10,
    batchMax: 2,
    concurrentJobs: 1,
    allowSubtitles: false,
    allowChapters: false,
    allowMetadata: false,
  },
  PREMIUM: {
    plan: 'PREMIUM',
    maxHeight: 4320,
    maxAudioKbps: 320,
    playlistMax: 300,
    batchMax: 10,
    concurrentJobs: 4,
    allowSubtitles: true,
    allowChapters: true,
    allowMetadata: true,
  },
};
type AuthCtx = {
  me: User;
  policy: Policy | null;
  token: string | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  setToken: (value: string | null) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

type UiLanguage = 'sr' | 'en';

type MovementSection = {
  heading: string;
  paragraphs: string[];
};

type Translation = {
  hero: {
    badge: string;
    title: string;
    intro: string;
    highlights: Array<{ title: string; desc: string }>;
    tiles: Array<{ label: string; title: string; description: string }>;
  };
  login: {
    badge: string;
    title: string;
    subtitle: string;
    primaryButton: string;
    submittingLabel: string;
  };
  register: {
    badge: string;
    title: string;
    subtitle: string;
    primaryButton: string;
    submittingLabel: string;
  };
  tabs: {
    login: string;
    register: string;
  };
  placeholders: {
    username: string;
    email: string;
    password: string;
    confirm: string;
  };
  instructions: {
    login: string;
    register: string;
  };
  errors: {
    missingCredentials: string;
    passwordTooShort: string;
    passwordMismatch: string;
    operationFailed: string;
  };
  status: {
    loadingAccount: string;
    checkingSession: string;
  };
  language: {
    switchLabel: string;
    switchTo: string;
    options: Record<UiLanguage, { short: string; title: string }>;
  };
  movement: {
    badge: string;
    title: string;
    sections: MovementSection[];
  };
};

const UI_COPY: Record<UiLanguage, Translation> = {
  sr: {
    hero: {
      badge: 'Pumpaj Premium',
      title: 'Media Downloader Hub',
      intro: 'Preuzimaj video, audio, plej liste i titlove brže nego ikad. Jedan nalog, sve mogućnosti – bez čekanja i bez kompromisa.',
      highlights: [
        { title: 'Ultra brzi download', desc: 'Bez ograničenja brzine za svaki nalog.' },
        { title: 'Batch & Queue magija', desc: 'Pametno upravljanje redovima, pauza i nastavak.' },
        { title: 'Premium alati', desc: 'Sačuvaj plej liste, audio-only ekstrakcije i titlove.' },
      ],
      tiles: [
        { label: 'Realtime SSE', title: 'Živi progres', description: 'Status, brzina i ETA u jednom pogledu.' },
        { label: 'Desktop & Web', title: 'Dual-mode', description: 'Electron aplikacija + web iskustvo.' },
      ],
    },
    login: {
      badge: 'Dobrodošao nazad',
      title: 'Prijavi se i nastavi preuzimanje',
      subtitle: 'Unesi korisničko ime i lozinku i nastavi tamo gde si stao.',
      primaryButton: 'Prijavi se',
      submittingLabel: 'Prijavljivanje…',
    },
    register: {
      badge: 'Kreiraj nalog',
      title: 'Beskonačan premium od prvog dana',
      subtitle: 'Registruj nalog za tren – svi korisnici dobijaju kompletan premium paket automatski.',
      primaryButton: 'Registruj se',
      submittingLabel: 'Kreiranje naloga…',
    },
    tabs: {
      login: 'Prijava',
      register: 'Registracija',
    },
    placeholders: {
      username: 'korisničko ime',
      email: 'email@domena.com',
      password: 'lozinka',
      confirm: 'potvrdi lozinku',
    },
    instructions: {
      login: 'Nemaš nalog? Prebaci se na karticu „Registracija” iznad i popuni formu – svi dobijaju premium pristup automatski.',
      register: 'Već imaš nalog? Izaberi „Prijava” iznad i uloguj se za nekoliko sekundi.',
    },
    errors: {
      missingCredentials: 'Unesi korisničko ime i lozinku.',
      passwordTooShort: 'Lozinka mora imati najmanje 6 karaktera.',
      passwordMismatch: 'Lozinke se ne poklapaju.',
      operationFailed: 'Operacija nije uspela.',
    },
    status: {
      loadingAccount: 'Učitavanje naloga…',
      checkingSession: 'Provera sesije…',
    },
    language: {
      switchLabel: 'Promena jezika',
      switchTo: 'Prebaci na',
      options: {
        sr: { short: 'SR', title: 'Srpski' },
        en: { short: 'EN', title: 'Engleski' },
      },
    },
    movement: {
      badge: 'PUMPAJ poruka',
      title: 'Pokret koji pojačava istinu',
      sections: [
        {
          heading: 'Šta je PUMPAJ?',
          paragraphs: [
            'PUMPAJ znači: pojačaj istinu i tempo. Ne staj. Drži ritam i budi uporan.',
            'To je naš kratki znak istrajnosti i borbe za bolju budućnost.',
          ],
        },
        {
          heading: 'Zašto protestujemo?',
          paragraphs: [
            'Novi Sad, 1. 11. 2024. – pad nadstrešnice na železničkoj stanici, gde je ubijeno 16 ljudi.',
            'Tražimo punu istinu i procesuiranje odgovornih za ovaj zločin.',
            'Korupcija i bezakonje – nameštanje poslova, katastrofalno izvođenje radova i zloupotrebe na svakom koraku.',
            'Tražimo pravnu državu u kojoj vlada zakon, a ne kriminal.',
          ],
        },
        {
          heading: 'Naš poziv',
          paragraphs: [
            'PUMPAJ = pravda, odgovornost i jednakost za sve.',
          ],
        },
      ],
    },
  },
  en: {
    hero: {
      badge: 'Pumpaj Premium',
      title: 'Media Downloader Hub',
      intro: 'Download video, audio, playlists, and subtitles faster than ever. One account, all features—no waiting and no limits.',
      highlights: [
        { title: 'Blazing-fast downloads', desc: 'No throttling, full speed for every account.' },
        { title: 'Batch & queue magic', desc: 'Smart queue control with pause and resume.' },
        { title: 'Premium tools', desc: 'Save playlists, extract audio-only, and keep subtitles.' },
      ],
      tiles: [
        { label: 'Realtime SSE', title: 'Live progress', description: 'Status, speed, and ETA at a glance.' },
        { label: 'Desktop & Web', title: 'Dual-mode', description: 'Electron app plus polished web experience.' },
      ],
    },
    login: {
      badge: 'Welcome back',
      title: 'Sign in and keep downloading',
      subtitle: 'Enter your username and password to pick up right where you left off.',
      primaryButton: 'Sign in',
      submittingLabel: 'Signing in…',
    },
    register: {
      badge: 'Create your account',
      title: 'Unlimited premium from day one',
      subtitle: 'Register instantly—every new member receives the full premium bundle automatically.',
      primaryButton: 'Sign up',
      submittingLabel: 'Creating account…',
    },
    tabs: {
      login: 'Sign in',
      register: 'Register',
    },
    placeholders: {
      username: 'username',
      email: 'email@domain.com',
      password: 'password',
      confirm: 'confirm password',
    },
    instructions: {
      login: 'No account yet? Switch to the “Register” tab above and fill out the form—everyone gets premium access automatically.',
      register: 'Already have an account? Choose “Sign in” above and you’ll be in within seconds.',
    },
    errors: {
      missingCredentials: 'Enter your username and password.',
      passwordTooShort: 'Password must be at least 6 characters long.',
      passwordMismatch: 'Passwords do not match.',
      operationFailed: 'The operation failed.',
    },
    status: {
      loadingAccount: 'Loading account…',
      checkingSession: 'Checking session…',
    },
    language: {
      switchLabel: 'Language',
      switchTo: 'Switch to',
      options: {
        sr: { short: 'SR', title: 'Serbian' },
        en: { short: 'EN', title: 'English' },
      },
    },
    movement: {
      badge: 'PUMPAJ Message',
      title: 'A movement amplifying the truth',
      sections: [
        {
          heading: 'What is PUMPAJ?',
          paragraphs: [
            'PUMPAJ means: amplify the truth and the tempo. Don’t stop. Keep the pace and stay persistent.',
            'It’s our short call for perseverance and a better future.',
          ],
        },
        {
          heading: 'Why do we protest?',
          paragraphs: [
            'Novi Sad, Nov 1, 2024 – the collapse of the railway station canopy, where 16 people were killed.',
            'We demand the full truth and the prosecution of those responsible for this crime.',
            'Corruption and lawlessness – rigged contracts, disastrous workmanship, and abuses at every step.',
            'We demand a state governed by the rule of law, not by crime.',
          ],
        },
        {
          heading: 'Our call',
          paragraphs: [
            'PUMPAJ = justice, accountability, and equality for all.',
          ],
        },
      ],
    },
  },
};

const LANGUAGE_SEQUENCE: UiLanguage[] = ['sr', 'en'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isBrowser = typeof window !== 'undefined';
  const isIpc = isBrowser && Boolean((window as any).api?.auth);
  const [token, setTokenState] = useState<string | null>(() => {
    if (!isBrowser) return null;
    try { return localStorage.getItem('app:token'); } catch { return null; }
  });
  const [me, setMe] = useState<User>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const setToken = useCallback((value: string | null) => {
    setTokenState(value);
    if (!isBrowser) return;
    try {
      if (value) localStorage.setItem('app:token', value);
      else localStorage.removeItem('app:token');
    } catch {}
  }, [isBrowser]);

  const fetchMe = useCallback(async (tok: string) => {
    const res = await fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) throw new Error('unauthorized');
    const data = await res.json();
    const user = normalizeUser(data.user) || null;
    setMe(user);
    if (data?.policy) setPolicy(data.policy as Policy);
    else setPolicy(derivePolicy(user?.plan));
  }, []);

  useEffect(() => {
    if (isIpc) {
      setLoading(true);
      (async () => {
        try {
          const res = await (window as any).api?.auth?.whoami?.();
          if (res?.ok && res.user) {
            const user = normalizeUser(res.user);
            setMe(user);
            setPolicy(derivePolicy(user?.plan));
          } else {
            setMe(null);
            setPolicy(null);
          }
        } finally {
          setLoading(false);
        }
      })();
      const unsubscribe = (window as any).api?.auth?.onState?.((payload: any) => {
        const user = normalizeUser(payload?.user) || null;
        setMe(user);
        setPolicy(user ? derivePolicy(user.plan) : null);
      });
  return () => { unsubscribe?.(); };
    }
    if (!token) {
      setMe(null);
      setPolicy(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMe(token)
      .catch(() => {
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [isIpc, token, fetchMe, setToken]);

  const login = useCallback(async ({ username, password }: LoginPayload) => {
    const name = String(username || '').trim();
    const pwd = String(password || '');
    if (!name || !pwd) throw new Error('missing_credentials');
    if (isIpc) {
      const res = await (window as any).api?.auth?.login?.({ username: name, password: pwd });
      if (!res?.ok) throw new Error(res?.error || 'login_failed');
      const user = normalizeUser(res.user);
      setMe(user);
      setPolicy(derivePolicy(user?.plan));
      try { localStorage.setItem('app:lastUsername', name); } catch {}
      return;
    }
    const res = await fetch(authUrl('/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: name, password: pwd }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `login_failed_${res.status}`);
    }
    const data = await res.json().catch(() => ({}));
    if (data?.token) {
      setToken(data.token);
      await fetchMe(data.token);
    } else if (token) {
      await fetchMe(token);
    }
    try { localStorage.setItem('app:lastUsername', name); } catch {}
  }, [isIpc, fetchMe, setToken, token]);

  const register = useCallback(async ({ username, password, email }: RegisterPayload) => {
    const name = String(username || '').trim();
    const mail = email ? String(email).trim() : undefined;
    const pwd = String(password || '');
    if (!name || !pwd) throw new Error('missing_credentials');
    if (pwd.length < 6) throw new Error('password_too_short');
    if (isIpc) {
      const res = await (window as any).api?.auth?.register?.({ username: name, password: pwd, email: mail });
      if (!res?.ok) throw new Error(res?.error || 'register_failed');
      await login({ username: name, password: pwd });
      if (mail) { try { localStorage.setItem('app:lastEmail', mail); } catch {} }
      return;
    }
    const res = await fetch(authUrl('/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: name, password: pwd, email: mail }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `register_failed_${res.status}`);
    }
    const data = await res.json().catch(() => ({}));
    if (data?.token) {
      setToken(data.token);
      await fetchMe(data.token);
    } else {
      await login({ username: name, password: pwd });
    }
    try {
      localStorage.setItem('app:lastUsername', name);
      if (mail) localStorage.setItem('app:lastEmail', mail);
    } catch {}
  }, [isIpc, login, fetchMe, setToken]);

  const logout = useCallback(async () => {
    if (isIpc) {
      try { await (window as any).api?.auth?.logout?.(); } catch {}
    } else {
      try {
        await fetch(authUrl('/logout'), { method: 'POST', credentials: 'include' });
      } catch {}
    }
    setToken(null);
    setMe(null);
    setPolicy(null);
  }, [isIpc, setToken]);

  const ctxValue = useMemo(() => ({ me, policy, token, loading, login, register, logout, setToken }), [me, policy, token, loading, login, register, logout, setToken]);

  return <Ctx.Provider value={ctxValue}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function usePolicy(defaultPlan: Plan = 'PREMIUM') {
  const { policy } = useAuth();
  return policy ?? POLICY_DEFAULTS[defaultPlan];
}

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { me, login, register, loading } = useAuth();
  const isBrowser = typeof window !== 'undefined';
  const isIpc = isBrowser && Boolean((window as any).api?.auth);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [language, setLanguage] = useState<UiLanguage>('en');
  const copy = useMemo(() => UI_COPY[language], [language]);
  const activeFormCopy = mode === 'login' ? copy.login : copy.register;
  const [username, setUsername] = useState<string>(() => {
    if (!isBrowser) return '';
    try { return localStorage.getItem('app:lastUsername') || ''; } catch { return ''; }
  });
  const [email, setEmail] = useState<string>(() => {
    if (!isBrowser) return '';
    try { return localStorage.getItem('app:lastEmail') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !submitting) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setError('');
    const name = username.trim();
    const mail = mode === 'register' ? email.trim() : '';
    const pwd = password;
    if (!name || !pwd) {
      setError(copy.errors.missingCredentials);
      return;
    }
    if (mode === 'register') {
      if (pwd.length < 6) { setError(copy.errors.passwordTooShort); return; }
      if (pwd !== confirm) { setError(copy.errors.passwordMismatch); return; }
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ username: name, password: pwd });
      } else {
        await register({ username: name, password: pwd, email: mail || undefined });
      }
      try {
        localStorage.setItem('app:lastUsername', name);
        if (mail) localStorage.setItem('app:lastEmail', mail);
      } catch {}
      setPassword('');
      setConfirm('');
    } catch (e: any) {
      setError(e?.message ? String(e.message) : copy.errors.operationFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (isIpc) {
    if (loading && !me) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-sm">{copy.status.loadingAccount}</div>
      );
    }
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-sm">{copy.status.checkingSession}</div>
    );
  }

  if (me) return <>{children}</>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -inset-[140px] bg-[radial-gradient(40%_60%_at_0%_0%,rgba(59,130,246,0.35),transparent_60%),radial-gradient(35%_55%_at_100%_10%,rgba(236,72,153,0.30),transparent_62%),radial-gradient(45%_60%_at_20%_100%,rgba(14,165,233,0.28),transparent_68%)] opacity-70" />
        <div className="absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/10 to-emerald-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.0),rgba(15,23,42,0.78))]" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col p-6">
        {/* Header: Logo + Name + SR/EN in one row */}
        <div className="w-full max-w-6xl mx-auto mb-12">
          <div className="flex items-center justify-between bg-white/5 backdrop-blur-xl rounded-3xl border border-white/15 p-6 shadow-2xl">
            {/* Logo + Name */}
            <div className="flex items-center gap-4">
              <span className="rounded-2xl bg-gradient-to-br from-blue-500/30 to-purple-500/30 p-3 shadow-xl">
                <img src="/pumpaj-180.png?v=2" alt="Pumpaj logo" className="h-24 w-24" />
              </span>
              <div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent">{copy.hero.title}</h1>
                <p className="text-sm tracking-[0.4em] uppercase text-blue-200/90 font-bold">{copy.hero.badge}</p>
              </div>
            </div>

            {/* SR/EN Switcher - Much More Visible */}
            <div className="inline-flex items-center gap-3 rounded-3xl border-2 border-white/30 bg-slate-900/90 p-2 shadow-2xl backdrop-blur-xl">
              {LANGUAGE_SEQUENCE.map((code) => {
                const option = copy.language.options[code];
                const isActive = language === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLanguage(code)}
                    className={`rounded-2xl px-6 py-4 text-xl font-black transition-all duration-300 transform ${isActive ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white shadow-2xl shadow-blue-500/60 scale-110 ring-4 ring-white/40' : 'text-white/80 hover:text-white hover:bg-white/15 hover:scale-105 hover:shadow-xl'}`}
                    aria-label={`${copy.language.switchTo} ${option.title}`}
                    title={option.title}
                  >
                    {option.short}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content: Message and Login/Register - Same Size */}
        <div className="flex-1 w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 items-start">
          
          {/* Left: PUMPAJ Message - 50% width */}
          <div className="h-full">
            <div className="h-full rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-blue-900/20 p-8 backdrop-blur-xl">
              <div className="space-y-6">
                <div className="text-center">
                  <style dangerouslySetInnerHTML={{
                    __html: `
                      @keyframes redPulse {
                        0%, 100% {
                          background-color: rgba(147, 51, 234, 0.3);
                          border-color: rgba(168, 85, 247, 0.5);
                          color: rgb(196, 181, 253);
                          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                        }
                        50% {
                          background-color: rgba(220, 38, 38, 0.4);
                          border-color: rgba(248, 113, 113, 0.7);
                          color: rgb(254, 202, 202);
                          box-shadow: 0 25px 50px -12px rgba(220, 38, 38, 0.4), 0 0 30px rgba(248, 113, 113, 0.6), 0 0 60px rgba(248, 113, 113, 0.3);
                        }
                      }
                      .red-pulse {
                        animation: redPulse 2s ease-in-out infinite;
                      }
                    `
                  }} />
                  <span className="inline-flex items-center justify-center rounded-full px-6 py-3 text-lg font-black uppercase tracking-wider border-2 red-pulse">
                    {copy.movement.badge}
                  </span>
                  <h2 className="mt-6 text-3xl font-black text-white">{copy.movement.title}</h2>
                </div>
                <div className="space-y-6 text-white/85 leading-relaxed">
                  {copy.movement.sections.map((section) => (
                    <div key={section.heading} className="space-y-3">
                      <h3 className="text-lg font-bold uppercase tracking-wide text-purple-300 border-b border-purple-500/30 pb-2">{section.heading}</h3>
                      {section.paragraphs.map((paragraph, index) => (
                        <p key={`${section.heading}-${index}`} className="text-base leading-relaxed">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                
                {/* PUMPAJ Logo na dnu - MNOGO VEĆI */}
                <div className="flex justify-center mt-8 pt-6 border-t border-purple-500/30">
                  <img src="/pumpaj-256.png?v=2" alt="Pumpaj logo" className="h-40 w-40 opacity-90 hover:opacity-100 transition-opacity duration-300" />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Login/Register Form - 50% width - IDENTICAL TO MESSAGE */}
          <div className="h-full">
            <div className="h-full rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-blue-900/20 p-8 backdrop-blur-xl">
              <div className="space-y-6">
                <div className="text-center">
                  <span className="inline-flex items-center justify-center rounded-full bg-purple-500/30 border-2 border-purple-400/50 px-6 py-3 text-lg font-black uppercase tracking-wider text-purple-200 shadow-xl">
                    {activeFormCopy.badge}
                  </span>
                  <h2 className="mt-6 text-3xl font-black text-white">{activeFormCopy.title}</h2>
                  <p className="mt-3 text-base text-white/80">{activeFormCopy.subtitle}</p>
                </div>

                <div className="space-y-6">
                  {/* Additional Info Section */}
                  <div className="space-y-4 text-white/85 leading-relaxed">
                    <div className="space-y-3">
                      <h3 className="text-lg font-bold uppercase tracking-wide text-purple-300 border-b border-purple-500/30 pb-2">
                        {mode === 'login' 
                          ? (language === 'sr' ? 'BRZA PRIJAVA' : 'QUICK LOGIN')
                          : (language === 'sr' ? 'BESPLATNO ČLANSTVO' : 'FREE MEMBERSHIP')
                        }
                      </h3>
                      <div className="space-y-2">
                        {mode === 'login' ? (
                          <>
                            <p className="text-base leading-relaxed">
                              {language === 'sr' 
                                ? 'Ulogujte se da pristupite svim funkcijama platforme. Vaš nalog omogućava personalizovane preuzimanja i praćenje istorije.'
                                : 'Log in to access all platform features. Your account enables personalized downloads and history tracking.'
                              }
                            </p>
                            <p className="text-base leading-relaxed">
                              {language === 'sr'
                                ? 'Podržavamo sve popularne video platforme sa naprednim opcijama kvaliteta i formata.'
                                : 'We support all popular video platforms with advanced quality and format options.'
                              }
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-base leading-relaxed">
                              {language === 'sr'
                                ? 'Kreirajte besplatan nalog za pristup premijum funkcijama. Uživajte u neograničenim preuzimanjima i ekskluzivnim opcijama.'
                                : 'Create a free account to access premium features. Enjoy unlimited downloads and exclusive options.'
                              }
                            </p>
                            <p className="text-base leading-relaxed">
                              {language === 'sr'
                                ? 'Registracija je brza i jednostavna - potrebno je samo korisničko ime, email i lozinka.'
                                : 'Registration is quick and simple - just username, email and password required.'
                              }
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={copy.placeholders.username}
                      autoComplete="username"
                      className="w-full rounded-2xl border border-white/20 bg-slate-900/50 px-4 py-4 text-white placeholder-white/50 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/30"
                    />
                    {mode === 'register' && (
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={copy.placeholders.email}
                        autoComplete="email"
                        className="w-full rounded-2xl border border-white/20 bg-slate-900/50 px-4 py-4 text-white placeholder-white/50 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/30"
                      />
                    )}
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={copy.placeholders.password}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className="w-full rounded-2xl border border-white/20 bg-slate-900/50 px-4 py-4 text-white placeholder-white/50 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/30"
                    />
                    {mode === 'register' && (
                      <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={copy.placeholders.confirm}
                        autoComplete="new-password"
                        className="w-full rounded-2xl border border-white/20 bg-slate-900/50 px-4 py-4 text-white placeholder-white/50 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/30"
                      />
                    )}
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">
                      {error}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="w-full rounded-2xl bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 px-4 py-4 text-center text-lg font-black text-white shadow-2xl shadow-purple-500/40 transition hover:from-purple-500 hover:via-blue-500 hover:to-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? activeFormCopy.submittingLabel : activeFormCopy.primaryButton}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => { 
                        const newMode = mode === 'login' ? 'register' : 'login';
                        setMode(newMode); 
                        setError(''); 
                      }}
                      className="w-full rounded-2xl border-2 border-purple-500/50 bg-transparent px-4 py-3 text-center text-base font-bold text-purple-200 transition hover:bg-purple-500/10 hover:border-purple-400"
                    >
                      {mode === 'login' ? copy.tabs.register : copy.tabs.login}
                    </button>
                  </div>

                  <p className="text-center text-sm text-white/70 leading-relaxed border-t border-purple-500/30 pt-4">
                    {mode === 'login' ? copy.instructions.login : copy.instructions.register}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeatureGuard({ children, plan = 'FREE', fallback }: { children: React.ReactNode; plan?: Plan; fallback?: React.ReactNode }) {
  const { policy } = useAuth();
  const currentPlan = policy?.plan ?? 'FREE';
  if (plan === 'FREE') return <>{children}</>;
  if (currentPlan === 'PREMIUM') return <>{children}</>;
  return <>{fallback ?? null}</>;
}

function derivePolicy(plan: Plan | null | undefined): Policy {
  return POLICY_DEFAULTS[plan === 'FREE' ? 'FREE' : 'PREMIUM'];
}

function normalizeUser(raw: any): User {
  if (!raw) return null;
  const plan: Plan = raw.plan === 'FREE' ? 'FREE' : 'PREMIUM';
  return {
    id: String(raw.id ?? 'me'),
    email: raw.email || undefined,
    username: raw.username || undefined,
    plan,
  };
}

const authUrl = (path: string) => {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}/auth${suffix}`;
};
