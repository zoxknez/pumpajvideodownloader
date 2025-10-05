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
  title: {
    default: 'Pumpaj Video Downloader',
    template: '%s | Pumpaj',
  },
  description: 'Premium video downloader for YouTube and other platforms. High-quality downloads with no throttling.',
  keywords: ['video downloader', 'youtube downloader', 'mp3 converter', 'video converter', 'pumpaj'],
  authors: [{ name: 'Pumpaj Team' }],
  creator: 'Pumpaj',
  publisher: 'Pumpaj',
  icons: {
    icon: '/pumpaj-192.png',
    apple: '/pumpaj-192.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://pumpajvideodl.com',
    siteName: 'Pumpaj Video Downloader',
    title: 'Pumpaj Video Downloader',
    description: 'Premium video downloader for YouTube and other platforms. High-quality downloads with no throttling.',
    images: [
      {
        url: '/pumpaj-512.png',
        width: 512,
        height: 512,
        alt: 'Pumpaj Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pumpaj Video Downloader',
    description: 'Premium video downloader for YouTube and other platforms.',
    images: ['/pumpaj-512.png'],
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
