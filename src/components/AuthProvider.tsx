/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { API_BASE } from '../lib/api';
import { PumpajMessage } from './PumpajMessage';

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

/* ============================ i18n ============================ */

type UiLanguage = 'sr' | 'en';
type ShowcaseSlideId = 'overview' | 'workflow';

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
    features: Array<{ icon: string; title: string; description: string }>;
    benefits: Array<{ title: string; description: string }>;
    security: { title: string; features: string[] };
  };
  register: {
    badge: string;
    title: string;
    subtitle: string;
    primaryButton: string;
    submittingLabel: string;
  };
  tabs: { login: string; register: string };
  placeholders: { username: string; email: string; password: string; confirm: string };
  instructions: { login: string; register: string };
  errors: {
    missingCredentials: string;
    passwordTooShort: string;
    passwordMismatch: string;
    operationFailed: string;
  };
  status: { loadingAccount: string; checkingSession: string };
  language: {
    switchLabel: string;
    switchTo: string;
    options: Record<UiLanguage, { short: string; title: string }>;
  };
  appShowcase: {
    badge: string;
    slides: Array<{
      id: ShowcaseSlideId;
      accent: string;
      title: string;
      description: string;
      highlights: Array<{ icon?: string; label: string; value: string }>;
      items: Array<{ icon?: string; title: string; description: string }>;
    }>;
  };
};

const UI_COPY: Record<UiLanguage, Translation> = {
  sr: {
    hero: {
      badge: 'Pumpaj Premium',
      title: 'Media Downloader Hub',
      intro:
        'Preuzimaj video, audio, plej liste i titlove brže nego ikad. Jedan nalog, sve mogućnosti – bez čekanja i bez kompromisa.',
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
      features: [
        { icon: '🚀', title: 'Brzina svetlosti', description: 'Neograničena brzina preuzimanja za sve korisnike' },
        { icon: '📱', title: 'Svugde dostupno', description: 'Web + desktop aplikacija za maksimalnu fleksibilnost' },
        { icon: '🎵', title: 'Audio majstor', description: 'Izdvoj audio u bilo kom formatu i kvalitetu' },
        { icon: '📊', title: 'Živa statistika', description: 'Prati progres u realnom vremenu preko SSE' },
      ],
      benefits: [
        { title: 'Premium bez čekanja', description: 'Svi korisnici dobijaju punu premium funkcionalnost od prvog dana.' },
        { title: 'Podrška za sve platforme', description: 'YouTube, Vimeo, TikTok, Instagram i 100+ drugih servisa.' },
        { title: 'Batch i queue sistem', description: 'Dodaj stotine URL-ova odjednom, pauziraj i nastavi kad hoćeš.' },
        { title: 'Sigurnost na prvom mestu', description: 'Lokalno čuvanje fajlova, bez deljenja sa trećim stranama.' },
      ],
      security: {
        title: 'Bezbednost i privatnost',
        features: [
          'Lokalna enkripcija svih korisničkih podataka',
          'Nema praćenja ili analitike treće strane',
          'Fajlovi se čuvaju lokalno na vašem uređaju',
          'HTTPS konekcije za sve komunikacije',
        ],
      },
    },
    register: {
      badge: 'Kreiraj nalog',
      title: 'Beskonačan premium od prvog dana',
      subtitle:
        'Registruj nalog za tren – svi korisnici dobijaju kompletan premium paket automatski.',
      primaryButton: 'Registruj se',
      submittingLabel: 'Kreiranje naloga…',
    },
    tabs: { login: 'Prijava', register: 'Registracija' },
    placeholders: {
      username: 'korisničko ime',
      email: 'email@domena.com',
      password: 'lozinka',
      confirm: 'potvrdi lozinku',
    },
    instructions: {
      login:
        'Nemaš nalog? Prebaci se na karticu „Registracija" iznad i popuni formu – svi dobijaju premium pristup automatski.',
      register:
        'Već imaš nalog? Izaberi „Prijava" iznad i uloguj se za nekoliko sekundi.',
    },
    errors: {
      missingCredentials: 'Unesi korisničko ime i lozinku.',
      passwordTooShort: 'Lozinka mora imati najmanje 6 karaktera.',
      passwordMismatch: 'Lozinke se ne poklapaju.',
      operationFailed: 'Operacija nije uspela.',
    },
    status: { loadingAccount: 'Učitavanje naloga…', checkingSession: 'Provera sesije…' },
    language: {
      switchLabel: 'Promena jezika',
      switchTo: 'Prebaci na',
      options: { sr: { short: 'SR', title: 'Srpski' }, en: { short: 'EN', title: 'Engleski' } },
    },
    appShowcase: {
      badge: 'O aplikaciji',
      slides: [
        {
          id: 'overview',
          accent: 'Sve u jednom',
          title: 'Napredni media downloader',
          description:
            'Pumpaj kombinuje brzinu, stabilnost i sigurnost da uhvati svaki izvor sadržaja za par sekundi.',
          highlights: [
            { icon: '🌐', label: 'Servisa', value: '100+' },
            { icon: '📺', label: 'Kvalitet', value: 'Do 8K HDR' },
            { icon: '⚡', label: 'Batch', value: '300 URL-a' },
          ],
          items: [
            { icon: '⚡', title: 'Turbo preuzimanje', description: 'Pametna optimizacija konekcija bez ograničenja brzine.' },
            { icon: '💾', title: 'Lokalna kontrola', description: 'Sve datoteke ostaju na tvom uređaju – bez cloud sinhronizacije.' },
            { icon: '🔄', title: 'Queue orkestracija', description: 'Pauziraj, nastavi i rasporedi preuzimanja za nekoliko sekundi.' },
          ],
        },
        {
          id: 'workflow',
          accent: 'Radni tok u dva takta',
          title: 'Preuzmi sve što vidiš',
          description:
            'Od linka do gotovog fajla u par klikova – kreirano za kreatore sadržaja i timove.',
          highlights: [
            { icon: '▶️', label: 'Start', value: '2 klika' },
            { icon: '📡', label: 'Monitoring', value: 'Live SSE' },
            { icon: '💻', label: 'Platforme', value: 'Web + Desktop' },
          ],
          items: [
            { icon: '🧠', title: 'Auto izbor kvaliteta', description: 'Aplikacija prepoznaje optimalan format i bitrate automatski.' },
            { icon: '🎚️', title: 'Napredne kontrole', description: 'Trimovanje, konverzija i ekstrakcija bez dodatnih alata.' },
            { icon: '📊', title: 'Progres bez kašnjenja', description: 'Precizan ETA, brzina i logovi u realnom vremenu.' },
          ],
        },
      ],
    },
  },
  en: {
    hero: {
      badge: 'Pumpaj Premium',
      title: 'Media Downloader Hub',
      intro:
        'Download video, audio, playlists, and subtitles faster than ever. One account, all features—no waiting and no limits.',
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
      features: [
        { icon: '🚀', title: 'Lightning speed', description: 'Unlimited download speeds for all users' },
        { icon: '📱', title: 'Everywhere access', description: 'Web + desktop app for maximum flexibility' },
        { icon: '🎵', title: 'Audio master', description: 'Extract audio in any format and quality' },
        { icon: '📊', title: 'Live statistics', description: 'Track progress in real-time via SSE' },
      ],
      benefits: [
        { title: 'Premium without waiting', description: 'All users get full premium functionality from day one.' },
        { title: 'All platforms supported', description: 'YouTube, Vimeo, TikTok, Instagram and 100+ other services.' },
        { title: 'Batch and queue system', description: 'Add hundreds of URLs at once, pause and resume anytime.' },
        { title: 'Security first', description: 'Local file storage, no sharing with third parties.' },
      ],
      security: {
        title: 'Security and privacy',
        features: [
          'Local encryption of all user data',
          'No tracking or third-party analytics',
          'Files stored locally on your device',
          'HTTPS connections for all communications',
        ],
      },
    },
    register: {
      badge: 'Create your account',
      title: 'Unlimited premium from day one',
      subtitle:
        'Register instantly—every new member receives the full premium bundle automatically.',
      primaryButton: 'Sign up',
      submittingLabel: 'Creating account…',
    },
    tabs: { login: 'Sign in', register: 'Register' },
    placeholders: {
      username: 'username',
      email: 'email@domain.com',
      password: 'password',
      confirm: 'confirm password',
    },
    instructions: {
      login:
        'No account yet? Switch to the "Register" tab above and fill out the form—everyone gets premium access automatically.',
      register:
        'Already have an account? Choose "Sign in" above and you\'ll be in within seconds.',
    },
    errors: {
      missingCredentials: 'Enter your username and password.',
      passwordTooShort: 'Password must be at least 6 characters long.',
      passwordMismatch: 'Passwords do not match.',
      operationFailed: 'The operation failed.',
    },
    status: { loadingAccount: 'Loading account…', checkingSession: 'Checking session…' },
    language: {
      switchLabel: 'Language',
      switchTo: 'Switch to',
      options: { sr: { short: 'SR', title: 'Serbian' }, en: { short: 'EN', title: 'English' } },
    },
    appShowcase: {
      badge: 'About the app',
      slides: [
        {
          id: 'overview',
          accent: 'All-in-one toolkit',
          title: 'Advanced media downloader',
          description:
            'Pumpaj blends speed, reliability, and privacy to capture any media source in seconds.',
          highlights: [
            { icon: '🌐', label: 'Services', value: '100+' },
            { icon: '📺', label: 'Quality', value: 'Up to 8K HDR' },
            { icon: '⚡', label: 'Batch', value: '300 URLs' },
          ],
          items: [
            { icon: '🚀', title: 'Turbo transfers', description: 'Smart connection pooling with zero throttling.' },
            { icon: '💾', title: 'Local-first', description: 'Everything stays on your device—no cloud uploads.' },
            { icon: '🔄', title: 'Queue orchestration', description: 'Pause, resume, and reorder downloads instantly.' },
          ],
        },
        {
          id: 'workflow',
          accent: 'Workflow in two beats',
          title: 'Grab anything you see',
          description:
            'From link to finished file in a couple clicks—built for creators and teams.',
          highlights: [
            { icon: '▶️', label: 'Start', value: '2 clicks' },
            { icon: '📡', label: 'Monitoring', value: 'Live SSE' },
            { icon: '💻', label: 'Platforms', value: 'Web + Desktop' },
          ],
          items: [
            { icon: '🧠', title: 'Auto quality pick', description: 'Detects the optimal format and bitrate automatically.' },
            { icon: '🎚️', title: 'Advanced adjustments', description: 'Trim, convert, and extract without external tools.' },
            { icon: '📊', title: 'Instant progress', description: 'Accurate ETA, speed, and logs in real time.' },
          ],
        },
      ],
    },
  },
};

const LANGUAGE_SEQUENCE: UiLanguage[] = ['sr', 'en'];

/* ============================ Auth Provider ============================ */

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

  const applyUser = useCallback((data: any) => {
    const user = normalizeUser(data?.user) || null;
    setMe(user);
    if (data?.policy) setPolicy(data.policy as Policy);
    else setPolicy(derivePolicy(user?.plan));
  }, []);

  const fetchMeBearer = useCallback(async (tok: string) => {
    const res = await fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) throw new Error('unauthorized');
    const data = await res.json();
    applyUser(data);
  }, [applyUser]);

  const fetchMeCookie = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/me`, { credentials: 'include' });
    if (!res.ok) throw new Error('unauthorized');
    const data = await res.json();
    applyUser(data);
  }, [applyUser]);

  useEffect(() => {
    let cancelled = false;

    if (isIpc) {
      setLoading(true);
      (async () => {
        try {
          const res = await (window as any).api?.auth?.whoami?.();
          if (!cancelled) {
            if (res?.ok && res.user) {
              const user = normalizeUser(res.user);
              setMe(user);
              setPolicy(derivePolicy(user?.plan));
            } else {
              setMe(null);
              setPolicy(null);
            }
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      const unsubscribe = (window as any).api?.auth?.onState?.((payload: any) => {
        if (cancelled) return;
        const user = normalizeUser(payload?.user) || null;
        setMe(user);
        setPolicy(user ? derivePolicy(user.plan) : null);
      });

      return () => { cancelled = true; unsubscribe?.(); };
    }

    (async () => {
      setLoading(true);
      try {
        if (token) await fetchMeBearer(token);
        else await fetchMeCookie();
      } catch {
        setMe(null); setPolicy(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isIpc, token, fetchMeBearer, fetchMeCookie]);

  const login = useCallback(async ({ username, password }: LoginPayload) => {
    const name = String(username || '').trim();
    const pwd = String(password || '');
    if (!name || !pwd) throw new Error('missing_credentials');

    if (isIpc) {
      const res = await (window as any).api?.auth?.login?.({ username: name, password: pwd });
      if (!res?.ok) throw new Error(res?.error || 'login_failed');
      const user = normalizeUser(res.user);
      setMe(user); setPolicy(derivePolicy(user?.plan));
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
      await fetchMeBearer(data.token);
    } else {
      await fetchMeCookie();
    }
    try { localStorage.setItem('app:lastUsername', name); } catch {}
  }, [isIpc, fetchMeBearer, fetchMeCookie, setToken]);

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
      await fetchMeBearer(data.token);
    } else {
      await login({ username: name, password: pwd });
    }

    try {
      localStorage.setItem('app:lastUsername', name);
      if (mail) localStorage.setItem('app:lastEmail', mail);
    } catch {}
  }, [isIpc, login, fetchMeBearer, setToken]);

  const logout = useCallback(async () => {
    if (isIpc) {
      try { await (window as any).api?.auth?.logout?.(); } catch {}
    } else {
      try { await fetch(authUrl('/logout'), { method: 'POST', credentials: 'include' }); } catch {}
    }
    setToken(null); setMe(null); setPolicy(null);
  }, [isIpc, setToken]);

  const ctxValue = useMemo(
    () => ({ me, policy, token, loading, login, register, logout, setToken }),
    [me, policy, token, loading, login, register, logout, setToken],
  );

  return <Ctx.Provider value={ctxValue}>{children}</Ctx.Provider>;
}

/* ============================ Hooks ============================ */

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function usePolicy(defaultPlan: Plan = 'PREMIUM') {
  const { policy } = useAuth();
  return policy ?? POLICY_DEFAULTS[defaultPlan];
}

/* ============================ Login Gate (UI) ============================ */

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { me, login, register, loading } = useAuth();
  const isBrowser = typeof window !== 'undefined';
  const isIpc = isBrowser && Boolean((window as any).api?.auth);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [language, setLanguage] = useState<UiLanguage>(() => {
    if (typeof window === 'undefined') return 'en';
    try { return (localStorage.getItem('app:lang') as UiLanguage) || 'en'; } catch { return 'en'; }
  });
  const [currentLeftView, setCurrentLeftView] = useState<ShowcaseSlideId>('overview');

  const copy = useMemo(() => UI_COPY[language], [language]);
  const activeFormCopy = mode === 'login' ? copy.login : copy.register;
  const showcaseSlides = copy.appShowcase.slides;
  const activeShowcase = useMemo(
    () => showcaseSlides.find(s => s.id === currentLeftView) ?? showcaseSlides[0],
    [showcaseSlides, currentLeftView],
  );

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
  const [showPumpajInfo, setShowPumpajInfo] = useState(false);

  // rotate left slides
  useEffect(() => {
    if (!showcaseSlides.length) return;
    const ids = showcaseSlides.map(s => s.id);
    const t = setInterval(() => {
      setCurrentLeftView(cur => {
        const i = ids.indexOf(cur);
        const n = i === -1 ? 0 : (i + 1) % ids.length;
        return ids[n] ?? ids[0];
      });
    }, 5000);
    return () => clearInterval(t);
  }, [showcaseSlides]);

  // persist lang
  useEffect(() => {
    try { localStorage.setItem('app:lang', language); } catch {}
  }, [language]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !submitting) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setError('');
    const name = username.trim();
    const mail = mode === 'register' ? email.trim() : '';
    const pwd = password;

    if (!name || !pwd) { setError(copy.errors.missingCredentials); return; }
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
      setPassword(''); setConfirm('');
    } catch (e: any) {
      setError(e?.message ? String(e.message) : copy.errors.operationFailed);
    } finally {
      setSubmitting(false);
    }
  };

  // modal ESC
  useEffect(() => {
    if (!showPumpajInfo) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPumpajInfo(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPumpajInfo]);

  if (isIpc) {
    if (loading && !me) {
      return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-sm">{copy.status.loadingAccount}</div>;
    }
    return <>{children}</>;
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-sm">{copy.status.checkingSession}</div>;
  }

  if (me) return <>{children}</>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      {/* background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -inset-[140px] bg-[radial-gradient(40%_60%_at_0%_0%,rgba(59,130,246,0.35),transparent_60%),radial-gradient(35%_55%_at_100%_10%,rgba(236,72,153,0.30),transparent_62%),radial-gradient(45%_60%_at_20%_100%,rgba(14,165,233,0.28),transparent_68%)] opacity-70" />
        <div className="absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/10 to-emerald-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.0),rgba(15,23,42,0.78))]" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col p-6">
        {/* Header */}
        <div className="w-full max-w-6xl mx-auto mb-12">
          <div className="flex items-center justify-between bg-white/5 backdrop-blur-xl rounded-3xl border border-white/15 p-6 shadow-2xl">
            <div className="flex items-center gap-4">
              <span className="rounded-2xl bg-gradient-to-br from-blue-500/30 to-purple-500/30 p-3 shadow-xl">
                <img src="/pumpaj-180.png?v=2" alt="Pumpaj logo" className="h-24 w-24" />
              </span>
              <div>
                <h1 className="text-3xl font-black bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent">{copy.hero.title}</h1>
                <p className="text-sm tracking-[0.4em] uppercase text-blue-200/90 font-bold">{copy.hero.badge}</p>
              </div>
            </div>

            <div className="inline-flex items-center gap-3 rounded-3xl border-2 border-white/30 bg-slate-900/90 p-2 shadow-2xl backdrop-blur-xl">
              {LANGUAGE_SEQUENCE.map((code) => {
                const option = copy.language.options[code];
                const isActive = language === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLanguage(code)}
                    className={`rounded-2xl px-6 py-4 text-xl font-black transition-all duration-300 transform ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white shadow-2xl shadow-blue-500/60 scale-110 ring-4 ring-white/40'
                        : 'text-white/80 hover:text-white hover:bg-white/15 hover:scale-105 hover:shadow-xl'
                    }`}
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

        {/* Main grid */}
        <div className="flex-1 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left: app showcase */}
          <div className="h-[600px]">
            <div className="h-full rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-900/25 via-slate-900/30 to-purple-900/20 p-6 backdrop-blur-xl overflow-hidden">
              <div className="flex h-full flex-col gap-4">
                <div className="text-center space-y-2 flex-shrink-0">
                  <span className="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide border bg-blue-500/30 border-blue-400/60 text-blue-100/90">
                    {copy.appShowcase.badge}
                  </span>
                  <p className="text-xs uppercase tracking-[0.2em] text-blue-200/70">{activeShowcase?.accent}</p>
                  <h2 className="text-lg font-bold text-white">{activeShowcase?.title}</h2>
                  <p className="text-xs text-white/70 px-2">{activeShowcase?.description}</p>
                  <div className="flex justify-center gap-2 pt-1">
                    {showcaseSlides.map(slide => (
                      <span key={slide.id} className={`h-1.5 w-8 rounded-full transition-all ${slide.id === currentLeftView ? 'bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)]' : 'bg-white/15'}`} />
                    ))}
                  </div>
                </div>

                {activeShowcase && (
                  <div className="flex-1 space-y-3 text-white/85 text-xs overflow-y-auto">
                    <div className="grid grid-cols-3 gap-2">
                      {activeShowcase.highlights.map(({ icon, label, value }) => (
                        <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-2 py-3 text-center shadow-inner">
                          {icon && <div className="text-sm">{icon}</div>}
                          <div className="mt-1 text-[10px] uppercase tracking-wider text-white/60">{label}</div>
                          <div className="text-sm font-bold text-white">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {activeShowcase.items.map(({ icon, title, description }) => (
                        <div key={title} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 shadow-sm">
                          {icon && <span className="text-base flex-shrink-0">{icon}</span>}
                          <div className="space-y-1 min-w-0">
                            <h3 className="text-xs font-semibold text-white">{title}</h3>
                            <p className="text-[11px] text-white/70 leading-relaxed">{description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: auth card */}
          <div className="h-[600px]">
            <div className="h-full rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-blue-900/20 p-5 backdrop-blur-xl overflow-hidden">
              <div className="space-y-3 h-full flex flex-col">
                <div className="text-center flex-shrink-0">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-purple-500/20 rounded-full blur-xl"></div>
                    <span className="relative inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500/40 via-blue-500/40 to-purple-500/40 border border-purple-400/60 px-5 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-2xl">
                      ✨ {activeFormCopy.badge} ✨
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-bold bg-gradient-to-r from-white via-purple-100 to-blue-100 bg-clip-text text-transparent">
                    {activeFormCopy.title}
                  </h2>
                  <p className="mt-1 text-xs text-white/90 leading-relaxed max-w-sm mx-auto">
                    {activeFormCopy.subtitle}
                  </p>
                </div>

                {/* PUMPAJ info button */}
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 via-purple-600/20 to-red-600/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition duration-300"></div>
                  <button
                    type="button"
                    onClick={() => setShowPumpajInfo(true)}
                    className="relative w-full rounded-xl border border-red-500/40 bg-gradient-to-r from-red-600/20 via-purple-600/20 to-red-600/20 backdrop-blur-xl px-6 py-4 text-center transition-all duration-300 hover:border-red-400/60 hover:shadow-lg hover:shadow-red-500/30 hover:scale-[1.02]"
                  >
                    <div className="text-lg font-bold bg-gradient-to-r from-red-300 via-purple-300 to-red-300 bg-clip-text text-transparent">
                      {language === 'sr' ? 'Šta znači PUMPAJ u Srbiji?' : 'What does PUMPAJ mean in Serbia?'}
                    </div>
                    <div className="text-xs text-white/60 mt-1">
                      {language === 'sr' ? '🔥 Srpski pokret za istinu 🔥' : '🔥 Serbian movement for truth 🔥'}
                    </div>
                  </button>
                </div>

                {/* form */}
                <div className="space-y-2.5 flex-1 overflow-y-auto">
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`👤 ${copy.placeholders.username}`}
                      autoComplete="username"
                      className="w-full rounded-xl border border-white/20 bg-slate-900/70 backdrop-blur-xl px-5 py-3.5 text-white placeholder-white/60 outline-none transition-all duration-300 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-400/20 hover:border-white/40 hover:bg-slate-900/80"
                    />

                    {mode === 'register' && (
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`📧 ${copy.placeholders.email}`}
                        autoComplete="email"
                        className="w-full rounded-xl border border-white/20 bg-slate-900/70 backdrop-blur-xl px-5 py-3.5 text-white placeholder-white/60 outline-none transition-all duration-300 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-400/20 hover:border-white/40 hover:bg-slate-900/80"
                      />
                    )}

                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`🔒 ${copy.placeholders.password}`}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className="w-full rounded-xl border border-white/20 bg-slate-900/70 backdrop-blur-xl px-5 py-3.5 text-white placeholder-white/60 outline-none transition-all duration-300 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-400/20 hover:border-white/40 hover:bg-slate-900/80"
                    />

                    {mode === 'register' && (
                      <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`🔐 ${copy.placeholders.confirm}`}
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-white/20 bg-slate-900/70 backdrop-blur-xl px-5 py-3.5 text-white placeholder-white/60 outline-none transition-all duration-300 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-400/20 hover:border-white/40 hover:bg-slate-900/80"
                      />
                    )}

                    {error && (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-200">
                        {error}
                      </div>
                    )}
                  </div>
                </div>

                {/* buttons */}
                <div className="space-y-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError(''); handleSubmit(); }}
                    disabled={submitting}
                    className={`w-full rounded-xl border px-6 py-4 font-bold transition-all duration-300 backdrop-blur-xl ${
                      mode === 'login'
                        ? 'border-purple-400/50 bg-gradient-to-r from-purple-600/90 via-blue-600/90 to-purple-600/90 text-white shadow-xl shadow-purple-500/30'
                        : 'border-white/20 bg-slate-900/40 text-white/80 hover:border-purple-400/30 hover:bg-slate-900/60 hover:text-white'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span className="flex items-center justify-center gap-3">
                      {submitting && mode === 'login'
                        ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {activeFormCopy.submittingLabel}</>)
                        : (<><span className="text-xl">🔑</span>{copy.tabs.login}</>)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMode('register'); setError(''); handleSubmit(); }}
                    disabled={submitting}
                    className={`w-full rounded-xl border px-6 py-4 font-bold transition-all duration-300 backdrop-blur-xl ${
                      mode === 'register'
                        ? 'border-blue-400/50 bg-gradient-to-r from-blue-600/90 via-purple-600/90 to-blue-600/90 text-white shadow-xl shadow-blue-500/30'
                        : 'border-white/20 bg-slate-900/40 text-white/80 hover:border-blue-400/30 hover:bg-slate-900/60 hover:text-white'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span className="flex items-center justify-center gap-3">
                      {submitting && mode === 'register'
                        ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {activeFormCopy.submittingLabel}</>)
                        : (<><span className="text-xl">✨</span>{copy.tabs.register}</>)}
                    </span>
                  </button>
                </div>

                {/* footer hint */}
                <div className="relative flex-shrink-0 pt-2">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-blue-500/5 rounded-lg blur-sm"></div>
                  <div className="relative flex items-center justify-center">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                    <div className="px-4">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 text-xs text-white/90">
                        <span className="w-1.5 h-1.5 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full animate-pulse"></span>
                        {mode === 'login' ? copy.instructions.login : copy.instructions.register}
                      </span>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pumpaj modal */}
      {showPumpajInfo && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowPumpajInfo(false)}
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
        >
          <div className="relative max-w-3xl w-full max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-500 ease-out" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <div className="w-8 h-8 bg-gradient-to-br from-slate-800 via-purple-900 to-red-900 rotate-45 border-2 border-white/30 shadow-2xl"></div>
            </div>
            <div className="bg-gradient-to-br from-slate-800/98 via-purple-900/98 to-red-900/98 backdrop-blur-3xl rounded-2xl border-2 border-white/30 shadow-2xl overflow-hidden">
              <div className="p-6 text-center relative">
                <button
                  aria-label="Close"
                  onClick={() => setShowPumpajInfo(false)}
                  className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors text-2xl hover:scale-110 transform duration-200 p-2 rounded-full hover:bg-white/10"
                >
                  ✕
                </button>
                <div className="flex items-center justify-center mb-4 gap-3">
                  <div className="text-3xl">🇷🇸</div>
                  <h3 className="text-3xl font-black bg-gradient-to-r from-red-400 via-blue-400 to-white bg-clip-text text-transparent">
                    {language === 'sr' ? 'PUMPAJ REVOLUCIJA' : 'PUMPAJ REVOLUTION'}
                  </h3>
                  <div className="text-3xl">💪</div>
                </div>
                <div className="overflow-y-auto max-h-[70vh] px-2 text-base leading-relaxed">
                  <PumpajMessage language={language} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ Helpers ============================ */

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
