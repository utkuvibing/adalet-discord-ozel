import React, { useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VolumePopupProps {
  socketId: string;
  displayName: string;
  position: { x: number; y: number };
  currentVolume: number; // 0-200 (percentage, 100 = normal, 200 = boost)
  onVolumeChange: (socketId: string, volume: number) => void;
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
  onClose,
}: VolumePopupProps): React.JSX.Element {
  const popupRef = useRef<HTMLDivElement>(null);

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
      // Perceptual (cubic) mapping: gain = (sliderValue/100)^3 * 2
      // This gives a more natural volume curve where low slider values
      // produce quieter sound instead of jumping to loud too fast.
      const normalized = sliderValue / 100; // 0.0 - 2.0
      const gain = Math.pow(normalized, 3) * 2;
      onVolumeChange(socketId, gain);
    },
    [socketId, onVolumeChange]
  );

  // Clamp popup position to stay within viewport
  const popupStyle: React.CSSProperties = {
    ...styles.popup,
    left: Math.min(position.x, window.innerWidth - 200),
    top: Math.min(position.y, window.innerHeight - 100),
  };

  return (
    <div ref={popupRef} style={popupStyle}>
      <div style={styles.header}>{displayName}</div>
      <div style={styles.sliderRow}>
        <input
          type="range"
          min="0"
          max="200"
          value={Math.round(Math.cbrt(currentVolume / 2) * 100)}
          onChange={handleSliderChange}
          style={styles.slider}
          title={`Volume: ${Math.round(Math.cbrt(currentVolume / 2) * 100)}%`}
        />
        <span style={styles.percent}>{Math.round(Math.cbrt(currentVolume / 2) * 100)}%</span>
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
    backgroundColor: '#1a1a1a',
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
};
