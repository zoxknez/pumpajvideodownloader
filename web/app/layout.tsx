export const metadata = { title: 'Pumpaj Web', description: 'Downloader demo' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif' }}>{children}</body>
    </html>
  );
}
