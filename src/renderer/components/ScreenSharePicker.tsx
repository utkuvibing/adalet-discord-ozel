import React, { useState } from 'react';
import type { ScreenSource } from '../../shared/types';

interface ScreenSharePickerProps {
  sources: ScreenSource[];
  onSelect: (sourceId: string, withAudio: boolean) => void;
  onClose: () => void;
}

export function ScreenSharePicker({
  sources,
  onSelect,
  onClose,
}: ScreenSharePickerProps): React.JSX.Element {
  const [includeAudio, setIncludeAudio] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const screens = sources.filter((s) => s.display_id !== '');
  const windows = sources.filter((s) => s.display_id === '');

  const handleSelect = () => {
    if (selectedId) {
      onSelect(selectedId, includeAudio);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Share Your Screen</h3>
          <button style={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Screens section */}
        {screens.length > 0 && (
          <>
            <div style={styles.sectionLabel}>Screens</div>
            <div style={styles.grid}>
              {screens.map((source) => (
                <button
                  key={source.id}
                  style={{
                    ...styles.sourceCard,
                    ...(selectedId === source.id ? styles.sourceCardSelected : {}),
                  }}
                  onClick={() => setSelectedId(source.id)}
                >
                  <img
                    src={source.thumbnail}
                    alt={source.name}
                    style={styles.thumbnail}
                  />
                  <span style={styles.sourceName}>{source.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Windows section */}
        {windows.length > 0 && (
          <>
            <div style={styles.sectionLabel}>Windows</div>
            <div style={styles.grid}>
              {windows.map((source) => (
                <button
                  key={source.id}
                  style={{
                    ...styles.sourceCard,
                    ...(selectedId === source.id ? styles.sourceCardSelected : {}),
                  }}
                  onClick={() => setSelectedId(source.id)}
                >
                  <div style={styles.thumbnailWrapper}>
                    {source.appIcon && (
                      <img
                        src={source.appIcon}
                        alt=""
                        style={styles.appIcon}
                      />
                    )}
                    <img
                      src={source.thumbnail}
                      alt={source.name}
                      style={styles.thumbnail}
                    />
                  </div>
                  <span style={styles.sourceName}>{source.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Footer with audio toggle and share button */}
        <div style={styles.footer}>
          <label style={styles.audioLabel}>
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
              style={styles.checkbox}
            />
            Share system audio
          </label>
          <div style={styles.footerButtons}>
            <button style={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              style={{
                ...styles.shareBtn,
                ...(selectedId ? {} : styles.shareBtnDisabled),
              }}
              onClick={handleSelect}
              disabled={!selectedId}
            >
              Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    border: '1px solid #2a2a2a',
    width: '700px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.2rem',
    borderBottom: '1px solid #2a2a2a',
  },
  title: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: '#e0e0e0',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '1.4rem',
    cursor: 'pointer',
    padding: '0 0.2rem',
    lineHeight: 1,
  },
  sectionLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '0.8rem 1.2rem 0.3rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '0.6rem',
    padding: '0.4rem 1.2rem',
    overflowY: 'auto',
  },
  sourceCard: {
    background: '#111111',
    border: '2px solid #2a2a2a',
    borderRadius: '8px',
    cursor: 'pointer',
    padding: '0.4rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.4rem',
    transition: 'border-color 0.15s',
  },
  sourceCardSelected: {
    borderColor: '#7fff00',
    boxShadow: '0 0 8px rgba(127, 255, 0, 0.25)',
  },
  thumbnailWrapper: {
    position: 'relative',
    width: '100%',
  },
  thumbnail: {
    width: '100%',
    height: 'auto',
    borderRadius: '4px',
    display: 'block',
  },
  appIcon: {
    position: 'absolute',
    top: '4px',
    left: '4px',
    width: '20px',
    height: '20px',
  },
  sourceName: {
    fontSize: '0.7rem',
    color: '#ccc',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
    padding: '0 0.2rem',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.8rem 1.2rem',
    borderTop: '1px solid #2a2a2a',
  },
  audioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.8rem',
    color: '#ccc',
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#7fff00',
  },
  footerButtons: {
    display: 'flex',
    gap: '0.5rem',
  },
  cancelBtn: {
    background: '#2a2a2a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    color: '#ccc',
    cursor: 'pointer',
    padding: '0.4rem 1rem',
    fontSize: '0.8rem',
    fontWeight: 500,
  },
  shareBtn: {
    background: '#7fff00',
    border: 'none',
    borderRadius: '8px',
    color: '#0d0d0d',
    cursor: 'pointer',
    padding: '0.4rem 1rem',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  shareBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
};
