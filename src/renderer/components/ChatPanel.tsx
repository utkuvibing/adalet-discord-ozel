import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, Send, File, Image as ImageIcon, X, Download } from 'lucide-react';
import type { ChatMessage, SystemMessage } from '../../shared/types';
import type { TypedSocket } from '../hooks/useSocket';
import { AvatarBadge } from './AvatarBadge';
import { renderMarkdown } from '../utils/markdown';
import { theme } from '../theme';

interface ChatPanelProps {
  socket: TypedSocket | null;
  activeRoomId: number | null;
  systemMessages: SystemMessage[];
  myUserId: number | null;
  serverAddress: string;
}

type FeedItem =
  | { kind: 'system'; msg: SystemMessage }
  | { kind: 'chat'; msg: ChatMessage };

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

export function ChatPanel({
  socket,
  activeRoomId,
  systemMessages,
  myUserId,
  serverAddress,
}: ChatPanelProps): React.JSX.Element {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<number | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingEmitRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const serverBaseUrl = /^https?:\/\//.test(serverAddress)
    ? serverAddress
    : `http://${serverAddress}`;

  useEffect(() => {
    if (!socket) return;
    const handleHistory = (history: ChatMessage[]) => setChatMessages(history);
    const handleMessage = (msg: ChatMessage) => setChatMessages((prev) => [...prev, msg]);

    socket.on('chat:history', handleHistory);
    socket.on('chat:message', handleMessage);

    return () => {
      socket.off('chat:history', handleHistory);
      socket.off('chat:message', handleMessage);
    };
  }, [socket]);

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
    return () => socket.off('typing:update', handleTypingUpdate);
  }, [socket]);

  useEffect(() => {
    setChatMessages([]);
    setTypingUsers(new Map());
  }, [activeRoomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, systemMessages]);

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
          formData.append('content', caption);
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
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.');
        setTimeout(() => setUploadError(null), 4000);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [activeRoomId, myUserId, inputValue, serverBaseUrl]
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

  const handleSend = useCallback(() => {
    if (!socket || activeRoomId === null) return;
    const content = inputValue.trim();
    if (content.length === 0) return;
    socket.emit('chat:message', { roomId: activeRoomId, content });
    setInputValue('');
  }, [socket, activeRoomId, inputValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const feed: FeedItem[] = [];
  for (const msg of systemMessages) feed.push({ kind: 'system', msg });
  for (const msg of chatMessages) feed.push({ kind: 'chat', msg });
  feed.sort((a, b) => (a.kind === 'system' ? a.msg.timestamp : a.msg.timestamp) - (b.kind === 'system' ? b.msg.timestamp : b.msg.timestamp));

  const shouldShowHeader = (item: FeedItem, index: number): boolean => {
    if (item.kind !== 'chat') return false;
    if (index === 0) return true;
    const prev = feed[index - 1];
    if (prev.kind !== 'chat') return true;
    if (prev.msg.userId !== item.msg.userId) return true;
    if (item.msg.timestamp - prev.msg.timestamp > 5 * 60 * 1000) return true;
    return false;
  };

  const renderFileAttachment = (msg: ChatMessage) => {
    if (!msg.fileUrl) return null;
    const fullUrl = serverBaseUrl + msg.fileUrl;
    const isImage = msg.fileMimeType?.startsWith('image/');

    if (isImage) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={styles.imageContainer}
        >
          <img
            src={fullUrl}
            alt={msg.fileName || 'Image'}
            style={styles.inlineImage}
            onClick={() => setLightboxUrl(fullUrl)}
            loading="lazy"
          />
          {msg.fileSize != null && (
            <span style={styles.imageMeta}>
              {msg.fileName} • {formatFileSize(msg.fileSize)}
            </span>
          )}
        </motion.div>
      );
    }

    return (
      <div style={styles.fileCard}>
        <File size={20} color={theme.colors.accent} style={{ flexShrink: 0 }} />
        <div style={styles.fileInfo}>
          <a href={fullUrl} download={msg.fileName || 'file'} style={styles.fileLink} target="_blank" rel="noopener noreferrer">
            {msg.fileName || 'Unknown file'}
          </a>
          {msg.fileSize != null && <span style={styles.fileSize}>{formatFileSize(msg.fileSize)}</span>}
        </div>
        <a href={fullUrl} download style={styles.downloadIconBtn}>
          <Download size={16} />
        </a>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.messagesList}>
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

            const isOwn = myUserId !== null && item.msg.userId === myUserId;
            const showHeader = shouldShowHeader(item, i);
            return (
              <motion.div
                key={`chat-${item.msg.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  ...styles.chatMsg,
                  ...(showHeader ? styles.chatMsgWithHeader : {}),
                }}
                onMouseEnter={() => setHoveredMsgId(item.msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                {showHeader && (
                  <div style={styles.chatHeader}>
                    <AvatarBadge displayName={item.msg.displayName} profilePhotoUrl={item.msg.profilePhotoUrl} serverAddress={serverAddress} size={28} />
                    <div style={styles.headerInfo}>
                      <span style={styles.displayName}>{item.msg.displayName}</span>
                      <span style={styles.chatTime}>{formatTime(item.msg.timestamp)}</span>
                    </div>
                  </div>
                )}
                <div style={{ ...styles.chatContent, paddingLeft: showHeader ? '2.5rem' : '2.5rem' }}>
                  {item.msg.content && <div>{renderMarkdown(item.msg.content)}</div>}
                  {item.msg.fileUrl && renderFileAttachment(item.msg)}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputWrapper}>
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
          <textarea
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
          <button
            style={{ ...styles.sendBtn, opacity: inputValue.trim() || uploading ? 1 : 0.4 }}
            onClick={handleSend}
            disabled={!inputValue.trim() || uploading}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {lightboxUrl && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.lightboxOverlay} onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} style={styles.lightboxImage} alt="Full size" onClick={(e) => e.stopPropagation()} />
          <div style={styles.lightboxControls}>
            <button style={styles.lightboxClose} onClick={() => setLightboxUrl(null)}><X size={20} /></button>
          </div>
        </motion.div>
      )}

      {uploadError && <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={styles.uploadError}>{uploadError}</motion.div>}
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
    backgroundColor: theme.colors.bgDarkest,
  },
  messagesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.5rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  systemMsg: {
    padding: '0.5rem 0',
    textAlign: 'center' as const,
  },
  systemText: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizeXs,
    background: 'rgba(255,255,255,0.03)',
    padding: '0.2rem 0.8rem',
    borderRadius: '100px',
    display: 'inline-block',
  },
  chatMsg: {
    padding: '0.15rem 0.5rem',
    borderRadius: '8px',
    transition: 'background-color 0.2s',
  },
  chatMsgWithHeader: {
    marginTop: '1rem',
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.8rem',
    marginBottom: '0.3rem',
  },
  headerInfo: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
  },
  displayName: {
    color: theme.colors.accent,
    fontSize: theme.font.sizeMd,
    fontWeight: 600,
  },
  chatTime: {
    color: theme.colors.textMuted,
    fontSize: '0.65rem',
  },
  chatContent: {
    color: theme.colors.textPrimary,
    fontSize: theme.font.sizeMd,
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  inputWrapper: {
    padding: '0 1.5rem 1.5rem 1.5rem',
    position: 'relative',
  },
  typingBar: {
    position: 'absolute',
    top: '-1.2rem',
    left: '2.5rem',
    fontSize: '0.7rem',
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  inputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderRadius: '16px',
    boxShadow: theme.shadows.md,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.textPrimary,
    padding: '0.5rem',
    fontSize: theme.font.sizeMd,
    outline: 'none',
    resize: 'none' as const,
    fontFamily: 'inherit',
    maxHeight: '150px',
  },
  uploadBtn: {
    background: 'transparent',
    border: 'none',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    padding: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    background: theme.colors.accent,
    border: 'none',
    color: '#000',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  imageContainer: {
    marginTop: '0.5rem',
    borderRadius: theme.radius,
    overflow: 'hidden',
    border: `1px solid ${theme.colors.borderSubtle}`,
    display: 'inline-block',
  },
  inlineImage: {
    maxWidth: '450px',
    maxHeight: '350px',
    display: 'block',
    cursor: 'pointer',
  },
  imageMeta: {
    fontSize: '0.65rem',
    color: theme.colors.textMuted,
    padding: '0.3rem 0.6rem',
    background: 'rgba(0,0,0,0.3)',
    display: 'block',
  },
  fileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.8rem',
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: theme.radius,
    padding: '0.8rem',
    maxWidth: '350px',
    marginTop: '0.5rem',
  },
  fileInfo: {
    flex: 1,
    overflow: 'hidden',
  },
  fileLink: {
    color: theme.colors.textPrimary,
    fontSize: theme.font.sizeSm,
    textDecoration: 'none',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  fileSize: {
    color: theme.colors.textMuted,
    fontSize: '0.7rem',
  },
  downloadIconBtn: {
    color: theme.colors.textSecondary,
    padding: '0.4rem',
    borderRadius: '6px',
    background: 'rgba(255,255,255,0.05)',
  },
  lightboxOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.9)',
    backdropFilter: 'blur(8px)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    maxWidth: '90vw',
    maxHeight: '90vh',
    borderRadius: theme.radius,
    boxShadow: theme.shadows.lg,
  },
  lightboxControls: {
    position: 'absolute' as const,
    top: '2rem',
    right: '2rem',
  },
  lightboxClose: {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: '#fff',
    padding: '0.5rem',
    borderRadius: '50%',
    cursor: 'pointer',
  },
  uploadError: {
    position: 'absolute' as const,
    bottom: '5rem',
    left: '2rem',
    background: theme.colors.error,
    color: '#fff',
    padding: '0.5rem 1rem',
    borderRadius: theme.radius,
    fontSize: theme.font.sizeSm,
    boxShadow: theme.shadows.md,
  }
};
