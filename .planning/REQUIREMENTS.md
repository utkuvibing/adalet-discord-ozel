# Requirements: Sex Dungeon

**Defined:** 2026-03-01
**Core Value:** Friends can hop into a private voice room anytime and hang out — no company owns the data, no one's listening, it's completely yours.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Voice & Communication

- [x] **VOIC-01**: User can see available voice rooms and drop into any room instantly
- [ ] **VOIC-02**: User can mute their microphone while staying in the room
- [ ] **VOIC-03**: User can deafen (stop hearing all audio) while staying in the room
- [ ] **VOIC-04**: User can use push-to-talk with a configurable hotkey (works even when app is not focused)
- [ ] **VOIC-05**: User can see who is currently speaking via a visual indicator
- [ ] **VOIC-06**: User can adjust each friend's volume independently
- [x] **VOIC-07**: User can see who is in each room before joining
- [x] **VOIC-08**: User's connection auto-reconnects after WiFi drops without manual intervention

### Text & Sharing

- [x] **TEXT-01**: User can send text messages in a room's chat that persist across sessions
- [x] **TEXT-02**: User can see message history when joining a room
- [x] **TEXT-03**: User can share images and files with others in the room
- [x] **TEXT-04**: User can view shared images inline in chat

### Screen Sharing

- [ ] **SCRN-01**: User can share their screen or a specific window with a picker UI
- [ ] **SCRN-02**: Screen share runs at gaming-optimized quality (up to 1080p/30fps) with no artificial paywall
- [ ] **SCRN-03**: User can capture and share system audio (game sounds) alongside screen share

### Identity & Auth

- [x] **AUTH-01**: Host can generate invite links that friends use to join
- [x] **AUTH-02**: User can set a display name and avatar on first join
- [x] **AUTH-03**: User stays logged in across app restarts (session persistence)
- [x] **AUTH-04**: Invite links expire after a configurable time period

### UI & Experience

- [ ] **UI-01**: App has a retro/gaming aesthetic (pixel art, neon colors, arcade-style elements)
- [ ] **UI-02**: Host can create and name custom voice rooms

### Infrastructure

- [x] **INFR-01**: Server runs on host's own PC with zero external paid services
- [x] **INFR-02**: Friends connect via desktop app (Electron) to host's server
- [x] **INFR-03**: Voice/video flows peer-to-peer (WebRTC) — server never handles media
- [x] **INFR-04**: App works across different home networks (NAT traversal with STUN/TURN)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhancements

- **ENH-01**: Soundboard — play reaction sounds for everyone to hear
- **ENH-02**: CRT/scanline visual effects on the UI
- **ENH-03**: Camera/video support for face-to-face calls
- **ENH-04**: Message history search
- **ENH-05**: Web browser client (for friends without the desktop app)
- **ENH-06**: Audio device selection UI with hot-swap support

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Bot integrations | Infinite scope, not needed for 2-5 friends |
| Role-based permissions | Overkill for a small equal friend group |
| DMs / private messaging | Breaks small-group model — just talk in the room |
| Server discovery / public rooms | Contradicts privacy motivation |
| Mobile app | Desktop only for v1, separate codebase |
| Recording / VODs | Legal gray area, storage cost |
| E2E voice encryption | DTLS already encrypts in transit; Insertable Streams adds complexity |
| OAuth / third-party login | Invite links are simpler and more private |
| Message reactions / editing | Nice-to-have, not needed for basic chat |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFR-01 | Phase 1 — Foundation | Complete |
| INFR-02 | Phase 1 — Foundation | Complete |
| INFR-03 | Phase 1 — Foundation | Complete |
| INFR-04 | Phase 2 — Signaling and NAT Traversal | Complete |
| AUTH-01 | Phase 2 — Signaling and NAT Traversal | Complete |
| AUTH-04 | Phase 2 — Signaling and NAT Traversal | Complete |
| VOIC-01 | Phase 3 — Voice Chat | Complete |
| VOIC-02 | Phase 3 — Voice Chat | Pending |
| VOIC-03 | Phase 3 — Voice Chat | Pending |
| VOIC-04 | Phase 3 — Voice Chat | Pending |
| VOIC-05 | Phase 3 — Voice Chat | Pending |
| VOIC-06 | Phase 3 — Voice Chat | Pending |
| VOIC-07 | Phase 3 — Voice Chat | Complete |
| VOIC-08 | Phase 3 — Voice Chat | Complete |
| AUTH-02 | Phase 4 — Auth and Identity | Complete |
| AUTH-03 | Phase 4 — Auth and Identity | Complete |
| TEXT-01 | Phase 5 — Text Chat and File Sharing | Complete |
| TEXT-02 | Phase 5 — Text Chat and File Sharing | Complete |
| TEXT-03 | Phase 5 — Text Chat and File Sharing | Complete |
| TEXT-04 | Phase 5 — Text Chat and File Sharing | Complete |
| UI-01 | Phase 6 — Retro UI and Room Management | Pending |
| UI-02 | Phase 6 — Retro UI and Room Management | Pending |
| SCRN-01 | Phase 7 — Screen Sharing | Pending |
| SCRN-02 | Phase 7 — Screen Sharing | Pending |
| SCRN-03 | Phase 7 — Screen Sharing | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after roadmap creation — traceability complete*
