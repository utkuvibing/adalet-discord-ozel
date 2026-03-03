import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { TypedSocket } from '../hooks/useSocket';
import type { DMMessage, FriendItem } from '../../shared/types';
import { AvatarBadge } from './AvatarBadge';

interface DMPanelProps {
  socket: TypedSocket | null;
  myUserId: number | null;
  targetUserId: number | null;
  serverAddress: string;
}

export function DMPanel({ socket, myUserId, targetUserId, serverAddress }: DMPanelProps): React.JSX.Element {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [input, setInput] = useState('');
  const [inCallWith, setInCallWith] = useState<number | null>(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit('friend:list:request');
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleFriendList = (list: FriendItem[]) => setFriends(list);
    const handleHistory = (payload: { targetUserId: number; messages: DMMessage[] }) => {
      if (payload.targetUserId === targetUserId) setMessages(payload.messages);
    };
    const handleMessage = (payload: { targetUserId: number; message: DMMessage }) => {
      if (payload.targetUserId === targetUserId) {
        setMessages((prev) => [...prev, payload.message]);
      }
    };
    const handleCallStarted = (payload: { targetUserId: number; fromUserId: number }) => {
      setInCallWith(payload.fromUserId);
    };
    const handleCallEnded = () => setInCallWith(null);

    socket.on('friend:list', handleFriendList);
    socket.on('dm:history', handleHistory);
    socket.on('dm:message', handleMessage);
    socket.on('dm:call:started', handleCallStarted);
    socket.on('dm:call:ended', handleCallEnded);

    return () => {
      socket.off('friend:list', handleFriendList);
      socket.off('dm:history', handleHistory);
      socket.off('dm:message', handleMessage);
      socket.off('dm:call:started', handleCallStarted);
      socket.off('dm:call:ended', handleCallEnded);
    };
  }, [socket, targetUserId]);

  useEffect(() => {
    if (!socket || targetUserId === null) return;
    socket.emit('dm:history:request', { targetUserId });
  }, [socket, targetUserId]);

  const activeFriend = useMemo(
    () => friends.find((f) => f.userId === targetUserId) ?? null,
    [friends, targetUserId]
  );

  const sendMessage = useCallback(() => {
    if (!socket || targetUserId === null) return;
    const content = input.trim();
    if (!content) return;
    socket.emit('dm:message', { targetUserId, content });
    setInput('');
  }, [socket, targetUserId, input]);

  if (targetUserId === null) {
    return <div style={styles.emptyPane}>Select a friend to open conversation.</div>;
  }

  return (
    <div style={styles.chatArea}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <AvatarBadge
            displayName={activeFriend?.displayName ?? `User ${targetUserId}`}
            profilePhotoUrl={activeFriend?.profilePhotoUrl ?? null}
            serverAddress={serverAddress}
            size={30}
          />
          <div>
            <div style={styles.headerName}>{activeFriend?.displayName ?? `User ${targetUserId}`}</div>
            <div style={styles.headerBio}>{activeFriend?.bio || 'No bio yet'}</div>
          </div>
        </div>
        <div style={styles.callButtons}>
          {!activeFriend && (
            <button style={styles.callBtn} onClick={() => socket?.emit('friend:request:send', { targetUserId })}>
              Add Friend
            </button>
          )}
          <button style={styles.callBtn} onClick={() => socket?.emit('dm:call:start', { targetUserId })}>Call</button>
          <button style={styles.callBtn} onClick={() => socket?.emit('dm:call:end', { targetUserId })}>End</button>
        </div>
      </header>
      {inCallWith === targetUserId && <div style={styles.callBanner}>DM Call Active</div>}
      <div style={styles.messages}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.msg,
              ...(msg.fromUserId === myUserId ? styles.msgMine : {}),
            }}
          >
            {msg.content}
          </div>
        ))}
      </div>
      <div style={styles.inputRow}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={styles.input}
          placeholder="Message..."
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button style={styles.sendBtn} onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #2a2a2a',
    padding: '0.7rem 0.9rem',
    backgroundColor: '#0f1218',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerName: { fontSize: '0.9rem', color: '#ececec', fontWeight: 700 },
  headerBio: { fontSize: '0.74rem', color: '#8792a5' },
  callButtons: { display: 'flex', gap: 6 },
  callBtn: {
    background: '#1b1f2a',
    border: '1px solid #2f3545',
    borderRadius: 8,
    color: '#c7d0df',
    fontSize: '0.76rem',
    padding: '5px 10px',
    cursor: 'pointer',
  },
  callBanner: { padding: '0.35rem 0.8rem', backgroundColor: '#102218', color: '#7fff00', fontSize: '0.74rem' },
  messages: { flex: 1, overflowY: 'auto', padding: '0.75rem' },
  msg: {
    maxWidth: '70%',
    padding: '0.5rem 0.65rem',
    borderRadius: 10,
    backgroundColor: '#1a1d27',
    color: '#e4e7ee',
    marginBottom: 6,
    fontSize: '0.82rem',
  },
  msgMine: { marginLeft: 'auto', backgroundColor: '#1b2e1a' },
  inputRow: { display: 'flex', gap: 8, borderTop: '1px solid #2a2a2a', padding: '0.6rem 0.8rem' },
  input: {
    flex: 1,
    backgroundColor: '#11141c',
    border: '1px solid #2a3140',
    borderRadius: 10,
    color: '#dfe6f0',
    padding: '0.5rem 0.7rem',
    fontSize: '0.82rem',
  },
  sendBtn: {
    background: '#2f7a2f',
    border: '1px solid #3f9a3f',
    borderRadius: 10,
    color: '#fff',
    padding: '0.5rem 0.9rem',
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  emptyPane: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#687083',
  },
};
