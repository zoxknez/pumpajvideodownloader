const BASE_PREMIUM_URL = 'https://pumpaj.app/premium';

const trackParams = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.append(key, value);
  });
  return search.toString();
};

export const PREMIUM_UPGRADE_URL = `${BASE_PREMIUM_URL}?${trackParams({
  utm_source: 'app',
  utm_medium: 'upgrade',
})}`;

export function openPremiumUpgrade(source?: string) {
  if (typeof window === 'undefined') return;
  const extra = source ? `&utm_content=${encodeURIComponent(source)}` : '';
  const targetUrl = `${PREMIUM_UPGRADE_URL}${extra}`;
  try {
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  } catch {
    window.location.href = targetUrl;
  }
}
