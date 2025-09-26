import './globals.css';

export const metadata = {
  title: 'Pumpaj Web',
  description: 'Premium downloader for your browser',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="pumpaj-page">{children}</body>
    </html>
  );
}
