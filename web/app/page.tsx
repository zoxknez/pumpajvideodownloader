import NextDynamic from 'next/dynamic';
const DownloaderDemo = NextDynamic(() => import('@/components/DownloaderDemo'), { ssr: false });
export default function Home() {
  return <DownloaderDemo />;
}
