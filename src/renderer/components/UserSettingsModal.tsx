import React, { useEffect, useMemo, useState } from 'react';
import { AvatarBadge } from './AvatarBadge';
import { resolveMediaUrl } from '../utils/mediaUrl';

interface UserSettingsModalProps {
  open: boolean;
  onClose: () => void;
  serverAddress: string;
  userId: number | null;
  currentDisplayName: string;
  currentBio: string;
  currentProfilePhotoUrl: string | null;
  currentBannerGifUrl: string | null;
  onProfileUpdated: (payload: {
    displayName: string;
    bio: string;
    profilePhotoUrl: string | null;
    profileBannerGifUrl: string | null;
  }) => void;
}

export function UserSettingsModal({
  open,
  onClose,
  serverAddress,
  userId,
  currentDisplayName,
  currentBio,
  currentProfilePhotoUrl,
  currentBannerGifUrl,
  onProfileUpdated,
}: UserSettingsModalProps): React.JSX.Element | null {
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [bio, setBio] = useState(currentBio);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const baseUrl = useMemo(
    () => (/^https?:\/\//.test(serverAddress) ? serverAddress : `http://${serverAddress}`),
    [serverAddress]
  );

  useEffect(() => {
    if (!open) return;
    setDisplayName(currentDisplayName);
    setBio(currentBio);
    setError(null);
  }, [open, currentDisplayName, currentBio]);

  if (!open) return null;

  const patchProfile = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ userId, displayName, bio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      onProfileUpdated({
        displayName: data.displayName,
        bio: data.bio,
        profilePhotoUrl: data.profilePhotoUrl ?? null,
        profileBannerGifUrl: data.profileBannerGifUrl ?? null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File, endpoint: '/profile/photo' | '/profile/banner-gif') => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', String(userId));
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        body: formData,
        headers: { 'ngrok-skip-browser-warning': '1' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onProfileUpdated({
        displayName: data.displayName,
        bio: data.bio,
        profilePhotoUrl: data.profilePhotoUrl ?? null,
        profileBannerGifUrl: data.profileBannerGifUrl ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>User Settings</h3>
        <div style={styles.preview}>
          {resolveMediaUrl(currentBannerGifUrl, serverAddress) && (
            <img
              src={resolveMediaUrl(currentBannerGifUrl, serverAddress)!}
              style={styles.banner}
              alt="banner"
            />
          )}
          <div style={styles.avatarWrap}>
            <AvatarBadge
              displayName={currentDisplayName}
              profilePhotoUrl={currentProfilePhotoUrl}
              serverAddress={serverAddress}
              size={64}
            />
          </div>
        </div>
        <label style={styles.label}>
          Nickname
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} style={styles.input} />
        </label>
        <label style={styles.label}>
          Bio (max 100)
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={100} style={styles.textarea} />
        </label>
        <div style={styles.uploadRow}>
          <label style={styles.uploadBtn}>
            Upload PP (PNG/JPG {'<='} 5MB)
            <input
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], '/profile/photo')}
            />
          </label>
          <label style={styles.uploadBtn}>
            Upload Banner GIF ({'<='} 10MB)
            <input
              type="file"
              accept="image/gif"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], '/profile/banner-gif')}
            />
          </label>
        </div>
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.actions}>
          <button style={styles.secondaryBtn} onClick={onClose}>Close</button>
          <button style={styles.primaryBtn} onClick={patchProfile} disabled={busy}>Save & Close</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    width: 520,
    maxWidth: 'calc(100vw - 2rem)',
    backgroundColor: '#0f1117',
    border: '1px solid #2b3140',
    borderRadius: 14,
    padding: '1rem',
  },
  title: { margin: '0 0 0.8rem', color: '#dce3ef', fontSize: '1rem' },
  preview: { position: 'relative', backgroundColor: '#141925', borderRadius: 10, height: 120, overflow: 'hidden', marginBottom: 12 },
  banner: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarWrap: { position: 'absolute', left: 12, bottom: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, color: '#a8b0bf', fontSize: '0.8rem', marginBottom: 10 },
  input: { background: '#11141c', border: '1px solid #2c3445', borderRadius: 8, color: '#e3e8f2', padding: '0.5rem 0.6rem' },
  textarea: { background: '#11141c', border: '1px solid #2c3445', borderRadius: 8, color: '#e3e8f2', padding: '0.5rem 0.6rem', minHeight: 74, resize: 'vertical' },
  uploadRow: { display: 'flex', gap: 8, marginBottom: 10 },
  uploadBtn: { flex: 1, background: '#1a202d', border: '1px solid #30394a', borderRadius: 8, color: '#c7d0df', padding: '0.5rem', textAlign: 'center', cursor: 'pointer', fontSize: '0.75rem' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  primaryBtn: { background: '#2a8a2a', border: '1px solid #3ba63b', color: '#fff', borderRadius: 8, padding: '0.45rem 0.8rem', cursor: 'pointer' },
  secondaryBtn: { background: '#181d28', border: '1px solid #2b3343', color: '#c6d0df', borderRadius: 8, padding: '0.45rem 0.8rem', cursor: 'pointer' },
  error: { color: '#ff6a6a', fontSize: '0.75rem', marginBottom: 8 },
};
