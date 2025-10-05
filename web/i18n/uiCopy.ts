// i18n/uiCopy.ts
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

export const UI_COPY: Record<UiLanguage, Translation> = {
  sr: {
    hero: {
      badge: 'Pumpaj Premium',
      title: 'Media Downloader Hub',
      intro:
        'Preuzimaj video, audio, plej liste i titlove brže nego ikad. Jedan nalog, sve mogućnosti – bez čekanja i bez kompromisa.',
      featureBadges: [
        { icon: '⚡', label: '100+ platformi' },
        { icon: '🎵', label: '8K kvalitet' },
        { icon: '🚀', label: 'Neograničena brzina' },
      ],
      premiumBadgeLabel: 'BESPLATAN PREMIUM',
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
      badge: 'Dobrodošli nazad',
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
        'Nemaš nalog? Prebaci se na karticu „Registracija" ili koristi „Brza prijava" iznad i popuni formu – svi dobijaju premium pristup automatski.',
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
            { icon: '🛡️', title: 'Sigurna autentifikacija', description: 'JWT + Supabase bridge štite naloge i sesije bez curenja podataka.' },
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
            { icon: '🤝', title: 'Timovi spremni', description: 'Uloge i deljeni nalozi čuvaju ritam timskog preuzimanja.' },
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
        'Need an account? Switch to the “Register” tab or Quick Login above and complete the form—premium access starts immediately.',
      register:
        'Already registered? Choose “Sign in” above and jump back into your downloads in seconds.',
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
            { icon: '🛡️', title: 'Secure auth bridge', description: 'JWT and Supabase token bridge keep sessions locked down.' },
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
            { icon: '🤝', title: 'Team-ready flow', description: 'Role-based access keeps collaborative downloads tidy.' },
          ],
        },
      ],
    },
  },
};
