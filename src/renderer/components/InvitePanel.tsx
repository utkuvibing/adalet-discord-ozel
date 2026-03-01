import React, { useState, useCallback } from 'react';

type ExpiryOption = { label: string; value: number | null };

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '1 Hour', value: 3600000 },
  { label: '24 Hours', value: 86400000 },
  { label: 'Never', value: null },
];

export function InvitePanel(): React.JSX.Element {
  const [expiresInMs, setExpiresInMs] = useState<number | null>(3600000);
  const [maxUses, setMaxUses] = useState<string>('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopyInvite = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const maxUsesNum = maxUses.trim() === '' || maxUses === '0' ? null : parseInt(maxUses, 10);
      const result = await window.electronAPI.createInvite({
        expiresInMs,
        maxUses: maxUsesNum,
      });

      const inviteString = `${result.serverAddress}/${result.token}`;
      setGeneratedLink(inviteString);

      await navigator.clipboard.writeText(inviteString);
      setCopied(true);

      // Clear "Copied!" after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to generate invite.');
      console.error('[invite] Error creating invite:', err);
    } finally {
      setLoading(false);
    }
  }, [expiresInMs, maxUses]);

  return (
    <div style={styles.container}>
      <h4 style={styles.header}>Invite Friends</h4>

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

      {/* Copy Invite button */}
      <button
        style={styles.copyBtn}
        onClick={handleCopyInvite}
        disabled={loading}
      >
        {loading ? 'Generating...' : copied ? 'Copied!' : 'Copy Invite'}
      </button>

      {/* Generated link preview */}
      {generatedLink && (
        <div style={styles.preview} title={generatedLink}>
          {generatedLink.length > 40
            ? generatedLink.substring(0, 37) + '...'
            : generatedLink}
        </div>
      )}

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
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
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
    borderRadius: '3px',
    color: '#b0b0b0',
    padding: '0.3rem',
    fontSize: '0.7rem',
    fontFamily: 'monospace',
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
    fontFamily: 'monospace',
  },
  input: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '3px',
    color: '#e0e0e0',
    padding: '0.3rem 0.5rem',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  copyBtn: {
    width: '100%',
    backgroundColor: '#1a2a1a',
    border: '1px solid #7fff00',
    borderRadius: '4px',
    color: '#7fff00',
    padding: '0.5rem',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  preview: {
    marginTop: '0.4rem',
    color: '#666',
    fontSize: '0.7rem',
    fontFamily: 'monospace',
    wordBreak: 'break-all' as const,
    backgroundColor: '#111',
    padding: '0.3rem 0.5rem',
    borderRadius: '3px',
  },
  error: {
    color: '#ff4444',
    fontSize: '0.75rem',
    fontFamily: 'monospace',
    margin: '0.3rem 0 0',
  },
};
