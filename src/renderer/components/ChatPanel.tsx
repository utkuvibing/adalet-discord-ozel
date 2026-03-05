import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Paperclip,
  Send,
  File as FileIcon,
  Music2,
  X,
  Download,
  Eye,
  Pencil,
  Trash2,
  Check,
  Reply,
  Smile,
  Ellipsis,
  Search,
} from 'lucide-react';
import EmojiPicker, { Categories, Theme } from 'emoji-picker-react';
import type { ChatMessage, SystemMessage, PeerInfo } from '../../shared/types';
import type { TypedSocket } from '../hooks/useSocket';
import { AvatarBadge } from './AvatarBadge';
import { renderMarkdown } from '../utils/markdown';
import { normalizeCountryCodeFlagsInText } from '../utils/flagEmoji';
import { theme } from '../theme';

interface ChatPanelProps {
  socket: TypedSocket | null;
  activeRoomId: number | null;
  systemMessages: SystemMessage[];
  myUserId: number | null;
  serverAddress: string;
  onOpenUserCard?: (user: PeerInfo, position: { x: number; y: number }) => void;
  roomUserNames?: Record<number, string>;
}

type FeedItem =
  | { kind: 'system'; msg: SystemMessage }
  | { kind: 'chat'; msg: ChatMessage };

type AttachmentKind = 'image' | 'video' | 'audio' | 'document' | 'file';

interface PreviewState {
  url: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string | null;
}
type PreviewAspect = 'landscape' | 'portrait' | 'square';

interface ParsedReplyReference {
  targetMessageId: number | null;
  displayName: string;
  preview: string;
  body: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🙏', '🎉'];
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

type GifPanelTab = 'gif' | 'sticker';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fileExtension(name: string | undefined): string {
  if (!name) return '';
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

function getAttachmentKind(msg: ChatMessage): AttachmentKind {
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

function getMessagePreviewForReply(msg: ChatMessage): string {
  const source = normalizeCountryCodeFlagsInText((msg.content?.trim() || msg.fileName || 'Attachment'))
    .replace(/\s+/g, ' ')
    .trim();
  return source.slice(0, 90);
}

function buildReplyPrefix(msg: ChatMessage): string {
  return `> [reply:${msg.id}] @${msg.displayName}: ${getMessagePreviewForReply(msg)}`;
}

function parseReplyReference(content: string | undefined): ParsedReplyReference | null {
  if (!content) return null;
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  if (!firstLine.startsWith('>')) return null;

  const withId = firstLine.match(/^>\s*\[reply:(\d+)\]\s*@([^:]+):\s*(.*)$/i);
  if (withId) {
    const targetMessageId = Number(withId[1]);
    return {
      targetMessageId: Number.isFinite(targetMessageId) ? targetMessageId : null,
      displayName: withId[2].trim(),
      preview: normalizeCountryCodeFlagsInText(withId[3].trim()),
      body: lines.slice(1).join('\n').trimStart(),
    };
  }

  const legacy = firstLine.match(/^>\s*@([^:]+):\s*(.*)$/i);
  if (!legacy) return null;
  return {
    targetMessageId: null,
    displayName: legacy[1].trim(),
    preview: normalizeCountryCodeFlagsInText(legacy[2].trim()),
    body: lines.slice(1).join('\n').trimStart(),
  };
}

function chatMessageToPeerInfo(msg: ChatMessage): PeerInfo {
  return {
    socketId: `chat-user-${msg.userId}`,
    userId: msg.userId,
    displayName: msg.displayName,
    avatarId: msg.avatarId,
    profilePhotoUrl: msg.profilePhotoUrl ?? null,
  };
}

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

export function ChatPanel({
  socket,
  activeRoomId,
  systemMessages,
  myUserId,
  serverAddress,
  onOpenUserCard,
  roomUserNames,
}: ChatPanelProps): React.JSX.Element {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<number | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewAspect, setPreviewAspect] = useState<PreviewAspect>('landscape');
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [emojiPickerForMsgId, setEmojiPickerForMsgId] = useState<number | null>(null);
  const [composeEmojiOpen, setComposeEmojiOpen] = useState(false);
  const [composeGifOpen, setComposeGifOpen] = useState(false);
  const [composeGifTab, setComposeGifTab] = useState<GifPanelTab>('gif');
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [roomSearchOpen, setRoomSearchOpen] = useState(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [roomSearchActiveIndex, setRoomSearchActiveIndex] = useState(0);
  const [hoveredReaction, setHoveredReaction] = useState<{
    messageId: number;
    emoji: string;
    names: string[];
  } | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingEmitRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldAutoScrollRef = useRef<boolean>(true);
  const prevMessageCountsRef = useRef<{ chat: number; system: number }>({ chat: 0, system: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const roomSearchInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef<number>(0);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const composeEmojiPickerRef = useRef<HTMLDivElement>(null);
  const composeGifRef = useRef<HTMLDivElement>(null);
  const [highlightedReplyMsgId, setHighlightedReplyMsgId] = useState<number | null>(null);

  const serverBaseUrl = /^https?:\/\//.test(serverAddress)
    ? serverAddress
    : `http://${serverAddress}`;
  const normalizedRoomSearch = roomSearchQuery.trim().toLocaleLowerCase('tr-TR');
  const roomSearchMatchIds = useMemo(() => {
    if (!normalizedRoomSearch) return [] as number[];
    return chatMessages
      .filter((msg) => (msg.content ?? '').toLocaleLowerCase('tr-TR').includes(normalizedRoomSearch))
      .map((msg) => msg.id);
  }, [chatMessages, normalizedRoomSearch]);
  const roomSearchMatchSet = useMemo(() => new Set(roomSearchMatchIds), [roomSearchMatchIds]);
  const activeRoomSearchMessageId = roomSearchMatchIds[roomSearchActiveIndex] ?? null;

  const reactionNameLookup = useMemo(() => {
    const lookup = new Map<number, string>();
    for (const [rawUserId, name] of Object.entries(roomUserNames ?? {})) {
      const userId = Number(rawUserId);
      if (Number.isFinite(userId) && name.trim().length > 0) {
        lookup.set(userId, name.trim());
      }
    }
    for (const msg of chatMessages) {
      if (!lookup.has(msg.userId)) {
        lookup.set(msg.userId, msg.displayName);
      }
    }
    if (myUserId != null && !lookup.has(myUserId)) {
      try {
        const raw = localStorage.getItem('session');
        const parsed = raw ? (JSON.parse(raw) as { displayName?: string }) : null;
        const mine = parsed?.displayName?.trim();
        if (mine) lookup.set(myUserId, mine);
      } catch {
        // ignore parse errors
      }
    }
    return lookup;
  }, [roomUserNames, chatMessages, myUserId]);

  useEffect(() => {
    if (!socket) return;
    const handleHistory = (history: ChatMessage[]) => setChatMessages(history);
    const handleMessage = (msg: ChatMessage) => setChatMessages((prev) => [...prev, msg]);
    const handleMessageUpdate = (msg: ChatMessage) => {
      setChatMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
    };
    const handleMessageDelete = (payload: { messageId: number; roomId: number }) => {
      if (activeRoomId !== null && payload.roomId !== activeRoomId) return;
      setChatMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
      setDeleteConfirmMsg((prev) => (prev?.id === payload.messageId ? null : prev));
      if (editingMessageId === payload.messageId) {
        setEditingMessageId(null);
        setEditDraft('');
      }
      if (replyingTo?.id === payload.messageId) {
        setReplyingTo(null);
      }
    };
    const handleReactionUpdate = (payload: { messageId: number; reactions: { emoji: string; userIds: number[] }[] }) => {
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === payload.messageId
            ? { ...msg, reactions: payload.reactions }
            : msg
        )
      );
    };

    socket.on('chat:history', handleHistory);
    socket.on('chat:message', handleMessage);
    socket.on('chat:message:update', handleMessageUpdate);
    socket.on('chat:message:delete', handleMessageDelete);
    socket.on('reaction:update', handleReactionUpdate);

    return () => {
      socket.off('chat:history', handleHistory);
      socket.off('chat:message', handleMessage);
      socket.off('chat:message:update', handleMessageUpdate);
      socket.off('chat:message:delete', handleMessageDelete);
      socket.off('reaction:update', handleReactionUpdate);
    };
  }, [socket, activeRoomId, editingMessageId, replyingTo]);

  useEffect(() => {
    if (!socket || activeRoomId === null) return;
    socket.emit('chat:history:request', { roomId: activeRoomId });
  }, [socket, activeRoomId]);

  useEffect(() => {
    if (!socket) return;
    const handleTypingUpdate = (payload: { socketId: string; displayName: string; typing: boolean }) => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (payload.typing) {
          next.set(payload.socketId, payload.displayName);
          const existingTimer = typingTimersRef.current.get(payload.socketId);
          if (existingTimer) clearTimeout(existingTimer);
          const timer = setTimeout(() => {
            setTypingUsers((p) => {
              const n = new Map(p);
              n.delete(payload.socketId);
              return n;
            });
            typingTimersRef.current.delete(payload.socketId);
          }, 3500);
          typingTimersRef.current.set(payload.socketId, timer);
        } else {
          next.delete(payload.socketId);
          const timer = typingTimersRef.current.get(payload.socketId);
          if (timer) {
            clearTimeout(timer);
            typingTimersRef.current.delete(payload.socketId);
          }
        }
        return next;
      });
    };
    socket.on('typing:update', handleTypingUpdate);
    return () => {
      socket.off('typing:update', handleTypingUpdate);
    };
  }, [socket]);

  useEffect(() => {
    setChatMessages([]);
    setTypingUsers(new Map());
    setEditingMessageId(null);
    setEditDraft('');
    setPreview(null);
    setPreviewAspect('landscape');
    setDeleteConfirmMsg(null);
    setReplyingTo(null);
    setEmojiPickerForMsgId(null);
    setComposeEmojiOpen(false);
    setComposeGifOpen(false);
    setComposeGifTab('gif');
    setGifQuery('');
    setGifResults([]);
    setGifLoading(false);
    setGifError(null);
    setIsDragOver(false);
    setRoomSearchOpen(false);
    setRoomSearchQuery('');
    setRoomSearchActiveIndex(0);
    setHoveredReaction(null);
    dragDepthRef.current = 0;
    shouldAutoScrollRef.current = true;
    prevMessageCountsRef.current = { chat: 0, system: 0 };
  }, [activeRoomId]);

  useEffect(() => {
    if (!roomSearchOpen) return;
    requestAnimationFrame(() => {
      roomSearchInputRef.current?.focus();
      roomSearchInputRef.current?.select();
    });
  }, [roomSearchOpen]);

  useEffect(() => {
    setRoomSearchActiveIndex(0);
  }, [normalizedRoomSearch, activeRoomId]);

  useEffect(() => {
    if (roomSearchMatchIds.length === 0) {
      setRoomSearchActiveIndex(0);
      return;
    }
    setRoomSearchActiveIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= roomSearchMatchIds.length) return roomSearchMatchIds.length - 1;
      return prev;
    });
  }, [roomSearchMatchIds]);

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (emojiPickerForMsgId !== null) {
        if (emojiPickerRef.current?.contains(target)) return;
        if (target.closest('[data-emoji-picker-trigger="true"]')) return;
        setEmojiPickerForMsgId(null);
      }
      if (composeEmojiOpen) {
        if (composeEmojiPickerRef.current?.contains(target)) return;
        if (target.closest('[data-compose-emoji-trigger="true"]')) return;
        setComposeEmojiOpen(false);
      }
      if (composeGifOpen) {
        if (composeGifRef.current?.contains(target)) return;
        if (target.closest('[data-compose-gif-trigger="true"]')) return;
        setComposeGifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, [emojiPickerForMsgId, composeEmojiOpen, composeGifOpen]);

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
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, []);

  const updateAutoScrollState = useCallback(() => {
    const listEl = messagesListRef.current;
    if (!listEl) return;
    const distanceToBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    shouldAutoScrollRef.current = distanceToBottom <= 120;
  }, []);

  useEffect(() => {
    const prev = prevMessageCountsRef.current;
    const chatIncreased = chatMessages.length > prev.chat;
    const systemIncreased = systemMessages.length > prev.system;
    const initialLoad =
      prev.chat === 0 &&
      prev.system === 0 &&
      (chatMessages.length > 0 || systemMessages.length > 0);

    if ((initialLoad || chatIncreased || systemIncreased) && shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: initialLoad ? 'auto' : 'smooth' });
    }

    prevMessageCountsRef.current = { chat: chatMessages.length, system: systemMessages.length };
  }, [chatMessages.length, systemMessages.length]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!activeRoomId || !myUserId) return;
      setUploading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomId', String(activeRoomId));
        formData.append('userId', String(myUserId));
        const caption = inputValue.trim();
        if (caption.length > 0) {
          const normalizedCaption = normalizeCountryCodeFlagsInText(caption);
          const content = replyingTo
            ? `${buildReplyPrefix(replyingTo)}\n${normalizedCaption}`
            : normalizedCaption;
          formData.append('content', content);
          setInputValue('');
        }

        const response = await fetch(`${serverBaseUrl}/upload`, {
          method: 'POST',
          body: formData,
          headers: { 'ngrok-skip-browser-warning': '1' },
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Upload failed.' }));
          throw new Error(errData.error || `Upload failed (${response.status})`);
        }
        if (replyingTo && caption.length > 0) {
          setReplyingTo(null);
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.');
        setTimeout(() => setUploadError(null), 4000);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [activeRoomId, myUserId, inputValue, serverBaseUrl, replyingTo]
  );

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      e.preventDefault();
      uploadFile(items[0]);
    }
  }, [uploadFile]);

  const hasDraggedFiles = useCallback((e: React.DragEvent): boolean => {
    const types = e.dataTransfer?.types ? Array.from(e.dataTransfer.types) : [];
    return types.includes('Files');
  }, []);

  const handleDropFiles = useCallback(async (files: File[]) => {
    if (activeRoomId === null || !myUserId) {
      setUploadError('Join a room before uploading files.');
      setTimeout(() => setUploadError(null), 4000);
      return;
    }
    for (const file of files) {
      await uploadFile(file);
    }
  }, [activeRoomId, myUserId, uploadFile]);

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

  const handleSend = useCallback(() => {
    if (!socket || activeRoomId === null) return;
    const content = inputValue.trim();
    if (content.length === 0) return;
    const normalizedContent = normalizeCountryCodeFlagsInText(content);
    const payloadContent = replyingTo
      ? `${buildReplyPrefix(replyingTo)}\n${normalizedContent}`
      : normalizedContent;
    socket.emit('chat:message', { roomId: activeRoomId, content: payloadContent });
    setInputValue('');
    if (replyingTo) {
      setReplyingTo(null);
    }
  }, [socket, activeRoomId, inputValue, replyingTo]);

  const insertTextAtCursor = useCallback((text: string) => {
    const input = inputRef.current;
    if (!input) {
      setInputValue((prev) => prev + text);
      return;
    }
    const start = input.selectionStart ?? inputValue.length;
    const end = input.selectionEnd ?? start;
    const next = `${inputValue.slice(0, start)}${text}${inputValue.slice(end)}`;
    setInputValue(next);
    window.requestAnimationFrame(() => {
      const cursor = start + text.length;
      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
  }, [inputValue]);

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
      if (!response.ok) {
        throw new Error(`GIF search failed (${response.status})`);
      }
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

  const handleSendGifFromUrl = useCallback(async (rawUrl: string) => {
    const raw = rawUrl.trim();
    if (!raw) return;
    if (activeRoomId === null || myUserId === null) {
      setUploadError('GIF gondermek icin once bir odaya gir.');
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
      setUploadError('Gecerli bir GIF URL gir.');
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
  }, [activeRoomId, myUserId, uploadFile]);

  const beginEdit = useCallback((msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditDraft(msg.content ?? '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditDraft('');
  }, []);

  const submitEdit = useCallback((msg: ChatMessage) => {
    if (!socket) return;
    const content = editDraft.trim();
    if (!msg.fileUrl && content.length === 0) return;
    socket.emit('chat:message:edit', { messageId: msg.id, content });
    setEditingMessageId(null);
    setEditDraft('');
  }, [socket, editDraft]);

  const handleDeleteMessage = useCallback((msg: ChatMessage) => {
    if (!socket) return;
    setDeleteConfirmMsg(msg);
  }, [socket]);

  const handleToggleReaction = useCallback((messageId: number, emoji: string) => {
    if (!socket) return;
    socket.emit('reaction:toggle', { messageId, emoji });
  }, [socket]);

  const handleOpenUserCardFromMessage = useCallback(
    (msg: ChatMessage, event: React.MouseEvent<HTMLElement>) => {
      if (!onOpenUserCard) return;
      if (myUserId !== null && msg.userId === myUserId) return;
      const rect = event.currentTarget.getBoundingClientRect();
      onOpenUserCard(chatMessageToPeerInfo(msg), {
        x: rect.right + 10,
        y: rect.top - 8,
      });
    },
    [onOpenUserCard, myUserId]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

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

  const feed: FeedItem[] = [];
  for (const msg of systemMessages) feed.push({ kind: 'system', msg });
  for (const msg of chatMessages) feed.push({ kind: 'chat', msg });
  feed.sort((a, b) => (a.kind === 'system' ? a.msg.timestamp : a.msg.timestamp) - (b.kind === 'system' ? b.msg.timestamp : b.msg.timestamp));

  const shouldShowHeader = (item: FeedItem): boolean => {
    return item.kind === 'chat';
  };

  const findReplyTargetMessageId = useCallback((reply: ParsedReplyReference, currentMessage: ChatMessage): number | null => {
    if (reply.targetMessageId !== null && chatMessages.some((msg) => msg.id === reply.targetMessageId)) {
      return reply.targetMessageId;
    }
    const replyDisplay = reply.displayName.toLowerCase();
    const replyPreview = reply.preview.toLowerCase();
    for (let idx = chatMessages.length - 1; idx >= 0; idx -= 1) {
      const candidate = chatMessages[idx];
      if (candidate.id === currentMessage.id) continue;
      if (candidate.timestamp > currentMessage.timestamp) continue;
      if (candidate.displayName.toLowerCase() !== replyDisplay) continue;
      const candidatePreview = getMessagePreviewForReply(candidate).toLowerCase();
      if (
        candidatePreview === replyPreview ||
        candidatePreview.startsWith(replyPreview) ||
        replyPreview.startsWith(candidatePreview)
      ) {
        return candidate.id;
      }
    }
    return null;
  }, [chatMessages]);

  const jumpToMessage = useCallback((messageId: number) => {
    const target = messageRefs.current.get(messageId);
    if (!target) return;
    shouldAutoScrollRef.current = false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedReplyMsgId(messageId);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedReplyMsgId((prev) => (prev === messageId ? null : prev));
      highlightTimerRef.current = null;
    }, 1800);
  }, []);

  const focusRoomSearch = useCallback(() => {
    setRoomSearchOpen(true);
    requestAnimationFrame(() => roomSearchInputRef.current?.focus());
  }, []);

  const goToPrevRoomSearchMatch = useCallback(() => {
    if (roomSearchMatchIds.length === 0) return;
    setRoomSearchActiveIndex((prev) => {
      const nextIndex = prev <= 0 ? roomSearchMatchIds.length - 1 : prev - 1;
      const targetId = roomSearchMatchIds[nextIndex];
      if (targetId != null) jumpToMessage(targetId);
      return nextIndex;
    });
  }, [roomSearchMatchIds, jumpToMessage]);

  const goToNextRoomSearchMatch = useCallback(() => {
    if (roomSearchMatchIds.length === 0) return;
    setRoomSearchActiveIndex((prev) => {
      const nextIndex = prev >= roomSearchMatchIds.length - 1 ? 0 : prev + 1;
      const targetId = roomSearchMatchIds[nextIndex];
      if (targetId != null) jumpToMessage(targetId);
      return nextIndex;
    });
  }, [roomSearchMatchIds, jumpToMessage]);

  useEffect(() => {
    if (!roomSearchOpen || activeRoomSearchMessageId === null) return;
    jumpToMessage(activeRoomSearchMessageId);
  }, [roomSearchOpen, activeRoomSearchMessageId, jumpToMessage]);

  const renderFileAttachment = (msg: ChatMessage) => {
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
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={styles.imageContainer}
        >
          <img
            src={fullUrl}
            alt={fileName}
            style={styles.inlineImage}
            onClick={openPreview}
            loading="lazy"
          />
          <div style={styles.attachmentFooter}>
            <span style={styles.imageMeta}>{fileName}</span>
            <div style={styles.attachmentActions}>
              <button style={styles.downloadIconBtn} onClick={openPreview} title="Open in app">
                <Eye size={14} />
              </button>
              <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download">
                <Download size={14} />
              </button>
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
              <button style={styles.downloadIconBtn} onClick={openPreview} title="Open in app">
                <Eye size={14} />
              </button>
              <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download">
                <Download size={14} />
              </button>
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
            <span style={styles.fileSize}>
              {msg.fileSize != null ? formatFileSize(msg.fileSize) : 'Audio'}
            </span>
            <div style={styles.attachmentActions}>
              <button style={styles.downloadIconBtn} onClick={openPreview} title="Open in app">
                <Eye size={14} />
              </button>
              <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download">
                <Download size={14} />
              </button>
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
          <button style={styles.downloadIconBtn} onClick={openPreview} title="Open in app">
            <Eye size={16} />
          </button>
          <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download">
            <Download size={16} />
          </button>
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
        <button type="button" style={styles.downloadIconBtn} onClick={openPreview} title="Open in app">
          <Eye size={16} />
        </button>
        <button type="button" style={styles.downloadIconBtn} onClick={() => void handleDownload(fullUrl, fileName)} title="Download">
          <Download size={16} />
        </button>
      </div>
    );
  };

  const previewFrameStyle =
    previewAspect === 'portrait'
      ? styles.previewFramePortrait
      : previewAspect === 'square'
        ? styles.previewFrameSquare
        : styles.previewFrameLandscape;

  const confirmDeleteMessage = useCallback(() => {
    if (!socket || !deleteConfirmMsg) return;
    socket.emit('chat:message:delete', { messageId: deleteConfirmMsg.id });
    if (editingMessageId === deleteConfirmMsg.id) {
      setEditingMessageId(null);
      setEditDraft('');
    }
    setDeleteConfirmMsg(null);
  }, [socket, deleteConfirmMsg, editingMessageId]);

  return (
    <div
      style={styles.container}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {roomSearchOpen && (
        <div style={styles.searchStrip}>
          <Search size={14} color={theme.colors.textMuted} />
          <input
            ref={roomSearchInputRef}
            style={styles.searchInput}
            value={roomSearchQuery}
            onChange={(event) => setRoomSearchQuery(event.target.value)}
            placeholder="Search messages in this room..."
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (event.shiftKey) goToPrevRoomSearchMatch();
                else goToNextRoomSearchMatch();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setRoomSearchOpen(false);
              }
            }}
          />
          <span style={styles.searchCount}>
            {roomSearchMatchIds.length === 0 ? '0/0' : `${roomSearchActiveIndex + 1}/${roomSearchMatchIds.length}`}
          </span>
          <button type="button" style={styles.searchNavBtn} onClick={goToPrevRoomSearchMatch} title="Previous match">
            ↑
          </button>
          <button type="button" style={styles.searchNavBtn} onClick={goToNextRoomSearchMatch} title="Next match">
            ↓
          </button>
          <button
            type="button"
            style={styles.searchCloseBtn}
            onClick={() => setRoomSearchOpen(false)}
            title="Close search"
          >
            <X size={12} />
          </button>
        </div>
      )}
      <div
        ref={messagesListRef}
        style={styles.messagesList}
        onScroll={updateAutoScrollState}
      >
        <AnimatePresence initial={false}>
          {feed.map((item, i) => {
            if (item.kind === 'system') {
              return (
                <motion.div
                  key={`sys-${item.msg.timestamp}-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={styles.systemMsg}
                >
                  <span style={styles.systemText}>{item.msg.text}</span>
                </motion.div>
              );
            }

            const msg = item.msg;
            const isOwn = myUserId !== null && msg.userId === myUserId;
            const headerName = isOwn ? `${msg.displayName} (You)` : msg.displayName;
            const showHeader = shouldShowHeader(item);
            const isEditing = editingMessageId === msg.id;
            const toolbarVisible = hoveredMsgId === msg.id || emojiPickerForMsgId === msg.id;
            const parsedReply = parseReplyReference(msg.content);
            const replyTargetMessageId = parsedReply ? findReplyTargetMessageId(parsedReply, msg) : null;
            const contentBody = parsedReply ? parsedReply.body : msg.content;
            return (
              <motion.div
                key={`chat-${msg.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                ref={(node) => {
                  if (node) messageRefs.current.set(msg.id, node);
                  else messageRefs.current.delete(msg.id);
                }}
                style={{
                  ...styles.chatMsg,
                  ...(isOwn ? styles.chatMsgOwn : styles.chatMsgOther),
                  ...(showHeader ? styles.chatMsgWithHeader : {}),
                  ...(hoveredMsgId === msg.id ? styles.chatMsgHovered : {}),
                  ...(roomSearchMatchSet.has(msg.id) ? styles.chatMsgSearchHit : {}),
                  ...(activeRoomSearchMessageId === msg.id ? styles.chatMsgSearchActive : {}),
                  ...(highlightedReplyMsgId === msg.id ? styles.chatMsgReplyHighlight : {}),
                }}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => {
                  setHoveredMsgId(null);
                  setHoveredReaction((prev) => (prev?.messageId === msg.id ? null : prev));
                }}
              >
                {showHeader && (
                  <div style={styles.chatHeader}>
                    <button
                      type="button"
                      style={styles.headerUserBtn}
                      onClick={(event) => handleOpenUserCardFromMessage(msg, event)}
                      title={isOwn ? 'This is you' : `View ${msg.displayName}`}
                      disabled={isOwn}
                    >
                      <AvatarBadge displayName={msg.displayName} profilePhotoUrl={msg.profilePhotoUrl} serverAddress={serverAddress} size={28} />
                      <span style={styles.displayName}>{headerName}</span>
                    </button>
                    <div style={styles.headerMeta}>
                      <span style={styles.chatTime}>{formatTime(msg.timestamp)}</span>
                      {msg.editedAt ? <span style={styles.editedTag}>edited</span> : null}
                      {isOwn && toolbarVisible && !isEditing && (
                        <div style={styles.headerActionRow}>
                          <button style={styles.messageActionBtn} onClick={() => beginEdit(msg)} title="Edit">
                            <Pencil size={12} />
                          </button>
                          <button style={{ ...styles.messageActionBtn, ...styles.messageDeleteBtn }} onClick={() => handleDeleteMessage(msg)} title="Delete">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div
                  style={{
                    ...styles.chatContent,
                    ...(toolbarVisible ? styles.chatContentWithToolbar : {}),
                  }}
                >
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
                        <button
                          style={styles.editSaveBtn}
                          onClick={() => submitEdit(msg)}
                          disabled={!msg.fileUrl && editDraft.trim().length === 0}
                        >
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
                      {parsedReply && (
                        <button
                          type="button"
                          style={{
                            ...styles.replyRefCard,
                            ...(replyTargetMessageId ? styles.replyRefCardClickable : {}),
                          }}
                          onClick={() => {
                            if (replyTargetMessageId !== null) {
                              jumpToMessage(replyTargetMessageId);
                            }
                          }}
                          title={replyTargetMessageId !== null ? 'Go to replied message' : 'Original message not found'}
                        >
                          <span style={styles.replyRefLabel}>Reply to {parsedReply.displayName}</span>
                          <span style={styles.replyRefPreview}>{parsedReply.preview}</span>
                        </button>
                      )}
                      {contentBody && <div>{renderMarkdown(contentBody)}</div>}
                      {msg.fileUrl && renderFileAttachment(msg)}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div style={styles.reactionRow}>
                          {msg.reactions.map((reaction) => {
                            const mine = myUserId !== null && reaction.userIds.includes(myUserId);
                            const reactorNames = reaction.userIds.map((userId) => reactionNameLookup.get(userId) ?? `User ${userId}`);
                            const showReactionTooltip =
                              hoveredReaction?.messageId === msg.id && hoveredReaction.emoji === reaction.emoji;
                            return (
                              <div key={`${msg.id}-${reaction.emoji}`} style={styles.reactionItem}>
                                <button
                                type="button"
                                style={{
                                  ...styles.reactionPill,
                                  ...(mine ? styles.reactionPillActive : {}),
                                }}
                                onClick={() => handleToggleReaction(msg.id, reaction.emoji)}
                                onMouseEnter={() => setHoveredReaction({
                                  messageId: msg.id,
                                  emoji: reaction.emoji,
                                  names: reactorNames,
                                })}
                                onMouseLeave={() =>
                                  setHoveredReaction((prev) =>
                                    prev?.messageId === msg.id && prev.emoji === reaction.emoji ? null : prev
                                  )
                                }
                                title={reactorNames.join(', ')}
                              >
                                <span>{reaction.emoji}</span>
                                <span>{reaction.userIds.length}</span>
                                </button>
                                {showReactionTooltip && (
                                  <div style={styles.reactionTooltip}>
                                    {hoveredReaction.names.join(', ')}
                                  </div>
                                )}
                              </div>
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
                            onClick={() => {
                              setReplyingTo(msg);
                              setEmojiPickerForMsgId(null);
                            }}
                            title="Reply"
                          >
                            <Reply size={12} />
                          </button>
                          <button
                            type="button"
                            style={styles.messageActionBtn}
                            title="More emojis"
                            data-emoji-picker-trigger="true"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() =>
                              setEmojiPickerForMsgId((prev) => (prev === msg.id ? null : msg.id))
                            }
                          >
                            <Ellipsis size={13} />
                            </button>
                        </div>
                      )}
                      {emojiPickerForMsgId === msg.id && (
                        <div
                          ref={emojiPickerRef}
                          style={{
                            ...styles.emojiPickerWrap,
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                        >
                          <EmojiPicker
                            theme={Theme.DARK}
                            className="inn-emoji-picker"
                            width={360}
                            height={430}
                            autoFocusSearch={false}
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
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputWrapper}>
        {replyingTo && (
          <div style={styles.replyingBar}>
            <div style={styles.replyingMeta}>
              <span style={styles.replyingLabel}>Replying to {replyingTo.displayName}</span>
              <span style={styles.replyingPreview}>{getMessagePreviewForReply(replyingTo)}</span>
            </div>
            <button
              type="button"
              style={styles.replyCancelBtn}
              onClick={() => setReplyingTo(null)}
              title="Cancel reply"
            >
              <X size={12} />
            </button>
          </div>
        )}
        {typingUsers.size > 0 && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} style={styles.typingBar}>
            {(() => {
              const names = [...typingUsers.values()];
              if (names.length === 1) return `${names[0]} is typing...`;
              if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
              return `${names[0]} and ${names.length - 1} others are typing...`;
            })()}
          </motion.div>
        )}

        <div style={styles.inputBar} className="glass">
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />
          <button style={styles.uploadBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Paperclip size={20} />
          </button>
          <button
            type="button"
            style={styles.searchBtn}
            onClick={focusRoomSearch}
            title="Search messages in this room"
          >
            <Search size={16} />
          </button>
          <textarea
            ref={inputRef}
            style={styles.input}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (socket && activeRoomId !== null) {
                const now = Date.now();
                if (now - lastTypingEmitRef.current > 2000) {
                  lastTypingEmitRef.current = now;
                  socket.emit('typing:start', activeRoomId);
                }
              }
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={uploading ? 'Uploading...' : 'Send a message...'}
            rows={1}
          />
          <div style={styles.inputActions}>
            <button
              type="button"
              style={styles.inputActionBtn}
              title="Insert emoji"
              data-compose-emoji-trigger="true"
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
              data-compose-gif-trigger="true"
              onClick={() => {
                setComposeGifOpen((prev) => !prev);
                setComposeEmojiOpen(false);
                if (!composeGifOpen) {
                  setComposeGifTab('gif');
                }
              }}
            >
              GIF
            </button>
          </div>
          <button
            style={{ ...styles.sendBtn, opacity: inputValue.trim() || uploading ? 1 : 0.4 }}
            onClick={handleSend}
            disabled={!inputValue.trim() || uploading}
          >
            <Send size={18} />
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
              autoFocusSearch={false}
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

      {uploadError && <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={styles.uploadError}>{uploadError}</motion.div>}

      {deleteConfirmMsg && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.confirmOverlay} onClick={() => setDeleteConfirmMsg(null)}>
          <div style={styles.confirmCard} onClick={(event) => event.stopPropagation()}>
            <span style={styles.confirmTitle}>Mesaj Silinsin mi?</span>
            <span style={styles.confirmText}>Bu mesaj ve ek dosya herkes icin silinecek.</span>
            <div style={styles.confirmActions}>
              <button type="button" style={styles.confirmCancelBtn} onClick={() => setDeleteConfirmMsg(null)}>Iptal</button>
              <button type="button" style={styles.confirmDeleteBtn} onClick={confirmDeleteMessage}>Sil</button>
            </div>
          </div>
        </motion.div>
      )}

      {isDragOver && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={styles.dropOverlay}
        >
          <div style={styles.dropOverlayCard}>
            <span style={styles.dropOverlayTitle}>
              {activeRoomId === null ? 'Select a room first' : 'Drop files to upload'}
            </span>
            <span style={styles.dropOverlaySubtitle}>
              {activeRoomId === null
                ? 'Pick a room, then drop files here.'
                : 'Images, videos, audio and documents are supported (max 25 MB each).'}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    background:
      'radial-gradient(circle at 48% -20%, rgba(227,170,106,0.18) 0%, rgba(227,170,106,0.05) 34%, transparent 70%), linear-gradient(180deg, rgba(13,10,8,0.9) 0%, rgba(8,6,4,0.94) 100%)',
  },
  messagesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.2rem 1.4rem 0.9rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
  },
  systemMsg: {
    padding: '0.5rem 0',
    textAlign: 'center',
  },
  systemText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizeXs,
    background: 'linear-gradient(180deg, rgba(227,170,106,0.13) 0%, rgba(227,170,106,0.04) 100%)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    padding: '0.2rem 0.72rem',
    borderRadius: '100px',
    display: 'inline-block',
    boxShadow: 'inset 0 1px 0 rgba(255, 238, 212, 0.1)',
  },
  chatMsg: {
    padding: '0.42rem 0.2rem 0.44rem',
    borderRadius: 0,
    transition: 'background-color 0.15s',
    position: 'relative',
    width: '100%',
    maxWidth: '100%',
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    background: 'transparent',
    alignSelf: 'stretch',
    marginBottom: 0,
  },
  chatMsgOwn: {
    alignSelf: 'stretch',
  },
  chatMsgOther: {
    alignSelf: 'stretch',
  },
  chatMsgHovered: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  chatMsgSearchHit: {
    backgroundColor: 'rgba(227,170,106,0.08)',
  },
  chatMsgSearchActive: {
    backgroundColor: 'rgba(227,170,106,0.14)',
  },
  chatMsgReplyHighlight: {
    backgroundColor: 'rgba(227,170,106,0.1)',
  },
  chatMsgWithHeader: {
    marginTop: 0,
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.18rem',
  },
  headerUserBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.72rem',
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    padding: 0,
    cursor: 'pointer',
    minWidth: 0,
  },
  headerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
  },
  headerActionRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    marginLeft: '0.18rem',
  },
  displayName: {
    color: theme.colors.accent,
    fontSize: theme.font.sizeMd,
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chatTime: {
    color: theme.colors.textMuted,
    fontSize: '0.68rem',
  },
  editedTag: {
    color: theme.colors.textMuted,
    fontSize: '0.64rem',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: '999px',
    padding: '0.06rem 0.34rem',
  },
  chatContent: {
    color: theme.colors.textPrimary,
    fontSize: theme.font.sizeMd,
    lineHeight: '1.42',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    minWidth: 0,
    paddingLeft: '2.3rem',
  },
  chatContentWithToolbar: {
    paddingBottom: '1.7rem',
  },
  replyRefCard: {
    width: '100%',
    borderRadius: '10px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(227,170,106,0.08)',
    padding: '0.34rem 0.5rem',
    marginBottom: '0.28rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
    textAlign: 'left',
    color: theme.colors.textPrimary,
    cursor: 'default',
  },
  replyRefCardClickable: {
    cursor: 'pointer',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'rgba(227,170,106,0.12)',
  },
  replyRefLabel: {
    fontSize: '0.68rem',
    color: theme.colors.accent,
    fontWeight: 700,
  },
  replyRefPreview: {
    fontSize: '0.72rem',
    color: theme.colors.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  inputWrapper: {
    padding: '0.6rem 1.2rem 1rem',
    position: 'relative',
  },
  searchStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.38rem',
    padding: '0.4rem 1.2rem',
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
  replyingBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    marginBottom: '0.45rem',
    padding: '0.36rem 0.5rem',
    borderRadius: '10px',
    border: `1px solid ${theme.colors.accentBorder}`,
    background: 'rgba(227,170,106,0.08)',
  },
  replyingMeta: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  replyingLabel: {
    color: theme.colors.accent,
    fontSize: '0.68rem',
    fontWeight: 700,
  },
  replyingPreview: {
    color: theme.colors.textMuted,
    fontSize: '0.7rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  replyCancelBtn: {
    width: '22px',
    height: '22px',
    borderRadius: '6px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(0,0,0,0.18)',
    color: theme.colors.textSecondary,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  typingBar: {
    position: 'absolute',
    top: '-0.55rem',
    left: '1.8rem',
    fontSize: '0.68rem',
    color: theme.colors.textMuted,
    fontStyle: 'italic',
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
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.textPrimary,
    padding: '0.5rem',
    fontSize: theme.font.sizeMd,
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    maxHeight: '150px',
  },
  inputActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.32rem',
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
  composeEmojiPicker: {
    position: 'absolute',
    right: '3.8rem',
    bottom: '3.55rem',
    zIndex: 1300,
    filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.45))',
  },
  composeGifPanel: {
    position: 'absolute',
    right: '3.8rem',
    bottom: '3.55rem',
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
    marginTop: '0.22rem',
    justifyContent: 'flex-end',
  },
  reactionItem: {
    position: 'relative',
    display: 'inline-flex',
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
  reactionTooltip: {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    right: 0,
    maxWidth: '300px',
    borderRadius: '8px',
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: 'rgba(12,9,7,0.96)',
    color: theme.colors.textSecondary,
    fontSize: '0.68rem',
    lineHeight: 1.35,
    padding: '0.28rem 0.42rem',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    boxShadow: '0 8px 18px rgba(0,0,0,0.42)',
    zIndex: 25,
  },
  messageToolbar: {
    position: 'absolute',
    right: '0.42rem',
    bottom: '0.14rem',
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
  uploadError: {
    position: 'absolute',
    bottom: '5.2rem',
    left: '1.2rem',
    background: theme.colors.error,
    color: '#fff',
    padding: '0.5rem 1rem',
    borderRadius: '10px',
    fontSize: theme.font.sizeSm,
    boxShadow: theme.shadows.md,
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
};
