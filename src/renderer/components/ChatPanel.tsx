import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
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

type AttachmentKind = 'image' | 'video' | 'audio' | 'document' | 'file';

interface PreviewState {
  url: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string | null;
}

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
  const [hoveredMsgId, setHoveredMsgId] = useState<number | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
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
    const handleMessageUpdate = (msg: ChatMessage) => {
      setChatMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
    };
    const handleMessageDelete = (payload: { messageId: number; roomId: number }) => {
      if (activeRoomId !== null && payload.roomId !== activeRoomId) return;
      setChatMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
      if (editingMessageId === payload.messageId) {
        setEditingMessageId(null);
        setEditDraft('');
      }
    };

    socket.on('chat:history', handleHistory);
    socket.on('chat:message', handleMessage);
    socket.on('chat:message:update', handleMessageUpdate);
    socket.on('chat:message:delete', handleMessageDelete);

    return () => {
      socket.off('chat:history', handleHistory);
      socket.off('chat:message', handleMessage);
      socket.off('chat:message:update', handleMessageUpdate);
      socket.off('chat:message:delete', handleMessageDelete);
    };
  }, [socket, activeRoomId, editingMessageId]);

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
  }, [activeRoomId]);

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
    if (!window.confirm('Delete this message and attached file for everyone?')) return;
    socket.emit('chat:message:delete', { messageId: msg.id });
    if (editingMessageId === msg.id) {
      setEditingMessageId(null);
      setEditDraft('');
    }
  }, [socket, editingMessageId]);

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
    const kind = getAttachmentKind(msg);
    const fileName = msg.fileName || 'Attachment';

    const openPreview = () => {
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

            const msg = item.msg;
            const isOwn = myUserId !== null && msg.userId === myUserId;
            const showHeader = shouldShowHeader(item, i);
            const isEditing = editingMessageId === msg.id;
            return (
              <motion.div
                key={`chat-${msg.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  ...styles.chatMsg,
                  ...(showHeader ? styles.chatMsgWithHeader : {}),
                }}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                {showHeader && (
                  <div style={styles.chatHeader}>
                    <AvatarBadge displayName={msg.displayName} profilePhotoUrl={msg.profilePhotoUrl} serverAddress={serverAddress} size={28} />
                    <div style={styles.headerInfo}>
                      <span style={styles.displayName}>{msg.displayName}</span>
                      <span style={styles.chatTime}>{formatTime(msg.timestamp)}</span>
                      {msg.editedAt ? <span style={styles.editedTag}>edited</span> : null}
                    </div>
                  </div>
                )}
                <div style={{ ...styles.chatContent, paddingLeft: '2.5rem' }}>
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
                      {msg.content && <div>{renderMarkdown(msg.content)}</div>}
                      {msg.fileUrl && renderFileAttachment(msg)}
                      {isOwn && hoveredMsgId === msg.id && (
                        <div style={styles.messageActions}>
                          <button style={styles.messageActionBtn} onClick={() => beginEdit(msg)} title="Edit">
                            <Pencil size={12} />
                          </button>
                          <button style={{ ...styles.messageActionBtn, ...styles.messageDeleteBtn }} onClick={() => handleDeleteMessage(msg)} title="Delete">
                            <Trash2 size={12} />
                          </button>
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
              {preview.kind === 'image' && (
                <img src={preview.url} style={styles.lightboxImage} alt={preview.name} />
              )}
              {preview.kind === 'video' && (
                <video controls autoPlay style={styles.previewVideo}>
                  <source src={preview.url} type={preview.mimeType || 'video/mp4'} />
                </video>
              )}
              {preview.kind === 'audio' && (
                <audio controls autoPlay style={styles.previewAudio}>
                  <source src={preview.url} type={preview.mimeType || 'audio/mpeg'} />
                </audio>
              )}
              {preview.kind === 'document' && (
                <iframe src={preview.url} title={preview.name} style={styles.previewDocument} />
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
    gap: '0.24rem',
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
    padding: '0.2rem 0.45rem',
    borderRadius: '11px',
    transition: 'background-color 0.2s',
    position: 'relative',
  },
  chatMsgWithHeader: {
    marginTop: '0.86rem',
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.72rem',
    marginBottom: '0.35rem',
  },
  headerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  displayName: {
    color: theme.colors.accent,
    fontSize: theme.font.sizeMd,
    fontWeight: 700,
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
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  inputWrapper: {
    padding: '0.6rem 1.2rem 1rem',
    position: 'relative',
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
  messageActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.3rem',
    marginTop: '0.4rem',
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
    width: 'min(980px, 92vw)',
    maxHeight: '90vh',
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
    padding: '0.9rem',
  },
  lightboxImage: {
    maxWidth: '100%',
    maxHeight: 'calc(90vh - 120px)',
    borderRadius: theme.radius,
    boxShadow: theme.shadows.lg,
  },
  previewVideo: {
    width: '100%',
    maxHeight: 'calc(90vh - 120px)',
    borderRadius: '10px',
    background: '#000',
  },
  previewAudio: {
    width: 'min(620px, 90vw)',
  },
  previewDocument: {
    width: '100%',
    height: 'calc(90vh - 120px)',
    border: 'none',
    borderRadius: '10px',
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
};
