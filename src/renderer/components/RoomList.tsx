import React, { useState, useRef, useCallback } from 'react';
import type { RoomWithMembers, VoiceState } from '../../shared/types';
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
  isHost: boolean;
  socket: TypedSocket | null;
}

export function RoomList({ rooms, activeRoomId, onJoinRoom, onLeaveRoom, voiceStates, speakingPeers, onMemberRightClick, isHost, socket }: RoomListProps): React.JSX.Element {
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  const toggleExpand = (roomId: number) => {
    setExpandedRoomId((prev) => (prev === roomId ? null : roomId));
  };

  // Drag-and-drop handlers (host only)
  const handleDragStart = useCallback((e: React.DragEvent, roomId: number) => {
    dragItemRef.current = roomId;
    e.dataTransfer.effectAllowed = 'move';
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
    dragItemRef.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, roomId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(roomId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetRoomId: number) => {
    e.preventDefault();
    setDragOverId(null);
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

          return (
            <div
              key={room.id}
              style={{
                ...styles.roomBlock,
                ...(dragOverId === room.id ? styles.roomBlockDragOver : {}),
              }}
              draggable={isHost}
              onDragStart={(e) => handleDragStart(e, room.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, room.id)}
              onDrop={(e) => handleDrop(e, room.id)}
            >
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
    padding: '0.8rem 0.8rem 0.4rem',
  },
  header: {
    color: '#7fff00',
    fontSize: '0.85rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    margin: 0,
  },
  addBtn: {
    background: 'none',
    border: '1px solid #2a2a2a',
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
    padding: '0 0.8rem 0.4rem',
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
    padding: '0 0.4rem',
  },
  roomBlock: {
    marginBottom: '0.2rem',
    transition: 'border-color 0.15s',
    borderTop: '2px solid transparent',
  },
  roomBlockDragOver: {
    borderTopColor: '#7fff00',
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
