/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Globe2, Pointer } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { PumpajMessage } from './PumpajMessage';
import { useI18n } from './I18nProvider';
import { getSupabase } from '../lib/supabaseClient';

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

export type UiLanguage = 'sr' | 'en';
export type ShowcaseSlideId = 'overview' | 'workflow';

export type Translation = {
  hero: {
    badge: string;
    title: string;
    intro: string;
    featureBadges: Array<{ icon: string; label: string }>;
    premiumBadgeLabel: string;
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
    missingRegisterCredentials: string;
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
      title: 'Video Downloader',
      intro:
        'Preuzimaj video, audio, plej liste i titlove brže nego ikad. Jedan nalog, sve mogućnosti – bez čekanja i bez kompromisa.',
      featureBadges: [
        { icon: '⚡', label: '100+ platformi' },
        { icon: '🎵', label: '8K kvalitet' },
        { icon: '🚀', label: 'Neograničena brzina' },
      ],
  premiumBadgeLabel: 'FREE PREMIUM',
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
      missingRegisterCredentials: 'Unesi korisničko ime, email i lozinku.',
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
      badge: 'O APLIKACIJI',
      slides: [
        {
          id: 'overview',
          accent: '',
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
            { icon: '🎯', title: 'Precizno targetiranje', description: 'Automatsko prepoznavanje optimalnog kvaliteta za svaki tip sadržaja.' },
            { icon: '🛡️', title: 'Sigurnost i privatnost', description: 'End-to-end enkripcija i potpuna kontrola nad vašim podacima.' },
          ],
        },
        {
          id: 'workflow',
          accent: '',
          title: 'Preuzmi sve što vidiš',
          description:
            'Od linka do gotovog fajla u par klikova – kreirano za kreatore sadržaja i timove.',
          highlights: [
            { icon: '▶️', label: 'Start', value: '2 klika' },
            { icon: '📡', label: 'Monitoring', value: 'Live SSE' },
            { icon: '💻', label: 'Platforme', value: 'Web' },
          ],
          items: [
            { icon: '🧠', title: 'Auto izbor kvaliteta', description: 'Aplikacija prepoznaje optimalan format i bitrate automatski.' },
            { icon: '🎚️', title: 'Napredne kontrole', description: 'Trimovanje, konverzija i ekstrakcija bez dodatnih alata.' },
            { icon: '📊', title: 'Progres bez kašnjenja', description: 'Precizan ETA, brzina i logovi u realnom vremenu.' },
            { icon: '🎨', title: 'Kreativne mogućnosti', description: 'Ekstraktuj thumbnail-e, GIF animacije i audio sample-e sa jednim klikom.' },
            { icon: '🔧', title: 'Prilagodljive opcije', description: 'Definisai custom output foldere, file naming pattern-e i post-processing komande.' },
          ],
        },
      ],
    },
  },
  en: {
    hero: {
      badge: 'Pumpaj Premium',
      title: 'Video Downloader',
      intro:
        'Download video, audio, playlists, and subtitles faster than ever. One account, all features—no waiting and no limits.',
      featureBadges: [
        { icon: '⚡', label: '100+ Platforms' },
        { icon: '🎵', label: '8K Quality' },
        { icon: '🚀', label: 'Unlimited Speed' },
      ],
      premiumBadgeLabel: 'FREE PREMIUM',
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
      missingRegisterCredentials: 'Enter your username, email and password.',
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
      badge: 'ABOUT THE APP',
      slides: [
        {
          id: 'overview',
          accent: '',
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
            { icon: '🎯', title: 'Precision targeting', description: 'Auto-detection of optimal quality for every content type.' },
            { icon: '🛡️', title: 'Security & privacy', description: 'End-to-end encryption with complete data ownership.' },
          ],
        },
        {
          id: 'workflow',
          accent: '',
          title: 'Grab anything you see',
          description:
            'From link to finished file in a couple clicks—built for creators and teams.',
          highlights: [
            { icon: '▶️', label: 'Start', value: '2 clicks' },
            { icon: '📡', label: 'Monitoring', value: 'Live SSE' },
            { icon: '💻', label: 'Platforms', value: 'Web' },
          ],
          items: [
            { icon: '🧠', title: 'Auto quality pick', description: 'Detects the optimal format and bitrate automatically.' },
            { icon: '🎚️', title: 'Advanced adjustments', description: 'Trim, convert, and extract without external tools.' },
            { icon: '📊', title: 'Instant progress', description: 'Accurate ETA, speed, and logs in real time.' },
            { icon: '🎨', title: 'Creative capabilities', description: 'Extract thumbnails, GIF animations and audio samples with one click.' },
            { icon: '🔧', title: 'Customizable options', description: 'Define custom output folders, file naming patterns and post-processing commands.' },
          ],
        },
      ],
    },
  },
};

export const LANGUAGE_SEQUENCE: UiLanguage[] = ['en', 'sr'];

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

  // Check Supabase session on mount
  useEffect(() => {
    const checkSupabaseSession = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // User is authenticated via Supabase OAuth
          const user: User = {
            id: session.user.id,
            email: session.user.email,
            username: session.user.email?.split('@')[0] || 'user',
            plan: 'PREMIUM', // Default to premium for OAuth users
          };
          setMe(user);
          setPolicy(POLICY_DEFAULTS['PREMIUM']);
          setLoading(false);
          return true;
        }
      } catch (err) {
        console.error('Supabase session check error:', err);
      }
      return false;
    };

    checkSupabaseSession();
  }, []);

  // Listen to Supabase auth state changes
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Supabase auth event:', event, session?.user?.email);
      
      if (event === 'SIGNED_IN' && session?.user) {
        const user: User = {
          id: session.user.id,
          email: session.user.email,
          username: session.user.email?.split('@')[0] || 'user',
          plan: 'PREMIUM',
        };
        setMe(user);
        setPolicy(POLICY_DEFAULTS['PREMIUM']);
      } else if (event === 'SIGNED_OUT') {
        setMe(null);
        setPolicy(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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

    // Skip backend auth check if Supabase session exists
    const checkBackendAuth = async () => {
      const supabase = getSupabase();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setLoading(false);
          return; // Already authenticated via Supabase
        }
      }

      setLoading(true);
      try {
        if (token) await fetchMeBearer(token);
        else await fetchMeCookie();
      } catch {
        setMe(null); setPolicy(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkBackendAuth();

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
    // Logout from Supabase if session exists
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Supabase logout error:', err);
      }
    }

    // Logout from backend
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
  const { locale, setLocale } = useI18n();
  const language = useMemo<UiLanguage>(() => (locale === 'sr' ? 'sr' : 'en'), [locale]);
  const nextLanguage = useMemo<UiLanguage>(() => {
    const currentIndex = LANGUAGE_SEQUENCE.indexOf(language);
    return LANGUAGE_SEQUENCE[(currentIndex + 1) % LANGUAGE_SEQUENCE.length] ?? language;
  }, [language]);
  const cycleLanguage = useCallback(() => {
    setLocale(nextLanguage);
  }, [nextLanguage, setLocale]);

  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [currentLeftView, setCurrentLeftView] = useState<ShowcaseSlideId>('overview');

  const copy = useMemo(() => UI_COPY[language], [language]);
  const meaningPumpajLabel = language === 'sr' ? 'Šta znači "Pumpaj" u Srbiji?' : 'What does "Pumpaj" mean in Serbia?';
  const quickLoginLabel = language === 'sr' ? 'Brza prijava i registracija' : 'Quick social login';
  const quickLoginSeparator = language === 'sr' ? 'ili koristi email' : 'or use email';
  const instructionText = mode === 'login' ? copy.instructions.login : copy.instructions.register;
  const activeFormCopy = mode === 'login' ? copy.login : copy.register;
  const showcaseSlides = copy.appShowcase.slides;
  const activeShowcase = useMemo(
    () => showcaseSlides.find(s => s.id === currentLeftView) ?? showcaseSlides[0],
    [showcaseSlides, currentLeftView],
  );
  const showcaseHeadline = useMemo(() => {
    if (!activeShowcase) return '';
    const title = activeShowcase.title?.trim();
    const description = activeShowcase.description?.trim();
    if (!description) return title ?? '';
    return `${title} — ${description}`;
  }, [activeShowcase]);
  const showcaseItems = useMemo(() => activeShowcase?.items.slice(0, 4) ?? [], [activeShowcase]);
  const securitySectionTitle = copy.login.security.title;
  const securityFeatures = useMemo(() => copy.login.security.features.slice(0, 3), [copy]);
  const securityIcons = ['🛡️', '🔐', '🧠'];
  const primaryBadgeText = useMemo(() => {
    if (mode === 'login') {
      return language === 'sr' ? 'Dobrodošli nazad' : copy.login.badge;
    }
    return activeFormCopy.badge;
  }, [mode, language, copy, activeFormCopy]);

  const [username, setUsername] = useState<string>(() => {
    if (!isBrowser) return '';
    try { return localStorage.getItem('app:lastUsername') || ''; } catch { return ''; }
  });
  const [email, setEmail] = useState<string>(() => {
    if (!isBrowser) return '';
    try { return localStorage.getItem('app:lastEmail') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPumpajInfo, setShowPumpajInfo] = useState(false);
  const autoOpenTriggered = useRef(false);

  const openPumpajInfo = useCallback(() => {
    autoOpenTriggered.current = true;
    setShowPumpajInfo(true);
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('pumpaj:auto-opened', '1');
      }
    } catch {}
  }, []);

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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !submitting) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleGoogleLogin = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setError(language === 'sr' ? 'Supabase nije konfigurisan' : 'Supabase not configured');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) {
        console.error('Google login error:', error);
        setError(language === 'sr' ? 'Google prijava nije uspela' : 'Google login failed');
      }
    } catch (e: any) {
      console.error('Google OAuth error:', e);
      setError(e?.message ? String(e.message) : copy.errors.operationFailed);
    } finally {
      setSubmitting(false);
    }
  }, [language, copy.errors.operationFailed]);

  const handleSubmit = async () => {
    setError('');
    const name = username.trim();
    const mail = mode === 'register' ? email.trim() : '';
    const pwd = password;

    if (mode === 'login') {
      if (!name || !pwd) { setError(copy.errors.missingCredentials); return; }
    } else {
      if (!name || !mail || !pwd) { setError(copy.errors.missingRegisterCredentials); return; }
      if (pwd.length < 6) { setError(copy.errors.passwordTooShort); return; }
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.sessionStorage.getItem('pumpaj:auto-opened') === '1') {
        autoOpenTriggered.current = true;
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (showPumpajInfo || autoOpenTriggered.current) return;
    const timer = window.setTimeout(() => {
      autoOpenTriggered.current = true;
      openPumpajInfo();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [showPumpajInfo, openPumpajInfo]);

  if (isIpc) {
    if (loading && !me) {
      return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-sm">{copy.status.loadingAccount}</div>;
    }
    return <>{children}</>;
  }

  if (loading) {
    return null;
  }

  if (me) return <>{children}</>;

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
  {/* background intentionally left plain */}

  <div className="relative z-10 flex flex-col gap-0 px-4 pt-0 pb-4 mt-4 md:mt-2 lg:mt-1">
        {/* Enhanced Premium Header */}
        <div className="w-full max-w-6xl mx-auto">
          <div className="relative rounded-2xl border border-blue-500/40 bg-gradient-to-b from-blue-900/45 via-slate-900/35 to-transparent p-3 backdrop-blur-xl shadow-lg overflow-hidden">
            {/* Animated background effects */}
            <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-transparent rounded-full blur-xl animate-pulse"></div>
            <div className="absolute bottom-0 right-0 w-40 h-40 bg-gradient-to-tl from-purple-400/15 to-transparent rounded-full blur-2xl animate-pulse delay-1000"></div>
            
            <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              {/* Logo + Title + Features */}
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
                <div className="relative ml-4">
                  <img
                    src="/pumpaj-192.png?v=3"
                    alt="Pumpaj logo"
                    className="relative h-32 w-48 object-contain drop-shadow-[0_16px_28px_rgba(59,130,246,0.3)] sm:h-36 sm:w-56 lg:h-40 lg:w-60"
                  />
                </div>
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-4">
                        <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent flex items-center gap-5">
                          Video
                          <span className="bg-gradient-to-r from-green-400 via-emerald-500 to-green-600 rounded-2xl px-6 py-3 text-2xl font-bold text-white shadow-xl border border-green-400/30 animate-pulse">
                            PRO
                          </span>
                          Downloader
                        </h1>
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={cycleLanguage}
                        className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-white/20 bg-slate-900/70 text-white shadow-[0_0_32px_rgba(59,130,246,0.48)] backdrop-blur-sm transition-all duration-300 hover:border-white/35 hover:shadow-[0_0_40px_rgba(59,130,246,0.62)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                        aria-label={`${copy.language.switchTo} ${copy.language.options[nextLanguage].title}`}
                        title={`${copy.language.switchTo} ${copy.language.options[nextLanguage].title}`}
                      >
                        <Globe2 className="h-12 w-12" aria-hidden="true" />
                        <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-blue-500 px-2.5 py-[3px] text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-lg">
                          {copy.language.options[language].short}
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm md:text-base">
                    {copy.hero.featureBadges.map(({ icon, label }) => (
                      <div
                        key={label}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15 hover:border-white/30 transition-all duration-300 hover:scale-105"
                      >
                        <span className="text-base md:text-lg">{icon}</span>
                        <span className="font-medium text-white/80 tracking-wide uppercase">{label}</span>
                      </div>
                    ))}
                    <div className="relative flex items-center gap-2 px-3 py-1 rounded-lg bg-gradient-to-r from-pink-400/35 via-purple-400/35 to-pink-400/35 border border-pink-300/60 shadow-lg shadow-pink-500/20">
                      <span className="relative text-pink-200 text-base md:text-lg">✨</span>
                      <span className="relative text-pink-100 font-semibold text-sm md:text-base bg-gradient-to-r from-pink-100 via-white to-pink-200 bg-clip-text text-transparent tracking-[0.2em]">
                        {copy.hero.premiumBadgeLabel}
                      </span>
                      <span className="relative text-pink-200 text-base md:text-lg">✨</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content area - connected to header */}
        <div className="w-full max-w-6xl mx-auto">
          <div className="relative rounded-b-2xl border-x-2 border-b-2 border-blue-500/30 bg-gradient-to-br from-blue-900/10 via-slate-900/20 to-purple-900/10 p-3 backdrop-blur-sm shadow-xl">
            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {/* Left: app showcase */}
          <div className="min-h-[520px] lg:min-h-[640px]">
            <div className="h-full rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-900/25 via-slate-900/30 to-purple-900/20 p-3 backdrop-blur-xl overflow-hidden">
              <div className="flex h-full flex-col gap-4">
                <div className="text-center space-y-2 flex-shrink-0">
                  {/* ABOUT THE APP badge */}
                  <div className="relative space-y-2">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 rounded-xl blur-lg"></div>
                      <div className="relative flex flex-col gap-4 rounded-xl px-8 py-4 border-2 bg-gradient-to-r from-blue-500/40 via-purple-500/40 to-blue-500/40 border-blue-400/60 backdrop-blur-sm shadow-xl md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start text-left md:max-w-xl">
                          <div className="space-y-1">
                            <span className="block text-sm font-semibold uppercase tracking-[0.22em] text-white">
                              {meaningPumpajLabel}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={openPumpajInfo}
                          className="group relative flex h-12 min-w-[170px] items-center justify-center rounded-2xl border border-rose-300/60 bg-gradient-to-r from-rose-500/50 via-amber-500/35 to-rose-500/45 px-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-white shadow-[0_0_18px_rgba(244,114,182,0.55)] transition-all duration-300 hover:border-rose-200/85 hover:shadow-[0_0_36px_rgba(248,113,113,0.7)] hover:-translate-y-[2px] md:min-w-[200px] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                          title={language === 'sr' ? 'Više o Pumpaj aplikaciji' : 'Learn more about Pumpaj'}
                        >
                          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-rose-400/25 via-white/10 to-amber-300/20 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100 animate-soft-glow"></span>
                          <span className="relative flex items-center gap-2">
                            <span className="text-[12px] tracking-[0.28em]">
                              {language === 'sr' ? 'Saznaj više' : 'Learn more'}
                            </span>
                            <span className="hidden text-lg group-hover:translate-x-0.5 group-hover:text-amber-200 transition-all duration-300 md:inline">
                              ➜
                            </span>
                          </span>
                          <span className="pointer-events-none absolute -top-1 right-2 text-rose-300 drop-shadow-[0_6px_18px_rgba(244,114,182,0.6)] animate-tap-hand" aria-hidden="true">
                            <Pointer className="h-8 w-8" />
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-sm uppercase tracking-[0.2em] text-blue-200/70">{activeShowcase?.accent}</p>
                  {showcaseHeadline && (
                    <h2
                      className="text-lg font-semibold text-white/95 px-2 truncate"
                      title={showcaseHeadline}
                    >
                      {showcaseHeadline}
                    </h2>
                  )}
                  <div className="flex justify-center gap-2 pt-2">
                    {showcaseSlides.map(slide => (
                      <span key={slide.id} className={`h-2 w-10 rounded-full transition-all ${slide.id === currentLeftView ? 'bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)]' : 'bg-white/15'}`} />
                    ))}
                  </div>
                </div>

                {activeShowcase && (
                  <div className="flex-1 flex flex-col gap-2 text-white/85 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      {activeShowcase.highlights.map(({ icon, label, value }) => (
                        <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-2 py-3 text-center shadow-inner">
                          {icon && <div className="text-lg">{icon}</div>}
                          <div className="mt-1 text-xs uppercase tracking-wider text-white/60">{label}</div>
                          <div className="text-base font-bold text-white">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-y-auto pr-1 flex-1">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {showcaseItems.map(({ icon, title, description }) => (
                          <div key={title} className="flex h-full min-h-[110px] flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                              {icon && <span className="text-lg">{icon}</span>}
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-white">
                                {title}
                              </h3>
                            </div>
                            <p className="text-xs leading-snug text-white/70">
                              {description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 shadow-inner">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
                        <span>🛡️</span>
                        <span>{securitySectionTitle}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {securityFeatures.map((feature, index) => (
                          <div key={feature} className="flex h-full flex-col items-start gap-3 rounded-lg border border-white/15 bg-slate-900/40 p-3">
                            <span className="text-2xl">
                              {securityIcons[index % securityIcons.length]}
                            </span>
                            <p className="text-xs text-white/70 leading-snug">
                              {feature}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: auth card */}
          <div className="mt-2 lg:mt-[6px] min-h-[520px] lg:min-h-[640px]">
            <div className="h-full rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-blue-900/20 p-3 backdrop-blur-xl overflow-hidden">
              <div className="space-y-3 h-full flex flex-col">
                <div className="text-center flex-shrink-0">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-purple-500/20 rounded-xl blur-lg"></div>
                    <div className="relative flex items-center justify-center gap-4 rounded-xl px-10 py-5 border-2 bg-gradient-to-r from-purple-500/40 via-blue-500/40 to-purple-500/40 border-purple-400/60 backdrop-blur-sm shadow-xl">
                      <span className="flex flex-col items-center justify-center gap-2 text-2xl font-bold uppercase tracking-[0.1em] text-white">
                        <span className="flex items-center gap-3">
                          {mode === 'login' && <span className="text-3xl">🚀</span>}
                          {primaryBadgeText}
                        </span>
                        {mode === 'login' && me && (me as any).username && (
                          <span className="text-lg font-normal normal-case text-blue-200">
                            Zdravo, {(me as any).username}! 👋
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <h2 className="mt-3 text-xl font-bold bg-gradient-to-r from-white via-purple-100 to-blue-100 bg-clip-text text-transparent">
                    {activeFormCopy.title}
                  </h2>
                  <p className="mt-2 text-xs text-white/90 leading-relaxed max-w-sm mx-auto">
                    {activeFormCopy.subtitle}
                  </p>
                </div>

                {/* form - spuštena niže ali ne skroz */}
                <div className="flex-1 flex flex-col justify-start pt-4">
                  <div className="space-y-3 mt-2">
                    <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs text-white/70 leading-relaxed flex items-start gap-2">
                      <span className="text-lg">💡</span>
                      <p>
                        {instructionText}
                      </p>
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`👤 ${copy.placeholders.username}`}
                      autoComplete="username"
                      className="w-full rounded-xl border border-white/35 bg-slate-900/55 backdrop-blur-xl px-5 py-3.5 text-white placeholder-white/85 outline-none shadow-inner transition-all duration-300 focus:border-purple-300 focus:ring-2 focus:ring-purple-400/25 hover:border-white/50 hover:bg-slate-900/45"
                    />

                    {mode === 'register' && (
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`📧 ${copy.placeholders.email}`}
                        autoComplete="email"
                        className="w-full rounded-xl border border-white/35 bg-slate-900/55 backdrop-blur-xl px-5 py-3.5 text-white placeholder-white/85 outline-none shadow-inner transition-all duration-300 focus:border-purple-300 focus:ring-2 focus:ring-purple-400/25 hover:border-white/50 hover:bg-slate-900/45"
                      />
                    )}

                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`🔒 ${copy.placeholders.password}`}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className="w-full rounded-xl border border-white/35 bg-slate-900/55 backdrop-blur-xl px-5 py-3.5 text-white placeholder-white/85 outline-none shadow-inner transition-all duration-300 focus:border-purple-300 focus:ring-2 focus:ring-purple-400/25 hover:border-white/50 hover:bg-slate-900/45"
                    />

                    {error && (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-200">
                        {error}
                      </div>
                    )}

                  </div>
                </div>

                {/* buttons */}
                <div className="space-y-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError(''); if (mode !== 'login') return; handleSubmit(); }}
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
                    onClick={() => { setMode('register'); setError(''); if (mode !== 'register') return; handleSubmit(); }}
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

                  {/* Quick Login Options - only for login mode */}
                  {mode === 'login' && (
                    <div className="pt-2 space-y-3">
                      <div className="text-center">
                        <span className="text-sm uppercase tracking-wider text-white/60">{quickLoginLabel}</span>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={handleGoogleLogin}
                          disabled={submitting}
                          className="flex items-center justify-center gap-2 flex-1 px-3 py-2.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm text-white/80 hover:text-white"
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          Google
                        </button>
                        <button className="flex items-center justify-center gap-2 flex-1 px-3 py-2.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 transition-all text-sm text-white/80 hover:text-white">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                          </svg>
                          Facebook
                        </button>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-white/20"></div>
                          <span className="text-sm text-white/50">{quickLoginSeparator}</span>
                          <div className="h-px flex-1 bg-white/20"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pumpaj modal */}
      {showPumpajInfo && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-20"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowPumpajInfo(false)}
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
        >
          <div className="relative max-w-3xl w-full max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-500 ease-out" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 z-10">
              <img src="/pumpaj-192.png?v=3" alt="Pumpaj logo" className="shadow-2xl" />
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
      </div>
    </div>
  );
}

export function RootAuth({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LoginGate>{children}</LoginGate>
    </AuthProvider>
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
