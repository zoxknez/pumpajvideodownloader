const map: Record<string, string> = {
  BATCH_LIMIT_EXCEEDED: 'U ovom planu batch je ograničen. Smanji broj linkova ili pređi na Premium.',
  LICENSE_REQUIRED: 'Unesi licencni ključ.',
  ACTIVATE_FAILED: 'Aktivacija nije uspela. Proveri ključ i pokušaj ponovo.',
  PROXY_ERROR: 'Greška tokom preuzimanja sa izvora. Pokušaj ponovo.',
};

export function friendlyError(code?: string, fallback = 'Došlo je do greške.') {
  if (!code) return fallback;
  return map[code] || fallback;
}
