import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, Volume2, Plus, Trash2, ChevronRight, ChevronDown, LogOut } from 'lucide-react';
import type { RoomWithMembers, VoiceState, PeerInfo } from '../../shared/types';
import type { TypedSocket } from '../hooks/useSocket';
import { RoomMembers } from './RoomMembers';
import { theme } from '../theme';

interface RoomListProps {
  rooms: RoomWithMembers[];
  activeRoomId: number | null;
  onJoinRoom: (roomId: number) => void;
  onLeaveRoom: () => void;
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
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [userDragOverId, setUserDragOverId] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeRoomId !== null) setExpandedRoomId(activeRoomId);
  }, [activeRoomId]);

  const toggleExpand = (e: React.MouseEvent, roomId: number) => {
    e.stopPropagation();
    setExpandedRoomId((prev) => (prev === roomId ? null : roomId));
  };

  const handleDragStart = useCallback((e: React.DragEvent, roomId: number) => {
    dragItemRef.current = roomId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-room-drag', String(roomId));
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '0.5';
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1';
    setDragOverId(null);
    setUserDragOverId(null);
    dragItemRef.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, roomId: number) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/x-user-drag')) {
      setUserDragOverId(roomId);
      setDragOverId(null);
    } else {
      setDragOverId(roomId);
      setUserDragOverId(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetRoomId: number) => {
    e.preventDefault();
    setDragOverId(null);
    setUserDragOverId(null);

    const userDragData = e.dataTransfer.getData('application/x-user-drag');
    if (userDragData) {
      try {
        const { socketId } = JSON.parse(userDragData);
        socket?.emit('room:move-user', { socketId, targetRoomId });
      } catch { /* ignore */ }
      return;
    }

    const draggedRoomId = dragItemRef.current;
    if (draggedRoomId === null || draggedRoomId === targetRoomId) return;

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
        <h3 style={styles.header}>Channels</h3>
        {isHost && (
          <motion.button
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(127, 255, 0, 0.2)' }}
            whileTap={{ scale: 0.9 }}
            style={styles.addBtn}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={styles.createRow}
          >
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="new-room-name"
              maxLength={50}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newRoomName.trim()) {
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
          </motion.div>
        )}
      </AnimatePresence>

      <div style={styles.roomList}>
        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;
          const isExpanded = room.id === expandedRoomId;
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
              onDragLeave={() => { setDragOverId(null); setUserDragOverId(null); }}
              onDrop={(e) => handleDrop(e, room.id)}
            >
              <motion.div
                whileHover={{ backgroundColor: isActive ? 'rgba(127, 255, 0, 0.08)' : 'rgba(255, 255, 255, 0.03)' }}
                style={{
                  ...styles.roomRow,
                  ...(isActive ? styles.roomRowActive : {}),
                }}
                onClick={() => onJoinRoom(room.id)}
              >
                <div style={{ ...styles.accentIndicator, opacity: isActive ? 1 : 0 }} />

                <button style={styles.expandBtn} onClick={(e) => toggleExpand(e, room.id)}>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <div style={styles.roomMain}>
                  {room.members.length > 0 ? (
                    <Volume2 size={16} color={isActive ? theme.colors.accent : theme.colors.textSecondary} />
                  ) : (
                    <Hash size={16} color={theme.colors.textMuted} />
                  )}
                  <span style={{
                    ...styles.roomName,
                    color: isActive ? theme.colors.accent : theme.colors.textPrimary,
                  }}>
                    {room.name}
                  </span>
                </div>

                {room.members.length > 0 && (
                  <span style={{
                    ...styles.count,
                    ...(isActive ? styles.countActive : {}),
                  }}>
                    {room.members.length}
                  </span>
                )}

                {isHost && !room.isDefault && (
                  <button
                    className="delete-btn"
                    style={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      socket?.emit('room:delete', room.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </motion.div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <RoomMembers
                      members={room.members}
                      voiceStates={voiceStates}
                      speakingPeers={speakingPeers}
                      onMemberRightClick={onMemberRightClick}
                      onMemberClick={onMemberClick}
                      serverAddress={serverAddress}
                      isHost={isHost}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {activeRoomId !== null && (
        <motion.button
          whileHover={{ scale: 1.02, backgroundColor: 'rgba(255, 75, 75, 0.1)' }}
          whileTap={{ scale: 0.98 }}
          style={styles.leaveBtn}
          onClick={onLeaveRoom}
        >
          <LogOut size={16} /> Leave Current Room
        </motion.button>
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
    padding: '1.2rem 1rem 0.6rem',
  },
  header: {
    color: theme.colors.textMuted,
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: 0,
    fontFamily: theme.font.familyDisplay,
  },
  addBtn: {
    background: 'transparent',
    border: 'none',
    color: theme.colors.textMuted,
    cursor: 'pointer',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px',
    transition: 'color 0.2s',
  },
  createRow: {
    padding: '0 1rem 0.8rem',
    overflow: 'hidden',
  },
  createInput: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: theme.radiusSm,
    color: theme.colors.textPrimary,
    padding: '0.5rem 0.8rem',
    fontSize: theme.font.sizeSm,
    outline: 'none',
  },
  roomList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 0.5rem',
  },
  roomBlock: {
    marginBottom: '2px',
    borderRadius: theme.radiusSm,
    transition: 'all 0.2s',
  },
  roomBlockDragOver: {
    borderTop: `2px solid ${theme.colors.accent}`,
  },
  roomBlockUserDragOver: {
    backgroundColor: 'rgba(127,255,0,0.05)',
    boxShadow: `inset 0 0 0 1px ${theme.colors.accentBorder}`,
  },
  roomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.5rem 0.6rem',
    borderRadius: '8px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background-color 0.2s',
  },
  roomRowActive: {
    backgroundColor: 'rgba(127, 255, 0, 0.08)',
  },
  accentIndicator: {
    position: 'absolute',
    left: '-2px',
    width: '4px',
    height: '24px',
    borderRadius: '0 4px 4px 0',
    backgroundColor: theme.colors.accent,
    boxShadow: theme.shadows.glow,
    transition: 'opacity 0.2s',
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.textMuted,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  roomMain: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    overflow: 'hidden',
  },
  roomName: {
    fontSize: theme.font.sizeMd,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    letterSpacing: '0.01em',
  },
  count: {
    color: theme.colors.textMuted,
    fontSize: '0.7rem',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: '10px',
    padding: '0.1rem 0.5rem',
    fontWeight: 600,
  },
  countActive: {
    color: theme.colors.accent,
    backgroundColor: 'rgba(127,255,0,0.1)',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: theme.colors.textMuted,
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    opacity: 0.6,
  },
  leaveBtn: {
    margin: '1rem',
    background: 'rgba(255, 75, 75, 0.05)',
    border: `1px solid rgba(255, 75, 75, 0.2)`,
    borderRadius: theme.radiusSm,
    color: theme.colors.error,
    padding: '0.6rem',
    fontSize: theme.font.sizeSm,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.6rem',
  },
};
