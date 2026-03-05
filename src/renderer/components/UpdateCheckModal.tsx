import React from 'react';
import { RefreshCw, Download, XCircle, CheckCircle2, Info } from 'lucide-react';
import type { UpdateCheckResult } from '../../shared/types';
import { theme } from '../theme';

interface UpdateCheckModalProps {
  open: boolean;
  loading: boolean;
  result: UpdateCheckResult | null;
  onClose: () => void;
  onCheckNow: () => void;
  onOpenRelease: () => void;
}

export function UpdateCheckModal({
  open,
  loading,
  result,
  onClose,
  onCheckNow,
  onOpenRelease,
}: UpdateCheckModalProps): React.JSX.Element | null {
  if (!open) return null;

  const status = result?.status ?? 'no-release';
  const latestVersion = result?.latestVersion ?? '-';
  const currentVersion = result?.currentVersion ?? '-';
  const message = (() => {
    if (loading) return 'Surum kontrol ediliyor...';
    if (!result) return 'Kontrol icin asagidaki butona bas.';
    if (status === 'up-to-date') return `Guncelsin. Surum: v${currentVersion}`;
    if (status === 'update-available') return `Yeni surum var: ${latestVersion}`;
    if (status === 'error') return result.error ?? 'Guncelleme kontrolu basarisiz oldu.';
    return 'Release bilgisi bulunamadi.';
  })();

  const icon = (() => {
    if (loading) return <RefreshCw size={16} />;
    if (status === 'up-to-date') return <CheckCircle2 size={16} />;
    if (status === 'update-available') return <Download size={16} />;
    if (status === 'error') return <XCircle size={16} />;
    return <Info size={16} />;
  })();

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div style={styles.card} onMouseDown={(event) => event.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Update Check</h3>
        </div>

        <div style={styles.content}>
          <div style={styles.statusRow}>
            <span style={styles.statusIcon}>{icon}</span>
            <div style={styles.statusTextWrap}>
              <p style={styles.message}>{message}</p>
              {result?.status === 'update-available' && (
                <p style={styles.meta}>
                  Su anki surum: v{currentVersion}
                  {result.releaseName ? ` | ${result.releaseName}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>

        <div style={styles.actions}>
          <button
            style={styles.secondaryBtn}
            onClick={onCheckNow}
            disabled={loading}
          >
            {loading ? 'Checking...' : 'Check Again'}
          </button>
          {result?.status === 'update-available' && (
            <button
              style={styles.primaryBtn}
              onClick={onOpenRelease}
            >
              Release'i Ac
            </button>
          )}
          <button style={styles.ghostBtn} onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2600,
    background: 'rgba(6,4,3,0.62)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  card: {
    width: 'min(520px, 92vw)',
    borderRadius: '14px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'linear-gradient(180deg, rgba(25,18,13,0.97) 0%, rgba(12,9,7,0.98) 100%)',
    boxShadow: '0 18px 42px rgba(0,0,0,0.55)',
    overflow: 'hidden',
  },
  header: {
    padding: '0.72rem 0.85rem',
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    background: 'linear-gradient(180deg, rgba(227,170,106,0.1) 0%, rgba(227,170,106,0.03) 100%)',
  },
  title: {
    margin: 0,
    color: theme.colors.accent,
    fontSize: '0.92rem',
    letterSpacing: '0.02em',
    fontFamily: theme.font.familyDisplay,
    fontWeight: 'normal',
  },
  content: {
    padding: '0.9rem',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.62rem',
  },
  statusIcon: {
    width: '28px',
    height: '28px',
    borderRadius: '999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(227,170,106,0.14)',
    color: theme.colors.accent,
    border: `1px solid ${theme.colors.accentBorder}`,
    flexShrink: 0,
  },
  statusTextWrap: {
    minWidth: 0,
  },
  message: {
    margin: 0,
    color: theme.colors.textPrimary,
    fontSize: '0.82rem',
    lineHeight: 1.45,
    wordBreak: 'break-word',
  },
  meta: {
    margin: '0.38rem 0 0',
    color: theme.colors.textMuted,
    fontSize: '0.73rem',
  },
  actions: {
    padding: '0.78rem 0.85rem 0.88rem',
    borderTop: `1px solid ${theme.colors.borderSubtle}`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.45rem',
    flexWrap: 'wrap',
  },
  primaryBtn: {
    borderRadius: '9px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'rgba(227,170,106,0.18)',
    color: theme.colors.accent,
    padding: '0.43rem 0.78rem',
    fontSize: '0.74rem',
    fontWeight: 700,
  },
  secondaryBtn: {
    borderRadius: '9px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.05)',
    color: theme.colors.textSecondary,
    padding: '0.43rem 0.78rem',
    fontSize: '0.74rem',
  },
  ghostBtn: {
    borderRadius: '9px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.03)',
    color: theme.colors.textMuted,
    padding: '0.43rem 0.78rem',
    fontSize: '0.74rem',
  },
};
