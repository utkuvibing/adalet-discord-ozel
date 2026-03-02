import { useState, useCallback, useRef } from 'react';
import type { ScreenSource } from '../../shared/types';

export interface UseScreenShareReturn {
  /** Whether the screen share picker is open */
  pickerOpen: boolean;
  /** Available screen/window sources (populated when picker opens) */
  sources: ScreenSource[];
  /** Whether a screen share is currently active */
  isSharing: boolean;
  /** The active screen share MediaStream (null when not sharing) */
  screenStream: MediaStream | null;
  /** Ref to the active screen share MediaStream for use by other hooks */
  screenStreamRef: React.MutableRefObject<MediaStream | null>;
  /** Open the source picker (fetches sources from main process) */
  openPicker: () => Promise<void>;
  /** Close the source picker without selecting */
  closePicker: () => void;
  /** Select a source and start the screen share */
  startShare: (sourceId: string, withAudio: boolean) => Promise<void>;
  /** Stop the active screen share */
  stopShare: () => void;
}

export interface UseScreenShareOptions {
  /** Called when screen share starts with the acquired stream */
  onShareStarted?: (stream: MediaStream) => void;
  /** Called when screen share stops with the stream that was being shared */
  onShareStopped?: (stream: MediaStream) => void;
}

export function useScreenShare(options?: UseScreenShareOptions): UseScreenShareReturn {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const openPicker = useCallback(async () => {
    try {
      const srcs = await window.electronAPI.getScreenSources();
      setSources(srcs);
      setPickerOpen(true);
    } catch (err) {
      console.error('[screen-share] Failed to get sources:', err);
    }
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setSources([]);
  }, []);

  const stopShareInternal = useCallback(() => {
    const stream = screenStreamRef.current;
    if (stream) {
      options?.onShareStopped?.(stream);
      stream.getTracks().forEach((track) => track.stop());
    }
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsSharing(false);
    console.log('[screen-share] Stopped sharing');
  }, [options]);

  const startShare = useCallback(async (sourceId: string, withAudio: boolean) => {
    try {
      // Step 1: Tell main process which source to use
      await window.electronAPI.selectScreenSource(sourceId, withAudio);

      // Step 2: Call getDisplayMedia -- triggers setDisplayMediaRequestHandler in main
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true, // Will get system audio if handler provides loopback
      });

      // Step 3: Set contentHint to 'motion' to avoid VP9 5fps cap
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = 'motion';

        // Handle OS-level "Stop sharing" button
        videoTrack.onended = () => {
          console.log('[screen-share] Video track ended (OS stop button)');
          stopShareInternal();
        };
      }

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsSharing(true);
      setPickerOpen(false);
      setSources([]);
      console.log('[screen-share] Started sharing, tracks:', stream.getTracks().length);

      // Notify WebRTC integration
      options?.onShareStarted?.(stream);
    } catch (err) {
      console.error('[screen-share] Failed to start share:', err);
      setPickerOpen(false);
    }
  }, [stopShareInternal, options]);

  const stopShare = useCallback(() => {
    stopShareInternal();
  }, [stopShareInternal]);

  return {
    pickerOpen,
    sources,
    isSharing,
    screenStream,
    screenStreamRef,
    openPicker,
    closePicker,
    startShare,
    stopShare,
  };
}
