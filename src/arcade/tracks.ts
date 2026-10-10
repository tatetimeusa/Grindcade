import type { Instrument, Note, Track } from './music';

// The arcade's soundtrack. Every track is four chords played over eight bars:
// bars 1-4 lay down the groove, bars 5-8 bring in the lead.

type Chord = { bass: number; arp: number[]; pad: number[] };
type LeadBar = [step: number, midi: number, steps: number][];

interface Spec {
  bpm: number;
  maxBpm: number;
  chords: Chord[]; // four, one per bar
  arp: (number | null)[]; // 16 steps: index into the chord's arp notes, null = rest
  bass: (step: number) => { up: boolean; steps: number } | null; // up = an octave higher
  kick: number[];
  snare: number[];
  hat: number[];
  lead: LeadBar[]; // four bars, played on bars 5-8
  // which instruments play at this intensity (all of them when left out)
  layers?: (intensity: number) => Instrument[];
}

const ALL: Instrument[] = ['bass', 'arp', 'pad', 'lead', 'kick', 'snare', 'hat'];

const track = (spec: Spec): Track => ({
  bpm: spec.bpm,
  maxBpm: spec.maxBpm,
  bars: 8,
  notes: (bar, step, intensity) => {
    const on = new Set(spec.layers ? spec.layers(intensity) : ALL);
    const chord = spec.chords[bar % 4];
    const out: Note[] = [];
    if (on.has('kick') && spec.kick.includes(step)) out.push({ inst: 'kick' });
    if (on.has('snare') && spec.snare.includes(step)) out.push({ inst: 'snare' });
    if (on.has('hat') && spec.hat.includes(step)) out.push({ inst: 'hat' });
    const b = on.has('bass') ? spec.bass(step) : null;
    if (b) out.push({ inst: 'bass', midi: chord.bass + (b.up ? 12 : 0), steps: b.steps });
    const a = spec.arp[step];
    if (on.has('arp') && a != null) out.push({ inst: 'arp', midi: chord.arp[a % chord.arp.length] });
    if (on.has('pad') && step === 0) for (const m of chord.pad) out.push({ inst: 'pad', midi: m, steps: 16 });
    if (on.has('lead') && bar >= 4) {
      for (const [s, midi, steps] of spec.lead[bar % 4]) if (s === step) out.push({ inst: 'lead', midi, steps });
    }
    return out;
  },
});

const UP_DOWN = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 1];

// NIGHT DRIVE: synthwave in A minor, Am - F - C - G.
export const nightDriveTrack = track({
  bpm: 112,
  maxBpm: 129,
  chords: [
    { bass: 33, arp: [69, 72, 76, 81], pad: [57, 60, 64] }, // Am
    { bass: 29, arp: [65, 69, 72, 77], pad: [53, 57, 60] }, // F
    { bass: 36, arp: [67, 72, 76, 79], pad: [55, 60, 64] }, // C
    { bass: 31, arp: [67, 71, 74, 79], pad: [55, 59, 62] }, // G
  ],
  arp: UP_DOWN,
  // driving 8ths, jumping up the octave on the off-beats
  bass: (s) => (s % 2 === 0 ? { up: s % 4 === 2, steps: 2 } : null),
  kick: [0, 4, 8, 12],
  snare: [4, 12],
  hat: [2, 6, 10, 14],
  lead: [
    [[0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 69, 4]],
    [[0, 72, 6], [6, 69, 2], [8, 65, 8]],
    [[0, 67, 4], [4, 72, 4], [8, 76, 6], [14, 74, 2]],
    [[0, 74, 8], [8, 71, 4], [12, 67, 4]],
  ],
});

// TUNNEL RUN: tense, E minor with the dark half-step up to F (Em - F - Em - D),
// a relentless 16th-note bass, hats on every off-16th.
export const tunnelTrack = track({
  bpm: 132,
  maxBpm: 150,
  chords: [
    { bass: 28, arp: [64, 67, 71, 76], pad: [52, 55, 59] }, // Em
    { bass: 29, arp: [65, 69, 72, 77], pad: [53, 57, 60] }, // F
    { bass: 28, arp: [64, 67, 71, 76], pad: [52, 55, 59] }, // Em
    { bass: 26, arp: [62, 66, 69, 74], pad: [50, 54, 57] }, // D
  ],
  arp: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 2, 1, 2, 3],
  bass: (s) => ({ up: s % 8 === 6, steps: 1 }),
  kick: [0, 4, 8, 12],
  snare: [4, 12],
  hat: [1, 3, 5, 7, 9, 11, 13, 15],
  lead: [
    [[0, 76, 3], [3, 77, 3], [6, 76, 2], [8, 71, 8]],
    [[0, 77, 6], [6, 76, 2], [8, 72, 8]],
    [[0, 76, 3], [3, 77, 3], [6, 79, 2], [8, 76, 8]],
    [[0, 74, 8], [8, 78, 4], [12, 74, 4]],
  ],
});

// STACK: calm and dreamy, Cmaj7 - Am7 - Fmaj7 - G. It starts as pads and a
// gentle arpeggio and adds bass, then drums, then a melody as the tower grows.
export const stackTrack = track({
  bpm: 96,
  maxBpm: 118,
  chords: [
    { bass: 36, arp: [67, 71, 72, 76], pad: [55, 59, 64] }, // Cmaj7
    { bass: 33, arp: [64, 67, 69, 72], pad: [55, 60, 64] }, // Am7
    { bass: 29, arp: [65, 69, 72, 76], pad: [57, 60, 64] }, // Fmaj7
    { bass: 31, arp: [62, 67, 71, 74], pad: [55, 59, 62] }, // G
  ],
  arp: [0, null, 1, null, 2, null, 3, null, 2, null, 1, null, 3, null, 2, null],
  bass: (s) => (s === 0 || s === 6 || s === 8 ? { up: s === 6, steps: s === 0 ? 6 : 2 } : null),
  kick: [0, 8],
  snare: [4, 12],
  hat: [2, 6, 10, 14],
  lead: [
    [[0, 76, 8], [8, 74, 8]],
    [[0, 72, 8], [8, 69, 8]],
    [[0, 72, 6], [6, 74, 2], [8, 76, 8]],
    [[0, 74, 16]],
  ],
  layers: (i) => [
    'pad',
    'arp',
    ...(i >= 0.2 ? (['bass', 'kick'] as const) : []),
    ...(i >= 0.45 ? (['snare', 'hat'] as const) : []),
    ...(i >= 0.7 ? (['lead'] as const) : []),
  ],
});

// BRICKS: bouncy and upbeat, G - D - Em - C, a syncopated bass that skips.
export const bricksTrack = track({
  bpm: 124,
  maxBpm: 140,
  chords: [
    { bass: 31, arp: [67, 71, 74, 79], pad: [55, 59, 62] }, // G
    { bass: 38, arp: [66, 69, 74, 78], pad: [54, 57, 62] }, // D
    { bass: 40, arp: [64, 67, 71, 76], pad: [52, 55, 59] }, // Em
    { bass: 36, arp: [64, 67, 72, 76], pad: [52, 55, 60] }, // C
  ],
  arp: [0, null, 2, 1, null, 3, 2, null, 0, null, 2, 1, null, 3, 1, 2],
  bass: (s) => ([0, 3, 6, 8, 11, 14].includes(s) ? { up: s === 6 || s === 14, steps: 2 } : null),
  kick: [0, 8, 10],
  snare: [4, 12],
  hat: [2, 6, 10, 14],
  lead: [
    [[0, 79, 2], [2, 78, 2], [4, 79, 2], [6, 74, 2], [8, 71, 4], [12, 74, 4]],
    [[0, 78, 2], [2, 76, 2], [4, 78, 2], [6, 74, 2], [8, 69, 8]],
    [[0, 76, 2], [2, 74, 2], [4, 76, 2], [6, 79, 2], [8, 83, 4], [12, 79, 4]],
    [[0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 71, 4]],
  ],
});

// SNAKE: a classic chiptune loop, Am - G - F - E, fast arpeggios and a
// bright lead, drums kept out of the way.
export const snakeTrack = track({
  bpm: 136,
  maxBpm: 156,
  chords: [
    { bass: 33, arp: [69, 72, 76], pad: [57, 60, 64] }, // Am
    { bass: 31, arp: [67, 71, 74], pad: [55, 59, 62] }, // G
    { bass: 29, arp: [65, 69, 72], pad: [53, 57, 60] }, // F
    { bass: 28, arp: [64, 68, 71], pad: [52, 56, 59] }, // E
  ],
  arp: [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1],
  bass: (s) => (s % 2 === 0 ? { up: s % 8 === 4, steps: 1 } : null),
  kick: [0, 8],
  snare: [4, 12],
  hat: [],
  lead: [
    [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 74, 2], [8, 76, 4], [12, 81, 4]],
    [[0, 79, 2], [2, 77, 2], [4, 76, 2], [6, 74, 2], [8, 71, 8]],
    [[0, 72, 2], [2, 74, 2], [4, 76, 2], [6, 77, 2], [8, 76, 4], [12, 72, 4]],
    [[0, 71, 4], [4, 68, 4], [8, 64, 8]],
  ],
  layers: () => ['bass', 'arp', 'lead', 'kick', 'snare'],
});
