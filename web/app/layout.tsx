/* eslint-disable react-refresh/only-export-components */
import './globals.css';
import { cookies } from 'next/headers';
import I18nProvider from '@/components/I18nProvider';
import { Providers } from './providers';

const SUPPORTED_LOCALES = new Set(['sr', 'en']);

function normalizeLocale(raw?: string | null): 'sr' | 'en' {
  if (!raw) return 'en';
  const value = raw.split(',')[0]?.split('-')[0]?.toLowerCase() ?? 'en';
  return (SUPPORTED_LOCALES.has(value) ? value : 'en') as 'sr' | 'en';
}

export const metadata = {
  title: 'Pumpaj Web',
  description: 'Premium downloader for your browser',
  icons: {
    icon: '/pumpaj-192.png',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const rawCookieLocale = cookieStore.get('locale')?.value;
  const initialLocale = normalizeLocale(rawCookieLocale ?? 'en');

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body className="pumpaj-page">
        <I18nProvider initialLocale={initialLocale}>
          <Providers>
            {children}
          </Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
