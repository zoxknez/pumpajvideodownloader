'use client';
import React from 'react';
import dynamic from 'next/dynamic';

// IMPORT DESKTOP-STYLED MAIN VIEW (web-adapted, no IPC/Electron)
const DesktopApp = dynamic(() => import('./DesktopMainView'), { ssr: false });

export default function DownloadView() { 
  return <DesktopApp />; 
}
