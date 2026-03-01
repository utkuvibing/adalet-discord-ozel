// ICE server configuration for WebRTC peer connections.
//
// STUN: Google public servers (free, handles ~85% of NAT types)
// TURN: Metered.ca Open Relay Project (free, 500MB/month, zero setup)
//
// Per research decision: avoids coturn Docker/WSL2 complexity on Windows host.
// These are the public Open Relay credentials from Metered.ca documentation.
// Sufficient for a 2-5 friend group. Users can supply their own TURN
// credentials in a future settings UI.

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:staticauth.openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayprojectsecret',
  },
  {
    urls: 'turn:staticauth.openrelay.metered.ca:80?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayprojectsecret',
  },
  {
    urls: 'turn:staticauth.openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayprojectsecret',
  },
  {
    urls: 'turns:staticauth.openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayprojectsecret',
  },
];
