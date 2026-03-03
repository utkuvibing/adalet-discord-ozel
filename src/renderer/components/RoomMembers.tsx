import React from 'react';
import type { PeerInfo, VoiceState } from '../../shared/types';
import { getAvatarEmoji } from '../../shared/avatars';

interface RoomMembersProps {
  members: PeerInfo[];
  voiceStates: Map<string, VoiceState>;
  speakingPeers: Set<string>;
  onMemberRightClick: (socketId: string, event: React.MouseEvent) => void;
  isHost: boolean;
}

// ---------------------------------------------------------------------------
// Small inline icons for muted/deafened indicators
// ---------------------------------------------------------------------------

function MicMutedIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function DeafenedIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 1 1 18 0v6" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Inject CSS keyframes for speaking pulse animation (once)
const STYLE_ID = 'speaking-pulse-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes speakingPulse {
      0%   { box-shadow: 0 0 4px 1px rgba(127,255,0,0.4); border-color: rgba(127,255,0,0.6); }
      50%  { box-shadow: 0 0 12px 4px rgba(127,255,0,0.7); border-color: #7fff00; }
      100% { box-shadow: 0 0 4px 1px rgba(127,255,0,0.4); border-color: rgba(127,255,0,0.6); }
    }
  `;
  document.head.appendChild(style);
}

export function RoomMembers({ members, voiceStates, speakingPeers, onMemberRightClick, isHost }: RoomMembersProps): React.JSX.Element {
  if (members.length === 0) {
    return <p style={styles.empty}>No one here</p>;
  }

  const handleDragStart = (e: React.DragEvent, member: PeerInfo) => {
    if (!isHost) return;
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      'application/x-user-drag',
      JSON.stringify({ socketId: member.socketId, displayName: member.displayName })
    );
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  return (
    <ul style={styles.list}>
      {members.map((member) => {
        const isSpeaking = speakingPeers.has(member.socketId);
        const vs = voiceStates.get(member.socketId);
        const isMuted = vs?.muted ?? false;
        const isDeafened = vs?.deafened ?? false;

        return (
          <li
            key={member.socketId}
            style={{
              ...styles.item,
              ...(isSpeaking ? styles.itemSpeaking : styles.itemSilent),
              ...(isHost ? { cursor: 'grab' } : {}),
            }}
            className={isSpeaking ? 'speaking-member' : ''}
            draggable={isHost}
            onDragStart={(e) => handleDragStart(e, member)}
            onDragEnd={handleDragEnd}
            onContextMenu={(e) => {
              e.preventDefault();
              onMemberRightClick(member.socketId, e);
            }}
          >
            {/* Speaking indicator dot */}
            {isSpeaking && <span style={styles.speakingDot} />}
            <span style={styles.avatarBg}>
              <span style={styles.avatar}>{getAvatarEmoji(member.avatarId)}</span>
            </span>
            <span style={{
              ...styles.name,
              ...(isSpeaking ? { color: '#7fff00', fontWeight: 'bold' } : {}),
            }}>{member.displayName}</span>
            {/* Voice state icons */}
            {isDeafened && <DeafenedIcon />}
            {isMuted && !isDeafened && <MicMutedIcon />}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  list: {
    listStyle: 'none',
    margin: 0,
    padding: '0.2rem 0 0.2rem 1rem',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.3rem 0.4rem',
    fontSize: '0.8rem',
    color: '#c0c0c0',
    borderRadius: '8px',
    border: '1px solid transparent',
    marginBottom: '2px',
    cursor: 'default',
    transition: 'background-color 0.12s',
  },
  itemSpeaking: {
    animation: 'speakingPulse 1.2s ease-in-out infinite',
    backgroundColor: 'rgba(127,255,0,0.05)',
  },
  itemSilent: {
    transition: 'box-shadow 0.3s ease-out, border-color 0.3s ease-out, background-color 0.12s',
  },
  speakingDot: {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#7fff00',
    flexShrink: 0,
    boxShadow: '0 0 4px 1px rgba(127,255,0,0.6)',
  },
  avatarBg: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#1a1a1a',
    flexShrink: 0,
  },
  avatar: {
    fontSize: '0.85rem',
    lineHeight: 1,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  empty: {
    color: '#666',
    fontSize: '0.75rem',
    margin: 0,
    padding: '0.2rem 0 0.2rem 1.2rem',
  },
};
