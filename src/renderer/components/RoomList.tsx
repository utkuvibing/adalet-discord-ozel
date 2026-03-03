import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { RoomWithMembers, VoiceState, PeerInfo } from '../../shared/types';
import type { TypedSocket } from '../hooks/useSocket';
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
  onMemberClick?: (member: PeerInfo) => void;
  serverAddress: string;
  isHost: boolean;
  socket: TypedSocket | null;
}

export function RoomList({ rooms, activeRoomId, onJoinRoom, onLeaveRoom, voiceStates, speakingPeers, onMemberRightClick, onMemberClick, serverAddress, isHost, socket }: RoomListProps): React.JSX.Element {
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);

  useEffect(() => {
    if (activeRoomId !== null) setExpandedRoomId(activeRoomId);
  }, [activeRoomId]);
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<number | null>(null);
  const [userDragOverId, setUserDragOverId] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  const toggleExpand = (roomId: number) => {
    setExpandedRoomId((prev) => (prev === roomId ? null : roomId));
  };

  // Drag-and-drop handlers (host only)
  const handleDragStart = useCallback((e: React.DragEvent, roomId: number) => {
    dragItemRef.current = roomId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-room-drag', String(roomId));
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDragOverId(null);
    setUserDragOverId(null);
    dragItemRef.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, roomId: number) => {
    e.preventDefault();
    // Check if this is a user drag or room drag
    if (e.dataTransfer.types.includes('application/x-user-drag')) {
      e.dataTransfer.dropEffect = 'move';
      setUserDragOverId(roomId);
      setDragOverId(null);
    } else {
      e.dataTransfer.dropEffect = 'move';
      setDragOverId(roomId);
      setUserDragOverId(null);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
    setUserDragOverId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetRoomId: number) => {
    e.preventDefault();
    setDragOverId(null);
    setUserDragOverId(null);

    // Check if this is a user drop
    const userDragData = e.dataTransfer.getData('application/x-user-drag');
    if (userDragData) {
      try {
        const { socketId } = JSON.parse(userDragData);
        socket?.emit('room:move-user', { socketId, targetRoomId });
      } catch {
        // ignore parse errors
      }
      return;
    }

    // Room reorder drop
    const draggedRoomId = dragItemRef.current;
    if (draggedRoomId === null || draggedRoomId === targetRoomId) return;

    // Compute new order
    const orderedIds = rooms.map((r) => r.id);
    const fromIndex = orderedIds.indexOf(draggedRoomId);
    const toIndex = orderedIds.indexOf(targetRoomId);
    if (fromIndex === -1 || toIndex === -1) return;

    orderedIds.splice(fromIndex, 1);
    orderedIds.splice(toIndex, 0, draggedRoomId);

    socket?.emit('room:reorder', orderedIds);
  }, [rooms, socket]);

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <h3 style={styles.header}>Rooms</h3>
        {isHost && (
          <button
            style={styles.addBtn}
            onClick={() => setCreating(true)}
            title="Create room"
          >
            +
          </button>
        )}
      </div>

      {creating && (
        <div style={styles.createRow}>
          <input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Room name"
            maxLength={50}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newRoomName.trim().length > 0) {
                socket?.emit('room:create', newRoomName.trim());
                setCreating(false);
                setNewRoomName('');
              }
              if (e.key === 'Escape') {
                setCreating(false);
                setNewRoomName('');
              }
            }}
            style={styles.createInput}
          />
        </div>
      )}

      <div style={styles.roomList}>
        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;
          const isExpanded = room.id === expandedRoomId;
          const isHovered = room.id === hoveredRoomId;
          const isUserDragOver = room.id === userDragOverId;

          return (
            <div
              key={room.id}
              style={{
                ...styles.roomBlock,
                ...(dragOverId === room.id ? styles.roomBlockDragOver : {}),
                ...(isUserDragOver ? styles.roomBlockUserDragOver : {}),
              }}
              draggable={isHost}
              onDragStart={(e) => handleDragStart(e, room.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, room.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, room.id)}
              onMouseEnter={() => setHoveredRoomId(room.id)}
              onMouseLeave={() => setHoveredRoomId(null)}
            >
              <div
                style={{
                  ...styles.roomRow,
                  ...(isActive ? styles.roomRowActive : {}),
                  ...(isHovered && !isActive ? styles.roomRowHover : {}),
                }}
              >
                {/* Left accent border indicator */}
                <div style={{
                  ...styles.accentIndicator,
                  ...(isActive ? styles.accentIndicatorActive : {}),
                }} />

                <button
                  style={styles.expandBtn}
                  onClick={() => toggleExpand(room.id)}
                  title={isExpanded ? 'Collapse' : 'Expand members'}
                >
                  {isExpanded ? '\u25BC' : '\u25B6'}
                </button>

                {/* Volume icon */}
                <span style={styles.volumeIcon}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#7fff00' : '#555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    {room.members.length > 0 && (
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    )}
                  </svg>
                </span>

                <button
                  style={styles.roomName}
                  onClick={() => onJoinRoom(room.id)}
                  title={`Join ${room.name}`}
                >
                  {room.name}
                </button>

                <span style={{
                  ...styles.count,
                  ...(room.members.length > 0 ? styles.countActive : {}),
                }}>
                  {room.members.length}
                </span>

                {isHost && !room.isDefault && (
                  <button
                    style={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      socket?.emit('room:delete', room.id);
                    }}
                    title={`Delete ${room.name}`}
                  >
                    x
                  </button>
                )}
              </div>

              {isExpanded && (
                <RoomMembers
                  members={room.members}
                  voiceStates={voiceStates}
                  speakingPeers={speakingPeers}
                  onMemberRightClick={onMemberRightClick}
                  onMemberClick={onMemberClick}
                  serverAddress={serverAddress}
                  isHost={isHost}
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
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.9rem 0.9rem 0.5rem',
  },
  header: {
    color: '#7fff00',
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    margin: 0,
    fontFamily: "'Coolvetica', 'Inter', sans-serif",
  },
  addBtn: {
    background: 'rgba(127,255,0,0.1)',
    border: '1px solid rgba(127,255,0,0.3)',
    borderRadius: '8px',
    color: '#7fff00',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 700,
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
  },
  createRow: {
    padding: '0 0.9rem 0.4rem',
  },
  createInput: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '0.4rem 0.6rem',
    fontSize: '0.85rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  roomList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 0.5rem',
  },
  roomBlock: {
    marginBottom: '2px',
    transition: 'border-color 0.15s, background-color 0.15s',
    borderTop: '2px solid transparent',
    borderRadius: '6px',
  },
  roomBlockDragOver: {
    borderTopColor: '#7fff00',
  },
  roomBlockUserDragOver: {
    backgroundColor: 'rgba(127,255,0,0.08)',
    boxShadow: 'inset 0 0 0 1px rgba(127,255,0,0.3)',
    borderRadius: '8px',
  },
  roomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.45rem 0.4rem',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.12s',
  },
  roomRowActive: {
    backgroundColor: 'rgba(127,255,0,0.08)',
  },
  roomRowHover: {
    backgroundColor: '#1e2025',
  },
  accentIndicator: {
    width: '3px',
    height: '20px',
    borderRadius: '2px',
    backgroundColor: 'transparent',
    flexShrink: 0,
    transition: 'background-color 0.15s',
  },
  accentIndicatorActive: {
    backgroundColor: '#7fff00',
    boxShadow: '0 0 6px rgba(127,255,0,0.4)',
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
  volumeIcon: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
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
    color: '#555',
    fontSize: '0.7rem',
    backgroundColor: '#1a1a1a',
    borderRadius: '10px',
    padding: '0.1rem 0.45rem',
    minWidth: '20px',
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  countActive: {
    color: '#7fff00',
    backgroundColor: 'rgba(127,255,0,0.1)',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#555',
    cursor: 'pointer',
    fontSize: '0.75rem',
    padding: '0.1rem 0.3rem',
    borderRadius: '6px',
    lineHeight: 1,
    flexShrink: 0,
    opacity: 0.6,
  },
  leaveBtn: {
    margin: '0.6rem 0.9rem',
    background: 'linear-gradient(135deg, #3a1a1a, #2a0f0f)',
    border: '1px solid #ff4444',
    borderRadius: '8px',
    color: '#ff4444',
    padding: '0.45rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
