import { apiFetch } from './client';

export async function getJobsSettings(): Promise<any> {
  const res = await apiFetch('/api/jobs/settings', { method: 'GET' });
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`);
  return res.json();
}

export async function updateJobsSettings(settings: any): Promise<void> {
  const res = await apiFetch('/api/jobs/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`);
}
