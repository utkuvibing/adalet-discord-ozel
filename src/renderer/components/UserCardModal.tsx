import React, { useEffect, useMemo } from 'react';
import type { PeerInfo } from '../../shared/types';
import { AvatarBadge } from './AvatarBadge';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { theme } from '../theme';

interface UserCardModalProps {
  open: boolean;
  user: PeerInfo | null;
  position: { x: number; y: number } | null;
  serverAddress: string;
  isFriend: boolean;
  onClose: () => void;
  onMessage: (userId: number) => void;
  onAddFriend: (userId: number) => void;
}

const CARD_WIDTH = 340;
const CARD_ESTIMATED_HEIGHT = 330;
const VIEWPORT_MARGIN = 12;

export function UserCardModal({
  open,
  user,
  position,
  serverAddress,
  isFriend,
  onClose,
  onMessage,
  onAddFriend,
}: UserCardModalProps): React.JSX.Element | null {
  const bannerUrl = user ? resolveMediaUrl(user.profileBannerGifUrl, serverAddress) : null;
  const anchoredPosition = useMemo(() => {
    if (!position) return null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = position.x;
    let top = position.y;

    if (left + CARD_WIDTH + VIEWPORT_MARGIN > viewportWidth) {
      left = position.x - CARD_WIDTH - 16;
    }

    left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewportWidth - CARD_WIDTH - VIEWPORT_MARGIN));
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, viewportHeight - CARD_ESTIMATED_HEIGHT - VIEWPORT_MARGIN));

    return { left, top };
  }, [position]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !user || !anchoredPosition) return null;

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div
        style={{
          ...styles.card,
          left: anchoredPosition.left,
          top: anchoredPosition.top,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
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
    zIndex: 2400,
  },
  card: {
    position: 'fixed',
    width: CARD_WIDTH,
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
    background:
      'radial-gradient(circle at 68% -20%, rgba(227,170,106,0.16) 0%, rgba(227,170,106,0.04) 36%, transparent 74%), rgba(14, 10, 8, 0.96)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0 16px 42px rgba(0,0,0,0.42)',
  },
  bannerWrap: {
    height: 150,
    position: 'relative',
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    backgroundColor: theme.colors.bgCard,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  bannerFallback: {
    width: '100%',
    height: '100%',
    background:
      'radial-gradient(circle at 20% 20%, rgba(145,168,196,0.22) 0%, transparent 40%), linear-gradient(135deg, rgba(32,24,18,1), rgba(17,12,9,1))',
  },
  avatarWrap: {
    position: 'absolute',
    left: 14,
    bottom: -36,
    borderRadius: '50%',
    padding: 3,
    backgroundColor: 'rgba(14,10,8,0.96)',
  },
  body: {
    padding: '2.6rem 0.9rem 0.9rem',
  },
  name: {
    margin: '0 0 0.35rem',
    fontSize: '1.05rem',
    color: theme.colors.textPrimary,
    fontFamily: "'Coolvetica', 'Inter', sans-serif",
  },
  bio: {
    margin: 0,
    color: theme.colors.textMuted,
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
    background: 'rgba(227, 170, 106, 0.14)',
    border: `1px solid ${theme.colors.accentBorder}`,
    color: theme.colors.accent,
    borderRadius: 8,
    padding: '0.5rem 0.7rem',
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  friendBtn: {
    flex: 1,
    background: 'rgba(145, 168, 196, 0.12)',
    border: `1px solid ${theme.colors.rimAccent}`,
    color: theme.colors.textSecondary,
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
