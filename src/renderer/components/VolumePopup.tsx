import React, { useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VolumePopupProps {
  socketId: string;
  displayName: string;
  position: { x: number; y: number };
  currentVolume: number; // Gain value: 0.0-2.0 (1.0 = 100%)
  onVolumeChange: (socketId: string, volume: number) => void;
  isMuted?: boolean;
  onToggleMute?: (socketId: string) => void;
  onResetVolume?: (socketId: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VolumePopup({
  socketId,
  displayName,
  position,
  currentVolume,
  onVolumeChange,
  isMuted,
  onToggleMute,
  onResetVolume,
  onClose,
}: VolumePopupProps): React.JSX.Element {
  const popupRef = useRef<HTMLDivElement>(null);
  const percentValue = Math.max(0, Math.min(200, Math.round(currentVolume * 100)));

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use setTimeout to avoid immediately closing from the right-click event
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sliderValue = parseInt(e.target.value, 10);
      const gain = sliderValue / 100; // 0.0 - 2.0
      onVolumeChange(socketId, gain);
    },
    [socketId, onVolumeChange]
  );

  // Clamp popup position to stay within viewport
  const popupStyle: React.CSSProperties = {
    ...styles.popup,
    left: Math.min(position.x, window.innerWidth - 200),
    top: Math.min(position.y, window.innerHeight - 140),
  };

  return (
    <div ref={popupRef} style={popupStyle}>
      <div style={styles.header}>{displayName}</div>
      <div style={styles.sliderRow}>
        <input
          type="range"
          min="0"
          max="200"
          value={percentValue}
          onChange={handleSliderChange}
          style={styles.slider}
          title={`Volume: ${percentValue}%`}
        />
        <span style={styles.percent}>{percentValue}%</span>
      </div>
      <div style={styles.actionsRow}>
        {onToggleMute && (
          <button style={styles.actionBtn} onClick={() => onToggleMute(socketId)}>
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        )}
        {onResetVolume && (
          <button style={styles.actionBtn} onClick={() => onResetVolume(socketId)}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  popup: {
    position: 'fixed',
    zIndex: 1000,
    backgroundColor: '#19120e',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '8px 12px',
    width: '180px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  },
  header: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: '6px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  slider: {
    flex: 1,
    cursor: 'pointer',
    /* track + thumb styled globally in index.css */
  },
  percent: {
    fontSize: '0.7rem',
    color: '#888',
    minWidth: '32px',
    textAlign: 'right' as const,
  },
  actionsRow: {
    marginTop: '8px',
    display: 'flex',
    gap: '6px',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#222',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#ddd',
    fontSize: '0.7rem',
    padding: '4px 6px',
    cursor: 'pointer',
  },
};
