/** Persist user identity (display name + avatar) separately from session.
 *  Survives session expiration so the form can be pre-filled on next launch. */

const STORAGE_KEY = 'userIdentity';

interface SavedIdentity {
  displayName: string;
  avatarId?: string;
}

export function getSavedIdentity(): SavedIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.displayName === 'string') {
      return parsed as SavedIdentity;
    }
  } catch {
    // Corrupt data — ignore
  }
  return null;
}

export function saveIdentity(displayName: string, avatarId: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ displayName, avatarId }));
}
