import { useState, useCallback, useRef } from 'react';
import type { ScreenSource } from '../../shared/types';

export type ScreenResolution = '720p' | '1080p';
export type ScreenFps = 30 | 60;

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
  startShare: (sourceId: string, withAudio: boolean, resolution?: ScreenResolution, fps?: ScreenFps) => Promise<void>;
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

  const startShare = useCallback(async (sourceId: string, withAudio: boolean, resolution: ScreenResolution = '1080p', fps: ScreenFps = 60) => {
    try {
      const resMap = { '720p': { w: 1280, h: 720 }, '1080p': { w: 1920, h: 1080 } };
      const { w, h } = resMap[resolution];
      const minFrameRate = fps === 60 ? 45 : 24;
      const contentHint = (fps === 60 ? 'motion' : 'detail') as 'motion' | 'detail';

      // Step 1: Tell main process which source to use
      await window.electronAPI.selectScreenSource(sourceId, withAudio);

      // Step 2: Call getDisplayMedia -- triggers setDisplayMediaRequestHandler in main
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { min: Math.floor(w * 0.75), ideal: w, max: w },
          height: { min: Math.floor(h * 0.75), ideal: h, max: h },
          frameRate: { min: minFrameRate, ideal: fps, max: fps },
        },
        audio: withAudio, // request audio only when user explicitly enables it
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = contentHint;
        try {
          await videoTrack.applyConstraints({
            width: { ideal: w },
            height: { ideal: h },
            frameRate: { ideal: fps, max: fps },
          });
        } catch (err) {
          // Constraints may be partially unsupported on some GPUs/drivers.
          console.warn('[screen-share] Failed to enforce video constraints:', err);
        }
        const settings = videoTrack.getSettings();
        console.log('[screen-share] Video settings:', settings, `hint=${contentHint}`);
        if ((settings.width ?? 0) < Math.floor(w * 0.7) || (settings.height ?? 0) < Math.floor(h * 0.7)) {
          console.warn(`[screen-share] Captured resolution is below target: got ${settings.width}x${settings.height}, requested ${w}x${h}`);
        }

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
