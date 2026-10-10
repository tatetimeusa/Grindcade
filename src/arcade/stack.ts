import { ARCADE_SIZE as S, type GameDef } from './types';
import { stackTrack } from './tracks';

// STACK: a slab slides back and forth over the tower. Drop it; whatever hangs
// past the slab below is sliced off and falls, so the next one is narrower.
// Land it dead on and nothing is lost. Miss the tower and it's over.

const SLAB_H = 18;
const BASE_W = 200;
const BASE_Y = S - 40; // top of the base slab before the view scrolls
const PERFECT = 4; // units of slack that still count as dead on
const GROW_EVERY = 3; // perfect drops in a row that win back some width
const GROW_BY = 12;
const COLORS = ['#3ee5ff', '#f18dff', '#5cf593', '#ffc052', '#bda6ff', '#ff8797', '#b8f24a', '#ffa652', '#ffe66e'];

type Slab = { x: number; w: number; color: string };
type Chip = { x: number; y: number; w: number; vy: number; color: string };

const DROP_KEYS = new Set(['Enter', 'ArrowDown', 's', 'S']);

export const stack: GameDef = {
  id: 'stack',
  name: 'STACK',
  controls: 'Enter or ↓ to drop',
  music: stackTrack,
  create: (ctx, hooks) => {
    let tower: Slab[] = [];
    let moving: Slab = { x: 0, w: BASE_W, color: COLORS[1] };
    let dir = 1;
    let speed = 0;
    let chips: Chip[] = [];
    let view = 0; // how far the camera has risen
    let combo = 0;
    let note: { text: string; t: number } | null = null;
    let fallen: Chip | null = null; // the slab that missed, falling away

    // screen y of the top of the slab at height index i
    const slabY = (i: number) => BASE_Y - i * SLAB_H + view;

    const nextSlab = () => {
      const top = tower[tower.length - 1];
      dir = tower.length % 2 ? 1 : -1;
      moving = {
        x: dir > 0 ? -top.w : S,
        w: top.w,
        color: COLORS[tower.length % COLORS.length],
      };
      speed = Math.min(430, 150 + tower.length * 7);
    };

    const drop = () => {
      const top = tower[tower.length - 1];
      const y = slabY(tower.length);
      let left = Math.max(moving.x, top.x);
      let right = Math.min(moving.x + moving.w, top.x + top.w);
      if (right - left <= 0) {
        fallen = { x: moving.x, y, w: moving.w, vy: 0, color: moving.color };
        hooks.gameOver();
        return;
      }
      if (Math.abs(moving.x - top.x) <= PERFECT) {
        // dead on: snap to the slab below, nothing sliced
        left = top.x;
        right = top.x + top.w;
        combo++;
        if (combo % GROW_EVERY === 0) {
          left = Math.max(0, left - GROW_BY / 2);
          right = Math.min(S, right + GROW_BY / 2);
          note = { text: 'PERFECT  +WIDTH', t: 0.9 };
        } else {
          note = { text: combo > 1 ? `PERFECT x${combo}` : 'PERFECT', t: 0.7 };
        }
      } else {
        combo = 0;
        // the part hanging off either side breaks away
        if (moving.x < left) chips.push({ x: moving.x, y, w: left - moving.x, vy: 0, color: moving.color });
        if (moving.x + moving.w > right) {
          chips.push({ x: right, y, w: moving.x + moving.w - right, vy: 0, color: moving.color });
        }
      }
      tower.push({ x: left, w: right - left, color: moving.color });
      hooks.setScore(tower.length - 1);
      nextSlab();
    };

    const drawSlab = (x: number, y: number, w: number, color: string, glow: number, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `${color}33`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 * glow;
      ctx.fillRect(x, y, w, SLAB_H - 2);
      ctx.strokeRect(x + 1, y + 1, w - 2, SLAB_H - 4);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    return {
      reset: () => {
        tower = [{ x: (S - BASE_W) / 2, w: BASE_W, color: COLORS[0] }];
        chips = [];
        view = 0;
        combo = 0;
        note = null;
        fallen = null;
        nextSlab();
        hooks.setScore(0);
      },

      update: (dtMs) => {
        const dt = dtMs / 1000;
        moving.x += dir * speed * dt;
        if (moving.x + moving.w > S + moving.w * 0.25 && dir > 0) dir = -1;
        if (moving.x < -moving.w * 0.25 && dir < 0) dir = 1;

        // keep the top of the tower around the middle of the screen
        const want = Math.max(0, tower.length * SLAB_H - (BASE_Y - S * 0.45));
        view += (want - view) * Math.min(1, dt * 6);

        for (const c of chips) {
          c.vy += 900 * dt;
          c.y += c.vy * dt;
        }
        chips = chips.filter((c) => c.y < S + 40);
        if (note) note.t -= dt;
        if (note && note.t <= 0) note = null;
      },

      draw: (glow) => {
        const bg = ctx.createLinearGradient(0, 0, 0, S);
        bg.addColorStop(0, '#070312');
        bg.addColorStop(1, '#14061f');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, S, S);

        // faint grid that rises with the tower
        ctx.strokeStyle = 'rgba(62, 229, 255, 0.07)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= S; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, S);
          ctx.stroke();
        }
        const off = view % 30;
        for (let y = off; y <= S; y += 30) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(S, y);
          ctx.stroke();
        }

        tower.forEach((sl, i) => {
          const y = slabY(i);
          if (y > S || y < -SLAB_H) return;
          drawSlab(sl.x, y, sl.w, sl.color, glow, i === 0 ? 0.7 : 1);
        });
        for (const c of chips) drawSlab(c.x, c.y, c.w, c.color, glow, 0.6);
        if (fallen) drawSlab(fallen.x, fallen.y, fallen.w, fallen.color, glow, 0.6);
        else drawSlab(moving.x, slabY(tower.length), moving.w, moving.color, glow);

        if (note) {
          ctx.globalAlpha = Math.min(1, note.t * 3);
          ctx.fillStyle = '#ffe66e';
          ctx.shadowColor = '#ffe66e';
          ctx.shadowBlur = 12 * glow;
          ctx.font = 'bold 16px "Cascadia Code", Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(note.text, S / 2, 40);
          ctx.textAlign = 'start';
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      },

      // the music fills out as the tower climbs; full band by 30 slabs
      intensity: () => Math.min(1, (tower.length - 1) / 30),

      key: (k) => {
        if (!DROP_KEYS.has(k)) return false;
        drop();
        return true;
      },
    };
  },
};
