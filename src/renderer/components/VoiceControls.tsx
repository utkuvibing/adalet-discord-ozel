import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { VoiceState } from '../../shared/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type MicMode = 'open' | 'vad' | 'ptt';

interface VoiceControlsProps {
  myVoiceState: VoiceState;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onSetMuted: (muted: boolean) => void;
  activeRoomId: number | null;
  // VAD mode
  onSetVadMode?: (enabled: boolean) => void;
  // Noise gate
  noiseGateEnabled?: boolean;
  onToggleNoiseGate?: () => void;
  // Audio settings
  onOpenAudioSettings?: () => void;
  // Phase 7: Screen sharing
  isScreenSharing?: boolean;
  onToggleScreenShare?: () => void;
}

// ---------------------------------------------------------------------------
// SVG Icons (inline, no external deps)
// ---------------------------------------------------------------------------

function MicIcon({ muted }: { muted: boolean }): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
      {muted && <line x1="1" y1="1" x2="23" y2="23" stroke="#ff4444" strokeWidth="2.5" />}
    </svg>
  );
}

function HeadphoneIcon({ deafened }: { deafened: boolean }): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 1 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z" />
      <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z" />
      {deafened && <line x1="1" y1="1" x2="23" y2="23" stroke="#ff4444" strokeWidth="2.5" />}
    </svg>
  );
}

function ScreenShareIcon({ active }: { active: boolean }): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      {active && <line x1="1" y1="1" x2="23" y2="23" stroke="#ff4444" strokeWidth="2.5" />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoiceControls({
  myVoiceState,
  onToggleMute,
  onToggleDeafen,
  onSetMuted,
  activeRoomId,
  onSetVadMode,
  noiseGateEnabled = false,
  onToggleNoiseGate,
  onOpenAudioSettings,
  isScreenSharing = false,
  onToggleScreenShare,
}: VoiceControlsProps): React.JSX.Element | null {
  // Mic mode: open mic → vad → ptt
  const [micMode, setMicMode] = useState<MicMode>('open');
  // PTT state
  const [pttKey, setPttKey] = useState('Insert');
  const [pttActive, setPttActive] = useState(false); // true while PTT key is held
  const [rebinding, setRebinding] = useState(false);
  const pttEnabled = micMode === 'ptt';

  // Track pre-deafen mute state to restore on un-deafen
  const preMuteRef = useRef(false);

  // Cleanup ref for PTT state listener
  const pttCleanupRef = useRef<(() => void) | null>(null);

  // -------------------------------------------------------------------------
  // PTT registration
  // -------------------------------------------------------------------------
  const registerPTT = useCallback(
    async (key: string) => {
      // Unregister old listener
      if (pttCleanupRef.current) {
        pttCleanupRef.current();
        pttCleanupRef.current = null;
      }

      const ok = await window.electronAPI.registerPTTShortcut(key);
      if (!ok) {
        console.warn('[VoiceControls] Failed to register PTT shortcut:', key);
        return;
      }

      // Listen for PTT state changes (press/release from main process)
      const cleanup = window.electronAPI.onPTTStateChange((pressed: boolean) => {
        setPttActive(pressed);
      });
      pttCleanupRef.current = cleanup;
    },
    []
  );

  const unregisterPTT = useCallback(() => {
    if (pttCleanupRef.current) {
      pttCleanupRef.current();
      pttCleanupRef.current = null;
    }
    window.electronAPI.unregisterPTTShortcut();
    setPttActive(false);
  }, []);

  // -------------------------------------------------------------------------
  // Cycle mic mode: OPEN MIC → VAD → PTT → OPEN MIC
  // -------------------------------------------------------------------------
  const handleCycleMicMode = useCallback(() => {
    if (micMode === 'open') {
      // Switch to VAD
      unregisterPTT();
      setMicMode('vad');
      onSetVadMode?.(true);
      onSetMuted(false); // VAD controls muting itself
    } else if (micMode === 'vad') {
      // Switch to PTT
      onSetVadMode?.(false);
      setMicMode('ptt');
      onSetMuted(true);
      registerPTT(pttKey);
    } else {
      // Switch to Open Mic
      unregisterPTT();
      onSetVadMode?.(false);
      setMicMode('open');
      onSetMuted(false);
    }
  }, [micMode, pttKey, registerPTT, unregisterPTT, onSetMuted, onSetVadMode]);

  // -------------------------------------------------------------------------
  // PTT active state -> mute/unmute
  // When PTT enabled: muted unless key is held
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!pttEnabled) return;
    // PTT mode: mute when key is NOT held, unmute when held
    onSetMuted(!pttActive);
  }, [pttEnabled, pttActive, onSetMuted]);

  // -------------------------------------------------------------------------
  // Cleanup PTT on unmount or room leave
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (activeRoomId === null) {
      // Left room -> reset mic mode
      if (pttEnabled) {
        unregisterPTT();
      }
      onSetVadMode?.(false);
      setMicMode('open');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId]);

  useEffect(() => {
    return () => {
      // Unmount cleanup
      unregisterPTT();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Deafen toggle with auto-mute behavior
  // -------------------------------------------------------------------------
  const handleDeafenToggle = useCallback(() => {
    if (!myVoiceState.deafened) {
      // About to deafen -> save current mute state, then auto-mute
      preMuteRef.current = myVoiceState.muted;
      onToggleDeafen();
      if (!myVoiceState.muted) {
        onToggleMute(); // auto-mute when deafening
      }
    } else {
      // Un-deafening -> restore previous mute state
      onToggleDeafen();
      if (!preMuteRef.current && myVoiceState.muted) {
        onToggleMute(); // un-mute only if was not muted before deafen
      }
    }
  }, [myVoiceState.deafened, myVoiceState.muted, onToggleDeafen, onToggleMute]);

  // -------------------------------------------------------------------------
  // PTT key rebind
  // -------------------------------------------------------------------------
  const handleRebind = useCallback(() => {
    setRebinding(true);
  }, []);

  useEffect(() => {
    if (!rebinding) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Convert key to Electron accelerator format
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      setPttKey(key);
      setRebinding(false);

      // Re-register if PTT is active
      if (pttEnabled) {
        registerPTT(key);
      }
    };

    window.addEventListener('keydown', handler, { once: true });
    return () => window.removeEventListener('keydown', handler);
  }, [rebinding, pttEnabled, registerPTT]);

  // -------------------------------------------------------------------------
  // Don't render when not in a room
  // -------------------------------------------------------------------------
  if (activeRoomId === null) {
    return null;
  }

  return (
    <div style={styles.bar}>
      {/* Mic toggle */}
      <button
        style={{
          ...styles.iconBtn,
          color: myVoiceState.muted ? '#ff4444' : '#7fff00',
        }}
        onClick={onToggleMute}
        title={myVoiceState.muted ? 'Unmute' : 'Mute'}
      >
        <MicIcon muted={myVoiceState.muted} />
      </button>

      {/* Deafen toggle */}
      <button
        style={{
          ...styles.iconBtn,
          color: myVoiceState.deafened ? '#ff4444' : '#888',
        }}
        onClick={handleDeafenToggle}
        title={myVoiceState.deafened ? 'Undeafen' : 'Deafen'}
      >
        <HeadphoneIcon deafened={myVoiceState.deafened} />
      </button>

      {/* Mic mode cycle: OPEN MIC → VAD → PTT */}
      <button
        style={{
          ...styles.pttBtn,
          ...(pttActive ? styles.pttBtnActive : {}),
          ...(micMode === 'vad' ? styles.pttBtnVad : {}),
          ...(rebinding ? styles.pttBtnRebinding : {}),
        }}
        onClick={handleCycleMicMode}
        title={micMode === 'open' ? 'Switch to VAD' : micMode === 'vad' ? 'Switch to PTT' : 'Switch to Open Mic'}
      >
        {rebinding ? 'PRESS KEY...' : micMode === 'ptt' ? `PTT: ${pttKey}` : micMode === 'vad' ? 'VAD' : 'OPEN MIC'}
      </button>

      {/* Rebind button (only visible when PTT is enabled) */}
      {pttEnabled && !rebinding && (
        <button
          style={styles.rebindBtn}
          onClick={handleRebind}
          title="Change PTT key"
        >
          ...
        </button>
      )}

      {/* PTT transmit indicator */}
      {pttEnabled && pttActive && <span style={styles.pttDot} />}

      {/* Noise gate toggle */}
      {onToggleNoiseGate && (
        <button
          style={{
            ...styles.pttBtn,
            ...(noiseGateEnabled ? styles.nsBtnActive : {}),
          }}
          onClick={onToggleNoiseGate}
          title={noiseGateEnabled ? 'Disable Noise Gate' : 'Enable Noise Gate'}
        >
          NS
        </button>
      )}

      {/* Audio settings gear */}
      {onOpenAudioSettings && (
        <button
          style={{ ...styles.iconBtn, color: '#888' }}
          onClick={onOpenAudioSettings}
          title="Audio Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {/* Screen share toggle */}
      {onToggleScreenShare && (
        <button
          style={{
            ...styles.iconBtn,
            color: isScreenSharing ? '#ff4444' : '#888',
            marginLeft: 'auto',
          }}
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
        >
          <ScreenShareIcon active={isScreenSharing} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.45rem 0.7rem',
    backgroundColor: '#0d0d0d',
    borderTop: '1px solid #2a2a2a',
    boxShadow: '0 -2px 8px rgba(0,0,0,0.3)',
    height: '52px',
    boxSizing: 'border-box',
    flexShrink: 0,
  },
  iconBtn: {
    background: 'none',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    cursor: 'pointer',
    padding: '0.35rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
  },
  pttBtn: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#888',
    cursor: 'pointer',
    padding: '0.2rem 0.5rem',
    fontSize: '0.65rem',
    fontWeight: 500,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
  },
  pttBtnActive: {
    borderColor: '#7fff00',
    color: '#7fff00',
    boxShadow: '0 0 6px 1px rgba(127,255,0,0.3)',
  },
  pttBtnVad: {
    borderColor: '#00bfff',
    color: '#00bfff',
  },
  nsBtnActive: {
    borderColor: '#ff9900',
    color: '#ff9900',
  },
  pttBtnRebinding: {
    borderColor: '#ffaa00',
    color: '#ffaa00',
  },
  rebindBtn: {
    background: 'none',
    border: 'none',
    color: '#555',
    cursor: 'pointer',
    fontSize: '0.7rem',
    padding: '0 0.2rem',
    letterSpacing: '0.1em',
  },
  pttDot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#7fff00',
    animation: 'pulse 1s ease-in-out infinite',
    flexShrink: 0,
  },
};
