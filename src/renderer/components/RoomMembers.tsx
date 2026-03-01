import React from 'react';
import type { PeerInfo } from '../../shared/types';

interface RoomMembersProps {
  members: PeerInfo[];
}

export function RoomMembers({ members }: RoomMembersProps): React.JSX.Element {
  if (members.length === 0) {
    return <p style={styles.empty}>No one here</p>;
  }

  return (
    <ul style={styles.list}>
      {members.map((member) => (
        <li key={member.socketId} style={styles.item}>
          <span style={styles.dot} />
          <span style={styles.name}>{member.displayName}</span>
        </li>
      ))}
    </ul>
  );
}

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
    padding: '0.2rem 0',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    color: '#c0c0c0',
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
  },
  empty: {
    color: '#666',
    fontSize: '0.75rem',
    fontFamily: 'monospace',
    margin: 0,
    padding: '0.2rem 0 0.2rem 1.2rem',
  },
};
