import React, { useState, useCallback, useEffect, FormEvent } from 'react';
import { useSocketContext } from '../context/SocketContext';
import { AVATARS, AvatarId } from '../../shared/avatars';
import { getSavedIdentity } from '../utils/identity';

/** Parse invite string — supports deep links, LAN, and tunnel formats */
function parseInvite(raw: string): { serverAddress: string; token: string } | null {
  const trimmed = raw.trim();

  // Deep link: theinn://join/host:port/TOKEN
  const deepMatch = trimmed.match(/^theinn:\/\/join\/(.+)\/([^/]+)$/);
  if (deepMatch) {
    return { serverAddress: deepMatch[1], token: deepMatch[2] };
  }

  // Tunnel URL: https://domain.com/TOKEN or http://domain.com/TOKEN
  const urlMatch = trimmed.match(/^(https?:\/\/[^/]+)\/(.+)$/);
  if (urlMatch) {
    const [, origin, token] = urlMatch;
    return { serverAddress: origin, token };
  }

  // LAN: host:port/TOKEN
  const lanMatch = trimmed.match(/^([^:]+):(\d+)\/(.+)$/);
  if (lanMatch) {
    const [, host, port, token] = lanMatch;
    return { serverAddress: `${host}:${port}`, token };
  }

  return null;
}

interface JoinServerProps {
  isHostMode?: boolean;
  hostPort?: number;
  deepLinkInvite?: string;
}

export function JoinServer({ isHostMode, hostPort, deepLinkInvite }: JoinServerProps): React.JSX.Element {
  const { connectionState, error, connect } = useSocketContext();
  const saved = getSavedIdentity();
  const [displayName, setDisplayName] = useState(saved?.displayName ?? '');
  const [inviteLink, setInviteLink] = useState(deepLinkInvite ?? '');
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarId>((saved?.avatarId as AvatarId) ?? AVATARS[0].id);
  const [joinMode, setJoinMode] = useState<'host' | 'join'>(isHostMode ? 'host' : 'join');
  const [clipboardPasted, setClipboardPasted] = useState(false);

  // Phase 3: Auto-detect invite link from clipboard on mount (guest mode only)
  useEffect(() => {
    if (isHostMode || deepLinkInvite) return; // Skip for host or if deep link already set
    let cancelled = false;
    navigator.clipboard.readText().then((text) => {
      if (cancelled || !text) return;
      const parsed = parseInvite(text.trim());
      if (parsed) {
        setInviteLink(text.trim());
        setClipboardPasted(true);
        setTimeout(() => { if (!cancelled) setClipboardPasted(false); }, 2000);
      }
    }).catch(() => {
      // Clipboard access denied — silently ignore
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isConnecting = connectionState === 'connecting';
  const isHostConnect = isHostMode && joinMode === 'host';
  const canSubmit = displayName.trim().length > 0 && (isHostConnect || inviteLink.trim().length > 0) && !isConnecting;

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setParseError(null);

      if (isHostConnect) {
        // Host connects to localhost without invite token
        connect(`localhost:${hostPort}`, '', displayName.trim(), selectedAvatar);
        return;
      }

      const parsed = parseInvite(inviteLink);
      if (!parsed) {
        setParseError('Invalid invite format. Expected: host:port/token or https://domain/token');
        return;
      }

      connect(parsed.serverAddress, parsed.token, displayName.trim(), selectedAvatar);
    },
    [inviteLink, displayName, selectedAvatar, connect, isHostConnect, hostPort]
  );

  // Animation delay helper for staggered entrance
  const stagger = (index: number) => ({
    animation: `slideUp 0.3s ease-out ${0.1 + index * 0.05}s both`,
  });

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={{ ...styles.title, animation: 'fadeIn 0.4s ease-out 0.1s both' }}>The Inn</h1>

        <label style={{ ...styles.label, ...stagger(0) }}>
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

        <div style={{ ...styles.avatarSection, ...stagger(1) }}>
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

        {isHostMode && (
          <div style={{ ...styles.modeToggle, ...stagger(2) }}>
            <button
              type="button"
              style={{ ...styles.modeBtn, ...(joinMode === 'host' ? styles.modeBtnActive : {}) }}
              onClick={() => setJoinMode('host')}
            >
              Host Server
            </button>
            <button
              type="button"
              style={{ ...styles.modeBtn, ...(joinMode === 'join' ? styles.modeBtnActive : {}) }}
              onClick={() => setJoinMode('join')}
            >
              Join Server
            </button>
          </div>
        )}

        {!isHostConnect && (
          <label style={{ ...styles.label, ...stagger(3) }}>
            Invite Link
            <input
              type="text"
              value={inviteLink}
              onChange={(e) => {
                setInviteLink(e.target.value);
                setParseError(null);
                setClipboardPasted(false);
              }}
              placeholder="Paste invite link here"
              style={styles.input}
            />
            {clipboardPasted && (
              <span style={styles.clipboardHint}>Pasted from clipboard</span>
            )}
          </label>
        )}

        <button type="submit" disabled={!canSubmit} style={{ ...styles.button, animation: 'slideUp 0.3s ease-out 0.3s both' }}>
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
    animation: 'scaleIn 0.3s ease-out',
  },
  title: {
    color: '#7fff00',
    fontSize: '1.8rem',
    fontWeight: 700,
    textAlign: 'center' as const,
    margin: 0,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    color: '#b0b0b0',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  input: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '0.6rem 0.8rem',
    fontSize: '0.9rem',
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
    fontWeight: 500,
  },
  avatarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.4rem',
  },
  avatarCell: {
    background: '#1a1a1a',
    border: '2px solid transparent',
    borderRadius: '8px',
    padding: '0.4rem',
    cursor: 'pointer',
    fontSize: '1.5rem',
    textAlign: 'center' as const,
    lineHeight: 1,
    transition: 'transform 0.15s, border-color 0.2s',
  },
  avatarSelected: {
    border: '2px solid #7fff00',
    background: '#1a2a1a',
  },
  button: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #7fff00',
    borderRadius: '8px',
    color: '#7fff00',
    padding: '0.7rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  modeToggle: {
    display: 'flex',
    gap: '0.4rem',
  },
  modeBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    color: '#b0b0b0',
    padding: '0.5rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontWeight: 500,
  },
  modeBtnActive: {
    borderColor: '#7fff00',
    color: '#7fff00',
  },
  error: {
    color: '#ff4444',
    fontSize: '0.85rem',
    margin: 0,
    textAlign: 'center' as const,
  },
  clipboardHint: {
    color: '#4caf50',
    fontSize: '0.75rem',
    animation: 'slideUp 0.2s ease-out',
  },
};
