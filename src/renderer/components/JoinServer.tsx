import React, { useState, useCallback, FormEvent } from 'react';
import { useSocketContext } from '../context/SocketContext';
import { AVATARS, AvatarId } from '../../shared/avatars';

/** Parse invite string format: host:port/token */
function parseInvite(raw: string): { serverAddress: string; token: string } | null {
  const match = raw.trim().match(/^([^:]+):(\d+)\/(.+)$/);
  if (!match) return null;
  const [, host, port, token] = match;
  return { serverAddress: `${host}:${port}`, token };
}

interface JoinServerProps {
  isHostMode?: boolean;
  hostPort?: number;
}

export function JoinServer({ isHostMode, hostPort }: JoinServerProps): React.JSX.Element {
  const { connectionState, error, connect } = useSocketContext();
  const [displayName, setDisplayName] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarId>(AVATARS[0].id);

  const isConnecting = connectionState === 'connecting';
  const canSubmit = displayName.trim().length > 0 && (isHostMode || inviteLink.trim().length > 0) && !isConnecting;

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setParseError(null);

      if (isHostMode) {
        // Host connects to localhost without invite token
        connect(`localhost:${hostPort}`, '', displayName.trim(), selectedAvatar);
        return;
      }

      const parsed = parseInvite(inviteLink);
      if (!parsed) {
        setParseError('Invalid invite format. Expected: host:port/token');
        return;
      }

      connect(parsed.serverAddress, parsed.token, displayName.trim(), selectedAvatar);
    },
    [inviteLink, displayName, selectedAvatar, connect, isHostMode, hostPort]
  );

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>Sex Dungeon</h1>

        <label style={styles.label}>
          Display Name
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            style={styles.input}
            maxLength={32}
            autoFocus
          />
        </label>

        <div style={styles.avatarSection}>
          <span style={styles.avatarLabel}>Choose Avatar</span>
          <div style={styles.avatarGrid}>
            {AVATARS.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                title={avatar.label}
                onClick={() => setSelectedAvatar(avatar.id)}
                style={{
                  ...styles.avatarCell,
                  ...(selectedAvatar === avatar.id ? styles.avatarSelected : {}),
                }}
              >
                {avatar.emoji}
              </button>
            ))}
          </div>
        </div>

        {!isHostMode && (
          <label style={styles.label}>
            Invite Link
            <input
              type="text"
              value={inviteLink}
              onChange={(e) => {
                setInviteLink(e.target.value);
                setParseError(null);
              }}
              placeholder="Paste invite link here"
              style={styles.input}
            />
          </label>
        )}

        <button type="submit" disabled={!canSubmit} style={styles.button}>
          {isConnecting ? 'Connecting...' : 'Connect'}
        </button>

        {parseError && <p style={styles.error}>{parseError}</p>}
        {error && <p style={styles.error}>{error}</p>}
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#0d0d0d',
    padding: '1rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    backgroundColor: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '2rem',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    color: '#7fff00',
    fontSize: '1.8rem',
    fontFamily: 'monospace',
    textAlign: 'center' as const,
    margin: 0,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    color: '#b0b0b0',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
  },
  input: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '4px',
    color: '#e0e0e0',
    padding: '0.6rem 0.8rem',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    outline: 'none',
  },
  avatarSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  avatarLabel: {
    color: '#b0b0b0',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
  },
  avatarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.4rem',
  },
  avatarCell: {
    background: '#1a1a1a',
    border: '2px solid transparent',
    borderRadius: '6px',
    padding: '0.4rem',
    cursor: 'pointer',
    fontSize: '1.5rem',
    textAlign: 'center' as const,
    lineHeight: 1,
  },
  avatarSelected: {
    border: '2px solid #7fff00',
    background: '#1a2a1a',
  },
  button: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #7fff00',
    borderRadius: '4px',
    color: '#7fff00',
    padding: '0.7rem',
    fontSize: '1rem',
    fontFamily: 'monospace',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  error: {
    color: '#ff4444',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    margin: 0,
    textAlign: 'center' as const,
  },
};
