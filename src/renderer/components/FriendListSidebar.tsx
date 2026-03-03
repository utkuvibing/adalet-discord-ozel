import React, { useEffect, useState } from 'react';
import type { TypedSocket } from '../hooks/useSocket';
import type { FriendItem, FriendRequestItem } from '../../shared/types';
import { AvatarBadge } from './AvatarBadge';

interface FriendListSidebarProps {
  socket: TypedSocket | null;
  serverAddress: string;
  activeTargetUserId: number | null;
  onOpenConversation: (targetUserId: number) => void;
  onFriendListChange?: (friends: FriendItem[]) => void;
}

export function FriendListSidebar({
  socket,
  serverAddress,
  activeTargetUserId,
  onOpenConversation,
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
            ? {
                ...f,
                displayName: payload.displayName,
                bio: payload.bio,
                profilePhotoUrl: payload.profilePhotoUrl,
              }
            : f
        )
      );
      setRequests((prev) =>
        prev.map((r) =>
          r.fromUserId === payload.userId
            ? {
                ...r,
                fromDisplayName: payload.displayName,
                fromProfilePhotoUrl: payload.profilePhotoUrl,
              }
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
        <h3 style={styles.title}>Friend List</h3>
        <span style={styles.count}>{friends.length}</span>
      </div>
      <div style={styles.scroll}>
        {friends.length === 0 && <p style={styles.empty}>No friends yet</p>}
        {friends.map((friend) => (
          <button
            key={friend.userId}
            style={{
              ...styles.friendButton,
              ...(activeTargetUserId === friend.userId ? styles.friendButtonActive : {}),
            }}
            onClick={() => onOpenConversation(friend.userId)}
          >
            <AvatarBadge
              displayName={friend.displayName}
              profilePhotoUrl={friend.profilePhotoUrl}
              serverAddress={serverAddress}
              size={22}
            />
            <span style={styles.friendName}>{friend.displayName}</span>
          </button>
        ))}
      </div>

      <div style={styles.requestsSection}>
        <h4 style={styles.requestsTitle}>Requests</h4>
        {requests.length === 0 && <p style={styles.emptySmall}>No pending requests</p>}
        {requests.map((req) => (
          <div key={req.id} style={styles.requestRow}>
            <button style={styles.requestUser} onClick={() => onOpenConversation(req.fromUserId)}>
              <AvatarBadge
                displayName={req.fromDisplayName}
                profilePhotoUrl={req.fromProfilePhotoUrl}
                serverAddress={serverAddress}
                size={18}
              />
              <span style={styles.requestName}>{req.fromDisplayName}</span>
            </button>
            <button style={styles.acceptBtn} onClick={() => socket?.emit('friend:request:accept', { requestId: req.id })}>
              Accept
            </button>
            <button style={styles.rejectBtn} onClick={() => socket?.emit('friend:request:reject', { requestId: req.id })}>
              Reject
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderTop: '1px solid #2a2a2a',
    background: 'linear-gradient(180deg, #111111 0%, #0e1013 100%)',
    padding: '0.6rem 0.55rem 0.55rem',
    maxHeight: '36vh',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 0.25rem',
  },
  title: {
    margin: 0,
    color: '#b4f26e',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  count: {
    color: '#9ba2ad',
    fontSize: '0.72rem',
  },
  scroll: {
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    paddingRight: '0.15rem',
  },
  friendButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '8px',
    color: '#d5d9e0',
    fontSize: '0.78rem',
    padding: '0.35rem 0.4rem',
    cursor: 'pointer',
    textAlign: 'left',
  },
  friendButtonActive: {
    borderColor: '#7fff00',
    backgroundColor: 'rgba(127,255,0,0.08)',
  },
  friendName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  requestsSection: {
    borderTop: '1px solid #212121',
    paddingTop: '0.35rem',
  },
  requestsTitle: {
    margin: '0 0 0.3rem',
    color: '#959dab',
    fontSize: '0.72rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  requestRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
    marginBottom: '0.25rem',
  },
  requestUser: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    flex: 1,
    minWidth: 0,
    border: '1px solid #2a2a2a',
    background: '#101216',
    borderRadius: '6px',
    color: '#d0d6e0',
    padding: '0.2rem 0.3rem',
    cursor: 'pointer',
    textAlign: 'left',
  },
  requestName: {
    fontSize: '0.72rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  acceptBtn: {
    border: '1px solid #3c7e3c',
    background: '#173117',
    color: '#b9efb9',
    fontSize: '0.68rem',
    borderRadius: '6px',
    padding: '0.2rem 0.34rem',
    cursor: 'pointer',
  },
  rejectBtn: {
    border: '1px solid #6a2f2f',
    background: '#2f1616',
    color: '#efb6b6',
    fontSize: '0.68rem',
    borderRadius: '6px',
    padding: '0.2rem 0.34rem',
    cursor: 'pointer',
  },
  empty: {
    margin: '0.2rem 0.25rem',
    color: '#6d7480',
    fontSize: '0.74rem',
  },
  emptySmall: {
    margin: 0,
    color: '#616873',
    fontSize: '0.7rem',
  },
};
