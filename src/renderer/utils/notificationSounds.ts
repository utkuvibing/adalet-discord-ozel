// Stylized UI sounds for The Inn using Web Audio API (no external assets).
// Target profile: short medieval tavern + warm magical chime + clean UI feedback.

let audioCtx: AudioContext | null = null;
let incomingCallInterval: ReturnType<typeof setInterval> | null = null;

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      // Browser gesture policy may delay resume.
    });
  }
  return audioCtx;
}

function env(gain: GainNode, t: number, attack: number, decay: number, peak: number): void {
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(
  ctx: AudioContext,
  t: number,
  f: number,
  dur: number,
  wave: OscillatorType,
  vol: number,
  lpHz = 2600
): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();

  o.type = wave;
  o.frequency.setValueAtTime(f, t);
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(lpHz, t);
  lp.Q.value = 0.8;
  env(g, t, 0.006, dur, vol);

  o.connect(lp);
  lp.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function woodTap(ctx: AudioContext, t: number, vol = 0.05): void {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const decay = Math.exp(-i / (ctx.sampleRate * 0.004));
    data[i] = (Math.random() * 2 - 1) * decay * 0.65;
  }

  const src = ctx.createBufferSource();
  const hp = ctx.createBiquadFilter();
  const bp = ctx.createBiquadFilter();
  const g = ctx.createGain();

  src.buffer = buffer;
  hp.type = 'highpass';
  hp.frequency.value = 380;
  bp.type = 'bandpass';
  bp.frequency.value = 820;
  bp.Q.value = 1.3;
  env(g, t, 0.001, 0.05, vol);

  src.connect(hp);
  hp.connect(bp);
  bp.connect(g);
  g.connect(ctx.destination);
  src.start(t);
}

function metalPing(ctx: AudioContext, t: number, f = 1200, vol = 0.05): void {
  tone(ctx, t, f, 0.08, 'triangle', vol, 3600);
  tone(ctx, t + 0.01, f * 1.5, 0.06, 'sine', vol * 0.7, 4200);
}

function roomVerbHint(ctx: AudioContext, t: number, base = 420, vol = 0.03): void {
  tone(ctx, t, base, 0.13, 'sine', vol, 1500);
  tone(ctx, t + 0.04, base * 1.25, 0.1, 'sine', vol * 0.65, 1400);
}

// 1) Kanal giriş sesi ~0.2s: soft wood + warm magical chime
export function playJoinSound(): void {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    woodTap(ctx, t, 0.045);
    tone(ctx, t + 0.015, 660, 0.11, 'triangle', 0.075, 3000);
    tone(ctx, t + 0.05, 830, 0.09, 'sine', 0.06, 3600);
    metalPing(ctx, t + 0.04, 1320, 0.03);
    roomVerbHint(ctx, t + 0.02, 430, 0.022);
  } catch {
    // ignore audio failure
  }
}

// 2) Kanal çıkış sesi ~0.2s: wood close + muted descending chime
export function playLeaveSound(): void {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    woodTap(ctx, t, 0.04);
    tone(ctx, t + 0.01, 610, 0.1, 'triangle', 0.06, 2500);
    tone(ctx, t + 0.05, 470, 0.11, 'sine', 0.05, 2200);
    roomVerbHint(ctx, t + 0.03, 360, 0.018);
  } catch {
    // ignore audio failure
  }
}

// 3) Özel arama başlatma ~0.4s: lantern summon ring
export function playCallStartSound(): void {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    tone(ctx, t, 740, 0.13, 'triangle', 0.07, 3400);
    metalPing(ctx, t + 0.02, 1480, 0.045);
    tone(ctx, t + 0.15, 880, 0.12, 'sine', 0.06, 3600);
    tone(ctx, t + 0.26, 740, 0.1, 'triangle', 0.052, 3200);
    roomVerbHint(ctx, t + 0.04, 440, 0.02);
  } catch {
    // ignore audio failure
  }
}

function playIncomingCallRingOnce(): void {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    tone(ctx, t, 760, 0.1, 'triangle', 0.07, 3400);
    metalPing(ctx, t + 0.01, 1520, 0.05);
    tone(ctx, t + 0.13, 900, 0.09, 'sine', 0.058, 3600);
    roomVerbHint(ctx, t + 0.02, 470, 0.018);
  } catch {
    // ignore audio failure
  }
}

// 4) Incoming call repeating loop
export function startIncomingCallLoop(): void {
  if (incomingCallInterval) return;
  playIncomingCallRingOnce();
  incomingCallInterval = setInterval(() => {
    playIncomingCallRingOnce();
  }, 1150);
}

export function stopIncomingCallLoop(): void {
  if (!incomingCallInterval) return;
  clearInterval(incomingCallInterval);
  incomingCallInterval = null;
}

// 5) Arama kabul sesi ~0.15s: positive warm chime
export function playCallAcceptedSound(): void {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    tone(ctx, t, 784, 0.08, 'triangle', 0.07, 3600);
    tone(ctx, t + 0.03, 988, 0.07, 'sine', 0.055, 3900);
    metalPing(ctx, t + 0.01, 1568, 0.03);
  } catch {
    // ignore audio failure
  }
}

// 6) Mesaj gönderme ~0.1s: wood tap + tiny sparkle
export function playMessageSendSound(): void {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    woodTap(ctx, t, 0.032);
    tone(ctx, t + 0.012, 980, 0.04, 'sine', 0.032, 4200);
  } catch {
    // ignore audio failure
  }
}

// 7) Mesaj alma ~0.15s: warm short notification chime
export function playMessageReceiveSound(): void {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    tone(ctx, t, 698, 0.08, 'triangle', 0.055, 3200);
    tone(ctx, t + 0.035, 880, 0.07, 'sine', 0.048, 3600);
  } catch {
    // ignore audio failure
  }
}

