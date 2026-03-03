import React, { useState, useCallback, useEffect } from 'react';

type ExpiryOption = { label: string; value: number | null };

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '1 Hour', value: 3600000 },
  { label: '24 Hours', value: 86400000 },
  { label: 'Never', value: null },
];

export function InvitePanel(): React.JSX.Element {
  const [expiresInMs, setExpiresInMs] = useState<number | null>(86400000);
  const [maxUses, setMaxUses] = useState<string>('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLan, setCopiedLan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState('');
  const [urlSaved, setUrlSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load existing tunnel URL on mount
  useEffect(() => {
    window.electronAPI.getTunnelUrl().then((url) => {
      if (url) setPublicUrl(url);
    });
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

  const handleSetPublicUrl = useCallback(async () => {
    const url = publicUrl.trim() || null;
    await window.electronAPI.setTunnelUrl(url);
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2000);
  }, [publicUrl]);

  return (
    <div style={styles.container}>
      <h4 style={styles.header}>Invite Friends</h4>

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
        {/* Public URL for internet invites */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>
            Public URL (for internet invites)
            <div style={styles.urlRow}>
              <input
                type="text"
                value={publicUrl}
                onChange={(e) => { setPublicUrl(e.target.value); setUrlSaved(false); }}
                placeholder="https://abc.ngrok-free.app"
                style={styles.input}
              />
              <button style={styles.setBtn} onClick={handleSetPublicUrl}>
                {urlSaved ? 'Saved!' : 'Set'}
              </button>
            </div>
            <span style={styles.hint}>Leave empty = LAN-only invites</span>
          </label>
        </div>

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
    padding: '0.8rem',
    borderTop: '1px solid #2a2a2a',
  },
  header: {
    color: '#7fff00',
    fontSize: '0.9rem',
    fontFamily: "'Coolvetica', 'Inter', sans-serif",
    fontWeight: 'normal',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    margin: '0 0 0.5rem 0',
  },
  expiryRow: {
    display: 'flex',
    gap: '0.3rem',
    marginBottom: '0.5rem',
  },
  expiryBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    color: '#b0b0b0',
    padding: '0.3rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  expiryBtnActive: {
    borderColor: '#7fff00',
    color: '#7fff00',
  },
  field: {
    marginBottom: '0.5rem',
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    color: '#888',
    fontSize: '0.7rem',
    fontWeight: 500,
  },
  input: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '0.3rem 0.5rem',
    fontSize: '0.8rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  copyBtn: {
    width: '100%',
    background: 'linear-gradient(135deg, #7fff00, #66cc00)',
    border: 'none',
    borderRadius: '8px',
    color: '#0d0d0d',
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
    color: '#666',
    fontSize: '0.7rem',
    wordBreak: 'break-all' as const,
    backgroundColor: '#111',
    padding: '0.3rem 0.5rem',
    borderRadius: '8px',
  },
  lanBtn: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
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
    color: '#666',
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
  urlRow: {
    display: 'flex',
    gap: '0.3rem',
    alignItems: 'center',
  },
  setBtn: {
    backgroundColor: '#1a2a1a',
    border: '1px solid #7fff00',
    borderRadius: '8px',
    color: '#7fff00',
    padding: '0.3rem 0.6rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  hint: {
    color: '#555',
    fontSize: '0.65rem',
    fontStyle: 'italic',
  },
  error: {
    color: '#ff4444',
    fontSize: '0.75rem',
    margin: '0.3rem 0 0',
  },
};
