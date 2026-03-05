import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Download, Eye, File as FileIcon, Music2, Paperclip, Pencil, PhoneCall, Search, Send, Smile, Trash2, X, Ellipsis } from 'lucide-react';
import EmojiPicker, { Categories, Theme } from 'emoji-picker-react';
import type { TypedSocket } from '../hooks/useSocket';
import type { DMMessage, FriendItem, PeerInfo } from '../../shared/types';
import { AvatarBadge } from './AvatarBadge';
import { theme } from '../theme';
import { ICE_SERVERS } from '../../shared/iceConfig';
import { renderMarkdown } from '../utils/markdown';
import { normalizeCountryCodeFlagsInText } from '../utils/flagEmoji';
import {
  playCallAcceptedSound,
  playCallStartSound,
  playMessageReceiveSound,
  playMessageSendSound,
  startIncomingCallLoop,
  stopIncomingCallLoop,
} from '../utils/notificationSounds';

type CallStatus = 'idle' | 'calling' | 'ringing' | 'in-call';
type GifPanelTab = 'gif' | 'sticker';

const TENOR_API_KEY = 'LIVDSRZULELA';
const GIF_RESULT_LIMIT = 24;
const EMOJI_CATEGORIES_NO_FLAGS = [
  { category: Categories.SUGGESTED, name: 'Suggested' },
  { category: Categories.SMILEYS_PEOPLE, name: 'Smileys & People' },
  { category: Categories.ANIMALS_NATURE, name: 'Animals & Nature' },
  { category: Categories.FOOD_DRINK, name: 'Food & Drink' },
  { category: Categories.TRAVEL_PLACES, name: 'Travel & Places' },
  { category: Categories.ACTIVITIES, name: 'Activities' },
  { category: Categories.OBJECTS, name: 'Objects' },
  { category: Categories.SYMBOLS, name: 'Symbols' },
];

interface TenorMediaVariant {
  url?: string;
  preview?: string;
}

interface TenorResult {
  id: string;
  title?: string;
  content_description?: string;
  media?: Array<Record<string, TenorMediaVariant>>;
}

interface TenorResponse {
  results?: TenorResult[];
}

interface GifResult {
  id: string;
  mediaUrl: string;
  previewUrl: string;
  title: string;
}

type AttachmentKind = 'image' | 'video' | 'audio' | 'document' | 'file';

interface PreviewState {
  url: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string | null;
}
type PreviewAspect = 'landscape' | 'portrait' | 'square';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🙏', '🎉'];

function tenorToGifResult(result: TenorResult, tab: GifPanelTab): GifResult | null {
  const media = result.media?.[0];
  if (!media) return null;

  const mediaOrder =
    tab === 'sticker'
      ? ['gif_transparent', 'tinygif_transparent', 'nanogif_transparent', 'mediumgif', 'tinygif', 'gif']
      : ['tinygif', 'nanogif', 'mediumgif', 'gif'];
  const previewOrder =
    tab === 'sticker'
      ? ['tinywebp_transparent', 'webp_transparent', 'tinygif_transparent', 'gif_transparent', 'tinygif', 'gif']
      : ['tinygif', 'nanogif', 'mediumgif', 'gif'];

  const selectVariant = (keys: string[]): TenorMediaVariant | undefined => {
    for (const key of keys) {
      const candidate = media[key];
      if (candidate?.url) return candidate;
    }
    return undefined;
  };

  const selected = selectVariant(mediaOrder);
  const preview = selectVariant(previewOrder);
  if (!selected?.url) return null;

  const title =
    result.title?.trim() ||
    result.content_description?.trim() ||
    (tab === 'sticker' ? 'Sticker' : 'GIF');

  return {
    id: result.id,
    mediaUrl: selected.url,
    previewUrl: preview?.preview || preview?.url || selected.preview || selected.url,
    title,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fileExtension(name: string | undefined): string {
  if (!name) return '';
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

function getAttachmentKind(msg: DMMessage): AttachmentKind {
  const mime = msg.fileMimeType?.toLowerCase() ?? '';
  const ext = fileExtension(msg.fileName);

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  if (
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    ['txt', 'pdf', 'md', 'json', 'csv', 'log', 'html', 'htm', 'xml'].includes(ext)
  ) return 'document';
  return 'file';
}

interface DMPanelProps {
  socket: TypedSocket | null;
  myUserId: number | null;
  targetUserId: number | null;
  serverAddress: string;
  onOpenUserCard?: (user: PeerInfo, position: { x: number; y: number }) => void;
  openSearchToken?: number;
  openCallToken?: number;
}

export function DMPanel({ socket, myUserId, targetUserId, serverAddress, onOpenUserCard, openSearchToken, openCallToken }: DMPanelProps): React.JSX.Element {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewAspect, setPreviewAspect] = useState<PreviewAspect>('landscape');
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState<DMMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [emojiPickerForMsgId, setEmojiPickerForMsgId] = useState<number | null>(null);
  const [composeEmojiOpen, setComposeEmojiOpen] = useState(false);
  const [composeGifOpen, setComposeGifOpen] = useState(false);
  const [composeGifTab, setComposeGifTab] = useState<GifPanelTab>('gif');
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dmSearchOpen, setDmSearchOpen] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmSearchActiveIndex, setDmSearchActiveIndex] = useState(0);
  const [inCallWith, setInCallWith] = useState<number | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callError, setCallError] = useState<string | null>(null);
  const [callConnectedAt, setCallConnectedAt] = useState<number | null>(null);
  const [callDurationNow, setCallDurationNow] = useState<number>(Date.now());

  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const composeEmojiPickerRef = useRef<HTMLDivElement | null>(null);
  const composeGifRef = useRef<HTMLDivElement | null>(null);
  const dragDepthRef = useRef<number>(0);
  const callPeerUserIdRef = useRef<number | null>(null);
  const dmPcRef = useRef<RTCPeerConnection | null>(null);
  const dmLocalStreamRef = useRef<MediaStream | null>(null);
  const dmRemoteStreamRef = useRef<MediaStream | null>(null);
  const dmAudioElRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const acceptedPlayedRef = useRef(false);
  const inCallWithRef = useRef<number | null>(null);

  const serverBaseUrl = /^https?:\/\//.test(serverAddress)
    ? serverAddress
    : `http://${serverAddress}`;
  const activeTargetUserId = useMemo(() => {
    if (targetUserId === null) return null;
    const parsed = Number(targetUserId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [targetUserId]);
  const normalizedDmSearch = dmSearchQuery.trim().toLocaleLowerCase('tr-TR');
  const dmSearchMatchIds = useMemo(() => {
    if (!normalizedDmSearch) return [] as number[];
    return messages
      .filter((msg) => (msg.content ?? '').toLocaleLowerCase('tr-TR').includes(normalizedDmSearch))
      .map((msg) => msg.id);
  }, [messages, normalizedDmSearch]);
  const dmSearchMatchSet = useMemo(() => new Set(dmSearchMatchIds), [dmSearchMatchIds]);
  const activeSearchMessageId = dmSearchMatchIds[dmSearchActiveIndex] ?? null;

  const markCallAccepted = useCallback(() => {
    stopIncomingCallLoop();
    setCallStatus('in-call');
    setCallConnectedAt((prev) => prev ?? Date.now());
    if (!acceptedPlayedRef.current) {
      playCallAcceptedSound();
      acceptedPlayedRef.current = true;
    }
  }, []);

  const cleanupRemoteAudio = useCallback(() => {
    const audioEl = dmAudioElRef.current;
    if (!audioEl) return;
    try {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
    } catch {
      // ignore
    }
    dmAudioElRef.current = null;
    dmRemoteStreamRef.current = null;
  }, []);

  const teardownCall = useCallback((stopLocalStream: boolean) => {
    const pc = dmPcRef.current;
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // ignore
      }
      dmPcRef.current = null;
    }

    if (stopLocalStream && dmLocalStreamRef.current) {
      dmLocalStreamRef.current.getTracks().forEach((t) => t.stop());
      dmLocalStreamRef.current = null;
    }

    pendingIceRef.current = [];
    acceptedPlayedRef.current = false;
    stopIncomingCallLoop();
    cleanupRemoteAudio();
  }, [cleanupRemoteAudio]);

  useEffect(() => {
    inCallWithRef.current = inCallWith;
  }, [inCallWith]);

  const clearCallState = useCallback(() => {
    setInCallWith(null);
    setCallStatus('idle');
    setCallError(null);
    setCallConnectedAt(null);
    setCallDurationNow(Date.now());
    callPeerUserIdRef.current = null;
  }, []);

  const endActiveCall = useCallback((targetUserId: number | null, notifyPeer: boolean) => {
    if (!targetUserId) return;
    if (notifyPeer && socket) {
      socket.emit('dm:call:end', { targetUserId });
    }
    teardownCall(true);
    clearCallState();
  }, [socket, teardownCall, clearCallState]);

  const ensureLocalStream = useCallback(async (): Promise<MediaStream> => {
    const existing = dmLocalStreamRef.current;
    if (existing && existing.getAudioTracks().some((t) => t.readyState === 'live')) {
      return existing;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    dmLocalStreamRef.current = stream;
    return stream;
  }, []);

  const getOrCreatePc = useCallback((partnerUserId: number): RTCPeerConnection => {
    if (dmPcRef.current) return dmPcRef.current;
    if (!socket) throw new Error('Socket not connected');

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket.emit('dm:ice:candidate', {
        to: '',
        dmTargetUserId: partnerUserId,
        candidate: event.candidate.toJSON(),
      });
    };

    pc.ontrack = (event) => {
      if (event.track.kind !== 'audio') return;
      const sourceStream = event.streams[0] ?? new MediaStream([event.track]);
      let remoteStream = dmRemoteStreamRef.current;
      if (!remoteStream) {
        remoteStream = new MediaStream();
        dmRemoteStreamRef.current = remoteStream;
      }

      const exists = remoteStream.getTracks().some((t) => t.id === event.track.id);
      if (!exists) remoteStream.addTrack(event.track);

      if (!dmAudioElRef.current) {
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        dmAudioElRef.current = audioEl;
      }

      dmAudioElRef.current.srcObject = sourceStream;
      dmAudioElRef.current.play().catch(() => {
        // autoplay may fail until first interaction on some setups
      });
      markCallAccepted();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        markCallAccepted();
      } else if (pc.connectionState === 'failed') {
        stopIncomingCallLoop();
        setCallError('Call connection failed.');
      } else if (pc.connectionState === 'disconnected') {
        stopIncomingCallLoop();
        setCallError('Call disconnected.');
      } else if (pc.connectionState === 'closed') {
        stopIncomingCallLoop();
        setCallStatus('idle');
      }
    };

    dmPcRef.current = pc;
    return pc;
  }, [socket, markCallAccepted]);

  const attachLocalTracks = useCallback((pc: RTCPeerConnection, stream: MediaStream) => {
    const hasAudioSender = pc.getSenders().some((s) => s.track?.kind === 'audio');
    if (hasAudioSender) return;
    for (const track of stream.getAudioTracks()) {
      pc.addTrack(track, stream);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.emit('friend:list:request');
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const isForActiveTarget = (payloadTargetUserId: number): boolean =>
      activeTargetUserId !== null && Number(payloadTargetUserId) === activeTargetUserId;

    const handleFriendList = (list: FriendItem[]) => setFriends(list);
    const handleHistory = (payload: { targetUserId: number; messages: DMMessage[] }) => {
      if (isForActiveTarget(payload.targetUserId)) setMessages(payload.messages);
    };
    const handleMessage = (payload: { targetUserId: number; message: DMMessage }) => {
      if (isForActiveTarget(payload.targetUserId)) {
        setMessages((prev) => [...prev, payload.message]);
        if (myUserId !== null && payload.message.fromUserId !== myUserId) {
          playMessageReceiveSound();
        }
      }
    };
    const handleMessageUpdate = (payload: { targetUserId: number; message: DMMessage }) => {
      if (!isForActiveTarget(payload.targetUserId)) return;
      setMessages((prev) => prev.map((msg) => (msg.id === payload.message.id ? { ...msg, ...payload.message } : msg)));
    };
    const handleMessageDelete = (payload: { targetUserId: number; messageId: number }) => {
      if (!isForActiveTarget(payload.targetUserId)) return;
      setMessages((prev) => prev.filter((msg) => msg.id !== payload.messageId));
      setDeleteConfirmMsg((prev) => (prev?.id === payload.messageId ? null : prev));
      if (editingMessageId === payload.messageId) {
        setEditingMessageId(null);
        setEditDraft('');
      }
    };
    const handleReactionUpdate = (payload: { targetUserId: number; messageId: number; reactions: { emoji: string; userIds: number[] }[] }) => {
      if (!isForActiveTarget(payload.targetUserId)) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === payload.messageId
            ? { ...msg, reactions: payload.reactions }
            : msg
        )
      );
    };

    const handleCallStarted = (payload: { targetUserId: number; fromUserId: number }) => {
      const partnerUserId = payload.fromUserId === myUserId ? payload.targetUserId : payload.fromUserId;
      if (activeTargetUserId !== null && partnerUserId !== activeTargetUserId) return;

      callPeerUserIdRef.current = partnerUserId;
      setInCallWith(partnerUserId);
      setCallError(null);
      setCallConnectedAt(null);
      setCallDurationNow(Date.now());
      acceptedPlayedRef.current = false;
      setCallStatus(payload.fromUserId === myUserId ? 'calling' : 'ringing');
      if (payload.fromUserId === myUserId) {
        stopIncomingCallLoop();
      } else {
        startIncomingCallLoop();
      }
    };

    const handleCallEnded = (payload: { targetUserId: number; fromUserId: number }) => {
      const partnerUserId = payload.fromUserId === myUserId ? payload.targetUserId : payload.fromUserId;
      if (inCallWith !== null && partnerUserId !== inCallWith) return;

      teardownCall(true);
      clearCallState();
    };

    const handleDmOffer = async (payload: { description: RTCSessionDescriptionInit }) => {
      if (activeTargetUserId === null) return;
      try {
        callPeerUserIdRef.current = activeTargetUserId;
        setInCallWith(activeTargetUserId);
        setCallError(null);
        setCallConnectedAt(null);
        setCallDurationNow(Date.now());
        acceptedPlayedRef.current = false;
        setCallStatus('ringing');
        startIncomingCallLoop();

        const localStream = await ensureLocalStream();
        const pc = getOrCreatePc(activeTargetUserId);
        attachLocalTracks(pc, localStream);

        await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
        while (pendingIceRef.current.length > 0) {
          const candidate = pendingIceRef.current.shift()!;
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }

        await pc.setLocalDescription();
        if (!pc.localDescription) return;

        socket.emit('dm:sdp:answer', {
          to: '',
          dmTargetUserId: activeTargetUserId,
          description: pc.localDescription,
        });
      } catch (err) {
        console.error('[dm-call] handle offer failed:', err);
        setCallError('Failed to accept call.');
      }
    };

    const handleDmAnswer = async (payload: { description: RTCSessionDescriptionInit }) => {
      const pc = dmPcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
        while (pendingIceRef.current.length > 0) {
          const candidate = pendingIceRef.current.shift()!;
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        markCallAccepted();
      } catch (err) {
        console.error('[dm-call] handle answer failed:', err);
        setCallError('Failed to finalize call.');
      }
    };

    const handleDmIce = async (payload: { candidate: RTCIceCandidateInit }) => {
      const pc = dmPcRef.current;
      if (!pc) return;
      if (pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          console.warn('[dm-call] add ICE failed:', err);
        }
      } else {
        pendingIceRef.current.push(payload.candidate);
      }
    };

    socket.on('friend:list', handleFriendList);
    socket.on('dm:history', handleHistory);
    socket.on('dm:message', handleMessage);
    socket.on('dm:message:update', handleMessageUpdate);
    socket.on('dm:message:delete', handleMessageDelete);
    socket.on('dm:reaction:update', handleReactionUpdate);
    socket.on('dm:call:started', handleCallStarted);
    socket.on('dm:call:ended', handleCallEnded);
    socket.on('dm:sdp:offer', handleDmOffer);
    socket.on('dm:sdp:answer', handleDmAnswer);
    socket.on('dm:ice:candidate', handleDmIce);

    return () => {
      socket.off('friend:list', handleFriendList);
      socket.off('dm:history', handleHistory);
      socket.off('dm:message', handleMessage);
      socket.off('dm:message:update', handleMessageUpdate);
      socket.off('dm:message:delete', handleMessageDelete);
      socket.off('dm:reaction:update', handleReactionUpdate);
      socket.off('dm:call:started', handleCallStarted);
      socket.off('dm:call:ended', handleCallEnded);
      socket.off('dm:sdp:offer', handleDmOffer);
      socket.off('dm:sdp:answer', handleDmAnswer);
      socket.off('dm:ice:candidate', handleDmIce);
    };
  }, [
    socket,
    activeTargetUserId,
    myUserId,
    inCallWith,
    ensureLocalStream,
    getOrCreatePc,
    attachLocalTracks,
    markCallAccepted,
    teardownCall,
    clearCallState,
    editingMessageId,
  ]);

  useEffect(() => {
    if (!socket || activeTargetUserId === null) return;
    socket.emit('dm:history:request', { targetUserId: activeTargetUserId });
  }, [socket, activeTargetUserId]);

  useEffect(() => {
    return () => {
      const activeCallTarget = inCallWithRef.current;
      if (activeCallTarget && socket) {
        socket.emit('dm:call:end', { targetUserId: activeCallTarget });
      }
      teardownCall(true);
    };
  }, [socket, teardownCall]);

  useEffect(() => {
    if (activeTargetUserId === null) return;
    if (inCallWith === null) return;
    if (inCallWith === activeTargetUserId) return;
    endActiveCall(inCallWith, true);
  }, [activeTargetUserId, inCallWith, endActiveCall]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeTargetUserId]);

  const scrollToMessage = useCallback((messageId: number, behavior: ScrollBehavior = 'smooth') => {
    const node = messageRefs.current.get(messageId);
    if (!node) return;
    node.scrollIntoView({ behavior, block: 'center' });
  }, []);

  useEffect(() => {
    if (!dmSearchOpen) return;
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [dmSearchOpen]);

  useEffect(() => {
    setDmSearchActiveIndex(0);
  }, [normalizedDmSearch, activeTargetUserId]);

  useEffect(() => {
    if (dmSearchMatchIds.length === 0) {
      setDmSearchActiveIndex(0);
      return;
    }
    setDmSearchActiveIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= dmSearchMatchIds.length) return dmSearchMatchIds.length - 1;
      return prev;
    });
  }, [dmSearchMatchIds]);

  useEffect(() => {
    if (!dmSearchOpen || activeSearchMessageId === null) return;
    scrollToMessage(activeSearchMessageId);
  }, [dmSearchOpen, activeSearchMessageId, scrollToMessage]);

  useEffect(() => {
    if (openSearchToken == null || openSearchToken <= 0 || activeTargetUserId === null) return;
    setDmSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [openSearchToken, activeTargetUserId]);

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (emojiPickerForMsgId !== null) {
        if (emojiPickerRef.current?.contains(target)) return;
        if (target.closest('[data-dm-emoji-picker-trigger="true"]')) return;
        setEmojiPickerForMsgId(null);
      }
      if (composeEmojiOpen) {
        if (composeEmojiPickerRef.current?.contains(target)) return;
        if (target.closest('[data-dm-compose-emoji-trigger="true"]')) return;
        setComposeEmojiOpen(false);
      }
      if (composeGifOpen) {
        if (composeGifRef.current?.contains(target)) return;
        if (target.closest('[data-dm-compose-gif-trigger="true"]')) return;
        setComposeGifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, [emojiPickerForMsgId, composeEmojiOpen, composeGifOpen]);

  useEffect(() => {
    setMessages([]);
    setHoveredMsgId(null);
    setPreview(null);
    setPreviewAspect('landscape');
    setDeleteConfirmMsg(null);
    setEditingMessageId(null);
    setEditDraft('');
    setEmojiPickerForMsgId(null);
    setComposeEmojiOpen(false);
    setComposeGifOpen(false);
    setComposeGifTab('gif');
    setGifQuery('');
    setGifResults([]);
    setGifLoading(false);
    setGifError(null);
    setUploadError(null);
    setIsDragOver(false);
    setDmSearchOpen(false);
    setDmSearchQuery('');
    setDmSearchActiveIndex(0);
    dragDepthRef.current = 0;
  }, [activeTargetUserId]);

  useEffect(() => {
    if (!preview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreview(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [preview]);

  useEffect(() => {
    const preventWindowFileDrop = (event: DragEvent) => {
      const types = event.dataTransfer?.types ? Array.from(event.dataTransfer.types) : [];
      if (!types.includes('Files')) return;
      event.preventDefault();
    };
    window.addEventListener('dragover', preventWindowFileDrop);
    window.addEventListener('drop', preventWindowFileDrop);
    return () => {
      window.removeEventListener('dragover', preventWindowFileDrop);
      window.removeEventListener('drop', preventWindowFileDrop);
    };
  }, []);

  const activeFriend = useMemo(
    () => friends.find((f) => f.userId === activeTargetUserId) ?? null,
    [friends, activeTargetUserId]
  );

  const myProfile = useMemo(() => {
    try {
      const raw = localStorage.getItem('session');
      if (!raw) return { displayName: 'You', profilePhotoUrl: null as string | null };
      const parsed = JSON.parse(raw) as { displayName?: string; profilePhotoUrl?: string | null };
      return {
        displayName: parsed.displayName?.trim() || 'You',
        profilePhotoUrl: parsed.profilePhotoUrl ?? null,
      };
    } catch {
      return { displayName: 'You', profilePhotoUrl: null as string | null };
    }
  }, []);

  const dmTargetPeer = useMemo<PeerInfo>(() => ({
    socketId: `dm-user-${activeTargetUserId ?? 'unknown'}`,
    userId: activeTargetUserId ?? undefined,
    displayName: activeFriend?.displayName ?? `User ${activeTargetUserId ?? 'Unknown'}`,
    avatarId: '',
    profilePhotoUrl: activeFriend?.profilePhotoUrl ?? null,
    bio: activeFriend?.bio ?? '',
  }), [activeFriend, activeTargetUserId]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (activeTargetUserId === null || myUserId === null) return;
      setUploading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fromUserId', String(myUserId));
        formData.append('toUserId', String(activeTargetUserId));
        const caption = input.trim();
        if (caption.length > 0) {
          formData.append('content', normalizeCountryCodeFlagsInText(caption));
          setInput('');
        }

        const response = await fetch(`${serverBaseUrl}/upload/dm`, {
          method: 'POST',
          body: formData,
          headers: { 'ngrok-skip-browser-warning': '1' },
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Upload failed.' }));
          throw new Error(errData.error || `Upload failed (${response.status})`);
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.');
        setTimeout(() => setUploadError(null), 4000);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [activeTargetUserId, myUserId, input, serverBaseUrl]
  );

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  }, [uploadFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      e.preventDefault();
      void uploadFile(items[0]);
    }
  }, [uploadFile]);

  const hasDraggedFiles = useCallback((e: React.DragEvent): boolean => {
    const types = e.dataTransfer?.types ? Array.from(e.dataTransfer.types) : [];
    return types.includes('Files');
  }, []);

  const handleDropFiles = useCallback(async (files: File[]) => {
    if (activeTargetUserId === null || !myUserId) {
      setUploadError('Bir DM secmeden dosya gonderemezsin.');
      setTimeout(() => setUploadError(null), 4000);
      return;
    }
    for (const file of files) {
      await uploadFile(file);
    }
  }, [activeTargetUserId, myUserId, uploadFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }, [hasDraggedFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, [hasDraggedFiles]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  }, [hasDraggedFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files ?? []);
    if (droppedFiles.length === 0) return;
    void handleDropFiles(droppedFiles);
  }, [handleDropFiles, hasDraggedFiles]);

  const sendMessage = useCallback((rawContent?: string) => {
    if (!socket || activeTargetUserId === null) return;
    const content = (rawContent ?? input).trim();
    if (!content) return;
    socket.emit('dm:message', { targetUserId: activeTargetUserId, content: normalizeCountryCodeFlagsInText(content) });
    playMessageSendSound();
    setInput('');
  }, [socket, activeTargetUserId, input]);

  const focusSearch = useCallback(() => {
    setDmSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const goToPrevSearchMatch = useCallback(() => {
    if (dmSearchMatchIds.length === 0) return;
    setDmSearchActiveIndex((prev) => {
      const nextIndex = prev <= 0 ? dmSearchMatchIds.length - 1 : prev - 1;
      const targetId = dmSearchMatchIds[nextIndex];
      if (targetId != null) scrollToMessage(targetId);
      return nextIndex;
    });
  }, [dmSearchMatchIds, scrollToMessage]);

  const goToNextSearchMatch = useCallback(() => {
    if (dmSearchMatchIds.length === 0) return;
    setDmSearchActiveIndex((prev) => {
      const nextIndex = prev >= dmSearchMatchIds.length - 1 ? 0 : prev + 1;
      const targetId = dmSearchMatchIds[nextIndex];
      if (targetId != null) scrollToMessage(targetId);
      return nextIndex;
    });
  }, [dmSearchMatchIds, scrollToMessage]);

  const insertTextAtCursor = useCallback((text: string) => {
    const inputEl = inputRef.current;
    if (!inputEl) {
      setInput((prev) => prev + text);
      return;
    }

    const start = inputEl.selectionStart ?? input.length;
    const end = inputEl.selectionEnd ?? start;
    const next = `${input.slice(0, start)}${text}${input.slice(end)}`;
    setInput(next);
    window.requestAnimationFrame(() => {
      const cursor = start + text.length;
      inputEl.focus();
      inputEl.setSelectionRange(cursor, cursor);
    });
  }, [input]);

  const loadGifResults = useCallback(async (query: string, tab: GifPanelTab) => {
    const trimmedQuery = query.trim();
    const stickerParam = tab === 'sticker' ? '&searchfilter=sticker' : '';
    const endpoint = trimmedQuery
      ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(trimmedQuery)}&key=${TENOR_API_KEY}&limit=${GIF_RESULT_LIMIT}${stickerParam}`
      : `https://g.tenor.com/v1/trending?key=${TENOR_API_KEY}&limit=${GIF_RESULT_LIMIT}${stickerParam}`;

    setGifLoading(true);
    setGifError(null);
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`GIF search failed (${response.status})`);
      const data = (await response.json()) as TenorResponse;
      const mapped = (data.results ?? [])
        .map((result) => tenorToGifResult(result, tab))
        .filter((item): item is GifResult => item !== null);

      setGifResults(mapped);
      if (mapped.length === 0) {
        setGifError('Sonuc bulunamadi.');
      }
    } catch {
      setGifResults([]);
      setGifError('GIF aranirken bir hata olustu.');
    } finally {
      setGifLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!composeGifOpen) return;
    const timer = window.setTimeout(() => {
      void loadGifResults(gifQuery, composeGifTab);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [composeGifOpen, composeGifTab, gifQuery, loadGifResults]);

  const handleSendGifFromUrl = useCallback(async (gifUrl: string) => {
    const raw = gifUrl.trim();
    if (!raw) return;
    if (activeTargetUserId === null || myUserId === null) {
      setUploadError('GIF gondermek icin once bir DM sec.');
      setTimeout(() => setUploadError(null), 4000);
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('invalid protocol');
      }
    } catch {
      setUploadError('Gecerli bir GIF URL sec.');
      setTimeout(() => setUploadError(null), 4000);
      return;
    }

    try {
      const response = await fetch(parsed.toString());
      if (!response.ok) {
        throw new Error(`GIF fetch failed (${response.status})`);
      }
      const blob = await response.blob();
      const mime = blob.type || '';
      if (!mime.startsWith('image/')) {
        throw new Error('URL is not an image/GIF.');
      }
      const pathParts = parsed.pathname.split('/');
      const rawFileName = decodeURIComponent(pathParts[pathParts.length - 1] || 'tenor-gif');
      const safeName = rawFileName.replace(/[?#].*$/, '');
      const finalName = safeName.includes('.') ? safeName : `${safeName}.gif`;
      const file = new File([blob], finalName, { type: mime || 'image/gif' });
      await uploadFile(file);
      setComposeGifOpen(false);
    } catch {
      setUploadError('GIF gonderilemedi. Baska bir sonuc dene.');
      setTimeout(() => setUploadError(null), 4000);
    }
  }, [activeTargetUserId, myUserId, uploadFile]);

  const beginEdit = useCallback((msg: DMMessage) => {
    setEditingMessageId(msg.id);
    setEditDraft(msg.content ?? '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditDraft('');
  }, []);

  const submitEdit = useCallback((msg: DMMessage) => {
    if (!socket || activeTargetUserId === null) return;
    const content = editDraft.trim();
    if (!msg.fileUrl && content.length === 0) return;
    setMessages((prev) =>
      prev.map((item) =>
        item.id === msg.id
          ? { ...item, content, editedAt: Date.now() }
          : item
      )
    );
    socket.emit('dm:message:edit', { targetUserId: activeTargetUserId, messageId: msg.id, content });
    setEditingMessageId(null);
    setEditDraft('');
  }, [socket, activeTargetUserId, editDraft]);

  const handleDeleteMessage = useCallback((msg: DMMessage) => {
    if (!socket || activeTargetUserId === null) return;
    setDeleteConfirmMsg(msg);
  }, [socket, activeTargetUserId]);

  const handleToggleReaction = useCallback((messageId: number, emoji: string) => {
    if (!socket || activeTargetUserId === null) return;
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji) return;
    if (myUserId !== null) {
      setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== messageId) return item;
          const current = item.reactions ?? [];
          const existingIndex = current.findIndex((group) => group.emoji === normalizedEmoji);
          if (existingIndex < 0) {
            return {
              ...item,
              reactions: [...current, { emoji: normalizedEmoji, userIds: [myUserId] }],
            };
          }
          const existing = current[existingIndex];
          const hasMine = existing.userIds.includes(myUserId);
          const nextUserIds = hasMine
            ? existing.userIds.filter((id) => id !== myUserId)
            : [...existing.userIds, myUserId];
          const nextGroups = nextUserIds.length === 0
            ? current.filter((_, idx) => idx !== existingIndex)
            : current.map((group, idx) =>
              idx === existingIndex ? { ...group, userIds: nextUserIds } : group
            );
          return { ...item, reactions: nextGroups.length > 0 ? nextGroups : undefined };
        })
      );
    }
    socket.emit('dm:reaction:toggle', { targetUserId: activeTargetUserId, messageId, emoji: normalizedEmoji });
  }, [socket, activeTargetUserId, myUserId]);

  const handleDownload = useCallback(async (url: string, suggestedName: string) => {
    try {
      const result = await window.electronAPI.downloadFile(url, suggestedName);
      if (!result.ok && !result.canceled) {
        setUploadError(result.error || 'Download failed.');
        setTimeout(() => setUploadError(null), 4000);
      }
    } catch {
      setUploadError('Download failed.');
      setTimeout(() => setUploadError(null), 4000);
    }
  }, []);

  const detectPreviewAspect = useCallback((url: string, kind: AttachmentKind) => {
    setPreviewAspect('landscape');
    const applyRatio = (ratio: number) => {
      if (!Number.isFinite(ratio) || ratio <= 0) {
        setPreviewAspect('landscape');
        return;
      }
      if (ratio > 1.15) {
        setPreviewAspect('landscape');
      } else if (ratio < 0.85) {
        setPreviewAspect('portrait');
      } else {
        setPreviewAspect('square');
      }
    };

    if (kind === 'image') {
      const img = new Image();
      img.onload = () => applyRatio(img.naturalWidth / img.naturalHeight);
      img.onerror = () => setPreviewAspect('landscape');
      img.src = url;
      return;
    }

    if (kind === 'video') {
      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      videoEl.onloadedmetadata = () => {
        applyRatio(videoEl.videoWidth / videoEl.videoHeight);
        videoEl.removeAttribute('src');
        videoEl.load();
      };
      videoEl.onerror = () => setPreviewAspect('landscape');
      videoEl.src = url;
    }
  }, []);

  const renderFileAttachment = useCallback((msg: DMMessage) => {
    if (!msg.fileUrl) return null;
    const fullUrl = serverBaseUrl + msg.fileUrl;
    const kind = getAttachmentKind(msg);
    const fileName = msg.fileName || 'Attachment';

    const openPreview = () => {
      detectPreviewAspect(fullUrl, kind);
      setPreview({
        url: fullUrl,
        kind,
        name: fileName,
        mimeType: msg.fileMimeType ?? null,
      });
    };

    if (kind === 'image') {
      return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={styles.imageContainer}>
          <img src={fullUrl} alt={fileName} style={styles.inlineImage} onClick={openPreview} loading="lazy" />
          <div style={styles.attachmentFooter}>
            <span style={styles.imageMeta}>{fileName}</span>
            <div style={styles.attachmentActions}>
              <button style={styles.downloadIconBtn} onClick={openPreview} title="Open in app"><Eye size={14} /></button>
              <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download"><Download size={14} /></button>
            </div>
          </div>
        </motion.div>
      );
    }
    if (kind === 'video') {
      return (
        <div style={styles.richAttachmentCard}>
          <video controls preload="metadata" style={styles.inlineVideo}>
            <source src={fullUrl} type={msg.fileMimeType || 'video/mp4'} />
          </video>
          <div style={styles.attachmentFooter}>
            <span style={styles.fileSize}>{fileName}</span>
            <div style={styles.attachmentActions}>
              <button style={styles.downloadIconBtn} onClick={openPreview} title="Open in app"><Eye size={14} /></button>
              <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download"><Download size={14} /></button>
            </div>
          </div>
        </div>
      );
    }
    if (kind === 'audio') {
      return (
        <div style={styles.richAttachmentCard}>
          <div style={styles.audioRow}>
            <Music2 size={15} color={theme.colors.accent} />
            <span style={styles.fileSize}>{fileName}</span>
          </div>
          <audio controls preload="metadata" style={styles.inlineAudio}>
            <source src={fullUrl} type={msg.fileMimeType || 'audio/mpeg'} />
          </audio>
          <div style={styles.attachmentFooter}>
            <span style={styles.fileSize}>{msg.fileSize != null ? formatFileSize(msg.fileSize) : 'Audio'}</span>
            <div style={styles.attachmentActions}>
              <button style={styles.downloadIconBtn} onClick={openPreview} title="Open in app"><Eye size={14} /></button>
              <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download"><Download size={14} /></button>
            </div>
          </div>
        </div>
      );
    }
    if (kind === 'document') {
      return (
        <div style={styles.fileCard}>
          <FileIcon size={20} color={theme.colors.accent} style={{ flexShrink: 0 }} />
          <div style={styles.fileInfo}>
            <span style={styles.fileLink}>{fileName}</span>
            <span style={styles.fileSize}>{msg.fileSize != null ? formatFileSize(msg.fileSize) : 'Document'}</span>
          </div>
          <button style={styles.downloadIconBtn} onClick={openPreview} title="Open in app"><Eye size={16} /></button>
          <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download"><Download size={16} /></button>
        </div>
      );
    }
    return (
      <div style={styles.fileCard}>
        <FileIcon size={20} color={theme.colors.accent} style={{ flexShrink: 0 }} />
        <div style={styles.fileInfo}>
          <span style={styles.fileLink}>{fileName}</span>
          {msg.fileSize != null && <span style={styles.fileSize}>{formatFileSize(msg.fileSize)}</span>}
        </div>
        <button type="button" style={styles.downloadIconBtn} onClick={openPreview} title="Open in app"><Eye size={16} /></button>
        <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download"><Download size={16} /></button>
      </div>
    );
  }, [detectPreviewAspect, handleDownload, serverBaseUrl]);

  const previewFrameStyle =
    previewAspect === 'portrait'
      ? styles.previewFramePortrait
      : previewAspect === 'square'
        ? styles.previewFrameSquare
        : styles.previewFrameLandscape;

  const confirmDeleteMessage = useCallback(() => {
    if (!socket || activeTargetUserId === null || !deleteConfirmMsg) return;
    setMessages((prev) => prev.filter((msg) => msg.id !== deleteConfirmMsg.id));
    socket.emit('dm:message:delete', { targetUserId: activeTargetUserId, messageId: deleteConfirmMsg.id });
    if (editingMessageId === deleteConfirmMsg.id) {
      setEditingMessageId(null);
      setEditDraft('');
    }
    setDeleteConfirmMsg(null);
  }, [socket, activeTargetUserId, deleteConfirmMsg, editingMessageId]);

  const startCall = useCallback(async () => {
    if (!socket || activeTargetUserId === null) return;
    if (callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'in-call') return;

    setCallError(null);
    acceptedPlayedRef.current = false;
    setCallConnectedAt(null);
    setCallDurationNow(Date.now());
    setCallStatus('calling');
    setInCallWith(activeTargetUserId);
    callPeerUserIdRef.current = activeTargetUserId;
    stopIncomingCallLoop();
    playCallStartSound();

    try {
      const localStream = await ensureLocalStream();
      const pc = getOrCreatePc(activeTargetUserId);
      attachLocalTracks(pc, localStream);

      socket.emit('dm:call:start', { targetUserId: activeTargetUserId });

      await pc.setLocalDescription();
      if (!pc.localDescription) throw new Error('No local description');

      socket.emit('dm:sdp:offer', {
        to: '',
        dmTargetUserId: activeTargetUserId,
        description: pc.localDescription,
      });
    } catch (err) {
      console.error('[dm-call] start failed:', err);
      teardownCall(true);
      setInCallWith(null);
      setCallStatus('idle');
      setCallError('Could not start DM call.');
    }
  }, [socket, activeTargetUserId, callStatus, ensureLocalStream, getOrCreatePc, attachLocalTracks, teardownCall]);

  useEffect(() => {
    if (openCallToken == null || openCallToken <= 0 || activeTargetUserId === null) return;
    if (callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'in-call') return;
    void startCall();
  }, [openCallToken, activeTargetUserId, callStatus, startCall]);

  const endCall = useCallback(() => {
    const partnerUserId = inCallWith ?? activeTargetUserId;
    if (!partnerUserId) return;
    endActiveCall(partnerUserId, true);
  }, [inCallWith, activeTargetUserId, endActiveCall]);

  const callBannerText =
    callStatus === 'in-call'
      ? 'DM Call Active'
      : callStatus === 'calling'
        ? 'Calling...'
        : callStatus === 'ringing'
          ? 'Connecting call...'
          : '';
  const callPartnerName = activeFriend?.displayName ?? `User ${activeTargetUserId}`;
  const callDurationText = useMemo(() => {
    if (callStatus !== 'in-call' || !callConnectedAt) return '';
    const elapsedSeconds = Math.max(0, Math.floor((callDurationNow - callConnectedAt) / 1000));
    const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const ss = String(elapsedSeconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [callStatus, callConnectedAt, callDurationNow]);

  useEffect(() => {
    if (callStatus !== 'in-call' || callConnectedAt === null) return;
    setCallDurationNow(Date.now());
    const timer = setInterval(() => setCallDurationNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [callStatus, callConnectedAt]);

  if (activeTargetUserId === null) {
    return <div style={styles.emptyPane}>Select a friend to open conversation.</div>;
  }

  return (
    <div
      style={styles.chatArea}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            type="button"
            style={styles.headerUserBtn}
            onClick={(event) => {
              if (!onOpenUserCard) return;
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenUserCard(dmTargetPeer, { x: rect.right + 12, y: rect.top });
            }}
            title="View profile card"
          >
            <AvatarBadge
              displayName={activeFriend?.displayName ?? `User ${activeTargetUserId}`}
              profilePhotoUrl={activeFriend?.profilePhotoUrl ?? null}
              serverAddress={serverAddress}
              size={30}
            />
            <div>
              <div style={styles.headerName}>{activeFriend?.displayName ?? `User ${activeTargetUserId}`}</div>
              <div style={styles.headerBio}>{activeFriend?.bio || 'No bio yet'}</div>
            </div>
          </button>
        </div>
        <div style={styles.callButtons}>
          {!activeFriend && (
            <button style={styles.callBtn} onClick={() => socket?.emit('friend:request:send', { targetUserId: activeTargetUserId })}>
              Add Friend
            </button>
          )}
          <button
            style={styles.callBtn}
            onClick={startCall}
            disabled={callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'in-call'}
          >
            {callStatus === 'calling' ? 'Calling...' : 'Call'}
          </button>
          <button
            style={styles.callEndBtn}
            onClick={endCall}
            disabled={callStatus === 'idle'}
          >
            End
          </button>
        </div>
      </header>

      {inCallWith === activeTargetUserId && callBannerText && (
        <div style={styles.callBanner}>
          <div style={styles.callBannerLeft}>
            <span style={styles.callPulseDot} />
            <PhoneCall size={13} color={theme.colors.accent} />
            <span style={styles.callBannerTextStrong}>
              {callStatus === 'in-call'
                ? `${callPartnerName} ile sesli aramadasin`
                : callStatus === 'calling'
                  ? `${callPartnerName} araniyor...`
                  : `${callPartnerName} ile baglanti kuruluyor...`}
            </span>
          </div>
          {callStatus === 'in-call' && callDurationText && (
            <span style={styles.callTimerPill}>{callDurationText}</span>
          )}
        </div>
      )}
      {callError && <div style={styles.callError}>{callError}</div>}
      {dmSearchOpen && (
        <div style={styles.searchStrip}>
          <Search size={14} color={theme.colors.textMuted} />
          <input
            ref={searchInputRef}
            style={styles.searchInput}
            value={dmSearchQuery}
            onChange={(event) => setDmSearchQuery(event.target.value)}
            placeholder="Search messages in this DM..."
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (event.shiftKey) goToPrevSearchMatch();
                else goToNextSearchMatch();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setDmSearchOpen(false);
              }
            }}
          />
          <span style={styles.searchCount}>
            {dmSearchMatchIds.length === 0 ? '0/0' : `${dmSearchActiveIndex + 1}/${dmSearchMatchIds.length}`}
          </span>
          <button type="button" style={styles.searchNavBtn} onClick={goToPrevSearchMatch} title="Previous match">
            ↑
          </button>
          <button type="button" style={styles.searchNavBtn} onClick={goToNextSearchMatch} title="Next match">
            ↓
          </button>
          <button
            type="button"
            style={styles.searchCloseBtn}
            onClick={() => setDmSearchOpen(false)}
            title="Close search"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div ref={messagesListRef} style={styles.messages}>
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isOwn = myUserId !== null && msg.fromUserId === myUserId;
            const isEditing = editingMessageId === msg.id;
            const toolbarVisible = hoveredMsgId === msg.id || emojiPickerForMsgId === msg.id;
            const senderName = isOwn ? `${myProfile.displayName} (You)` : (activeFriend?.displayName ?? `User ${msg.fromUserId}`);
            const senderPhoto = isOwn ? myProfile.profilePhotoUrl : (activeFriend?.profilePhotoUrl ?? null);

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                ref={(node) => {
                  if (node) messageRefs.current.set(msg.id, node);
                  else messageRefs.current.delete(msg.id);
                }}
                style={{
                  ...styles.msg,
                  ...(isOwn ? styles.msgMine : {}),
                  ...(hoveredMsgId === msg.id ? styles.msgHovered : {}),
                  ...(dmSearchMatchSet.has(msg.id) ? styles.msgSearchHit : {}),
                  ...(activeSearchMessageId === msg.id ? styles.msgSearchActive : {}),
                }}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                <div style={styles.msgHeader}>
                  <div style={styles.msgSender}>
                    <AvatarBadge
                      displayName={senderName}
                      profilePhotoUrl={senderPhoto}
                      serverAddress={serverAddress}
                      size={22}
                    />
                    <span style={styles.msgSenderName}>{senderName}</span>
                  </div>
                  <div style={styles.msgMeta}>
                    <span style={styles.msgTime}>{formatTime(msg.timestamp)}</span>
                    {msg.editedAt ? <span style={styles.editedTag}>edited</span> : null}
                  </div>
                </div>

                {isEditing ? (
                  <div style={styles.editWrap}>
                    <textarea
                      style={styles.editInput}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      placeholder={msg.fileUrl ? 'Edit caption (optional)...' : 'Edit message...'}
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submitEdit(msg);
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                    />
                    <div style={styles.editActions}>
                      <button style={styles.editSaveBtn} onClick={() => submitEdit(msg)} disabled={!msg.fileUrl && editDraft.trim().length === 0}>
                        <Check size={13} />
                        Save
                      </button>
                      <button style={styles.editCancelBtn} onClick={cancelEdit}>
                        <X size={13} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {msg.content && <div>{renderMarkdown(msg.content)}</div>}
                    {msg.fileUrl && renderFileAttachment(msg)}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div style={styles.reactionRow}>
                        {msg.reactions.map((reaction) => {
                          const mine = myUserId !== null && reaction.userIds.includes(myUserId);
                          return (
                            <button
                              key={`${msg.id}-${reaction.emoji}`}
                              type="button"
                              style={{ ...styles.reactionPill, ...(mine ? styles.reactionPillActive : {}) }}
                              onClick={() => handleToggleReaction(msg.id, reaction.emoji)}
                              title="Toggle reaction"
                            >
                              <span>{reaction.emoji}</span>
                              <span>{reaction.userIds.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {toolbarVisible && (
                      <div style={styles.messageToolbar}>
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={`quick-${msg.id}-${emoji}`}
                            type="button"
                            style={styles.toolbarEmojiBtn}
                            onClick={() => handleToggleReaction(msg.id, emoji)}
                            title={`React ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                        <button
                          type="button"
                          style={styles.messageActionBtn}
                          title="More emojis"
                          data-dm-emoji-picker-trigger="true"
                          onClick={() => setEmojiPickerForMsgId((prev) => (prev === msg.id ? null : msg.id))}
                        >
                          <Ellipsis size={13} />
                        </button>
                        {isOwn && (
                          <>
                            <button style={styles.messageActionBtn} onClick={() => beginEdit(msg)} title="Edit">
                              <Pencil size={12} />
                            </button>
                            <button style={{ ...styles.messageActionBtn, ...styles.messageDeleteBtn }} onClick={() => handleDeleteMessage(msg)} title="Delete">
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {emojiPickerForMsgId === msg.id && (
                      <div ref={emojiPickerRef} style={styles.emojiPickerWrap} onMouseDown={(event) => event.stopPropagation()}>
                        <EmojiPicker
                          theme={Theme.DARK}
                          className="inn-emoji-picker"
                          width={360}
                          height={430}
                          categories={EMOJI_CATEGORIES_NO_FLAGS}
                          lazyLoadEmojis={true}
                          onEmojiClick={(emojiData) => {
                            handleToggleReaction(msg.id, emojiData.emoji);
                            setEmojiPickerForMsgId(null);
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputWrapper}>
        <div style={styles.inputBar} className="glass">
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            type="button"
            style={styles.uploadBtn}
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            disabled={uploading}
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            style={styles.searchBtn}
            onClick={focusSearch}
            title="Search in this DM"
          >
            <Search size={16} />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={styles.input}
            placeholder={uploading ? 'Uploading...' : 'Send a message...'}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            onPaste={handlePaste}
          />
          <div style={styles.inputActions}>
            <button
              type="button"
              style={styles.inputActionBtn}
              title="Insert emoji"
              data-dm-compose-emoji-trigger="true"
              onClick={() => {
                setComposeEmojiOpen((prev) => !prev);
                setComposeGifOpen(false);
              }}
            >
              <Smile size={15} />
            </button>
            <button
              type="button"
              style={styles.inputActionGifBtn}
              title="Send GIF"
              data-dm-compose-gif-trigger="true"
              onClick={() => {
                setComposeGifOpen((prev) => !prev);
                setComposeEmojiOpen(false);
                if (!composeGifOpen) setComposeGifTab('gif');
              }}
            >
              GIF
            </button>
          </div>
          <button
            type="button"
            style={{ ...styles.sendBtn, opacity: input.trim().length > 0 || uploading ? 1 : 0.4 }}
            onClick={() => sendMessage()}
            disabled={input.trim().length === 0 || uploading}
            title="Send"
          >
            <Send size={17} />
          </button>
        </div>
        {composeEmojiOpen && (
          <div
            ref={composeEmojiPickerRef}
            style={styles.composeEmojiPicker}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <EmojiPicker
              theme={Theme.DARK}
              className="inn-emoji-picker"
              width={360}
              height={430}
              categories={EMOJI_CATEGORIES_NO_FLAGS}
              lazyLoadEmojis={true}
              onEmojiClick={(emojiData) => {
                insertTextAtCursor(emojiData.emoji);
              }}
            />
          </div>
        )}
        {composeGifOpen && (
          <div
            ref={composeGifRef}
            style={styles.composeGifPanel}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div style={styles.composeGifTabs}>
              <button
                type="button"
                style={{
                  ...styles.composeGifTab,
                  ...(composeGifTab === 'gif' ? styles.composeGifTabActive : {}),
                }}
                onClick={() => setComposeGifTab('gif')}
              >
                GIF's
              </button>
              <button
                type="button"
                style={{
                  ...styles.composeGifTab,
                  ...(composeGifTab === 'sticker' ? styles.composeGifTabActive : {}),
                }}
                onClick={() => setComposeGifTab('sticker')}
              >
                Stickers
              </button>
            </div>
            <div style={styles.composeGifSearchRow}>
              <Search size={15} color={theme.colors.textMuted} />
              <input
                style={styles.composeGifInput}
                value={gifQuery}
                onChange={(event) => setGifQuery(event.target.value)}
                placeholder="Tenor'da ara"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void loadGifResults(gifQuery, composeGifTab);
                  }
                }}
              />
              <button
                type="button"
                style={styles.composeGifSearchBtn}
                onClick={() => void loadGifResults(gifQuery, composeGifTab)}
                title="Ara"
              >
                <Search size={13} />
              </button>
            </div>
            {gifLoading && <span style={styles.composeGifHint}>GIF'ler yukleniyor...</span>}
            {!gifLoading && gifError && <span style={styles.composeGifHint}>{gifError}</span>}
            <div style={styles.composeGifGrid}>
              {gifResults.map((gif) => (
                <button
                  key={gif.id}
                    type="button"
                    style={styles.composeGifTile}
                    onClick={() => void handleSendGifFromUrl(gif.mediaUrl)}
                    title={gif.title}
                >
                  <img src={gif.previewUrl} alt={gif.title} style={styles.composeGifThumb} loading="lazy" />
                  <span style={styles.composeGifTileLabel}>{gif.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {uploadError && <div style={styles.inputError}>{uploadError}</div>}
      </div>

      {preview && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.lightboxOverlay} onClick={() => setPreview(null)}>
          <div style={styles.previewCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.previewHeader}>
              <div style={styles.previewHeaderText}>
                <span style={styles.previewTitle}>{preview.name}</span>
                <span style={styles.previewSubtitle}>{preview.mimeType || preview.kind}</span>
              </div>
              <div style={styles.previewHeaderActions}>
                <button
                  type="button"
                  style={styles.downloadIconBtn}
                  onClick={() => void handleDownload(preview.url, preview.name)}
                  title="Download"
                >
                  <Download size={16} />
                </button>
                <button style={styles.lightboxClose} onClick={() => setPreview(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div style={styles.previewBody}>
              {(preview.kind === 'image' || preview.kind === 'video') && (
                <div style={{ ...styles.previewMediaFrame, ...previewFrameStyle }}>
                  {preview.kind === 'image' ? (
                    <img src={preview.url} style={styles.lightboxImage} alt={preview.name} />
                  ) : (
                    <video controls autoPlay style={styles.previewVideo}>
                      <source src={preview.url} type={preview.mimeType || 'video/mp4'} />
                    </video>
                  )}
                </div>
              )}
              {preview.kind === 'audio' && (
                <div style={styles.previewAudioFrame}>
                  <audio controls autoPlay style={styles.previewAudio}>
                    <source src={preview.url} type={preview.mimeType || 'audio/mpeg'} />
                  </audio>
                </div>
              )}
              {preview.kind === 'document' && (
                <div style={{ ...styles.previewMediaFrame, ...styles.previewFrameLandscape }}>
                  <iframe src={preview.url} title={preview.name} style={styles.previewDocument} />
                </div>
              )}
              {preview.kind === 'file' && (
                <div style={styles.previewFallback}>
                  <FileIcon size={22} color={theme.colors.accent} />
                  <span style={styles.fileSize}>Preview is not supported for this file type.</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {deleteConfirmMsg && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.confirmOverlay} onClick={() => setDeleteConfirmMsg(null)}>
          <div style={styles.confirmCard} onClick={(event) => event.stopPropagation()}>
            <span style={styles.confirmTitle}>Mesaj Silinsin mi?</span>
            <span style={styles.confirmText}>Bu DM mesaji ve ek dosya herkes icin silinecek.</span>
            <div style={styles.confirmActions}>
              <button type="button" style={styles.confirmCancelBtn} onClick={() => setDeleteConfirmMsg(null)}>Iptal</button>
              <button type="button" style={styles.confirmDeleteBtn} onClick={confirmDeleteMessage}>Sil</button>
            </div>
          </div>
        </motion.div>
      )}

      {isDragOver && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.dropOverlay}>
          <div style={styles.dropOverlayCard}>
            <span style={styles.dropOverlayTitle}>Drop files to upload</span>
            <span style={styles.dropOverlaySubtitle}>
              Images, videos, audio and documents are supported (max 25 MB each).
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chatArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    position: 'relative',
    background:
      'radial-gradient(circle at 50% -20%, rgba(227, 170, 106, 0.14) 0%, rgba(227, 170, 106, 0.03) 35%, transparent 70%), rgba(9, 6, 5, 0.72)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    padding: '0.7rem 0.9rem',
    backgroundColor: 'rgba(18, 13, 10, 0.86)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerUserBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
  },
  headerName: { fontSize: '0.9rem', color: theme.colors.textPrimary, fontWeight: 700 },
  headerBio: { fontSize: '0.74rem', color: theme.colors.textMuted },
  callButtons: { display: 'flex', gap: 6 },
  callBtn: {
    background: 'rgba(227, 170, 106, 0.08)',
    border: `1px solid ${theme.colors.accentBorder}`,
    borderRadius: 8,
    color: theme.colors.accent,
    fontSize: '0.76rem',
    padding: '5px 10px',
    cursor: 'pointer',
  },
  callEndBtn: {
    background: 'rgba(255, 75, 75, 0.12)',
    border: '1px solid rgba(255, 75, 75, 0.3)',
    borderRadius: 8,
    color: theme.colors.error,
    fontSize: '0.76rem',
    padding: '5px 10px',
    cursor: 'pointer',
  },
  callBanner: {
    padding: '0.5rem 0.8rem',
    background: 'linear-gradient(90deg, rgba(227,170,106,0.14) 0%, rgba(227,170,106,0.06) 65%, rgba(227,170,106,0.03) 100%)',
    color: theme.colors.textPrimary,
    borderBottom: `1px solid ${theme.colors.accentBorder}`,
    fontSize: '0.78rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.65rem',
  },
  callBannerLeft: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    minWidth: 0,
  },
  callPulseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    background: '#43d67c',
    boxShadow: '0 0 0 4px rgba(67, 214, 124, 0.18)',
    flexShrink: 0,
  },
  callBannerTextStrong: {
    color: theme.colors.textPrimary,
    fontWeight: 700,
    fontSize: '0.78rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  callTimerPill: {
    borderRadius: '999px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'rgba(10,8,6,0.65)',
    color: theme.colors.accent,
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.03em',
    padding: '0.18rem 0.5rem',
    flexShrink: 0,
  },
  callError: {
    padding: '0.35rem 0.8rem',
    backgroundColor: 'rgba(255, 75, 75, 0.08)',
    color: theme.colors.error,
    borderBottom: '1px solid rgba(255, 75, 75, 0.24)',
    fontSize: '0.74rem',
  },
  searchStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.38rem',
    padding: '0.4rem 0.8rem',
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(18,13,10,0.78)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    border: `1px solid ${theme.colors.borderInput}`,
    borderRadius: '8px',
    background: 'rgba(9,7,5,0.7)',
    color: theme.colors.textPrimary,
    padding: '0.35rem 0.5rem',
    fontSize: '0.74rem',
    fontFamily: 'inherit',
    outline: 'none',
  },
  searchCount: {
    fontSize: '0.68rem',
    color: theme.colors.textMuted,
    minWidth: '46px',
    textAlign: 'center',
  },
  searchNavBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '7px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.04)',
    color: theme.colors.textSecondary,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    fontSize: '0.72rem',
    lineHeight: 1,
  },
  searchCloseBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '7px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.04)',
    color: theme.colors.textMuted,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  },
  messages: { flex: 1, overflowY: 'auto', padding: '0.85rem' },
  msg: {
    maxWidth: '70%',
    padding: '0.5rem 0.65rem 2.2rem',
    borderRadius: 10,
    backgroundColor: 'rgba(227, 170, 106, 0.08)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    color: theme.colors.textPrimary,
    marginBottom: 6,
    fontSize: '0.82rem',
    position: 'relative',
    transition: 'background-color 0.2s',
  },
  msgMine: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(227, 170, 106, 0.16)',
    borderColor: theme.colors.accentBorder,
  },
  msgHovered: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  msgSearchHit: {
    borderColor: 'rgba(227,170,106,0.45)',
    backgroundColor: 'rgba(227,170,106,0.12)',
  },
  msgSearchActive: {
    borderColor: theme.colors.accentBorder,
    boxShadow: '0 0 0 1px rgba(227,170,106,0.35)',
  },
  msgHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.32rem',
    gap: '0.5rem',
  },
  msgSender: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.46rem',
    minWidth: 0,
  },
  msgSenderName: {
    color: theme.colors.accent,
    fontSize: '0.76rem',
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  msgMeta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    flexShrink: 0,
  },
  msgTime: {
    color: theme.colors.textMuted,
    fontSize: '0.64rem',
  },
  editedTag: {
    color: theme.colors.textMuted,
    fontSize: '0.62rem',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: '999px',
    padding: '0.06rem 0.28rem',
  },
  imageContainer: {
    marginTop: '0.5rem',
    borderRadius: '12px',
    overflow: 'hidden',
    border: `1px solid ${theme.colors.borderSubtle}`,
    display: 'inline-block',
    maxWidth: '420px',
    background: 'rgba(20,14,10,0.6)',
  },
  inlineImage: {
    maxWidth: '100%',
    maxHeight: '320px',
    display: 'block',
    cursor: 'pointer',
  },
  imageMeta: {
    fontSize: '0.7rem',
    color: theme.colors.textSecondary,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  attachmentFooter: {
    padding: '0.34rem 0.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  attachmentActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.28rem',
  },
  richAttachmentCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.38rem',
    background: 'linear-gradient(180deg, rgba(24,17,13,0.8) 0%, rgba(14,10,8,0.84) 100%)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: '12px',
    padding: '0.52rem',
    maxWidth: '430px',
    marginTop: '0.48rem',
  },
  inlineVideo: {
    width: '100%',
    maxHeight: '260px',
    borderRadius: '9px',
    background: '#000',
  },
  inlineAudio: {
    width: '100%',
    height: '34px',
  },
  audioRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.42rem',
  },
  fileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.7rem',
    background: 'linear-gradient(180deg, rgba(24,17,13,0.8) 0%, rgba(14,10,8,0.84) 100%)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: '11px',
    padding: '0.7rem',
    maxWidth: '430px',
    marginTop: '0.5rem',
  },
  fileInfo: {
    flex: 1,
    overflow: 'hidden',
  },
  fileLink: {
    color: theme.colors.textPrimary,
    fontSize: '0.76rem',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileSize: {
    color: theme.colors.textMuted,
    fontSize: '0.68rem',
  },
  downloadIconBtn: {
    border: `1px solid ${theme.colors.borderSubtle}`,
    color: theme.colors.textSecondary,
    width: '28px',
    height: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.05)',
    cursor: 'pointer',
    padding: 0,
  },
  reactionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.35rem',
    marginTop: '0.38rem',
  },
  reactionPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.28rem',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.04)',
    color: theme.colors.textSecondary,
    borderRadius: '999px',
    padding: '0.12rem 0.42rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  reactionPillActive: {
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'rgba(227,170,106,0.16)',
    color: theme.colors.accent,
  },
  messageToolbar: {
    position: 'absolute',
    right: '0.42rem',
    bottom: '0.35rem',
    zIndex: 15,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.3rem',
    alignItems: 'center',
    flexWrap: 'wrap',
    maxWidth: 'calc(100% - 3rem)',
  },
  emojiPickerWrap: {
    position: 'absolute',
    right: '0.42rem',
    bottom: '2.35rem',
    zIndex: 20,
    filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.45))',
  },
  toolbarEmojiBtn: {
    minWidth: '24px',
    height: '24px',
    borderRadius: '8px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(18,13,10,0.85)',
    color: theme.colors.textSecondary,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '0 0.3rem',
    fontSize: '0.82rem',
  },
  messageActionBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '8px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(18,13,10,0.85)',
    color: theme.colors.textSecondary,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  messageDeleteBtn: {
    color: '#f09a9a',
    border: '1px solid rgba(240,154,154,0.45)',
  },
  editWrap: {
    marginTop: '0.2rem',
    border: `1px solid ${theme.colors.accentBorder}`,
    borderRadius: '10px',
    padding: '0.45rem',
    background: 'rgba(20,14,10,0.72)',
  },
  editInput: {
    width: '100%',
    border: `1px solid ${theme.colors.borderInput}`,
    borderRadius: '8px',
    background: 'rgba(9,7,5,0.6)',
    color: theme.colors.textPrimary,
    padding: '0.46rem 0.58rem',
    resize: 'vertical',
    minHeight: '50px',
    fontSize: theme.font.sizeSm,
    fontFamily: 'inherit',
  },
  editActions: {
    marginTop: '0.42rem',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.35rem',
  },
  editSaveBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'rgba(227,170,106,0.15)',
    color: theme.colors.accent,
    borderRadius: '8px',
    padding: '0.25rem 0.5rem',
    fontSize: '0.72rem',
  },
  editCancelBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.03)',
    color: theme.colors.textMuted,
    borderRadius: '8px',
    padding: '0.25rem 0.5rem',
    fontSize: '0.72rem',
  },
  inputWrapper: {
    padding: '0.6rem 0.8rem 0.8rem',
    borderTop: `1px solid ${theme.colors.borderSubtle}`,
    backgroundColor: 'rgba(18, 13, 10, 0.85)',
    position: 'relative',
  },
  inputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.48rem',
    padding: '0.5rem 0.72rem',
    borderRadius: '14px',
    boxShadow: 'inset 0 1px 0 rgba(255,234,206,0.08), 0 8px 20px rgba(0,0,0,0.36)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'linear-gradient(180deg, rgba(24,17,12,0.84) 0%, rgba(14,10,8,0.9) 100%)',
  },
  uploadBtn: {
    background: 'rgba(227,170,106,0.08)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    width: '34px',
    height: '34px',
    borderRadius: '9px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtn: {
    background: 'rgba(227,170,106,0.08)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    width: '34px',
    height: '34px',
    borderRadius: '9px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 0,
    color: theme.colors.textPrimary,
    padding: '0.5rem',
    fontSize: theme.font.sizeMd,
    outline: 'none',
    fontFamily: 'inherit',
  },
  inputActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.32rem',
  },
  inputActionBtn: {
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.04)',
    color: theme.colors.textSecondary,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  },
  inputActionGifBtn: {
    height: '30px',
    minWidth: '36px',
    borderRadius: '8px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.04)',
    color: theme.colors.textSecondary,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '0 0.4rem',
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  sendBtn: {
    background: 'linear-gradient(180deg, #efc58a 0%, #d59f65 100%)',
    border: '1px solid rgba(209,149,89,0.9)',
    color: '#2f1b10',
    width: '34px',
    height: '34px',
    borderRadius: '9px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: 'inset 0 1px 0 rgba(255,245,220,0.45), 0 6px 14px rgba(0,0,0,0.32)',
    padding: 0,
  },
  composeEmojiPicker: {
    position: 'absolute',
    right: '3.4rem',
    bottom: '3.45rem',
    zIndex: 1300,
    filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.45))',
  },
  composeGifPanel: {
    position: 'absolute',
    right: '3.4rem',
    bottom: '3.45rem',
    zIndex: 1300,
    width: '360px',
    borderRadius: '12px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'linear-gradient(180deg, rgba(22,16,12,0.96) 0%, rgba(12,9,7,0.98) 100%)',
    boxShadow: '0 14px 32px rgba(0,0,0,0.48)',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  composeGifTabs: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
  },
  composeGifTab: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.textMuted,
    fontSize: '0.75rem',
    fontWeight: 700,
    padding: '0.2rem 0.45rem',
    borderRadius: '999px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.02)',
    cursor: 'pointer',
    outline: 'none',
  },
  composeGifTabActive: {
    color: theme.colors.accent,
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'rgba(227,170,106,0.1)',
  },
  composeGifSearchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    borderRadius: '9px',
    border: `1px solid ${theme.colors.borderInput}`,
    background: 'rgba(0,0,0,0.24)',
    padding: '0.35rem 0.45rem',
  },
  composeGifInput: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    color: theme.colors.textPrimary,
    padding: 0,
    fontSize: '0.76rem',
    outline: 'none',
  },
  composeGifSearchBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '7px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.05)',
    color: theme.colors.textSecondary,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  },
  composeGifHint: {
    color: theme.colors.textMuted,
    fontSize: '0.66rem',
  },
  composeGifGrid: {
    maxHeight: '260px',
    overflowY: 'auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.45rem',
    paddingRight: '0.1rem',
  },
  composeGifTile: {
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: '9px',
    background: 'rgba(255,255,255,0.02)',
    color: theme.colors.textPrimary,
    padding: 0,
    cursor: 'pointer',
    overflow: 'hidden',
    textAlign: 'left',
    position: 'relative',
  },
  composeGifThumb: {
    width: '100%',
    height: '100px',
    objectFit: 'cover',
    display: 'block',
  },
  composeGifTileLabel: {
    position: 'absolute',
    left: '0.35rem',
    right: '0.35rem',
    bottom: '0.35rem',
    color: '#fff',
    fontSize: '0.67rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textShadow: '0 1px 4px rgba(0,0,0,0.82)',
  },
  lightboxOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.88)',
    backdropFilter: 'blur(8px)',
    zIndex: 1100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  previewCard: {
    width: 'min(1680px, 98vw)',
    maxHeight: '96vh',
    borderRadius: '14px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'linear-gradient(180deg, rgba(30,21,15,0.95) 0%, rgba(15,11,8,0.96) 100%)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  previewHeader: {
    padding: '0.6rem 0.8rem',
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  previewHeaderText: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  previewTitle: {
    color: theme.colors.textPrimary,
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  previewSubtitle: {
    color: theme.colors.textMuted,
    fontSize: '0.68rem',
  },
  previewHeaderActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
  },
  previewBody: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    background:
      'radial-gradient(circle at 50% 8%, rgba(227,170,106,0.12) 0%, rgba(227,170,106,0.03) 35%, transparent 68%), linear-gradient(180deg, rgba(13,10,8,0.66) 0%, rgba(9,7,5,0.78) 100%)',
  },
  previewMediaFrame: {
    width: 'min(96vw, 1600px)',
    maxWidth: '100%',
    maxHeight: 'calc(96vh - 170px)',
    borderRadius: '16px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'linear-gradient(180deg, rgba(18,13,10,0.95) 0%, rgba(10,8,6,0.96) 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,236,208,0.08), 0 16px 38px rgba(0,0,0,0.5)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFrameLandscape: {
    aspectRatio: '16 / 9',
  },
  previewFramePortrait: {
    width: 'min(76vw, 880px)',
    aspectRatio: '4 / 5',
  },
  previewFrameSquare: {
    width: 'min(86vw, 980px)',
    aspectRatio: '1 / 1',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  },
  previewVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    background: '#000',
  },
  previewAudioFrame: {
    width: 'min(1100px, 94vw)',
    borderRadius: '16px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'linear-gradient(180deg, rgba(18,13,10,0.95) 0%, rgba(10,8,6,0.96) 100%)',
    padding: '1.3rem',
    boxShadow: 'inset 0 1px 0 rgba(255,236,208,0.08), 0 16px 38px rgba(0,0,0,0.5)',
  },
  previewAudio: {
    width: '100%',
    height: '44px',
  },
  previewDocument: {
    width: '100%',
    height: '100%',
    border: 'none',
    borderRadius: '14px',
    background: '#0b0806',
  },
  previewFallback: {
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: '10px',
    padding: '0.8rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    color: theme.colors.textSecondary,
  },
  lightboxClose: {
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    color: theme.colors.textPrimary,
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 1400,
    background: 'rgba(5,4,3,0.72)',
    backdropFilter: 'blur(5px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  confirmCard: {
    width: 'min(420px, 92vw)',
    borderRadius: '14px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'linear-gradient(180deg, rgba(24,17,12,0.97) 0%, rgba(12,9,7,0.98) 100%)',
    boxShadow: '0 14px 36px rgba(0,0,0,0.52)',
    padding: '0.9rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.46rem',
  },
  confirmTitle: {
    color: theme.colors.textPrimary,
    fontSize: '0.9rem',
    fontWeight: 700,
  },
  confirmText: {
    color: theme.colors.textMuted,
    fontSize: '0.78rem',
    lineHeight: 1.45,
  },
  confirmActions: {
    marginTop: '0.35rem',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.42rem',
  },
  confirmCancelBtn: {
    borderRadius: '9px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(255,255,255,0.03)',
    color: theme.colors.textSecondary,
    padding: '0.42rem 0.75rem',
    fontSize: '0.74rem',
  },
  confirmDeleteBtn: {
    borderRadius: '9px',
    border: '1px solid rgba(240,154,154,0.5)',
    background: 'rgba(240,154,154,0.14)',
    color: '#ffd2d2',
    padding: '0.42rem 0.75rem',
    fontSize: '0.74rem',
    fontWeight: 700,
  },
  dropOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 1200,
    background: 'rgba(8,6,4,0.72)',
    border: `2px dashed ${theme.colors.accentBorder}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  dropOverlayCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '1rem 1.3rem',
    borderRadius: '12px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'linear-gradient(180deg, rgba(25,18,13,0.94) 0%, rgba(12,9,7,0.96) 100%)',
    boxShadow: '0 10px 26px rgba(0,0,0,0.38)',
  },
  dropOverlayTitle: {
    color: theme.colors.accent,
    fontWeight: 700,
    fontSize: '0.88rem',
  },
  dropOverlaySubtitle: {
    color: theme.colors.textMuted,
    fontSize: '0.76rem',
    textAlign: 'center',
    maxWidth: '340px',
  },
  inputError: {
    marginTop: '0.38rem',
    color: '#f8b5b5',
    fontSize: '0.72rem',
  },
  emptyPane: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.textMuted,
  },
};
