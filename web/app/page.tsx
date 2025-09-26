import dynamic from 'next/dynamic';
const DownloaderDemo = dynamic(() => import('@/components/DownloaderDemo'), { ssr: false });
export default function Home() {
  return <DownloaderDemo />;
}
