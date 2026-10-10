// Arcade music, synthesized live with the Web Audio API like the app's other
// sounds: no audio files, nothing to license, nothing to break in the packaged
// build. A track is a few bars of notes on a 16th-note grid; the engine plays
// them a little ahead of time on the audio clock so timing stays tight.

export type Instrument = 'bass' | 'arp' | 'pad' | 'lead' | 'kick' | 'snare' | 'hat';

// one note: which instrument, MIDI note number (ignored by drums), and how
// many 16th steps it lasts
export type Note = { inst: Instrument; midi?: number; steps?: number };

export interface Track {
  bpm: number; // at intensity 0
  maxBpm: number; // at intensity 1
  bars: number;
  // the notes that start on this 16th step (0..15) of this bar; intensity
  // (0..1) lets a track add layers as the game heats up
  notes: (bar: number, step: number, intensity: number) => Note[];
}

const LOOKAHEAD = 0.12; // seconds of notes scheduled ahead
const TICK_MS = 25;

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let pump: GainNode | null = null; // pad bus, ducked on every kick
let echo: GainNode | null = null; // send into the delay
let noise: AudioBuffer | null = null;
let timer: number | null = null;
let current: Track | null = null;
let intensity = 0;
let nextAt = 0;
let bar = 0;
let step = 0;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ac) ac = new AC();
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

// a fresh output chain per play, so stopping can fade and drop every tail
function buildChain(a: AudioContext) {
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  master = a.createGain();
  master.gain.value = 0.0001;
  master.gain.exponentialRampToValueAtTime(0.42, a.currentTime + 0.4);
  master.connect(comp).connect(a.destination);

  pump = a.createGain();
  pump.connect(master);

  const delay = a.createDelay(1);
  const feedback = a.createGain();
  const wet = a.createGain();
  feedback.gain.value = 0.32;
  wet.gain.value = 0.22;
  echo = a.createGain();
  echo.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(master);
  delay.delayTime.value = (60 / (current?.bpm ?? 120)) * 0.75; // dotted 8th

  if (!noise) {
    noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
}

function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return t + attack + hold + release;
}

function play(a: AudioContext, n: Note, t: number, stepLen: number) {
  if (!master || !pump || !echo) return;
  const len = (n.steps ?? 1) * stepLen;
  const f = n.midi != null ? hz(n.midi) : 0;

  switch (n.inst) {
    case 'bass': {
      const o = a.createOscillator();
      const filt = a.createBiquadFilter();
      const g = a.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f;
      filt.type = 'lowpass';
      filt.Q.value = 6;
      const top = 700 + intensity * 900;
      filt.frequency.setValueAtTime(top, t);
      filt.frequency.exponentialRampToValueAtTime(180, t + len * 0.9);
      const end = env(g, t, 0.2, 0.005, len * 0.55, len * 0.35);
      o.connect(filt).connect(g).connect(master);
      o.start(t);
      o.stop(end + 0.02);
      break;
    }
    case 'arp': {
      const o = a.createOscillator();
      const filt = a.createBiquadFilter();
      const g = a.createGain();
      o.type = 'square';
      o.frequency.value = f;
      filt.type = 'lowpass';
      filt.frequency.value = 2600;
      const end = env(g, t, 0.05, 0.003, 0.02, 0.13);
      o.connect(filt).connect(g);
      g.connect(master);
      g.connect(echo);
      o.start(t);
      o.stop(end + 0.02);
      break;
    }
    case 'pad': {
      const filt = a.createBiquadFilter();
      const g = a.createGain();
      filt.type = 'lowpass';
      filt.frequency.value = 1500;
      const end = env(g, t, 0.05, 0.35, Math.max(0, len - 0.5), 0.45);
      for (const cents of [-8, 8]) {
        const o = a.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        o.connect(filt);
        o.start(t);
        o.stop(end + 0.02);
      }
      filt.connect(g).connect(pump);
      break;
    }
    case 'lead': {
      const filt = a.createBiquadFilter();
      const g = a.createGain();
      const lfo = a.createOscillator();
      const depth = a.createGain();
      filt.type = 'lowpass';
      filt.frequency.value = 2400;
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(9, t + Math.min(0.25, len)); // vibrato eases in
      lfo.connect(depth);
      const end = env(g, t, 0.075, 0.02, Math.max(0, len - 0.12), 0.18);
      for (const [type, cents] of [['sawtooth', -5], ['square', 5]] as const) {
        const o = a.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = cents;
        depth.connect(o.detune);
        o.connect(filt);
        o.start(t);
        o.stop(end + 0.02);
      }
      lfo.start(t);
      lfo.stop(end + 0.02);
      filt.connect(g);
      g.connect(master);
      g.connect(echo);
      break;
    }
    case 'kick': {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const end = env(g, t, 0.9, 0.002, 0.02, 0.28);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(end + 0.02);
      // pads duck under the kick and swell back: the synthwave pump
      pump.gain.cancelScheduledValues(t);
      pump.gain.setValueAtTime(0.35, t);
      pump.gain.linearRampToValueAtTime(1, t + stepLen * 3);
      break;
    }
    case 'snare': {
      if (!noise) break;
      const src = a.createBufferSource();
      const bp = a.createBiquadFilter();
      const g = a.createGain();
      src.buffer = noise;
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 0.8;
      // a long, then cut, tail: the gated 80s snare
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.34, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.16);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.22);
      const body = a.createOscillator();
      const bg = a.createGain();
      body.type = 'triangle';
      body.frequency.value = 190;
      const end = env(bg, t, 0.18, 0.002, 0.01, 0.08);
      body.connect(bg).connect(master);
      body.start(t);
      body.stop(end + 0.02);
      break;
    }
    case 'hat': {
      if (!noise) break;
      const src = a.createBufferSource();
      const hp = a.createBiquadFilter();
      const g = a.createGain();
      src.buffer = noise;
      hp.type = 'highpass';
      hp.frequency.value = 7500;
      const end = env(g, t, 0.07, 0.001, 0.005, 0.04);
      src.connect(hp).connect(g).connect(master);
      src.start(t, Math.random() * 0.5);
      src.stop(end + 0.02);
      break;
    }
  }
}

function schedule() {
  const a = ac;
  const tr = current;
  if (!a || !tr) return;
  const bpm = tr.bpm + (tr.maxBpm - tr.bpm) * intensity;
  const stepLen = 60 / bpm / 4;
  while (nextAt < a.currentTime + LOOKAHEAD) {
    for (const n of tr.notes(bar, step, intensity)) play(a, n, nextAt, stepLen);
    nextAt += stepLen;
    step++;
    if (step === 16) {
      step = 0;
      bar = (bar + 1) % tr.bars;
    }
  }
}

export function startMusic(track: Track): void {
  if (current === track && timer != null) return;
  stopMusic(true);
  const a = audio();
  if (!a) return;
  current = track;
  intensity = 0;
  bar = 0;
  step = 0;
  buildChain(a);
  nextAt = a.currentTime + 0.06;
  schedule();
  timer = window.setInterval(schedule, TICK_MS);
}

// fade out and let go of every node; quick=true for a hard switch between tracks
export function stopMusic(quick = false): void {
  if (timer != null) window.clearInterval(timer);
  timer = null;
  current = null;
  const a = ac;
  const m = master;
  master = null;
  pump = null;
  echo = null;
  if (!a || !m) return;
  const fade = quick ? 0.05 : 0.35;
  m.gain.cancelScheduledValues(a.currentTime);
  m.gain.setValueAtTime(Math.max(0.0001, m.gain.value), a.currentTime);
  m.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + fade);
  window.setTimeout(() => m.disconnect(), (fade + 0.1) * 1000);
}

// 0 = the track's base tempo, 1 = its top tempo (and a brighter bass)
export function setMusicIntensity(i: number): void {
  intensity = Math.max(0, Math.min(1, i));
}
