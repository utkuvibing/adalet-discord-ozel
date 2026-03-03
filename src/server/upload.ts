import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { app } from 'electron';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
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
import { updateUserProfile } from './user';

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

const profilePhotoUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const profileGifUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

function hasEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text);
}

function syncSocketProfile(io: TypedIO, payload: {
  userId: number;
  displayName: string;
  bio: string;
  profilePhotoUrl: string | null;
  profileBannerGifUrl: string | null;
}): void {
  for (const sock of io.sockets.sockets.values()) {
    if (sock.data.userId === payload.userId) {
      sock.data.displayName = payload.displayName;
      sock.data.bio = payload.bio;
      sock.data.profilePhotoUrl = payload.profilePhotoUrl;
      sock.data.profileBannerGifUrl = payload.profileBannerGifUrl;
    }
  }
}

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
          .select({ displayName: users.displayName, avatarUrl: users.avatarUrl, profilePhotoUrl: users.profilePhotoUrl })
          .from(users)
          .where(eq(users.id, userId))
          .get();

        const chatMessage: ChatMessage = {
          id: Number(result.lastInsertRowid),
          roomId,
          userId,
          displayName: user?.displayName || 'Unknown',
          avatarId: user?.avatarUrl || 'skull',
          profilePhotoUrl: user?.profilePhotoUrl ?? null,
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

  app.post(
    '/profile/photo',
    (req: Request, res: Response, next: NextFunction) => {
      profilePhotoUpload.single('file')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'File too large. Maximum size is 5 MB.' });
          return;
        }
        if (err) {
          res.status(400).json({ error: 'Upload failed.' });
          return;
        }
        next();
      });
    },
    (req: Request, res: Response) => {
      const file = req.file;
      const userId = Number(req.body.userId);
      if (!file || Number.isNaN(userId)) {
        res.status(400).json({ error: 'file and userId are required.' });
        return;
      }
      if (!['image/png', 'image/jpeg'].includes(file.mimetype)) {
        fs.unlinkSync(file.path);
        res.status(415).json({ error: 'Only PNG and JPG are supported.' });
        return;
      }

      const user = db
        .select({
          displayName: users.displayName,
          bio: users.bio,
          profileBannerGifUrl: users.profileBannerGifUrl,
        })
        .from(users)
        .where(eq(users.id, userId))
        .get();

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const updated = updateUserProfile(userId, {
        displayName: user.displayName,
        bio: user.bio ?? '',
        profilePhotoUrl: `/uploads/${file.filename}`,
        profileBannerGifUrl: user.profileBannerGifUrl ?? null,
      });

      io.emit('profile:updated', {
        userId: updated.id,
        displayName: updated.displayName,
        bio: updated.bio,
        profilePhotoUrl: updated.profilePhotoUrl,
        profileBannerGifUrl: updated.profileBannerGifUrl,
      });
      syncSocketProfile(io, {
        userId: updated.id,
        displayName: updated.displayName,
        bio: updated.bio,
        profilePhotoUrl: updated.profilePhotoUrl,
        profileBannerGifUrl: updated.profileBannerGifUrl,
      });

      res.status(200).json(updated);
    }
  );

  app.post(
    '/profile/banner-gif',
    (req: Request, res: Response, next: NextFunction) => {
      profileGifUpload.single('file')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'File too large. Maximum size is 10 MB.' });
          return;
        }
        if (err) {
          res.status(400).json({ error: 'Upload failed.' });
          return;
        }
        next();
      });
    },
    (req: Request, res: Response) => {
      const file = req.file;
      const userId = Number(req.body.userId);
      if (!file || Number.isNaN(userId)) {
        res.status(400).json({ error: 'file and userId are required.' });
        return;
      }
      if (file.mimetype !== 'image/gif') {
        fs.unlinkSync(file.path);
        res.status(415).json({ error: 'Only GIF is supported.' });
        return;
      }

      const user = db
        .select({
          displayName: users.displayName,
          bio: users.bio,
          profilePhotoUrl: users.profilePhotoUrl,
        })
        .from(users)
        .where(eq(users.id, userId))
        .get();

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const updated = updateUserProfile(userId, {
        displayName: user.displayName,
        bio: user.bio ?? '',
        profilePhotoUrl: user.profilePhotoUrl ?? null,
        profileBannerGifUrl: `/uploads/${file.filename}`,
      });

      io.emit('profile:updated', {
        userId: updated.id,
        displayName: updated.displayName,
        bio: updated.bio,
        profilePhotoUrl: updated.profilePhotoUrl,
        profileBannerGifUrl: updated.profileBannerGifUrl,
      });
      syncSocketProfile(io, {
        userId: updated.id,
        displayName: updated.displayName,
        bio: updated.bio,
        profilePhotoUrl: updated.profilePhotoUrl,
        profileBannerGifUrl: updated.profileBannerGifUrl,
      });

      res.status(200).json(updated);
    }
  );

  app.patch('/profile', express.json(), (req: Request, res: Response) => {
    const userId = Number(req.body.userId);
    const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : '';
    const bio = typeof req.body.bio === 'string' ? req.body.bio.trim() : '';

    if (Number.isNaN(userId) || displayName.length < 1 || displayName.length > 32) {
      res.status(400).json({ error: 'Invalid userId or displayName.' });
      return;
    }
    if (bio.length > 100) {
      res.status(400).json({ error: 'Bio can be max 100 characters.' });
      return;
    }
    if (hasEmoji(displayName) || hasEmoji(bio)) {
      res.status(400).json({ error: 'Emoji is not allowed in nickname or bio.' });
      return;
    }

    const user = db
      .select({
        profilePhotoUrl: users.profilePhotoUrl,
        profileBannerGifUrl: users.profileBannerGifUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const updated = updateUserProfile(userId, {
      displayName,
      bio,
      profilePhotoUrl: user.profilePhotoUrl ?? null,
      profileBannerGifUrl: user.profileBannerGifUrl ?? null,
    });

    io.emit('profile:updated', {
      userId: updated.id,
      displayName: updated.displayName,
      bio: updated.bio,
      profilePhotoUrl: updated.profilePhotoUrl,
      profileBannerGifUrl: updated.profileBannerGifUrl,
    });
    syncSocketProfile(io, {
      userId: updated.id,
      displayName: updated.displayName,
      bio: updated.bio,
      profilePhotoUrl: updated.profilePhotoUrl,
      profileBannerGifUrl: updated.profileBannerGifUrl,
    });

    res.status(200).json(updated);
  });
}
