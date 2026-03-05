import React, { useState, useCallback, useEffect } from 'react';

type ExpiryOption = { label: string; value: number | null };

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '1 Hour', value: 3600000 },
  { label: '24 Hours', value: 86400000 },
  { label: 'Never', value: null },
];

interface TailscaleStatus {
  installed: boolean;
  active: boolean;
  url: string | null;
}

export function InvitePanel(): React.JSX.Element {
  const [expiresInMs, setExpiresInMs] = useState<number | null>(86400000);
  const [maxUses, setMaxUses] = useState<string>('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLan, setCopiedLan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tsStatus, setTsStatus] = useState<TailscaleStatus>({ installed: false, active: false, url: null });

  // Check Tailscale status on mount
  useEffect(() => {
    window.electronAPI.getTailscaleStatus().then(setTsStatus);
  }, []);

  // Quick invite: one-click copy with default settings (24h, unlimited)
  const handleQuickInvite = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const result = await window.electronAPI.createInvite({
        expiresInMs: 86400000,
        maxUses: null,
      });

      // Prefer deep link format, fallback to raw LAN link
      const deepLink = `theinn://join/${result.serverAddress}/${result.token}`;
      const lanLink = `${result.serverAddress}/${result.token}`;
      setGeneratedLink(lanLink);

      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to generate invite.');
      console.error('[invite] Error creating invite:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Advanced invite with custom settings
  const handleAdvancedInvite = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const maxUsesNum = maxUses.trim() === '' || maxUses === '0' ? null : parseInt(maxUses, 10);
      const result = await window.electronAPI.createInvite({
        expiresInMs,
        maxUses: maxUsesNum,
      });

      const deepLink = `theinn://join/${result.serverAddress}/${result.token}`;
      const lanLink = `${result.serverAddress}/${result.token}`;
      setGeneratedLink(lanLink);

      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to generate invite.');
      console.error('[invite] Error creating invite:', err);
    } finally {
      setLoading(false);
    }
  }, [expiresInMs, maxUses]);

  // Copy LAN link (raw address format, no deep link)
  const handleCopyLanLink = useCallback(async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopiedLan(true);
    setTimeout(() => setCopiedLan(false), 2000);
  }, [generatedLink]);

  return (
    <div style={styles.container}>
      <h4 style={styles.header}>Invite Friends</h4>

      {/* Tailscale status badge */}
      {tsStatus.active ? (
        <div style={styles.badgeActive}>
          <span style={styles.dot} />
          Tunnel Active
          <span style={styles.badgeUrl} title={tsStatus.url ?? ''}>
            {tsStatus.url}
          </span>
        </div>
      ) : tsStatus.installed ? (
        <div style={styles.badgeWarn}>Tunnel could not start — LAN only</div>
      ) : (
        <div style={styles.badgeInfo}>
          <span>LAN only — </span>
          <a
            href="https://tailscale.com/download"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.link}
          >
            Install Tailscale
          </a>
          <span> for internet invites</span>
        </div>
      )}

      {/* Primary one-click invite button */}
      <button
        style={styles.copyBtn}
        onClick={handleQuickInvite}
        disabled={loading}
      >
        {loading ? 'Generating...' : copied ? 'Copied!' : 'Copy Invite Link'}
      </button>

      {/* Generated link preview + Copy LAN Link */}
      {generatedLink && (
        <div style={styles.previewRow}>
          <div style={styles.preview} title={generatedLink}>
            {generatedLink.length > 32
              ? generatedLink.substring(0, 29) + '...'
              : generatedLink}
          </div>
          <button style={styles.lanBtn} onClick={handleCopyLanLink}>
            {copiedLan ? 'Copied!' : 'LAN Link'}
          </button>
        </div>
      )}

      {/* Advanced toggle */}
      <button
        style={styles.advancedToggle}
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
      </button>

      {/* Collapsible advanced section */}
      <div style={{
        ...styles.advancedSection,
        maxHeight: showAdvanced ? '300px' : '0',
        opacity: showAdvanced ? 1 : 0,
        marginTop: showAdvanced ? '0.4rem' : '0',
      }}>
        {/* Expiry picker */}
        <div style={styles.expiryRow}>
          {EXPIRY_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              style={{
                ...styles.expiryBtn,
                ...(expiresInMs === opt.value ? styles.expiryBtnActive : {}),
              }}
              onClick={() => setExpiresInMs(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Max uses input */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>
            Max Uses
            <input
              type="number"
              min="0"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              style={styles.input}
            />
          </label>
        </div>

        {/* Custom invite button */}
        <button
          style={styles.copyBtn}
          onClick={handleAdvancedInvite}
          disabled={loading}
        >
          {loading ? 'Generating...' : 'Create Custom Invite'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    margin: '0.7rem',
    padding: '0.8rem',
    border: '1px solid rgba(227,170,106,0.2)',
    borderRadius: '12px',
    background: 'rgba(22, 15, 10, 0.68)',
  },
  header: {
    color: '#e3aa6a',
    fontSize: '0.9rem',
    fontFamily: "'Coolvetica', 'Inter', sans-serif",
    fontWeight: 'normal',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    margin: '0 0 0.5rem 0',
  },
  badgeActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    backgroundColor: 'rgba(227,170,106,0.08)',
    border: '1px solid rgba(227,170,106,0.2)',
    borderRadius: '8px',
    color: '#f1c48d',
    padding: '0.35rem 0.5rem',
    fontSize: '0.7rem',
    marginBottom: '0.5rem',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#e3aa6a',
    flexShrink: 0,
  },
  badgeUrl: {
    color: '#d8c5a0',
    fontSize: '0.6rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    marginLeft: 'auto',
  },
  badgeWarn: {
    backgroundColor: 'rgba(233,185,119,0.08)',
    border: '1px solid rgba(233,185,119,0.3)',
    borderRadius: '8px',
    color: '#cc9900',
    padding: '0.35rem 0.5rem',
    fontSize: '0.7rem',
    marginBottom: '0.5rem',
  },
  badgeInfo: {
    backgroundColor: 'rgba(145,168,196,0.08)',
    border: '1px solid rgba(145,168,196,0.22)',
    borderRadius: '8px',
    color: '#888',
    padding: '0.35rem 0.5rem',
    fontSize: '0.7rem',
    marginBottom: '0.5rem',
  },
  link: {
    color: '#e3aa6a',
    textDecoration: 'underline',
  },
  expiryRow: {
    display: 'flex',
    gap: '0.3rem',
    marginBottom: '0.5rem',
  },
  expiryBtn: {
    flex: 1,
    backgroundColor: 'rgba(28,20,14,0.9)',
    border: '1px solid rgba(227,170,106,0.2)',
    borderRadius: '8px',
    color: '#b0b0b0',
    padding: '0.3rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  expiryBtnActive: {
    borderColor: '#e3aa6a',
    color: '#e3aa6a',
  },
  field: {
    marginBottom: '0.5rem',
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    color: '#a38d69',
    fontSize: '0.7rem',
    fontWeight: 500,
  },
  input: {
    backgroundColor: 'rgba(28,20,14,0.9)',
    border: '1px solid rgba(227,170,106,0.2)',
    borderRadius: '8px',
    color: '#f7ecd9',
    padding: '0.3rem 0.5rem',
    fontSize: '0.8rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  copyBtn: {
    width: '100%',
    background: 'linear-gradient(135deg, #e3aa6a, #b7844f)',
    border: 'none',
    borderRadius: '8px',
    color: '#070504',
    padding: '0.5rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  previewRow: {
    display: 'flex',
    gap: '0.3rem',
    alignItems: 'center',
    marginTop: '0.4rem',
  },
  preview: {
    flex: 1,
    color: '#a38d69',
    fontSize: '0.7rem',
    wordBreak: 'break-all' as const,
    backgroundColor: 'rgba(13,9,7,0.8)',
    padding: '0.3rem 0.5rem',
    borderRadius: '8px',
  },
  lanBtn: {
    backgroundColor: 'rgba(28,20,14,0.9)',
    border: '1px solid rgba(227,170,106,0.2)',
    borderRadius: '8px',
    color: '#b0b0b0',
    padding: '0.3rem 0.5rem',
    fontSize: '0.65rem',
    cursor: 'pointer',
    flexShrink: 0,
  },
  advancedToggle: {
    background: 'none',
    border: 'none',
    color: '#a38d69',
    fontSize: '0.7rem',
    cursor: 'pointer',
    padding: '0.3rem 0',
    marginTop: '0.3rem',
    textAlign: 'left' as const,
    width: '100%',
  },
  advancedSection: {
    overflow: 'hidden',
    transition: 'max-height 0.25s ease, opacity 0.2s ease, margin-top 0.2s ease',
  },
  error: {
    color: '#ff4444',
    fontSize: '0.75rem',
    margin: '0.3rem 0 0',
  },
};
