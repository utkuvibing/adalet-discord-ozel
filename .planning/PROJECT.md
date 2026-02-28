# Sex Dungeon

## What This Is

A private, self-hosted voice chat app for a small group of friends (2-5 people). Think Discord stripped down to what actually matters — always-on voice rooms, screen sharing, basic text chat, and file sharing — wrapped in a retro/gaming aesthetic. Runs on your own PC, no third parties, no subscriptions, no bloat.

## Core Value

Friends can hop into a private voice room anytime and hang out — no company owns the data, no one's listening, it's completely yours.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Always-on voice rooms that friends can drop in and out of
- [ ] Screen sharing (optimized for showing gameplay)
- [ ] Basic text chat within voice rooms (links, memes, quick messages)
- [ ] File sharing (images, files between friends)
- [ ] Camera/video support (nice-to-have, not priority)
- [ ] Invite link system for friends to join
- [ ] User accounts with display names and avatars
- [ ] Retro/gaming UI (pixel art, neon, arcade vibes)
- [ ] Self-hosted server that runs on a home PC
- [ ] Desktop app for all users

### Out of Scope

- Server boosts / Nitro / monetization — this is free, for friends
- Bots and integrations — keep it simple
- Mobile app — desktop only for v1
- Public servers / discovery — this is private
- Role-based permissions — everyone's equal in a 2-5 person group
- DMs / private messaging — just talk in the room

## Context

- Built for a tight-knit gaming friend group, not a public community
- Privacy is a core motivator — distrust of Discord's data handling
- The app should feel fun and personal, not corporate
- Screen sharing is primarily for watching each other game
- WebRTC is the natural fit for peer-to-peer voice/video in a small group
- Electron for the desktop app, Node.js backend — all JS/TS stack
- Zero budget means free-tier everything, self-hosted on user's own hardware

## Constraints

- **Budget**: Zero — no paid services, hosting, or infrastructure
- **Hosting**: Self-hosted on user's own PC (acts as server)
- **Platform**: Desktop app only (Electron)
- **Tech stack**: JavaScript/TypeScript end-to-end
- **Scale**: 2-5 concurrent users max — no need for infrastructure that scales
- **Network**: Home internet — must work behind NAT (STUN/TURN considerations)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-hosted on own PC | Zero budget + privacy | — Pending |
| Electron desktop app | Cross-platform JS, familiar to users | — Pending |
| WebRTC for voice/video | P2P, low latency, no media server cost | — Pending |
| Retro/gaming aesthetic | Personal, fun, matches the group's vibe | — Pending |
| Invite-link auth | Simple onboarding for friends | — Pending |

---
*Last updated: 2026-03-01 after initialization*
