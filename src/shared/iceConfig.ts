// ICE server configuration for WebRTC peer connections.
//
// DNS lookups can fail intermittently in Chromium/Electron and immediately
// destabilize candidate gathering. Keep this list IP-only so ICE can proceed
// even when host resolution is flaky.

const OPEN_RELAY_USERNAME = 'openrelayproject';
const OPEN_RELAY_CREDENTIAL = 'openrelayproject';

export const ICE_SERVERS: RTCIceServer[] = [
  // STUN (Google public STUN via direct IP).
  { urls: 'stun:74.125.250.129:19302' },

  // OpenRelay TURN node #1 (UDP + TCP variants).
  {
    urls: 'turn:15.235.47.158:3478',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:15.235.47.158:3478?transport=tcp',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:15.235.47.158:80',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:15.235.47.158:80?transport=tcp',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:15.235.47.158:443',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:15.235.47.158:443?transport=tcp',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },

  // OpenRelay TURN node #2 (UDP + TCP variants).
  {
    urls: 'turn:216.39.253.123:3478',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:216.39.253.123:3478?transport=tcp',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:216.39.253.123:80',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:216.39.253.123:80?transport=tcp',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:216.39.253.123:443',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
  {
    urls: 'turn:216.39.253.123:443?transport=tcp',
    username: OPEN_RELAY_USERNAME,
    credential: OPEN_RELAY_CREDENTIAL,
  },
];
