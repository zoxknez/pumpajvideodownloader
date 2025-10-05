'use client';
import React from 'react';

// RootAuth sadrži LoginGate sa savršenim login UI
import { RootAuth } from './AuthProvider';

export default function DesktopApp() {
  // Ne trebaš App iz Vite-a – LoginGate će se pojaviti iz RootAuth-a
  return <RootAuth>{null}</RootAuth>;
}
