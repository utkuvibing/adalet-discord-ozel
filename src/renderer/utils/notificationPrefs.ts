export interface NotificationPrefs {
  desktopNotificationsEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number; // 0..1
}

const STORAGE_KEY = 'theinn:notification-prefs';
const CHANGE_EVENT = 'theinn:notification-prefs-changed';

const DEFAULT_PREFS: NotificationPrefs = {
  desktopNotificationsEnabled: true,
  soundEnabled: true,
  soundVolume: 0.8,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PREFS.soundVolume;
  return Math.max(0, Math.min(1, value));
}

export function getDefaultNotificationPrefs(): NotificationPrefs {
  return { ...DEFAULT_PREFS };
}

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultNotificationPrefs();
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      desktopNotificationsEnabled: parsed.desktopNotificationsEnabled ?? DEFAULT_PREFS.desktopNotificationsEnabled,
      soundEnabled: parsed.soundEnabled ?? DEFAULT_PREFS.soundEnabled,
      soundVolume: clamp01(parsed.soundVolume ?? DEFAULT_PREFS.soundVolume),
    };
  } catch {
    return getDefaultNotificationPrefs();
  }
}

export function saveNotificationPrefs(next: NotificationPrefs): void {
  const normalized: NotificationPrefs = {
    desktopNotificationsEnabled: !!next.desktopNotificationsEnabled,
    soundEnabled: !!next.soundEnabled,
    soundVolume: clamp01(next.soundVolume),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage failures
  }

  window.dispatchEvent(
    new CustomEvent<NotificationPrefs>(CHANGE_EVENT, { detail: normalized })
  );
}

export function onNotificationPrefsChange(
  callback: (prefs: NotificationPrefs) => void
): () => void {
  const handler = (event: Event): void => {
    const custom = event as CustomEvent<NotificationPrefs>;
    if (custom.detail) {
      callback(custom.detail);
      return;
    }
    callback(loadNotificationPrefs());
  };

  window.addEventListener(CHANGE_EVENT, handler as EventListener);
  window.addEventListener('storage', handler as EventListener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler as EventListener);
    window.removeEventListener('storage', handler as EventListener);
  };
}
