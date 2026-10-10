import { ARCADE_SIZE as S, type GameDef } from './types';
import { tunnelTrack } from './tracks';

// TUNNEL RUN: fly the boot intro's wireframe tunnel. Twelve lanes run around
// its square walls; the camera rolls so your ship is always at the bottom.
// Rings of barriers rush at you, each with a gap; slip through it.
//
// Cross-section coordinates run -1..1 on both axes (the tunnel wall is the
// square's edge). A point (x, y) at depth z lands at CX + x * F / z.

const CX = S / 2;
const CY = S / 2;
const F = 190;
const PLAYER_Z = 1.2;
const LANES = 12; // three per wall
const RING_GAP = 5; // depth between barrier rings
const BAR_DEPTH = 0.7;
const FAR_Z = 32;
const STEP_EVERY = 0.12; // seconds per lane while a key is held
const COLORS = ['#4ade80', '#86efac', '#22c55e', '#a3e635'];

type Pt = { x: number; y: number };
type Ring = { z: number; blocked: boolean[]; passed: boolean };

// the two ends of a lane on the square wall, going round clockwise
const laneEnds = (i: number): [Pt, Pt] => {
  const lane = ((i % LANES) + LANES) % LANES;
  const wall = Math.floor(lane / 3);
  const t0 = -1 + (lane % 3) * (2 / 3);
  const t1 = t0 + 2 / 3;
  const at = (t: number): Pt =>
    wall === 0 ? { x: t, y: 1 } : wall === 1 ? { x: 1, y: -t } : wall === 2 ? { x: -t, y: -1 } : { x: -1, y: t };
  return [at(t0), at(t1)];
};

const laneAngle = (i: number) => {
  const [a, b] = laneEnds(i);
  return Math.atan2((a.y + b.y) / 2, (a.x + b.x) / 2);
};

// shortest signed turn from angle a to angle b
const turn = (a: number, b: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const LEFT_KEYS = new Set(['ArrowLeft', 'a', 'A']);
const RIGHT_KEYS = new Set(['ArrowRight', 'd', 'D']);

export const tunnel: GameDef = {
  id: 'tunnel',
  name: 'TUNNEL RUN',
  controls: 'Left / Right or A / D to move around the tunnel',
  music: tunnelTrack,
  create: (ctx, hooks) => {
    let lane = 1; // bottom wall, middle
    let roll = 0; // camera roll, eases so the player's lane sits at the bottom
    let speed = 0;
    let t = 0;
    let phase = 0; // wireframe ring scroll
    let rings: Ring[] = [];
    let lastGap = 1; // centre lane of the previous ring's gap
    let passedCount = 0;
    let holdDir = 0;
    let holdFor = 0;
    let hit: Ring | null = null;

    const targetRoll = () => Math.PI / 2 - laneAngle(lane);

    const project = (p: Pt, z: number): Pt => {
      const c = Math.cos(roll);
      const s = Math.sin(roll);
      const x = p.x * c - p.y * s;
      const y = p.x * s + p.y * c;
      return { x: CX + (x * F) / z, y: CY + (y * F) / z };
    };

    const addRing = (z: number) => {
      // narrower gaps the longer you last, never fewer than three lanes
      const width = Math.max(3, 7 - Math.floor(t / 14));
      // the gap must be reachable in the time until this ring arrives
      const seconds = RING_GAP / Math.max(speed, 1);
      const reach = Math.max(1, Math.min(5, Math.floor(seconds / (STEP_EVERY + 0.03))));
      const shift = Math.round((Math.random() * 2 - 1) * reach);
      const centre = lastGap + shift;
      lastGap = ((centre % LANES) + LANES) % LANES;
      const blocked = Array.from({ length: LANES }, () => true);
      const first = centre - Math.floor(width / 2);
      for (let k = 0; k < width; k++) blocked[(((first + k) % LANES) + LANES) % LANES] = false;
      rings.push({ z, blocked, passed: false });
    };

    const move = (dir: number) => {
      lane = (lane + dir + LANES) % LANES;
    };

    const quad = (a: Pt, b: Pt, z0: number, z1: number) => {
      const p = [project(a, z0), project(b, z0), project(b, z1), project(a, z1)];
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.closePath();
    };

    const drawShip = (glow: number) => {
      const [a, b] = laneEnds(lane);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // a chevron lying on the wall, pointing down the tunnel
      const inward = { x: -mid.x * 0.08, y: -mid.y * 0.08 };
      const along = { x: (b.x - a.x) * 0.35, y: (b.y - a.y) * 0.35 };
      const nose = project({ x: mid.x + inward.x, y: mid.y + inward.y }, PLAYER_Z + 0.9);
      const l = project({ x: mid.x - along.x + inward.x, y: mid.y - along.y + inward.y }, PLAYER_Z);
      const r = project({ x: mid.x + along.x + inward.x, y: mid.y + along.y + inward.y }, PLAYER_Z);
      const tail = project({ x: mid.x + inward.x * 2, y: mid.y + inward.y * 2 }, PLAYER_Z + 0.25);
      ctx.fillStyle = hit ? '#ff4f6a' : 'rgba(62, 229, 255, 0.35)';
      ctx.strokeStyle = hit ? '#ff4f6a' : '#3ee5ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 16 * glow;
      ctx.beginPath();
      ctx.moveTo(nose.x, nose.y);
      ctx.lineTo(r.x, r.y);
      ctx.lineTo(tail.x, tail.y);
      ctx.lineTo(l.x, l.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    return {
      reset: () => {
        lane = 1;
        roll = targetRoll();
        speed = 7;
        t = 0;
        phase = 0;
        rings = [];
        lastGap = 1;
        passedCount = 0;
        holdDir = 0;
        holdFor = 0;
        hit = null;
        for (let z = 14; z < FAR_Z; z += RING_GAP) addRing(z);
        hooks.setScore(0);
      },

      update: (dtMs) => {
        const dt = dtMs / 1000;
        t += dt;
        speed = Math.min(19, 7 + t * 0.22);
        phase = (phase + speed * dt) % 1.6;

        if (holdDir) {
          holdFor += dt;
          while (holdFor >= STEP_EVERY) {
            holdFor -= STEP_EVERY;
            move(holdDir);
          }
        }
        roll += turn(roll, targetRoll()) * Math.min(1, dt * 12);

        for (const r of rings) r.z -= speed * dt;
        for (const r of rings) {
          if (r.passed || r.z > PLAYER_Z + 0.15 || r.z + BAR_DEPTH < PLAYER_Z - 0.15) continue;
          if (r.blocked[lane]) {
            hit = r;
            hooks.gameOver();
            return;
          }
        }
        for (const r of rings) {
          if (!r.passed && r.z + BAR_DEPTH < PLAYER_Z - 0.15) {
            r.passed = true;
            passedCount++;
            hooks.setScore(passedCount * 10);
          }
        }
        rings = rings.filter((r) => r.z + BAR_DEPTH > 0.5);
        const farthest = rings.reduce((m, r) => Math.max(m, r.z), 0);
        if (farthest < FAR_Z - RING_GAP) addRing(farthest + RING_GAP);
      },

      draw: (glow) => {
        ctx.fillStyle = '#04060a';
        ctx.fillRect(0, 0, S, S);
        const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, S * 0.55);
        g.addColorStop(0, 'rgba(74, 222, 128, 0.16)');
        g.addColorStop(1, 'rgba(4, 6, 10, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);

        const corners: Pt[] = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];

        // lane lines along the walls
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.18)';
        for (let i = 0; i < LANES; i++) {
          const [a] = laneEnds(i);
          const n = project(a, 0.9);
          const f = project(a, FAR_Z);
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(f.x, f.y);
          ctx.stroke();
        }

        // wireframe rings scrolling toward you, like the intro
        ctx.lineJoin = 'round';
        for (let k = 0; k < 22; k++) {
          const z = 0.9 + k * 1.6 - phase;
          if (z < 0.9) continue;
          const near = Math.max(0, 1 - z / FAR_Z);
          const c = COLORS[k % COLORS.length];
          ctx.globalAlpha = Math.min(1, 0.12 + near * near * 1.1);
          ctx.strokeStyle = c;
          ctx.lineWidth = Math.max(1, near * 3);
          ctx.shadowColor = c;
          ctx.shadowBlur = near * 14 * glow;
          ctx.beginPath();
          corners.forEach((p, i) => {
            const q = project(p, z);
            if (i === 0) ctx.moveTo(q.x, q.y);
            else ctx.lineTo(q.x, q.y);
          });
          ctx.closePath();
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // barriers, far first
        const sorted = [...rings].sort((a, b) => b.z - a.z);
        const drawRing = (r: Ring) => {
          const near = Math.max(0, 1 - r.z / FAR_Z);
          for (let i = 0; i < LANES; i++) {
            if (!r.blocked[i]) continue;
            const [a, b] = laneEnds(i);
            const z0 = Math.max(0.9, r.z);
            const z1 = r.z + BAR_DEPTH;
            if (z1 <= 0.9) continue;
            const red = r === hit && i === lane;
            ctx.globalAlpha = Math.min(1, 0.25 + near * 1.1);
            ctx.fillStyle = red ? 'rgba(255, 79, 106, 0.7)' : 'rgba(241, 141, 255, 0.28)';
            ctx.strokeStyle = red ? '#ff4f6a' : '#f18dff';
            ctx.lineWidth = Math.max(1, near * 2.5);
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = near * 12 * glow;
            quad(a, b, z0, z1);
            ctx.fill();
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
        };
        for (const r of sorted) if (r.z >= PLAYER_Z) drawRing(r);
        drawShip(glow);
        for (const r of sorted) if (r.z < PLAYER_Z) drawRing(r);

        ctx.fillStyle = 'rgba(219, 230, 245, 0.85)';
        ctx.font = '12px "Cascadia Code", Consolas, monospace';
        ctx.fillText(`${Math.round(speed * 20)} km/h`, 10, S - 10);
      },

      intensity: () => (speed - 7) / (19 - 7),

      key: (k) => {
        const dir = LEFT_KEYS.has(k) ? -1 : RIGHT_KEYS.has(k) ? 1 : 0;
        if (!dir) return false;
        move(dir);
        holdDir = dir;
        holdFor = -0.12; // a beat before a held key starts repeating
        return true;
      },
      keyUp: (k) => {
        if ((LEFT_KEYS.has(k) && holdDir < 0) || (RIGHT_KEYS.has(k) && holdDir > 0)) holdDir = 0;
      },
      releaseKeys: () => {
        holdDir = 0;
      },
    };
  },
};
