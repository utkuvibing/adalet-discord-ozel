# Feature Research

**Domain:** Private self-hosted voice chat / Discord alternative for small gaming friend groups (2-5 people)
**Researched:** 2026-03-01
**Confidence:** MEDIUM — Feature landscape is well-understood from competitor analysis; complexity estimates are informed estimates based on known WebRTC patterns, not measured builds.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete. Sourced from Discord, Mumble, TeamSpeak, and WebRTC voice app patterns.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Always-on voice rooms | Core Discord pattern — rooms persist, users drop in/out without initiating a call | HIGH | WebRTC peer connections must stay alive when members join/leave; signaling server required |
| Mute self (toggle) | Universal expectation for any voice app | LOW | Local mic track enable/disable in WebRTC |
| Deafen self (toggle) | Standard Discord UX — silences all incoming audio | LOW | Pause all incoming remote audio tracks |
| Push-to-talk mode | Gaming standard — prevents background noise from transmitting during intense gameplay | MEDIUM | Hotkey capture in Electron (globalShortcut API); must work even when app is not focused |
| Speaking indicator | Visual feedback showing who is currently talking — essential spatial awareness | MEDIUM | Audio level analysis on remote streams; highlight active speaker in UI |
| Mute/volume control for individual users | Friends need to control loud players independently | LOW | Per-stream gain node in Web Audio API |
| See who's in a room | Users need presence awareness before joining | LOW | Websocket state broadcast from server |
| Join / leave a room | Fundamental navigation | LOW | WebRTC connect/disconnect + signaling |
| Persistent text chat per room | Links, memes, coordinates — users expect text alongside voice | MEDIUM | Websocket-based messaging; persist to SQLite so messages survive restart |
| File/image sharing in chat | Share screenshots, memes, game clips | MEDIUM | Multipart upload to server local disk; serve back as static files; need size limits |
| User display name and avatar | Identity within the group | LOW | Simple profile stored server-side; avatar as uploaded image |
| Invite link auth | Friends-only access without public registration — expected for a private server | MEDIUM | Generate token URL; one-time or reusable links; no email/OAuth required |
| Connection status indicators | Online / in-voice / offline states visible to all | LOW | Websocket presence events broadcast to all clients |
| Reconnect handling | Dropped connections must recover automatically | MEDIUM | WebRTC ICE restart + websocket reconnect with exponential backoff |

### Differentiators (Competitive Advantage)

Features that set this product apart from Discord/alternatives for this specific use case. Not required for day one, but valued by a gaming friend group.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Screen sharing (gaming-optimized) | Primary use case — watching friends play; Discord locks 1080p/60fps behind Nitro paywall; self-hosted removes that limit | HIGH | WebRTC getDisplayMedia() with configurable resolution/fps; audio capture from system audio included |
| Retro/gaming visual aesthetic | Personal, fun, feels "ours" not corporate — this is the brand differentiator vs sterile self-hosted tools like Mumble | MEDIUM | CSS/design work; pixel font, neon palette, scanline effects; Electron allows full custom chrome |
| No account creation flow | Invite link lands you in the app — zero friction onboarding, no email required | MEDIUM | Token-based auth stored in localStorage; display name set on first join via invite |
| Camera/video in rooms | Face-to-face during gaming sessions — nice for late-night hangouts | HIGH | WebRTC video track alongside audio; grid layout in room view; off by default to save bandwidth |
| Soundboard / reaction sounds | Drop an airhorn, play a clip — classic gaming session energy | MEDIUM | Small audio file library; triggered via websocket broadcast; play on all clients simultaneously |
| Persistent room history | Scroll back through yesterday's links and memes even when voice is quiet | LOW | Already covered if text messages are stored in SQLite — just expose history on load |
| Per-user volume memory | App remembers volume settings per friend so you don't re-adjust every session | LOW | Store in local config file (Electron userData); purely client-side |
| Custom room names and count | Friends decide their own room structure — "Gaming", "AFK Lounge", "Movie Night" | LOW | Server admin panel or simple config; rooms stored in DB |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem appealing but should be explicitly avoided given the constraints of this project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Mobile app | "I want to join from my phone" | Doubles build scope; React Native + WebRTC mobile is a completely separate codebase and has different NAT traversal behavior; v1 is Electron only | Defer to v2; web-based client via browser could bridge the gap before a native mobile app |
| Bot integrations | "Can we add a music bot?" | Infinite scope; bots require a bot API/gateway layer; music bots require audio mixing server-side — transforms the architecture entirely | Out of scope by design; friends can play music through screen share audio instead |
| Role-based permissions | "Let me make someone a mod" | Overkill for 2-5 people; adds permission management UI and enforcement logic throughout; everyone is equal in this group | Flat permissions; server owner (host) has admin; all friends are equal |
| DMs / private messaging | "I want to whisper to one friend" | Breaks the small-group-in-a-room model; requires 1:1 routing, separate conversation threads, notification systems | Just say it out loud — 2-5 people, just talk; text in room serves coordination needs |
| Server discovery / public rooms | "Others should be able to find us" | Directly contradicts the privacy motivation; adds moderation concerns, legal exposure | Stay invite-only by design; share the link yourself |
| Message reactions (emoji) | Seems fun and Discord-like | Adds reaction storage, rendering complexity, and realtime sync for marginal value in a 2-5 person group | Simple emoji in text messages covers this; add reactions only if explicitly requested post-launch |
| Message editing and deletion | Feels expected | Requires message versioning/audit trail or hard deletes with sync; low value for small casual group | Keep messages immutable for v1; trivially addable later if needed |
| E2E encryption of voice | Privacy-focused users want it | Insertable Streams API (for E2E on WebRTC) is complex, has limited browser support, and adds key management overhead. Discord only introduced E2E in March 2026. | WebRTC DTLS already encrypts in transit between peers; add E2E as v2 if group demands it |
| TURN server always-on | "It should always work through NAT" | A TURN relay server requires bandwidth and a VPS — breaks the zero-budget constraint | Use STUN first (free via Google/Cloudflare STUN); document TURN setup as optional for problem NATs |
| Recording / VODs | "Save our sessions" | Legal gray area; storage cost; adds capture pipeline complexity; none of these concerns exist for video capture initiated by the user themselves | Users can use OBS or system-level recording tools independently |

---

## Feature Dependencies

```
[Invite Link Auth]
    └──required by──> [Any user can join]
                          └──required by──> [Voice Rooms]
                                                └──required by──> [Screen Sharing]
                                                └──required by──> [Camera/Video]
                                                └──required by──> [Soundboard]

[WebRTC Signaling Server]
    └──required by──> [Voice Rooms]
    └──required by──> [Screen Sharing]
    └──required by──> [Camera/Video]

[Websocket Server]
    └──required by──> [Text Chat]
    └──required by──> [Presence / Who Is In Room]
    └──required by──> [Speaking Indicators]
    └──required by──> [Soundboard triggers]

[Text Chat]
    └──enhanced by──> [File/Image Sharing]
    └──enhanced by──> [Persistent History]

[User Identity (display name + avatar)]
    └──required by──> [Speaking Indicators]
    └──required by──> [Room Presence List]
    └──required by──> [Text Chat attribution]

[Push-to-Talk]
    └──requires──> [Electron globalShortcut] (works outside app window)
    └──conflicts with──> [Open Mic] (must be a user toggle, not both simultaneously)

[Screen Sharing]
    └──requires──> [getDisplayMedia() in Electron]
    └──enhanced by──> [System audio capture]
    └──conflicts with──> [Camera/Video on same stream] (separate tracks, but bandwidth doubles)
```

### Dependency Notes

- **Voice Rooms require WebRTC Signaling Server:** The signaling server is the first infra piece that must be built; without it, WebRTC peers cannot find each other. This should be Phase 1 infrastructure.
- **Invite Link Auth required before any user joins:** Auth must be wired before the app is shareable with friends. It gates all other features.
- **Text Chat requires Websocket Server:** The same websocket server used for WebRTC signaling can handle text messages — these can be built together, not separately.
- **Speaking Indicators require Websocket presence + audio analysis:** Two separate systems must both work; the UI indicator depends on both real-time presence events and local audio level detection.
- **Screen Sharing conflicts with Camera at scale:** At 2-5 users this is manageable, but both active simultaneously doubles bandwidth through STUN/peer connections. Implement screen share first; camera second.
- **Push-to-Talk requires Electron globalShortcut:** This cannot be done in a plain web app; Electron is required to register hotkeys system-wide. This validates the Electron choice.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed for the friend group to actually use this instead of Discord.

- [ ] Voice rooms (always-on, drop in/out) — the entire reason this exists
- [ ] Mute / deafen / push-to-talk — without these, voice is unusable
- [ ] Speaking indicator — you need to see who is talking
- [ ] See who's in a room (presence) — fundamental awareness before joining
- [ ] Text chat per room (persistent) — links and memes are essential to how this group communicates
- [ ] File/image sharing — screenshots, game clips, memes
- [ ] Invite link auth (no registration, token-based) — frictionless onboarding
- [ ] User display name + avatar — basic identity
- [ ] Retro/gaming UI — this is the differentiation; without it, it's just an ugly Mumble clone
- [ ] Reconnect handling — home internet drops; the app must recover gracefully

### Add After Validation (v1.x)

Features to add once core voice + chat is working and friends are using it daily.

- [ ] Screen sharing — validated as the #2 use case (watching friends game); held from v1 only because voice stability must come first
- [ ] Per-user volume memory — small quality-of-life improvement; add when users complain about re-adjusting
- [ ] Custom room names / multiple rooms — start with 2-3 hardcoded rooms; let admin rename when needed
- [ ] Soundboard — fun differentiator; add when the group is comfortable with the app

### Future Consideration (v2+)

Features to defer until the v1 is stable and used.

- [ ] Camera/video — bandwidth-heavy; adds complexity to the WebRTC mesh; nice-to-have per PROJECT.md
- [ ] E2E encryption for voice — technically complex; DTLS encryption is already present; add if group demands it
- [ ] Web browser client — removes Electron dependency for joining; bridges mobile gap before native app
- [ ] Mobile app — separate codebase; only if Electron desktop is insufficient

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Always-on voice rooms | HIGH | HIGH | P1 |
| Mute / deafen / push-to-talk | HIGH | LOW | P1 |
| Speaking indicator | HIGH | MEDIUM | P1 |
| Room presence (who's in a room) | HIGH | LOW | P1 |
| Invite link auth | HIGH | MEDIUM | P1 |
| Text chat (persistent) | HIGH | MEDIUM | P1 |
| File / image sharing | HIGH | MEDIUM | P1 |
| User display name + avatar | MEDIUM | LOW | P1 |
| Retro/gaming UI | HIGH | MEDIUM | P1 |
| Reconnect handling | HIGH | MEDIUM | P1 |
| Screen sharing | HIGH | HIGH | P2 |
| Per-user volume memory | MEDIUM | LOW | P2 |
| Custom room names | MEDIUM | LOW | P2 |
| Soundboard | MEDIUM | MEDIUM | P2 |
| Camera/video | MEDIUM | HIGH | P3 |
| E2E voice encryption | LOW | HIGH | P3 |
| Web browser client | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (v1)
- P2: Should have, add after v1 is stable
- P3: Nice to have, future consideration (v2+)

---

## Competitor Feature Analysis

| Feature | Discord | Mumble | Revolt (self-hosted) | Our Approach |
|---------|---------|--------|----------------------|--------------|
| Always-on voice rooms | Yes | Yes | Yes | Yes — core feature |
| Screen sharing quality | 1080p/60fps (Nitro only; 720p/30fps free) | No | Limited | Unlimited — self-hosted removes the paywall |
| Text chat in voice | Yes | No | Yes | Yes — persistent SQLite |
| File sharing | 10 MB free (500 MB Nitro) | No | Yes | Configurable limit — self-hosted = no artificial cap |
| Invite links | Yes | Manual config | Yes | Yes — token-based, no registration |
| Noise suppression | Yes (Krisp AI) | Yes (basic) | Limited | Basic (browser native); AI suppression is v2 |
| Speaking indicator | Yes | Yes | Yes | Yes |
| Push-to-talk | Yes | Yes | Yes | Yes (Electron globalShortcut) |
| Camera/video | Yes | No | Limited | v1.x nice-to-have |
| Retro/gaming UI | No — corporate | No — minimal | No — Discord clone | Yes — core differentiator |
| Privacy | No — corporate data | Yes | Yes | Yes — fully self-hosted, local disk |
| Zero cost | No | Hosting cost | Hosting cost | Yes — runs on host's PC |
| Mobile | Yes | Yes | Yes | No — v1 desktop only |
| Bots | Yes | No | Yes | No — deliberately excluded |
| Roles / permissions | Complex | Basic | Complex | Flat — everyone equal |

---

## Sources

- [Discord Review 2026 - Pumble](https://pumble.com/reviews/discord-review) — feature completeness, file size limits, voice channel behavior
- [Discord Go Live and Screen Share documentation](https://support.discord.com/hc/en-us/articles/360040816151-Go-Live-and-Screen-Share) — resolution/fps tiers (720p free vs 1080p Nitro)
- [Self-hosted Discord alternatives - How-To Geek](https://www.howtogeek.com/5-self-hosted-discord-alternatives-that-are-actually-great/) — Mumble, Revolt, Matrix, TeamSpeak feature comparison
- [Voice Channels FAQ - Discord](https://support.discord.com/hc/en-us/articles/19583625604887-Voice-Channels-FAQs) — always-on behavior, drop-in/out UX
- [Key Features for Building a Voice Chat App 2025 - Digittrix](https://www.digittrix.com/blogs/top-features-to-include-in-a-voice-chat-app-in-2025) — speaking indicators, mute/deafen UX patterns
- [VoIP for Gaming: Low-Latency Voice Chat Solutions - Medium](https://medium.com/@justin.edgewoods/voip-for-gaming-low-latency-voice-chat-solutions-in-2025-03bd080fda2e) — push-to-talk vs open mic, latency requirements
- [How-To Geek self-hosted alternatives](https://www.howtogeek.com/5-self-hosted-discord-alternatives-that-are-actually-great/) — Mumble audio codec, Nextcloud Talk screen sharing
- [Discord patch notes Feb 2026](https://discord.com/blog/discord-patch-notes-february-4-2026) — E2E encryption rollout timeline (March 2026)

---
*Feature research for: Private self-hosted voice chat / gaming friend group app*
*Researched: 2026-03-01*
