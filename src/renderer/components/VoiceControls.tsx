import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Headphones, Monitor, Settings, Activity, Radio } from 'lucide-react';
import type { VoiceState } from '../../shared/types';
import { theme } from '../theme';

type MicMode = 'open' | 'vad' | 'ptt';

interface VoiceControlsProps {
  myVoiceState: VoiceState;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onSetMuted: (muted: boolean) => void;
  activeRoomId: number | null;
  onSetVadMode?: (enabled: boolean) => void;
  noiseGateEnabled?: boolean;
  onToggleNoiseGate?: () => void;
  onOpenAudioSettings?: () => void;
  isScreenSharing?: boolean;
  onToggleScreenShare?: () => void;
}

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
  const [micMode, setMicMode] = useState<MicMode>('open');
  const [pttKey, setPttKey] = useState('Insert');
  const [pttActive, setPttActive] = useState(false);
  const [rebinding, setRebinding] = useState(false);
  const pttEnabled = micMode === 'ptt';
  const preMuteRef = useRef(false);
  const pttCleanupRef = useRef<(() => void) | null>(null);

  const registerPTT = useCallback(async (key: string) => {
    if (pttCleanupRef.current) {
      pttCleanupRef.current();
      pttCleanupRef.current = null;
    }
    const ok = await window.electronAPI.registerPTTShortcut(key);
    if (!ok) return;
    pttCleanupRef.current = window.electronAPI.onPTTStateChange((pressed: boolean) => {
      setPttActive(pressed);
    });
  }, []);

  const unregisterPTT = useCallback(() => {
    if (pttCleanupRef.current) {
      pttCleanupRef.current();
      pttCleanupRef.current = null;
    }
    window.electronAPI.unregisterPTTShortcut();
    setPttActive(false);
  }, []);

  const handleCycleMicMode = useCallback(() => {
    if (micMode === 'open') {
      unregisterPTT();
      setMicMode('vad');
      onSetVadMode?.(true);
      onSetMuted(false);
    } else if (micMode === 'vad') {
      onSetVadMode?.(false);
      setMicMode('ptt');
      onSetMuted(true);
      registerPTT(pttKey);
    } else {
      unregisterPTT();
      onSetVadMode?.(false);
      setMicMode('open');
      onSetMuted(false);
    }
  }, [micMode, pttKey, registerPTT, unregisterPTT, onSetMuted, onSetVadMode]);

  useEffect(() => {
    if (!pttEnabled) return;
    onSetMuted(!pttActive);
  }, [pttEnabled, pttActive, onSetMuted]);

  useEffect(() => {
    if (activeRoomId === null) {
      if (pttEnabled) unregisterPTT();
      onSetVadMode?.(false);
      setMicMode('open');
    }
  }, [activeRoomId, pttEnabled, unregisterPTT, onSetVadMode]);

  useEffect(() => () => unregisterPTT(), [unregisterPTT]);

  const handleDeafenToggle = useCallback(() => {
    if (!myVoiceState.deafened) {
      preMuteRef.current = myVoiceState.muted;
      onToggleDeafen();
      if (!myVoiceState.muted) onToggleMute();
    } else {
      onToggleDeafen();
      if (!preMuteRef.current && myVoiceState.muted) onToggleMute();
    }
  }, [myVoiceState.deafened, myVoiceState.muted, onToggleDeafen, onToggleMute]);

  const handleRebind = useCallback(() => setRebinding(true), []);

  useEffect(() => {
    if (!rebinding) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      setPttKey(key);
      setRebinding(false);
      if (pttEnabled) registerPTT(key);
    };
    window.addEventListener('keydown', handler, { once: true });
    return () => window.removeEventListener('keydown', handler);
  }, [rebinding, pttEnabled, registerPTT]);

  if (activeRoomId === null) return null;

  return (
    <div style={styles.bar} className="glass">
      <div style={styles.controlsGroup}>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          style={{
            ...styles.iconBtn,
            color: myVoiceState.muted ? theme.colors.error : theme.colors.accent,
            backgroundColor: myVoiceState.muted ? 'rgba(255, 75, 75, 0.1)' : 'rgba(227, 170, 106, 0.05)',
            borderColor: myVoiceState.muted ? 'rgba(255, 75, 75, 0.2)' : theme.colors.accentBorder,
          }}
          onClick={onToggleMute}
          title={myVoiceState.muted ? 'Unmute' : 'Mute'}
        >
          {myVoiceState.muted ? <MicOff size={18} /> : <Mic size={18} />}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          style={{
            ...styles.iconBtn,
            color: myVoiceState.deafened ? theme.colors.error : theme.colors.textSecondary,
            backgroundColor: myVoiceState.deafened ? 'rgba(255, 75, 75, 0.1)' : 'transparent',
            borderColor: myVoiceState.deafened ? 'rgba(255, 75, 75, 0.2)' : theme.colors.borderSubtle,
          }}
          onClick={handleDeafenToggle}
          title={myVoiceState.deafened ? 'Undeafen' : 'Deafen'}
        >
          <Headphones size={18} />
        </motion.button>
      </div>

      <div style={styles.modeGroup}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          style={{
            ...styles.modeBtn,
            ...(micMode === 'ptt' ? (pttActive ? styles.pttActive : styles.pttIdle) : {}),
            ...(micMode === 'vad' ? styles.vadActive : {}),
            ...(rebinding ? styles.rebinding : {}),
          }}
          onClick={handleCycleMicMode}
        >
          {micMode === 'ptt' ? <Radio size={12} /> : <Activity size={12} />}
          <span style={styles.modeText}>
            {rebinding ? 'Press Key...' : micMode === 'ptt' ? `PTT: ${pttKey}` : micMode === 'vad' ? 'VAD' : 'OPEN MIC'}
          </span>
        </motion.button>

        {pttEnabled && !rebinding && (
          <button style={styles.rebindBtn} onClick={handleRebind}>...</button>
        )}
      </div>

      <div style={styles.actionsGroup}>
        {onToggleNoiseGate && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            style={{
              ...styles.miniBtn,
              color: noiseGateEnabled ? theme.colors.warning : theme.colors.textMuted,
              borderColor: noiseGateEnabled ? theme.colors.warning : 'transparent',
            }}
            onClick={onToggleNoiseGate}
            title="Noise Suppression"
          >
            NS
          </motion.button>
        )}

        {onOpenAudioSettings && (
          <motion.button
            whileHover={{ rotate: 90 }}
            style={{ ...styles.miniBtn, color: theme.colors.textMuted }}
            onClick={onOpenAudioSettings}
          >
            <Settings size={16} />
          </motion.button>
        )}

        {onToggleScreenShare && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            style={{
              ...styles.iconBtn,
              color: isScreenSharing ? theme.colors.error : theme.colors.textSecondary,
              borderColor: isScreenSharing ? theme.colors.error : theme.colors.borderSubtle,
            }}
            onClick={onToggleScreenShare}
          >
            <Monitor size={18} />
          </motion.button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.6rem 0.8rem',
    minHeight: '64px',
    backgroundColor: theme.colors.bgSidebar,
    borderTop: `1px solid ${theme.colors.borderSubtle}`,
    borderBottomLeftRadius: '18px',
    borderBottomRightRadius: '18px',
    boxSizing: 'border-box',
    flexShrink: 0,
  },
  controlsGroup: {
    display: 'flex',
    gap: '0.5rem',
  },
  actionsGroup: {
    display: 'flex',
    gap: '0.4rem',
    alignItems: 'center',
  },
  iconBtn: {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: theme.radiusSm,
    cursor: 'pointer',
    padding: '0.4rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    transition: 'all 0.2s',
  },
  modeGroup: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 0.5rem',
    position: 'relative',
  },
  modeBtn: {
    background: 'rgba(227, 170, 106, 0.06)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: theme.radiusSm,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    padding: '0.4rem 0.6rem',
    fontSize: '0.7rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    transition: 'all 0.2s',
    minWidth: '90px',
    justifyContent: 'center',
  },
  modeText: {
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  },
  pttIdle: {
    borderColor: theme.colors.borderSubtle,
    color: theme.colors.textMuted,
  },
  pttActive: {
    borderColor: theme.colors.accent,
    color: theme.colors.accent,
    boxShadow: `0 0 10px ${theme.colors.accentDim}`,
  },
  vadActive: {
    borderColor: theme.colors.rimAccent,
    color: '#91a8c4',
  },
  rebinding: {
    borderColor: theme.colors.warning,
    color: theme.colors.warning,
  },
  rebindBtn: {
    background: 'none',
    border: 'none',
    color: theme.colors.textMuted,
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: '0 0.2rem',
    marginLeft: '2px',
  },
  miniBtn: {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '4px',
    padding: '0.2rem',
    cursor: 'pointer',
    fontSize: '0.65rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
