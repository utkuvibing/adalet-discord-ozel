import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage, SystemMessage } from '../../shared/types';
import type { TypedSocket } from '../hooks/useSocket';
import { getAvatarEmoji } from '../../shared/avatars';

interface ChatPanelProps {
  socket: TypedSocket | null;
  activeRoomId: number | null;
  systemMessages: SystemMessage[];
  myUserId: number | null;
}

/** Unified feed item type for sorting system + chat messages chronologically. */
type FeedItem =
  | { kind: 'system'; msg: SystemMessage }
  | { kind: 'chat'; msg: ChatMessage };

/**
 * ChatPanel -- combined chat + system message feed with input bar.
 * Receives system messages as props, manages chat messages via Socket.IO listeners.
 */
export function ChatPanel({
  socket,
  activeRoomId,
  systemMessages,
  myUserId,
}: ChatPanelProps): React.JSX.Element {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen for chat:history and chat:message events
  useEffect(() => {
    if (!socket) return;

    const handleHistory = (history: ChatMessage[]) => {
      setChatMessages(history);
    };

    const handleMessage = (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    };

    socket.on('chat:history', handleHistory);
    socket.on('chat:message', handleMessage);

    return () => {
      socket.off('chat:history', handleHistory);
      socket.off('chat:message', handleMessage);
    };
  }, [socket]);

  // Clear chat messages when room changes
  useEffect(() => {
    setChatMessages([]);
  }, [activeRoomId]);

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, systemMessages]);

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

          return (
            <div
              key={`chat-${item.msg.id}`}
              style={{
                ...styles.chatMsg,
                ...(isOwn ? styles.chatMsgOwn : {}),
                ...(showHeader ? styles.chatMsgWithHeader : {}),
              }}
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
              <div style={styles.chatContent}>{item.msg.content}</div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={styles.inputBar}>
        <textarea
          style={styles.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
        />
        <button
          style={{
            ...styles.sendBtn,
            ...(inputValue.trim().length === 0 ? styles.sendBtnDisabled : {}),
          }}
          onClick={handleSend}
          disabled={inputValue.trim().length === 0}
        >
          Send
        </button>
      </div>
    </div>
  );
}

/** Format a Unix ms timestamp as HH:MM. */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
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
    borderRadius: '4px',
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
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
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
    borderRadius: '4px',
    padding: '0.5rem 0.6rem',
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    resize: 'none',
    outline: 'none',
    maxHeight: '5rem',
    lineHeight: '1.4',
  },
  sendBtn: {
    backgroundColor: '#7fff00',
    color: '#0d0d0d',
    border: 'none',
    borderRadius: '4px',
    padding: '0.5rem 0.8rem',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
};
