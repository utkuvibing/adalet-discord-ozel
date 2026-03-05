import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, Check, X, MessageSquare, Search, Phone } from 'lucide-react';
import type { TypedSocket } from '../hooks/useSocket';
import type { FriendItem, FriendRequestItem } from '../../shared/types';
import { AvatarBadge } from './AvatarBadge';
import { theme } from '../theme';

interface FriendListSidebarProps {
  socket: TypedSocket | null;
  serverAddress: string;
  activeTargetUserId: number | null;
  dmUnreadCounts: Map<number, number>;
  onOpenConversation: (targetUserId: number) => void;
  onStartSearchConversation: (targetUserId: number) => void;
  onStartCallConversation: (targetUserId: number) => void;
  onOpenUserCard: (friend: FriendItem, position: { x: number; y: number }) => void;
  onFriendListChange?: (friends: FriendItem[]) => void;
}

export function FriendListSidebar({
  socket,
  serverAddress,
  activeTargetUserId,
  dmUnreadCounts,
  onOpenConversation,
  onStartSearchConversation,
  onStartCallConversation,
  onOpenUserCard,
  onFriendListChange,
}: FriendListSidebarProps): React.JSX.Element {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<FriendRequestItem[]>([]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('friend:list:request');
    socket.emit('friend:request:list:request');
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleFriendList = (list: FriendItem[]) => {
      setFriends(list);
      onFriendListChange?.(list);
    };
    const handleRequestList = (list: FriendRequestItem[]) => setRequests(list);
    const handleIncomingRequest = (req: FriendRequestItem) => setRequests((prev) => [req, ...prev]);
    const handleRequestUpdated = () => {
      socket.emit('friend:list:request');
      socket.emit('friend:request:list:request');
    };
    const handleProfileUpdated = (payload: {
      userId: number;
      displayName: string;
      bio: string;
      profilePhotoUrl: string | null;
      profileBannerGifUrl: string | null;
    }) => {
      setFriends((prev) =>
        prev.map((f) =>
          f.userId === payload.userId
            ? { ...f, displayName: payload.displayName, bio: payload.bio, profilePhotoUrl: payload.profilePhotoUrl }
            : f
        )
      );
      setRequests((prev) =>
        prev.map((r) =>
          r.fromUserId === payload.userId
            ? { ...r, fromDisplayName: payload.displayName, fromProfilePhotoUrl: payload.profilePhotoUrl }
            : r
        )
      );
    };

    socket.on('friend:list', handleFriendList);
    socket.on('friend:request:list', handleRequestList);
    socket.on('friend:request:incoming', handleIncomingRequest);
    socket.on('friend:request:updated', handleRequestUpdated);
    socket.on('profile:updated', handleProfileUpdated);

    return () => {
      socket.off('friend:list', handleFriendList);
      socket.off('friend:request:list', handleRequestList);
      socket.off('friend:request:incoming', handleIncomingRequest);
      socket.off('friend:request:updated', handleRequestUpdated);
      socket.off('profile:updated', handleProfileUpdated);
    };
  }, [socket, onFriendListChange]);

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Users size={14} color={theme.colors.accent} />
          <h3 style={styles.title}>Friends</h3>
        </div>
        <span style={styles.count}>{friends.length}</span>
      </div>

      <div style={styles.scroll}>
        <AnimatePresence>
          {friends.length === 0 ? (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.empty}>
              No friends yet
            </motion.p>
          ) : (
            friends.map((friend) => (
              <motion.div
                key={friend.userId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                style={{
                  ...styles.friendButton,
                  ...(activeTargetUserId === friend.userId ? styles.friendButtonActive : {}),
                }}
                onClick={(event) => {
                  const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                  onOpenUserCard(friend, { x: rect.right + 12, y: rect.top });
                }}
              >
                <AvatarBadge displayName={friend.displayName} profilePhotoUrl={friend.profilePhotoUrl} serverAddress={serverAddress} size={24} />
                <span style={styles.friendName}>{friend.displayName}</span>
                {(dmUnreadCounts.get(friend.userId) ?? 0) > 0 && (
                  <span style={styles.unreadCount}>
                    {(dmUnreadCounts.get(friend.userId) ?? 0) > 99 ? '99+' : (dmUnreadCounts.get(friend.userId) ?? 0)}
                  </span>
                )}
                <div style={styles.friendActionsWrap}>
                  <button
                    type="button"
                    style={{
                      ...styles.friendDmBtn,
                      ...(activeTargetUserId === friend.userId ? styles.friendDmBtnActive : {}),
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onStartSearchConversation(friend.userId);
                    }}
                    title="Search in DM"
                  >
                    <Search size={12} />
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.friendDmBtn,
                      ...(activeTargetUserId === friend.userId ? styles.friendDmBtnActive : {}),
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenConversation(friend.userId);
                    }}
                    title="Open DM"
                  >
                    <MessageSquare size={12} />
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.friendDmBtn,
                      ...(activeTargetUserId === friend.userId ? styles.friendDmBtnActive : {}),
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onStartCallConversation(friend.userId);
                    }}
                    title="Start call"
                  >
                    <Phone size={12} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {requests.length > 0 && (
        <div style={styles.requestsSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <UserPlus size={14} color={theme.colors.warning} />
            <h4 style={styles.requestsTitle}>Pending Requests</h4>
          </div>
          <div style={styles.requestList}>
            {requests.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={styles.requestRow}
              >
                <div style={styles.requestUser}>
                  <AvatarBadge displayName={req.fromDisplayName} profilePhotoUrl={req.fromProfilePhotoUrl} serverAddress={serverAddress} size={20} />
                  <span style={styles.requestName}>{req.fromDisplayName}</span>
                </div>
                <div style={styles.requestActions}>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    style={styles.acceptBtn}
                    onClick={() => socket?.emit('friend:request:accept', { requestId: req.id })}
                  >
                    <Check size={14} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    style={styles.rejectBtn}
                    onClick={() => socket?.emit('friend:request:reject', { requestId: req.id })}
                  >
                    <X size={14} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'transparent',
    padding: '0.9rem 0.8rem',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.8rem',
    boxSizing: 'border-box',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 0.2rem',
  },
  title: {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontFamily: theme.font.familyDisplay,
  },
  count: {
    color: theme.colors.textMuted,
    fontSize: '0.72rem',
    fontWeight: 600,
    backgroundColor: 'rgba(227,170,106,0.08)',
    padding: '1px 6px',
    borderRadius: '10px',
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    minHeight: 0,
  },
  friendButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    backgroundColor: 'rgba(227, 170, 106, 0.04)',
    border: '1px solid rgba(96, 62, 36, 0.96)',
    borderRadius: theme.radiusSm,
    color: theme.colors.textPrimary,
    fontSize: theme.font.sizeSm,
    padding: '0.4rem 0.6rem',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'border-color 0.15s, background-color 0.15s',
    boxShadow: 'none',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  friendButtonActive: {
    backgroundColor: 'rgba(227, 170, 106, 0.16)',
    borderColor: 'rgba(138, 88, 52, 0.96)',
    color: theme.colors.accent,
  },
  friendName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
  },
  unreadCount: {
    color: '#2a1508',
    fontSize: '0.66rem',
    backgroundColor: '#efc58a',
    borderRadius: '999px',
    padding: '0.05rem 0.38rem',
    fontWeight: 700,
    border: '1px solid rgba(176,117,58,0.85)',
    boxShadow: '0 0 0 1px rgba(255,234,206,0.16) inset',
    flexShrink: 0,
  },
  friendDmBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '7px',
    border: '1px solid rgba(96, 62, 36, 0.9)',
    background: 'rgba(227,170,106,0.05)',
    color: theme.colors.textMuted,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    boxShadow: 'none',
    outline: 'none',
  },
  friendActionsWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    flexShrink: 0,
  },
  friendDmBtnActive: {
    color: theme.colors.accent,
    border: '1px solid rgba(138, 88, 52, 0.96)',
    background: 'rgba(227,170,106,0.14)',
  },
  requestsSection: {
    borderTop: `1px solid ${theme.colors.borderSubtle}`,
    paddingTop: '0.8rem',
  },
  requestsTitle: {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  requestList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  requestRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(227,170,106,0.06)',
    borderRadius: theme.radiusSm,
    padding: '0.4rem 0.5rem',
  },
  requestUser: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: 0,
  },
  requestName: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  requestActions: {
    display: 'flex',
    gap: '0.3rem',
  },
  acceptBtn: {
    background: 'rgba(227, 170, 106, 0.1)',
    border: 'none',
    color: theme.colors.accent,
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  rejectBtn: {
    background: 'rgba(255, 75, 75, 0.1)',
    border: 'none',
    color: theme.colors.error,
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  empty: {
    margin: '0.5rem 0.2rem',
    color: theme.colors.textMuted,
    fontSize: theme.font.sizeXs,
    fontStyle: 'italic',
  },
};
