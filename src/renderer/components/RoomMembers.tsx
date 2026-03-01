import React from 'react';
import type { PeerInfo, VoiceState } from '../../shared/types';

interface RoomMembersProps {
  members: PeerInfo[];
  voiceStates: Map<string, VoiceState>;
  speakingPeers: Set<string>;
  onMemberRightClick: (socketId: string, event: React.MouseEvent) => void;
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

export function RoomMembers({ members, voiceStates, speakingPeers, onMemberRightClick }: RoomMembersProps): React.JSX.Element {
  if (members.length === 0) {
    return <p style={styles.empty}>No one here</p>;
  }

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
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onMemberRightClick(member.socketId, e);
            }}
          >
            <span style={styles.dot} />
            <span style={styles.name}>{member.displayName}</span>
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
    padding: '0 0 0 1.2rem',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.2rem 0.3rem',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    color: '#c0c0c0',
    borderRadius: '4px',
    border: '1px solid transparent',
    marginBottom: '1px',
    cursor: 'default',
  },
  itemSpeaking: {
    boxShadow: '0 0 8px 2px #7fff00',
    border: '1px solid #7fff00',
    transition: 'box-shadow 0.15s ease-in-out, border-color 0.15s ease-in-out',
  },
  itemSilent: {
    transition: 'box-shadow 0.3s ease-out, border-color 0.3s ease-out',
  },
  dot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#7fff00',
    flexShrink: 0,
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
    fontFamily: 'monospace',
    margin: 0,
    padding: '0.2rem 0 0.2rem 1.2rem',
  },
};
