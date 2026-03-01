import React, { useState } from 'react';
import type { RoomWithMembers, VoiceState } from '../../shared/types';
import { RoomMembers } from './RoomMembers';

interface RoomListProps {
  rooms: RoomWithMembers[];
  activeRoomId: number | null;
  onJoinRoom: (roomId: number) => void;
  onLeaveRoom: () => void;
  // Voice data forwarded to RoomMembers
  voiceStates: Map<string, VoiceState>;
  speakingPeers: Set<string>;
  onMemberRightClick: (socketId: string, event: React.MouseEvent) => void;
}

export function RoomList({ rooms, activeRoomId, onJoinRoom, onLeaveRoom, voiceStates, speakingPeers, onMemberRightClick }: RoomListProps): React.JSX.Element {
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);

  const toggleExpand = (roomId: number) => {
    setExpandedRoomId((prev) => (prev === roomId ? null : roomId));
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.header}>Rooms</h3>

      <div style={styles.roomList}>
        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;
          const isExpanded = room.id === expandedRoomId;

          return (
            <div key={room.id} style={styles.roomBlock}>
              <div
                style={{
                  ...styles.roomRow,
                  ...(isActive ? styles.roomRowActive : {}),
                }}
              >
                <button
                  style={styles.expandBtn}
                  onClick={() => toggleExpand(room.id)}
                  title={isExpanded ? 'Collapse' : 'Expand members'}
                >
                  {isExpanded ? '\u25BC' : '\u25B6'}
                </button>

                <button
                  style={styles.roomName}
                  onClick={() => onJoinRoom(room.id)}
                  title={`Join ${room.name}`}
                >
                  {room.name}
                </button>

                <span style={styles.count}>({room.members.length})</span>
              </div>

              {isExpanded && (
                <RoomMembers
                  members={room.members}
                  voiceStates={voiceStates}
                  speakingPeers={speakingPeers}
                  onMemberRightClick={onMemberRightClick}
                />
              )}
            </div>
          );
        })}
      </div>

      {activeRoomId !== null && (
        <button style={styles.leaveBtn} onClick={onLeaveRoom}>
          Leave Room
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    color: '#7fff00',
    fontSize: '0.9rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '0.8rem 0.8rem 0.4rem',
    margin: 0,
  },
  roomList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 0.4rem',
  },
  roomBlock: {
    marginBottom: '0.2rem',
  },
  roomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.4rem',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  roomRowActive: {
    backgroundColor: '#1f2f1f',
    border: '1px solid #3a5a3a',
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '0.6rem',
    padding: '0.1rem 0.2rem',
    lineHeight: 1,
  },
  roomName: {
    background: 'none',
    border: 'none',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
    padding: 0,
    flex: 1,
    textAlign: 'left' as const,
  },
  count: {
    color: '#888',
    fontSize: '0.75rem',
  },
  leaveBtn: {
    margin: '0.5rem 0.8rem',
    backgroundColor: '#2a1a1a',
    border: '1px solid #ff4444',
    borderRadius: '8px',
    color: '#ff4444',
    padding: '0.4rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
