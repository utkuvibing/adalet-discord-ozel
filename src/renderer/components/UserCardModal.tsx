import React from 'react';
import type { PeerInfo } from '../../shared/types';
import { AvatarBadge } from './AvatarBadge';
import { resolveMediaUrl } from '../utils/mediaUrl';

interface UserCardModalProps {
  open: boolean;
  user: PeerInfo | null;
  serverAddress: string;
  isFriend: boolean;
  onClose: () => void;
  onMessage: (userId: number) => void;
  onAddFriend: (userId: number) => void;
}

export function UserCardModal({
  open,
  user,
  serverAddress,
  isFriend,
  onClose,
  onMessage,
  onAddFriend,
}: UserCardModalProps): React.JSX.Element | null {
  if (!open || !user) return null;
  const bannerUrl = resolveMediaUrl(user.profileBannerGifUrl, serverAddress);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.bannerWrap}>
          {bannerUrl ? (
            <img src={bannerUrl} alt="User banner" style={styles.bannerImage} />
          ) : (
            <div style={styles.bannerFallback} />
          )}
          <div style={styles.avatarWrap}>
            <AvatarBadge
              displayName={user.displayName}
              profilePhotoUrl={user.profilePhotoUrl}
              serverAddress={serverAddress}
              size={72}
            />
          </div>
        </div>

        <div style={styles.body}>
          <h3 style={styles.name}>{user.displayName}</h3>
          <p style={styles.bio}>{user.bio?.trim() || 'No bio yet.'}</p>

          <div style={styles.actions}>
            {user.userId != null && (
              <button style={styles.messageBtn} onClick={() => onMessage(user.userId!)}>
                Message
              </button>
            )}
            {user.userId != null && (
              <button
                style={{
                  ...styles.friendBtn,
                  ...(isFriend ? styles.friendBtnDisabled : {}),
                }}
                disabled={isFriend}
                onClick={() => onAddFriend(user.userId!)}
              >
                {isFriend ? 'Already Friend' : 'Add Friend'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2400,
  },
  card: {
    width: 360,
    maxWidth: 'calc(100vw - 2rem)',
    backgroundColor: '#0f1117',
    border: '1px solid #2b3140',
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
  },
  bannerWrap: {
    height: 150,
    position: 'relative',
    borderBottom: '1px solid #202531',
    backgroundColor: '#141926',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  bannerFallback: {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, #1a2230, #131820)',
  },
  avatarWrap: {
    position: 'absolute',
    left: 14,
    bottom: -36,
    borderRadius: '50%',
    padding: 3,
    backgroundColor: '#0f1117',
  },
  body: {
    padding: '2.6rem 0.9rem 0.9rem',
  },
  name: {
    margin: '0 0 0.35rem',
    fontSize: '1.05rem',
    color: '#e8edf6',
    fontFamily: "'Coolvetica', 'Inter', sans-serif",
  },
  bio: {
    margin: 0,
    color: '#9fa8b8',
    fontSize: '0.82rem',
    lineHeight: 1.45,
    minHeight: '2.3rem',
  },
  actions: {
    marginTop: '0.8rem',
    display: 'flex',
    gap: '0.5rem',
  },
  messageBtn: {
    flex: 1,
    background: '#1a2d1a',
    border: '1px solid #2f4d2f',
    color: '#b8ef9e',
    borderRadius: 8,
    padding: '0.5rem 0.7rem',
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  friendBtn: {
    flex: 1,
    background: '#1a202d',
    border: '1px solid #333f56',
    color: '#c8d4ea',
    borderRadius: 8,
    padding: '0.5rem 0.7rem',
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  friendBtnDisabled: {
    opacity: 0.6,
    cursor: 'default',
  },
};
