import { ICE_SERVERS as LOCAL_ICE_SERVERS } from '../shared/iceConfig';

interface SupabaseIceRow {
  urls: unknown;
  username: unknown;
  credential: unknown;
}

interface SupabaseIceResponse {
  iceServers: RTCIceServer[];
  source: 'supabase' | 'local-fallback';
}

const CACHE_TTL_MS = 60_000;

let cache: SupabaseIceResponse | null = null;
let cacheAt = 0;
let inflight: Promise<SupabaseIceResponse> | null = null;

function getSupabaseUrl(): string | null {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

function getSupabaseKey(): string | null {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_ANON_KEY?.trim()
    || process.env.SUPABASE_KEY?.trim();
  return key || null;
}

function normalizeUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((u): u is string => typeof u === 'string' && /^(stun|stuns|turn|turns):/.test(u));
  }

  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Some rows may store a JSON string array in a text column.
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((u): u is string => typeof u === 'string' && /^(stun|stuns|turn|turns):/.test(u));
      }
    } catch {
      // fall back to single URL handling
    }
  }

  return /^(stun|stuns|turn|turns):/.test(trimmed) ? [trimmed] : [];
}

function rowToIceServer(row: SupabaseIceRow): RTCIceServer | null {
  const urls = normalizeUrls(row.urls);
  if (urls.length === 0) return null;

  const server: RTCIceServer = {
    urls: urls.length === 1 ? urls[0] : urls,
  };

  if (typeof row.username === 'string' && row.username.trim().length > 0) {
    server.username = row.username.trim();
  }
  if (typeof row.credential === 'string' && row.credential.trim().length > 0) {
    server.credential = row.credential.trim();
  }

  return server;
}

async function fetchSupabaseIceServers(): Promise<RTCIceServer[] | null> {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();
  if (!supabaseUrl || !supabaseKey) return null;

  const endpoint = `${supabaseUrl}/rest/v1/webrtc_ice_servers?select=urls,username,credential,enabled,sort_order&enabled=eq.true&order=sort_order.asc.nullslast`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const reason = await response.text().catch(() => '');
    console.warn(`[ice] Supabase ICE fetch failed (${response.status}): ${reason || response.statusText}`);
    return null;
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    console.warn('[ice] Supabase ICE payload is not an array');
    return null;
  }

  const servers: RTCIceServer[] = payload
    .map((row) => rowToIceServer(row as SupabaseIceRow))
    .filter((row): row is RTCIceServer => row !== null);

  if (servers.length === 0) {
    console.warn('[ice] Supabase ICE table is empty or invalid; using local fallback');
    return null;
  }

  return servers;
}

export async function getRuntimeIceServers(): Promise<SupabaseIceResponse> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  if (!inflight) {
    inflight = (async () => {
      try {
        const remote = await fetchSupabaseIceServers();
        if (remote && remote.length > 0) {
          return {
            iceServers: remote,
            source: 'supabase',
          } as const;
        }
      } catch (err) {
        console.warn('[ice] Supabase ICE fetch threw, using local fallback:', err);
      }

      return {
        iceServers: LOCAL_ICE_SERVERS,
        source: 'local-fallback',
      } as const;
    })();
  }

  const result = await inflight;
  inflight = null;
  cache = result;
  cacheAt = Date.now();
  return result;
}
