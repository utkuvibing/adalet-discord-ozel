import React, { useState, useCallback, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Link as LinkIcon, LogIn, Loader2 } from 'lucide-react';
import { useSocketContext } from '../context/SocketContext';
import { getSavedIdentity } from '../utils/identity';
import { theme } from '../theme';

// Vite resolves this asset path at build time.
import appLogo from '../../../resources/app-logo.png';

function parseInvite(raw: string): { serverAddress: string; token: string } | null {
  const trimmed = raw.trim();
  const deepMatch = trimmed.match(/^theinn:\/\/join\/(.+)\/([^/]+)$/);
  if (deepMatch) return { serverAddress: deepMatch[1], token: deepMatch[2] };
  const urlMatch = trimmed.match(/^(https?:\/\/[^/]+)\/(.+)$/);
  if (urlMatch) return { serverAddress: urlMatch[1], token: urlMatch[2] };
  const lanMatch = trimmed.match(/^([^:]+):(\d+)\/(.+)$/);
  if (lanMatch) return { serverAddress: `${lanMatch[1]}:${lanMatch[2]}`, token: lanMatch[3] };
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
  const [clipboardPasted, setClipboardPasted] = useState(false);

  useEffect(() => {
    if (isHostMode || deepLinkInvite) return;
    let cancelled = false;
    navigator.clipboard.readText().then((text) => {
      if (cancelled || !text) return;
      const parsed = parseInvite(text.trim());
      if (parsed) {
        setInviteLink(text.trim());
        setClipboardPasted(true);
        setTimeout(() => { if (!cancelled) setClipboardPasted(false); }, 2000);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isHostMode, deepLinkInvite]);

  const isConnecting = connectionState === 'connecting';
  const isHostConnect = isHostMode;
  const canSubmit = displayName.trim().length > 0 && (isHostConnect || inviteLink.trim().length > 0) && !isConnecting;

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setParseError(null);
      if (isHostConnect) {
        connect(`localhost:${hostPort}`, '', displayName.trim(), 'skull');
        return;
      }
      const parsed = parseInvite(inviteLink);
      if (!parsed) {
        setParseError('Invalid invite format.');
        return;
      }
      connect(parsed.serverAddress, parsed.token, displayName.trim(), 'skull');
    },
    [inviteLink, displayName, connect, isHostConnect, hostPort]
  );

  return (
    <div style={styles.wrapper}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 115 }}
        style={styles.shell}
        className="glass"
      >
        <div style={styles.heroPane}>
          <motion.img
            initial={{ rotate: -8, scale: 0.85 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 12 }}
            src={appLogo}
            alt="The Inn Logo"
            style={styles.logoImage}
          />
          <h1 style={styles.title}>The Inn</h1>
          <p style={styles.subtitle}>Tavern voice halls for your party.</p>
          <div style={styles.heroList}>
            <p style={styles.heroItem}>Private invite rooms and direct whispers</p>
            <p style={styles.heroItem}>Drop in, share screen, move between chambers</p>
            <p style={styles.heroItem}>No public server chaos, only your crew</p>
          </div>
        </div>

        <div style={styles.formPane}>
          <header style={styles.header}>
            <p style={styles.kicker}>{isHostMode ? 'Host Mode' : 'Join Mode'}</p>
            <h2 style={styles.formTitle}>
              {isHostMode ? 'Open your tavern gate' : 'Enter with invite'}
            </h2>
          </header>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Display Name</label>
              <div style={styles.inputWrapper}>
                <User size={18} style={styles.inputIcon} />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How should friends call you?"
                  style={styles.input}
                  maxLength={32}
                  autoFocus
                />
              </div>
            </div>

            {!isHostConnect && (
              <div style={styles.inputGroup}>
                <label style={styles.label}>Invite Link</label>
                <div style={styles.inputWrapper}>
                  <LinkIcon size={18} style={styles.inputIcon} />
                  <input
                    type="text"
                    value={inviteLink}
                    onChange={(e) => {
                      setInviteLink(e.target.value);
                      setParseError(null);
                      setClipboardPasted(false);
                    }}
                    placeholder="Paste the invitation here"
                    style={styles.input}
                  />
                </div>
                <AnimatePresence>
                  {clipboardPasted && (
                    <motion.span initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={styles.hint}>
                      Autofilled from clipboard!
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            )}

            <motion.button
              whileHover={canSubmit ? { scale: 1.02 } : {}}
              whileTap={canSubmit ? { scale: 0.98 } : {}}
              type="submit"
              disabled={!canSubmit}
              style={{
                ...styles.button,
                opacity: canSubmit ? 1 : 0.5,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              {isConnecting ? (
                <>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  <span>Enter The Inn</span>
                </>
              )}
            </motion.button>

            {(parseError || error) && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.error}>
                {parseError || error}
              </motion.p>
            )}
          </form>
        </div>
      </motion.div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: theme.colors.bgDarkest,
    padding: '2rem',
    backgroundImage:
      'radial-gradient(circle at 50% 18%, rgba(227, 170, 106, 0.2) 0%, rgba(227, 170, 106, 0.08) 30%, transparent 62%), radial-gradient(circle at 8% 10%, rgba(145, 168, 196, 0.08) 0%, transparent 35%)',
  },
  shell: {
    display: 'grid',
    gridTemplateColumns: 'minmax(280px, 38%) minmax(320px, 1fr)',
    width: '100%',
    maxWidth: '980px',
    minHeight: '560px',
    borderRadius: '22px',
    overflow: 'hidden',
    border: `1px solid ${theme.colors.borderSubtle}`,
    boxShadow: theme.shadows.lg,
  },
  heroPane: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '0.9rem',
    padding: '2.2rem 2rem',
    background:
      'radial-gradient(circle at 42% 14%, rgba(227,170,106,0.28) 0%, rgba(227,170,106,0.08) 34%, transparent 64%), linear-gradient(180deg, rgba(18,13,10,0.94) 0%, rgba(10,7,5,0.94) 100%)',
    borderRight: `1px solid ${theme.colors.borderSubtle}`,
  },
  formPane: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '1.6rem',
    padding: '2.2rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  kicker: {
    margin: 0,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontSize: '0.68rem',
    fontWeight: 700,
  },
  formTitle: {
    margin: 0,
    color: theme.colors.textPrimary,
    fontSize: '1.6rem',
    fontFamily: theme.font.familyDisplay,
    fontWeight: 'normal',
    letterSpacing: '0.01em',
  },
  logoImage: {
    width: '96px',
    height: '96px',
    objectFit: 'contain',
    marginBottom: '0.2rem',
    filter: `drop-shadow(0 0 12px ${theme.colors.accentDim})`,
  },
  title: {
    color: theme.colors.accent,
    fontSize: '3.2rem',
    fontFamily: theme.font.familyDisplay,
    margin: 0,
    textShadow: '0 0 20px rgba(227, 170, 106, 0.35)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: '0.92rem',
    margin: 0,
    opacity: 0.95,
  },
  heroList: {
    marginTop: '0.8rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  heroItem: {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: '0.8rem',
    paddingLeft: '0.8rem',
    borderLeft: `2px solid ${theme.colors.accentBorder}`,
    lineHeight: 1.4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.2rem',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    paddingLeft: '0.2rem',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '1rem',
    color: theme.colors.textMuted,
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(31, 21, 14, 0.78)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: theme.radius,
    color: theme.colors.textPrimary,
    padding: '0.8rem 1rem 0.8rem 2.8rem',
    fontSize: theme.font.sizeMd,
    outline: 'none',
    transition: 'all 0.2s',
  },
  button: {
    background: theme.colors.accent,
    border: 'none',
    borderRadius: theme.radius,
    color: '#1f140d',
    padding: '1rem',
    fontSize: theme.font.sizeMd,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.8rem',
    marginTop: '0.5rem',
    boxShadow: theme.shadows.glow,
  },
  hint: {
    color: theme.colors.accent,
    fontSize: '0.7rem',
    paddingLeft: '0.2rem',
    marginTop: '0.2rem',
  },
  error: {
    color: theme.colors.error,
    fontSize: theme.font.sizeSm,
    textAlign: 'center',
    margin: 0,
    backgroundColor: 'rgba(255, 75, 75, 0.1)',
    padding: '0.6rem',
    borderRadius: theme.radiusSm,
    border: '1px solid rgba(255, 75, 75, 0.2)',
  },
};
