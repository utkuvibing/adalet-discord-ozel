import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { app } from 'electron';
import type { Express, Request, Response, NextFunction } from 'express';
import type { Server } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  ChatMessage,
} from '../shared/types';
import { db } from './db/client';
import { messages, users } from './db/schema';
import { eq } from 'drizzle-orm';

type TypedIO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/** Socket.IO room key prefix -- must match signaling.ts */
const ROOM_PREFIX = 'room:';

/** Resolve the uploads directory on disk. */
let _uploadsDir: string | null = null;

export function getUploadsDir(): string {
  if (_uploadsDir) return _uploadsDir;
  const base = app.isPackaged ? app.getPath('userData') : process.cwd();
  _uploadsDir = path.join(base, 'uploads');
  fs.mkdirSync(_uploadsDir, { recursive: true });
  return _uploadsDir;
}

/** Configure multer disk storage with unique filenames. */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadsDir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = crypto.randomUUID();
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

/**
 * Register file upload routes on the Express app.
 * POST /upload -- accepts multipart form data with a single 'file' field.
 */
export function registerUploadRoutes(app: Express, io: TypedIO): void {
  app.post(
    '/upload',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'File too large. Maximum size is 25 MB.' });
            return;
          }
          if (err instanceof Error) {
            res.status(400).json({ error: err.message });
            return;
          }
          res.status(500).json({ error: 'Upload failed.' });
          return;
        }
        next();
      });
    },
    (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'No file provided.' });
          return;
        }

        const roomId = parseInt(req.body.roomId, 10);
        const userId = parseInt(req.body.userId, 10);

        if (isNaN(roomId) || isNaN(userId)) {
          res.status(400).json({ error: 'roomId and userId are required.' });
          return;
        }

        const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';

        // Persist the file message to SQLite
        const result = db
          .insert(messages)
          .values({
            roomId,
            userId,
            content,
            fileUrl: `/uploads/${file.filename}`,
            fileName: file.originalname,
            fileSize: file.size,
            fileMimeType: file.mimetype,
          })
          .run();

        // Look up user for displayName and avatarId
        const user = db
          .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
          .from(users)
          .where(eq(users.id, userId))
          .get();

        const chatMessage: ChatMessage = {
          id: Number(result.lastInsertRowid),
          roomId,
          userId,
          displayName: user?.displayName || 'Unknown',
          avatarId: user?.avatarUrl || 'skull',
          content,
          timestamp: Date.now(),
          fileUrl: `/uploads/${file.filename}`,
          fileName: file.originalname,
          fileSize: file.size,
          fileMimeType: file.mimetype,
        };

        // Broadcast to the room via Socket.IO
        io.to(ROOM_PREFIX + roomId).emit('chat:message', chatMessage);

        res.status(200).json(chatMessage);
      } catch (err) {
        console.error('[upload] Error processing upload:', err);
        res.status(500).json({ error: 'Internal server error.' });
      }
    }
  );
}
