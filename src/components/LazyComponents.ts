import { lazy } from 'react';

// Lazy load heavy components - they need to be default exports
export const HistoryTab = lazy(() => import('./HistoryTab').then(module => ({ default: module.HistoryTab })));
export const BatchTab = lazy(() => import('./BatchTab').then(module => ({ default: module.BatchTab })));  
export const SettingsTab = lazy(() => import('./SettingsTab').then(module => ({ default: module.SettingsTab })));
export const QueueTab = lazy(() => import('./QueueTab').then(module => ({ default: module.QueueTab })));

// Keep main download components as regular imports since they're always needed
export { ThumbnailSection } from './ThumbnailSection';
export { VideoSection } from './VideoSection';
export { AudioSection } from './AudioSection';
export { OptionsSection } from './OptionsSection';
export { AnalysisResults } from './AnalysisResults';
export { PolicyBadge } from './PolicyBadge';