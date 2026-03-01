import React, { useState, useEffect, useRef } from 'react';
import type { ConnectionState } from '../hooks/useSocket';

interface ConnectionToastProps {
  connectionState: ConnectionState;
}

/**
 * Reconnection toast that only appears after 3 seconds of being in 'reconnecting' state.
 * Per locked decision: "brief 'Reconnecting...' toast only if reconnection takes >3 seconds"
 */
export function ConnectionToast({ connectionState }: ConnectionToastProps): React.JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (connectionState === 'reconnecting') {
      // Only show after 3 seconds of reconnecting
      timerRef.current = setTimeout(() => {
        setVisible(true);
      }, 3000);
    } else {
      // Clear timer and hide immediately when no longer reconnecting
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setVisible(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [connectionState]);

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.toast}>
        <span style={styles.dot} />
        <span style={styles.text}>Reconnecting...</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: '#1a1a1a',
    border: '1px solid #ff8800',
    borderRadius: '8px',
    padding: '0.6rem 1.2rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  },
  dot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#ff8800',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  text: {
    color: '#ff8800',
    fontSize: '0.85rem',
  },
};
