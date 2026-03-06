interface CloudflareTurnResponse {
  iceServers?: unknown;
}

interface CloudflareTurnResult {
  iceServers: RTCIceServer[];
  source: 'cloudflare-turn';
}

function getCloudflareTurnKeyId(): string | null {
  const value = process.env.CLOUDFLARE_TURN_KEY_ID?.trim();
  return value || null;
}

function getCloudflareTurnApiToken(): string | null {
  const value = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  return value || null;
}

function getCloudflareTurnTtlSec(): number {
  const raw = process.env.CLOUDFLARE_TURN_TTL_SEC?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) return 14_400;
  return Math.max(300, Math.min(86_400, parsed));
}

function normalizeIceServers(raw: unknown): RTCIceServer[] {
  if (!Array.isArray(raw)) return [];

  const normalized: RTCIceServer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const urlsRaw = record.urls;

    let urls: string[] = [];
    if (typeof urlsRaw === 'string') {
      urls = [urlsRaw];
    } else if (Array.isArray(urlsRaw)) {
      urls = urlsRaw.filter((value): value is string => typeof value === 'string');
    }

    const filteredUrls = urls
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      // Browser tarafinda 53 portu sik timeout yapabiliyor.
      .filter((value) => !value.includes(':53'));

    if (filteredUrls.length === 0) continue;

    const server: RTCIceServer = {
      urls: filteredUrls.length === 1 ? filteredUrls[0] : filteredUrls,
    };

    if (typeof record.username === 'string' && record.username.trim().length > 0) {
      server.username = record.username.trim();
    }

    if (typeof record.credential === 'string' && record.credential.trim().length > 0) {
      server.credential = record.credential.trim();
    }

    normalized.push(server);
  }

  return normalized;
}

export async function fetchCloudflareTurnIceServers(): Promise<CloudflareTurnResult | null> {
  const keyId = getCloudflareTurnKeyId();
  const apiToken = getCloudflareTurnApiToken();
  if (!keyId || !apiToken) return null;

  const endpoint = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;
  const ttl = getCloudflareTurnTtlSec();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl }),
  });

  if (!response.ok) {
    const reason = await response.text().catch(() => '');
    throw new Error(`Cloudflare TURN credentials failed (${response.status}): ${reason || response.statusText}`);
  }

  const payload = (await response.json()) as CloudflareTurnResponse;
  const iceServers = normalizeIceServers(payload.iceServers);
  if (iceServers.length === 0) {
    throw new Error('Cloudflare TURN returned empty iceServers');
  }

  return {
    iceServers,
    source: 'cloudflare-turn',
  };
}
