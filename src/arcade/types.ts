// The ARCADE cabinet runs any game that fits this shape. The cabinet owns the
// break-time clock, start/pause, the overlays and the best scores; a game only
// simulates, draws on its canvas and reports its score.

import type { Track } from './music';

// every game draws in the same 420-unit square; the cabinet scales it to fit
export const ARCADE_SIZE = 420;

export interface GameHooks {
  setScore: (n: number) => void;
  gameOver: () => void;
}

export interface Game {
  reset: () => void; // back to the start position, ready to play
  update: (dtMs: number) => void; // advance the simulation (only called while playing)
  // glow multiplies every shadowBlur: 0 with FX off, otherwise the board's
  // scale, since canvas shadows ignore the drawing scale
  draw: (glow: number) => void;
  key: (key: string) => boolean; // true when the game used the key
  // games that care how long a key is held (a paddle) also get releases, and
  // releaseKeys when play stops so nothing stays held through a pause
  keyUp?: (key: string) => void;
  releaseKeys?: () => void;
  // 0..1, how hard the game is pushing right now; drives the music's tempo
  intensity?: () => number;
}

export interface GameDef {
  id: string;
  name: string;
  controls: string; // shown on the start screen
  music?: Track; // plays while the game runs, if MUSIC and SND are on
  create: (ctx: CanvasRenderingContext2D, hooks: GameHooks) => Game;
}
