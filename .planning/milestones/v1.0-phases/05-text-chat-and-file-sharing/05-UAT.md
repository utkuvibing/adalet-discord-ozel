---
status: testing
phase: 05-text-chat-and-file-sharing
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md]
started: "2026-03-01T11:00:00Z"
updated: "2026-03-01T11:00:00Z"
---

## Current Test

number: 1
name: Send a text message
expected: |
  In a room, type a message in the chat input bar and press Enter. The message appears in the chat feed with your avatar emoji, display name (in green), timestamp, and message content. The input bar clears after sending.
awaiting: user response

## Tests

### 1. Send a text message
expected: Type a message in the chat input bar and press Enter. The message appears in the chat feed with your avatar emoji, display name (in green), timestamp, and content. The input bar clears after sending.
result: [pending]

### 2. Real-time message delivery
expected: With two app instances connected to the same room, send a message from one. It appears on the other instance in real time without refresh.
result: [pending]

### 3. Message history on join
expected: After sending some messages, close and reopen the app. Rejoin the room. Previous messages appear in the chat feed (up to 50 most recent).
result: [pending]

### 4. System messages in chat feed
expected: Join/leave events appear in the same chat feed as text messages, visually distinguished (italic, gray styling). The feed is sorted chronologically.
result: [pending]

### 5. Upload an image file
expected: Click the paperclip button in the chat input bar. Select a PNG/JPG image from your filesystem. The image appears inline in the chat as a thumbnail (max 400x300). Clicking the thumbnail opens a full-size lightbox overlay.
result: [pending]

### 6. Upload a non-image file
expected: Click the paperclip button and select a non-image file (e.g., .pdf, .zip, .txt). A styled file card appears in chat showing the filename, human-readable size (KB/MB), and a download link in green accent color.
result: [pending]

### 7. File messages delivered to other members
expected: Upload a file from one instance. The file message (image thumbnail or file card) appears on the other instance in real time.
result: [pending]

### 8. Clipboard paste upload
expected: Copy an image to clipboard (e.g., screenshot). Click in the chat input and press Ctrl+V. The image uploads and appears inline in the chat.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0

## Gaps

[none yet]
