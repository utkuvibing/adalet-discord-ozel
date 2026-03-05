import React from 'react';

/**
 * Simple markdown renderer for chat messages.
 * Supports: **bold**, *italic*, ~~strikethrough~~, `inline code`,
 * ```code blocks```, > quotes, and URL auto-linking.
 * XSS-safe: HTML is escaped before parsing.
 */

/** Escape HTML entities to prevent XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Parse inline markdown (bold, italic, strikethrough, inline code, links). */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex matches: `code`, **bold**, *italic*, ~~strike~~, URLs
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\~\~[^~]+\~\~)|(https?:\/\/[^\s<>\])"]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const m = match[0];

    if (match[1]) {
      // Inline code
      nodes.push(
        <code key={key++} style={inlineStyles.code}>
          {m.slice(1, -1)}
        </code>
      );
    } else if (match[2]) {
      // Bold
      nodes.push(<strong key={key++}>{m.slice(2, -2)}</strong>);
    } else if (match[3]) {
      // Italic
      nodes.push(<em key={key++}>{m.slice(1, -1)}</em>);
    } else if (match[4]) {
      // Strikethrough
      nodes.push(<del key={key++}>{m.slice(2, -2)}</del>);
    } else if (match[5]) {
      // URL
      nodes.push(
        <a
          key={key++}
          href={m}
          target="_blank"
          rel="noopener noreferrer"
          style={inlineStyles.link}
        >
          {m}
        </a>
      );
    }

    lastIndex = match.index + m.length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/** Render markdown-formatted chat content. */
export function renderMarkdown(content: string): React.ReactNode {
  const escaped = escapeHtml(content);

  // Split code blocks first (``` ... ```)
  const codeBlockPattern = /```([^`]*?)```/gs;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockKey = 0;

  while ((match = codeBlockPattern.exec(escaped)) !== null) {
    // Process text before the code block
    if (match.index > lastIndex) {
      const textBefore = escaped.slice(lastIndex, match.index);
      parts.push(...processLines(textBefore, blockKey));
      blockKey += 100;
    }

    // Code block
    parts.push(
      <pre key={`cb-${blockKey++}`} style={inlineStyles.codeBlock}>
        <code>{match[1].replace(/^\n/, '')}</code>
      </pre>
    );

    lastIndex = match.index + match[0].length;
  }

  // Process remaining text
  if (lastIndex < escaped.length) {
    parts.push(...processLines(escaped.slice(lastIndex), blockKey));
  }

  return <>{parts}</>;
}

/** Process lines for quotes and inline markdown. */
function processLines(text: string, startKey: number): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = startKey;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('&gt; ')) {
      // Blockquote (> was escaped to &gt;)
      nodes.push(
        <div key={`q-${key++}`} style={inlineStyles.quote}>
          {parseInline(line.slice(5))}
        </div>
      );
    } else {
      if (i > 0) nodes.push('\n');
      nodes.push(<React.Fragment key={`l-${key++}`}>{parseInline(line)}</React.Fragment>);
    }
  }

  return nodes;
}

const inlineStyles: Record<string, React.CSSProperties> = {
  code: {
    backgroundColor: '#1a1a2e',
    padding: '0.1rem 0.3rem',
    borderRadius: '4px',
    fontSize: '0.78rem',
    fontFamily: 'monospace',
    color: '#ff9900',
  },
  codeBlock: {
    backgroundColor: '#19120e',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    padding: '0.5rem 0.7rem',
    margin: '0.3rem 0',
    fontSize: '0.78rem',
    fontFamily: 'monospace',
    color: '#e0e0e0',
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  quote: {
    borderLeft: '3px solid #e3aa6a',
    paddingLeft: '0.6rem',
    color: '#aaa',
    margin: '0.2rem 0',
  },
  link: {
    color: '#00bfff',
    textDecoration: 'underline',
  },
};
