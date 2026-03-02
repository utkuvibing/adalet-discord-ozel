import React, { useRef, useEffect } from 'react';

interface ScreenShareViewerProps {
  stream: MediaStream;
  sharerName: string;
  onClose?: () => void; // For stopping own share; omit for viewing remote share
}

export function ScreenShareViewer({
  stream,
  sharerName,
  onClose,
}: ScreenShareViewerProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.sharerName}>{sharerName} is sharing their screen</span>
        {onClose && (
          <button style={styles.stopBtn} onClick={onClose}>
            Stop Sharing
          </button>
        )}
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={styles.video}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0a0a0a',
    borderBottom: '1px solid #2a2a2a',
    maxHeight: '60vh',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.4rem 0.8rem',
    backgroundColor: '#111111',
    borderBottom: '1px solid #2a2a2a',
  },
  sharerName: {
    fontSize: '0.75rem',
    color: '#7fff00',
    fontWeight: 500,
  },
  stopBtn: {
    background: '#ff4444',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    padding: '0.25rem 0.6rem',
    fontSize: '0.7rem',
    fontWeight: 600,
  },
  video: {
    width: '100%',
    height: 'auto',
    maxHeight: 'calc(60vh - 2rem)',
    objectFit: 'contain',
    backgroundColor: '#000',
  },
};
