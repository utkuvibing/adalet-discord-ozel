import React, { useRef, useEffect, useState, useCallback } from 'react';

export type ViewerMode = 'normal' | 'minimized' | 'fullscreen';

interface ScreenShareViewerProps {
  stream: MediaStream;
  sharerName: string;
  mode: ViewerMode;
  isOwnShare: boolean;
  onModeChange: (mode: ViewerMode) => void;
  onClose: () => void;
}

// Inline SVG icons for control buttons
const MinimizeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2" y="10" width="10" height="2" rx="1" fill="currentColor" />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function ScreenShareViewer({
  stream,
  sharerName,
  mode,
  isOwnShare,
  onModeChange,
  onClose,
}: ScreenShareViewerProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Auto-hide header in fullscreen mode
  useEffect(() => {
    if (mode !== 'fullscreen') {
      setHeaderVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }

    // Show header initially, then hide after 3s
    setHeaderVisible(true);
    hideTimerRef.current = setTimeout(() => setHeaderVisible(false), 3000);

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [mode]);

  // Mouse move in fullscreen shows header temporarily
  const handleMouseMove = useCallback(() => {
    if (mode !== 'fullscreen') return;
    setHeaderVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHeaderVisible(false), 3000);
  }, [mode]);

  // Escape key exits fullscreen
  useEffect(() => {
    if (mode !== 'fullscreen') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onModeChange('normal');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, onModeChange]);

  // Click on minimized PiP → restore to normal
  const handlePipClick = useCallback(() => {
    if (mode === 'minimized') {
      onModeChange('normal');
    }
  }, [mode, onModeChange]);

  // -- Minimized PiP mode --
  if (mode === 'minimized') {
    return (
      <div style={pipStyles.container} onClick={handlePipClick}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={pipStyles.video}
        />
        <div style={pipStyles.badge}>
          {isOwnShare ? (
            <span style={pipStyles.liveBadge}>LIVE</span>
          ) : (
            <span style={pipStyles.nameLabel}>{sharerName}</span>
          )}
        </div>
      </div>
    );
  }

  // -- Fullscreen mode --
  if (mode === 'fullscreen') {
    return (
      <div style={fullscreenStyles.overlay} onMouseMove={handleMouseMove}>
        <div
          style={{
            ...fullscreenStyles.header,
            opacity: headerVisible ? 1 : 0,
            pointerEvents: headerVisible ? 'auto' : 'none',
            transition: 'opacity 0.3s ease',
          }}
        >
          <div style={sharedStyles.headerLeft}>
            {isOwnShare && <span style={sharedStyles.liveBadge}>LIVE</span>}
            <span style={sharedStyles.sharerName}>
              {isOwnShare ? 'You are sharing' : `${sharerName}'s screen`}
            </span>
          </div>
          <div style={sharedStyles.controls}>
            <button
              style={sharedStyles.controlBtn}
              onClick={() => onModeChange('minimized')}
              title="Minimize"
            >
              <MinimizeIcon />
            </button>
            <button
              style={sharedStyles.controlBtn}
              onClick={() => onModeChange('normal')}
              title="Exit fullscreen"
            >
              <MaximizeIcon />
            </button>
            <button
              style={{
                ...sharedStyles.controlBtn,
                ...(isOwnShare ? sharedStyles.closeBtnDanger : {}),
              }}
              onClick={onClose}
              title={isOwnShare ? 'Stop Sharing' : 'Close'}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={fullscreenStyles.video}
        />
      </div>
    );
  }

  // -- Normal (embedded) mode --
  return (
    <div style={normalStyles.container}>
      <div style={sharedStyles.header}>
        <div style={sharedStyles.headerLeft}>
          {isOwnShare && <span style={sharedStyles.liveBadge}>LIVE</span>}
          <span style={sharedStyles.sharerName}>
            {isOwnShare ? 'You are sharing' : `${sharerName}'s screen`}
          </span>
        </div>
        <div style={sharedStyles.controls}>
          <button
            style={sharedStyles.controlBtn}
            onClick={() => onModeChange('minimized')}
            title="Minimize"
          >
            <MinimizeIcon />
          </button>
          <button
            style={sharedStyles.controlBtn}
            onClick={() => onModeChange('fullscreen')}
            title="Fullscreen"
          >
            <MaximizeIcon />
          </button>
          <button
            style={{
              ...sharedStyles.controlBtn,
              ...(isOwnShare ? sharedStyles.closeBtnDanger : {}),
            }}
            onClick={onClose}
            title={isOwnShare ? 'Stop Sharing' : 'Close'}
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={normalStyles.video}
      />
    </div>
  );
}

// ---------- Styles ----------

const sharedStyles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.35rem 0.6rem',
    backgroundColor: '#111111',
    borderBottom: '1px solid #2a2a2a',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  sharerName: {
    fontSize: '0.75rem',
    color: '#ccc',
    fontWeight: 500,
  },
  liveBadge: {
    fontSize: '0.6rem',
    fontWeight: 700,
    color: '#fff',
    backgroundColor: '#e03e3e',
    padding: '1px 5px',
    borderRadius: '3px',
    letterSpacing: '0.5px',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  controlBtn: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: '4px',
    color: '#aaa',
    cursor: 'pointer',
    padding: '3px 5px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, color 0.15s',
  },
  closeBtnDanger: {
    color: '#ff5555',
    borderColor: '#ff555544',
  },
};

const normalStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0a0a0a',
    borderBottom: '1px solid #2a2a2a',
    maxHeight: '60vh',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: 'auto',
    maxHeight: 'calc(60vh - 2rem)',
    objectFit: 'contain',
    backgroundColor: '#000',
  },
};

const pipStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    width: '240px',
    height: '135px',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    border: '1px solid #333',
    cursor: 'pointer',
    zIndex: 1000,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  badge: {
    position: 'absolute',
    top: '6px',
    left: '6px',
  },
  liveBadge: {
    fontSize: '0.55rem',
    fontWeight: 700,
    color: '#fff',
    backgroundColor: '#e03e3e',
    padding: '1px 5px',
    borderRadius: '3px',
    letterSpacing: '0.5px',
  },
  nameLabel: {
    fontSize: '0.6rem',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '1px 5px',
    borderRadius: '3px',
  },
};

const fullscreenStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 900,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0.8rem',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
    zIndex: 901,
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    backgroundColor: '#000',
  },
};
