import React, { useState, useEffect, useCallback, useRef } from 'react';

interface AudioSettingsProps {
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  noiseCancellationMode: 'standard' | 'enhanced';
  noiseCancellationLevel: number;
  onInputDeviceChange: (deviceId: string) => void;
  onOutputDeviceChange: (deviceId: string) => void;
  onNoiseCancellationModeChange: (mode: 'standard' | 'enhanced') => void;
  onNoiseCancellationLevelChange: (level: number) => void;
  onClose: () => void;
}

export function AudioSettings({
  selectedInputDeviceId,
  selectedOutputDeviceId,
  noiseCancellationMode,
  noiseCancellationLevel,
  onInputDeviceChange,
  onOutputDeviceChange,
  onNoiseCancellationModeChange,
  onNoiseCancellationLevelChange,
  onClose,
}: AudioSettingsProps): React.JSX.Element {
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Enumerate devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => d.kind === 'audioinput'));
      setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'));
    } catch (err) {
      console.warn('[AudioSettings] Failed to enumerate devices:', err);
    }
  }, []);

  useEffect(() => {
    enumerateDevices();
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
    };
  }, [enumerateDevices]);

  // Mic level meter
  useEffect(() => {
    let cancelled = false;
    const constraints: MediaTrackConstraints = { echoCancellation: true };
    if (selectedInputDeviceId) {
      constraints.deviceId = { exact: selectedInputDeviceId };
    }

    navigator.mediaDevices.getUserMedia({ audio: constraints }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const avg = sum / buf.length;
        setMicLevel(Math.min(100, (avg / 128) * 100));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }).catch(() => { /* mic not available */ });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [selectedInputDeviceId]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div style={styles.overlay}>
      <div ref={popupRef} style={styles.popup}>
        <div style={styles.header}>
          <span>Audio Settings</span>
          <button style={styles.closeBtn} onClick={onClose}>X</button>
        </div>

        <div style={styles.section}>
          <label style={styles.label}>Microphone</label>
          <select
            style={styles.select}
            value={selectedInputDeviceId}
            onChange={(e) => onInputDeviceChange(e.target.value)}
          >
            <option value="">Default</option>
            {inputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>

          <div style={styles.meterContainer}>
            <div style={{ ...styles.meterBar, width: `${micLevel}%` }} />
          </div>
        </div>

        <div style={styles.section}>
          <label style={styles.label}>Noise Cancellation</label>
          <select
            style={styles.select}
            value={noiseCancellationMode}
            onChange={(e) => onNoiseCancellationModeChange(e.target.value as 'standard' | 'enhanced')}
          >
            <option value="standard">Standard (WebRTC)</option>
            <option value="enhanced">Enhanced Voice Focus (Krisp-like)</option>
          </select>
          <p style={styles.hint}>
            Enhanced Voice Focus prioritizes speech and suppresses non-speech noise with higher CPU usage.
          </p>

          <div style={styles.sliderRow}>
            <span style={styles.sliderLabel}>Level</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={noiseCancellationLevel}
              disabled={noiseCancellationMode === 'standard'}
              onChange={(e) => onNoiseCancellationLevelChange(Number(e.target.value))}
              style={{
                ...styles.slider,
                opacity: noiseCancellationMode === 'standard' ? 0.5 : 1,
              }}
            />
            <span style={styles.sliderValue}>{noiseCancellationLevel}%</span>
          </div>
          <p style={styles.hint}>
            {noiseCancellationMode === 'enhanced'
              ? 'Low: more natural voice. High: stronger background suppression.'
              : 'Level slider is active only in Enhanced mode.'}
          </p>
        </div>

        <div style={styles.section}>
          <label style={styles.label}>Speaker</label>
          <select
            style={styles.select}
            value={selectedOutputDeviceId}
            onChange={(e) => onOutputDeviceChange(e.target.value)}
          >
            <option value="">Default</option>
            {outputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9000,
  },
  popup: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '1rem 1.2rem',
    width: '320px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#e0e0e0',
  },
  closeBtn: {
    background: 'none',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#888',
    cursor: 'pointer',
    padding: '0.2rem 0.5rem',
    fontSize: '0.75rem',
  },
  section: {
    marginBottom: '0.8rem',
  },
  label: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#888',
    marginBottom: '0.3rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  select: {
    width: '100%',
    backgroundColor: '#111',
    color: '#e0e0e0',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '0.4rem 0.5rem',
    fontSize: '0.82rem',
    fontFamily: "'Coolvetica', 'Inter', sans-serif",
    outline: 'none',
    cursor: 'pointer',
  },
  meterContainer: {
    marginTop: '0.4rem',
    height: '6px',
    backgroundColor: '#222',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  meterBar: {
    height: '100%',
    backgroundColor: '#7fff00',
    borderRadius: '3px',
    transition: 'width 0.05s',
  },
  hint: {
    margin: '0.35rem 0 0 0',
    color: '#7d8595',
    fontSize: '0.72rem',
    lineHeight: 1.35,
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.45rem',
  },
  sliderLabel: {
    color: '#a8b3c7',
    fontSize: '0.72rem',
    minWidth: '30px',
  },
  slider: {
    flex: 1,
    accentColor: '#7fff00',
    cursor: 'pointer',
  },
  sliderValue: {
    color: '#d8e4f8',
    fontSize: '0.72rem',
    minWidth: '38px',
    textAlign: 'right' as const,
  },
};
