import React, { useState } from 'react';
import type { ScreenSource } from '../../shared/types';
import type { ScreenResolution, ScreenFps } from '../hooks/useScreenShare';

interface ScreenSharePickerProps {
  sources: ScreenSource[];
  onSelect: (sourceId: string, withAudio: boolean, resolution?: ScreenResolution, fps?: ScreenFps) => void;
  onClose: () => void;
}

export function ScreenSharePicker({
  sources,
  onSelect,
  onClose,
}: ScreenSharePickerProps): React.JSX.Element {
  const [includeAudio, setIncludeAudio] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ScreenResolution>('1080p');
  const [fps, setFps] = useState<ScreenFps>(30);

  const screens = sources.filter((s) => s.display_id !== '');
  const windows = sources.filter((s) => s.display_id === '');

  const handleSelect = () => {
    if (selectedId) {
      onSelect(selectedId, includeAudio, resolution, fps);
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

        <div style={styles.scrollArea}>
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
        </div>

        {/* Footer with settings and share button */}
        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            <label style={styles.audioLabel}>
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(e) => setIncludeAudio(e.target.checked)}
                style={styles.checkbox}
              />
              Share system audio
            </label>

            {/* Quality settings */}
            <div style={styles.qualityRow}>
              <div style={styles.toggleGroup}>
                <button
                  style={{
                    ...styles.toggleBtn,
                    ...(resolution === '720p' ? styles.toggleBtnActive : {}),
                  }}
                  onClick={() => setResolution('720p')}
                >
                  720p
                </button>
                <button
                  style={{
                    ...styles.toggleBtn,
                    ...(resolution === '1080p' ? styles.toggleBtnActive : {}),
                  }}
                  onClick={() => setResolution('1080p')}
                >
                  1080p
                </button>
              </div>
              <div style={styles.toggleGroup}>
                <button
                  style={{
                    ...styles.toggleBtn,
                    ...(fps === 30 ? styles.toggleBtnActive : {}),
                  }}
                  onClick={() => setFps(30)}
                >
                  30 FPS
                </button>
                <button
                  style={{
                    ...styles.toggleBtn,
                    ...(fps === 60 ? styles.toggleBtnActive : {}),
                  }}
                  onClick={() => setFps(60)}
                >
                  60 FPS
                </button>
              </div>
            </div>
          </div>

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
    fontFamily: "'Coolvetica', 'Inter', sans-serif",
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
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '0.6rem',
    padding: '0.4rem 1.2rem',
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: '0.8rem 1.2rem',
    borderTop: '1px solid #2a2a2a',
  },
  footerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
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
    /* styled globally in index.css */
  },
  qualityRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  toggleGroup: {
    display: 'flex',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #3a3a3a',
  },
  toggleBtn: {
    background: '#1a1a1a',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    padding: '0.25rem 0.6rem',
    fontSize: '0.72rem',
    fontWeight: 500,
    transition: 'background 0.15s, color 0.15s',
  },
  toggleBtnActive: {
    background: '#7fff00',
    color: '#0d0d0d',
    fontWeight: 600,
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
