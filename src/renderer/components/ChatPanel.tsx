import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage, SystemMessage, ReactionGroup } from '../../shared/types';
import type { TypedSocket } from '../hooks/useSocket';
import { getAvatarEmoji } from '../../shared/avatars';
import { renderMarkdown } from '../utils/markdown';

interface ChatPanelProps {
  socket: TypedSocket | null;
  activeRoomId: number | null;
  systemMessages: SystemMessage[];
  myUserId: number | null;
  serverAddress: string;
}

/** Unified feed item type for sorting system + chat messages chronologically. */
type FeedItem =
  | { kind: 'system'; msg: SystemMessage }
  | { kind: 'chat'; msg: ChatMessage };

/** Format bytes to human-readable string (KB, MB). */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format a Unix ms timestamp as HH:MM. */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * ChatPanel -- combined chat + system message feed with input bar.
 * Receives system messages as props, manages chat messages via Socket.IO listeners.
 * Supports file uploads with inline image rendering and downloadable file cards.
 */
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

  // Listen for chat:history and chat:message events
  useEffect(() => {
    if (!socket) return;

    const handleHistory = (history: ChatMessage[]) => {
      setChatMessages(history);
    };

    const handleMessage = (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    };

    const handleReactionUpdate = (payload: { messageId: number; reactions: ReactionGroup[] }) => {
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === payload.messageId ? { ...msg, reactions: payload.reactions } : msg
        )
      );
    };

    socket.on('chat:history', handleHistory);
    socket.on('chat:message', handleMessage);
    socket.on('reaction:update', handleReactionUpdate);

    return () => {
      socket.off('chat:history', handleHistory);
      socket.off('chat:message', handleMessage);
      socket.off('reaction:update', handleReactionUpdate);
    };
  }, [socket]);

  // Listen for typing events
  useEffect(() => {
    if (!socket) return;

    const handleTypingUpdate = (payload: { socketId: string; displayName: string; typing: boolean }) => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (payload.typing) {
          next.set(payload.socketId, payload.displayName);
          // Auto-clear after 3.5s (slightly longer than server timeout)
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

  // Clear chat messages and typing when room changes
  useEffect(() => {
    setChatMessages([]);
    setTypingUsers(new Map());
  }, [activeRoomId]);

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, systemMessages]);

  // Upload file handler
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

        // Include text content as caption if present
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
        // Server broadcasts chat:message to room -- ChatPanel receives it via socket listener
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        setUploadError(message);
        // Clear error after 4 seconds
        setTimeout(() => setUploadError(null), 4000);
      } finally {
        setUploading(false);
        // Clear file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [activeRoomId, myUserId, inputValue, serverBaseUrl]
  );

  // Handle file input change
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  // Handle paste from clipboard (images)
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.files;
      if (items && items.length > 0) {
        e.preventDefault();
        uploadFile(items[0]);
      }
    },
    [uploadFile]
  );

  // Send message handler
  const handleSend = useCallback(() => {
    if (!socket || activeRoomId === null) return;
    const content = inputValue.trim();
    if (content.length === 0) return;

    socket.emit('chat:message', { roomId: activeRoomId, content });
    setInputValue('');
  }, [socket, activeRoomId, inputValue]);

  // Handle keydown -- Enter to send, Shift+Enter for newline
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Build unified feed sorted by timestamp
  const feed: FeedItem[] = [];

  for (const msg of systemMessages) {
    feed.push({ kind: 'system', msg });
  }
  for (const msg of chatMessages) {
    feed.push({ kind: 'chat', msg });
  }

  feed.sort((a, b) => {
    const tsA = a.kind === 'system' ? a.msg.timestamp : a.msg.timestamp;
    const tsB = b.kind === 'system' ? b.msg.timestamp : b.msg.timestamp;
    return tsA - tsB;
  });

  // Determine grouping: consecutive chat messages from same user within 5 minutes
  const shouldShowHeader = (item: FeedItem, index: number): boolean => {
    if (item.kind !== 'chat') return false;
    if (index === 0) return true;
    const prev = feed[index - 1];
    if (prev.kind !== 'chat') return true;
    if (prev.msg.userId !== item.msg.userId) return true;
    // More than 5 minutes apart
    if (item.msg.timestamp - prev.msg.timestamp > 5 * 60 * 1000) return true;
    return false;
  };

  const hasMessages = feed.length > 0;

  const QUICK_EMOJIS = ['\uD83D\uDC4D', '\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDD25'];

  const handleReactionToggle = useCallback(
    (messageId: number, emoji: string) => {
      socket?.emit('reaction:toggle', { messageId, emoji });
    },
    [socket]
  );

  /** Render file attachment for a chat message. */
  const renderFileAttachment = (msg: ChatMessage) => {
    if (!msg.fileUrl) return null;

    const fullUrl = serverBaseUrl + msg.fileUrl;
    const isImage = msg.fileMimeType?.startsWith('image/');

    if (isImage) {
      return (
        <div style={styles.imageContainer}>
          <img
            src={fullUrl}
            alt={msg.fileName || 'Image'}
            style={styles.inlineImage}
            onClick={() => setLightboxUrl(fullUrl)}
            loading="lazy"
            onLoad={(e) => {
              // Remove blur placeholder once loaded
              (e.target as HTMLImageElement).style.filter = 'none';
            }}
          />
          {msg.fileSize != null && (
            <span style={styles.imageMeta}>
              {msg.fileName} - {formatFileSize(msg.fileSize)}
            </span>
          )}
        </div>
      );
    }

    // Non-image file card
    return (
      <div style={styles.fileCard}>
        <span style={styles.fileIcon}>&#128196;</span>
        <div style={styles.fileInfo}>
          <a
            href={fullUrl}
            download={msg.fileName || 'file'}
            style={styles.fileLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            {msg.fileName || 'Unknown file'}
          </a>
          {msg.fileSize != null && (
            <span style={styles.fileSize}>{formatFileSize(msg.fileSize)}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.messagesList}>
        {!hasMessages && (
          <p style={styles.emptyText}>No messages yet</p>
        )}
        {feed.map((item, i) => {
          if (item.kind === 'system') {
            return (
              <div key={`sys-${item.msg.timestamp}-${i}`} style={styles.systemMsg}>
                <span style={styles.systemTime}>
                  {formatTime(item.msg.timestamp)}
                </span>
                <span style={styles.systemText}>{item.msg.text}</span>
              </div>
            );
          }

          // Chat message
          const isOwn = myUserId !== null && item.msg.userId === myUserId;
          const showHeader = shouldShowHeader(item, i);
          const hasText = item.msg.content.length > 0;
          const hasFile = !!item.msg.fileUrl;

          const msgReactions = item.msg.reactions || [];
          const isHovered = hoveredMsgId === item.msg.id;

          return (
            <div
              key={`chat-${item.msg.id}`}
              style={{
                ...styles.chatMsg,
                ...(isOwn ? styles.chatMsgOwn : {}),
                ...(showHeader ? styles.chatMsgWithHeader : {}),
                position: 'relative',
              }}
              onMouseEnter={() => setHoveredMsgId(item.msg.id)}
              onMouseLeave={() => setHoveredMsgId(null)}
            >
              {showHeader && (
                <div style={styles.chatHeader}>
                  <span style={styles.avatar}>
                    {getAvatarEmoji(item.msg.avatarId)}
                  </span>
                  <span style={styles.displayName}>
                    {item.msg.displayName}
                  </span>
                  <span style={styles.chatTime}>
                    {formatTime(item.msg.timestamp)}
                  </span>
                </div>
              )}
              {hasText && (
                <div style={styles.chatContent}>{renderMarkdown(item.msg.content)}</div>
              )}
              {hasFile && (
                <div style={styles.chatContent}>
                  {renderFileAttachment(item.msg)}
                </div>
              )}
              {/* Reaction badges */}
              {msgReactions.length > 0 && (
                <div style={styles.reactionRow}>
                  {msgReactions.map((r) => {
                    const isMyReaction = myUserId !== null && r.userIds.includes(myUserId);
                    return (
                      <button
                        key={r.emoji}
                        style={{
                          ...styles.reactionBadge,
                          ...(isMyReaction ? styles.reactionBadgeMine : {}),
                        }}
                        onClick={() => handleReactionToggle(item.msg.id, r.emoji)}
                        title={`${r.userIds.length} reaction(s)`}
                      >
                        {r.emoji} {r.userIds.length}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Quick emoji picker on hover */}
              {isHovered && (
                <div style={styles.emojiPicker}>
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      style={styles.emojiBtn}
                      onClick={() => handleReactionToggle(item.msg.id, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingUsers.size > 0 && (
        <div style={styles.typingBar}>
          {(() => {
            const names = [...typingUsers.values()];
            if (names.length === 1) return `${names[0]} is typing...`;
            if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
            return `${names[0]} and ${names.length - 1} others are typing...`;
          })()}
        </div>
      )}

      {/* Input bar */}
      <div style={styles.inputBar}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        {/* Upload button */}
        <button
          style={styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || activeRoomId === null}
          title="Attach file"
        >
          &#128206;
        </button>
        <textarea
          style={styles.input}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            // Emit typing:start with 2s debounce
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
          placeholder={uploading ? 'Uploading...' : 'Type a message...'}
          rows={1}
          disabled={uploading}
        />
        <button
          style={{
            ...styles.sendBtn,
            ...(inputValue.trim().length === 0 || uploading ? styles.sendBtnDisabled : {}),
          }}
          onClick={handleSend}
          disabled={inputValue.trim().length === 0 || uploading}
        >
          Send
        </button>
      </div>

      {/* Upload error message */}
      {uploadError && (
        <div style={styles.uploadError}>{uploadError}</div>
      )}

      {/* Lightbox overlay for full-size image view */}
      {lightboxUrl && (
        <div style={styles.lightboxOverlay} onClick={() => setLightboxUrl(null)}>
          <img
            src={lightboxUrl}
            style={styles.lightboxImage}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
          />
          <div style={styles.lightboxControls} onClick={(e) => e.stopPropagation()}>
            <a
              href={lightboxUrl}
              download
              style={styles.lightboxDownload}
              title="Download"
            >
              Download
            </a>
            <button
              style={styles.lightboxClose}
              onClick={() => setLightboxUrl(null)}
            >
              X
            </button>
          </div>
        </div>
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
  },
  messagesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0.8rem 1rem',
  },
  emptyText: {
    color: '#555',
    fontSize: '0.8rem',
    fontStyle: 'italic',
  },
  // System messages
  systemMsg: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.15rem 0',
    alignItems: 'baseline',
  },
  systemTime: {
    color: '#555',
    fontSize: '0.7rem',
    flexShrink: 0,
  },
  systemText: {
    color: '#888',
    fontSize: '0.78rem',
    fontStyle: 'italic',
  },
  // Chat messages
  chatMsg: {
    padding: '0.1rem 0.4rem',
    borderRadius: '8px',
  },
  chatMsgOwn: {
    backgroundColor: '#1a1a2e',
  },
  chatMsgWithHeader: {
    marginTop: '0.6rem',
    paddingTop: '0.3rem',
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginBottom: '0.15rem',
  },
  avatar: {
    fontSize: '0.9rem',
  },
  displayName: {
    color: '#7fff00',
    fontSize: '0.82rem',
    fontWeight: 'bold',
  },
  chatTime: {
    color: '#555',
    fontSize: '0.7rem',
  },
  chatContent: {
    color: '#e0e0e0',
    fontSize: '0.82rem',
    lineHeight: '1.4',
    paddingLeft: '1.5rem',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  // Reactions
  reactionRow: {
    display: 'flex',
    gap: '0.3rem',
    paddingLeft: '1.5rem',
    marginTop: '0.2rem',
    flexWrap: 'wrap' as const,
  },
  reactionBadge: {
    background: '#1a1a2e',
    border: '1px solid #2a2a3e',
    borderRadius: '12px',
    padding: '0.1rem 0.4rem',
    fontSize: '0.72rem',
    cursor: 'pointer',
    color: '#e0e0e0',
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
  },
  reactionBadgeMine: {
    borderColor: '#7fff00',
    backgroundColor: '#1a2e1a',
  },
  emojiPicker: {
    position: 'absolute' as const,
    right: '0.3rem',
    top: '-0.2rem',
    display: 'flex',
    gap: '0.15rem',
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '0.15rem 0.3rem',
    zIndex: 10,
  },
  emojiBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: '0.1rem',
    borderRadius: '4px',
  },
  // Typing indicator
  typingBar: {
    padding: '0.15rem 1rem 0.15rem 2.5rem',
    fontSize: '0.72rem',
    color: '#888',
    fontStyle: 'italic',
    borderTop: '1px solid #1a1a1a',
    backgroundColor: '#0f0f0f',
  },
  // Input bar
  inputBar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderTop: '1px solid #2a2a2a',
    backgroundColor: '#111111',
  },
  input: {
    flex: 1,
    backgroundColor: '#141414',
    color: '#e0e0e0',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '0.5rem 0.6rem',
    fontSize: '0.82rem',
    resize: 'none' as const,
    outline: 'none',
    maxHeight: '5rem',
    lineHeight: '1.4',
  },
  uploadBtn: {
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '0.4rem 0.5rem',
    fontSize: '1rem',
    cursor: 'pointer',
    flexShrink: 0,
    lineHeight: 1,
  },
  sendBtn: {
    backgroundColor: '#7fff00',
    color: '#0d0d0d',
    border: 'none',
    borderRadius: '8px',
    padding: '0.5rem 0.8rem',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  // Upload error
  uploadError: {
    position: 'absolute' as const,
    bottom: '3.5rem',
    left: '1rem',
    right: '1rem',
    backgroundColor: '#4a1515',
    color: '#ff6b6b',
    padding: '0.4rem 0.8rem',
    borderRadius: '8px',
    fontSize: '0.78rem',
    textAlign: 'center' as const,
  },
  // Inline image
  imageContainer: {
    marginTop: '0.3rem',
  },
  inlineImage: {
    maxWidth: '400px',
    maxHeight: '300px',
    borderRadius: '8px',
    border: '1px solid #2a2a2a',
    cursor: 'pointer',
    display: 'block',
    filter: 'blur(4px)',
    transition: 'filter 0.2s ease',
  },
  imageMeta: {
    fontSize: '0.68rem',
    color: '#555',
    marginTop: '0.15rem',
    display: 'block',
  },
  // File card
  fileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '0.5rem 0.7rem',
    maxWidth: '300px',
    marginTop: '0.3rem',
  },
  fileIcon: {
    fontSize: '1.3rem',
    flexShrink: 0,
  },
  fileInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.15rem',
    overflow: 'hidden',
  },
  fileLink: {
    color: '#7fff00',
    fontSize: '0.82rem',
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  fileSize: {
    color: '#666',
    fontSize: '0.72rem',
  },
  // Lightbox overlay
  lightboxOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    cursor: 'pointer',
  },
  lightboxImage: {
    maxWidth: '90vw',
    maxHeight: '90vh',
    borderRadius: '8px',
    cursor: 'default',
  },
  lightboxControls: {
    position: 'absolute' as const,
    top: '1rem',
    right: '1rem',
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  lightboxDownload: {
    backgroundColor: 'transparent',
    color: '#7fff00',
    border: '1px solid #555',
    borderRadius: '8px',
    padding: '0.3rem 0.6rem',
    fontSize: '0.8rem',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  lightboxClose: {
    backgroundColor: 'transparent',
    color: '#fff',
    border: '1px solid #555',
    borderRadius: '8px',
    padding: '0.3rem 0.6rem',
    fontSize: '1rem',
    cursor: 'pointer',
  },
};
