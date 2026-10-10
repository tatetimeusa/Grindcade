import { ARCADE_SIZE as S, type GameDef } from './types';

// BRICKS: paddle, ball, a wall of neon bricks. Clear the wall for the next,
// faster one. Three balls. Some bricks drop a pickup: six help, two hurt
// (SHRINK and FAST, drawn in red) and are worth dodging.

const PADDLE_Y = S - 26;
const PADDLE_H = 10;
const PADDLE_W = 72;
const WIDE_W = 112;
const SHRINK_W = 46;
const PADDLE_SPEED = 430;
const BALL_R = 6;
const COLS = 8;
const BRICK_W = 46;
const BRICK_H = 15;
const GAP = 4;
const TOP = 48;
const LEFT = (S - (COLS * BRICK_W + (COLS - 1) * GAP)) / 2;
const ROW_COLORS = ['#ff8797', '#ffa652', '#ffc052', '#b8f24a', '#5cf593', '#3ee5ff', '#bda6ff', '#f18dff'];
const LIVES = 3;
const MAX_LIVES = 5;
const DROP_CHANCE = 0.14;
const LASER_GAP = 0.22; // seconds between shots while Up is held
const BOLT_SPEED = 620;
const STICK_HOLD = 2.5; // a stuck ball launches itself after this long

type Kind = 'wide' | 'multi' | 'slow' | 'laser' | 'sticky' | 'life' | 'shrink' | 'fast';

const PICKUPS: Record<Kind, { label: string; color: string; weight: number; seconds: number }> = {
  wide: { label: 'WIDE', color: '#3ee5ff', weight: 18, seconds: 12 },
  multi: { label: 'MULTI', color: '#f18dff', weight: 16, seconds: 0 },
  slow: { label: 'SLOW', color: '#5cf593', weight: 14, seconds: 8 },
  laser: { label: 'LASER', color: '#ffe66e', weight: 13, seconds: 8 },
  sticky: { label: 'STICKY', color: '#bda6ff', weight: 13, seconds: 12 },
  life: { label: '+1 BALL', color: '#ffffff', weight: 4, seconds: 0 },
  shrink: { label: 'SHRINK', color: '#ff4f6a', weight: 11, seconds: 10 },
  fast: { label: 'FAST', color: '#ff4f6a', weight: 11, seconds: 8 },
};
const KINDS = Object.keys(PICKUPS) as Kind[];
const TOTAL_WEIGHT = KINDS.reduce((n, k) => n + PICKUPS[k].weight, 0);

const pickKind = (): Kind => {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const k of KINDS) {
    r -= PICKUPS[k].weight;
    if (r <= 0) return k;
  }
  return 'wide';
};

type Ball = { x: number; y: number; vx: number; vy: number; stuck: number | null; stuckFor: number };
type Brick = { x: number; y: number; hp: number; color: string; points: number };
type Drop = { x: number; y: number; kind: Kind };
type Bolt = { x: number; y: number };

const LEFT_KEYS = new Set(['ArrowLeft', 'a', 'A']);
const RIGHT_KEYS = new Set(['ArrowRight', 'd', 'D']);
const UP_KEYS = new Set(['ArrowUp', 'w', 'W']);

export const bricks: GameDef = {
  id: 'bricks',
  name: 'BRICKS',
  controls: 'Left / Right to move · Up to fire or launch',
  create: (ctx, hooks) => {
    let px = S / 2; // paddle centre
    let balls: Ball[] = [];
    let wall: Brick[] = [];
    let drops: Drop[] = [];
    let bolts: Bolt[] = [];
    let level = 1;
    let lives = LIVES;
    let score = 0;
    let serveIn = 0; // seconds until the ball on the paddle launches
    let held = { left: false, right: false, up: false };
    let reload = 0;
    // seconds left on each timed pickup
    let timers: Record<'wide' | 'shrink' | 'slow' | 'fast' | 'laser' | 'sticky', number> = {
      wide: 0, shrink: 0, slow: 0, fast: 0, laser: 0, sticky: 0,
    };

    const paddleW = () => (timers.shrink > 0 ? SHRINK_W : timers.wide > 0 ? WIDE_W : PADDLE_W);
    const ballSpeed = () => Math.min(400, 250 + (level - 1) * 30);
    const pace = () => (timers.slow > 0 ? 0.65 : timers.fast > 0 ? 1.4 : 1);

    const buildWall = () => {
      const rows = Math.min(8, 4 + level);
      wall = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          // from level 2, every other brick in the top row takes two hits
          const tough = level >= 2 && r === 0 && c % 2 === 0;
          wall.push({
            x: LEFT + c * (BRICK_W + GAP),
            y: TOP + r * (BRICK_H + GAP),
            hp: tough ? 2 : 1,
            color: ROW_COLORS[r % ROW_COLORS.length],
            points: (rows - r) * 5 + 5,
          });
        }
      }
    };

    const clearPickups = () => {
      timers = { wide: 0, shrink: 0, slow: 0, fast: 0, laser: 0, sticky: 0 };
      drops = [];
      bolts = [];
    };

    // a ball resting on the paddle, launched after a short pause
    const serve = () => {
      balls = [{ x: px, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: null, stuckFor: 0 }];
      serveIn = 0.8;
    };

    const launchAt = (b: Ball, angleDeg: number) => {
      const a = angleDeg * (Math.PI / 180);
      b.vx = Math.sin(a) * ballSpeed();
      b.vy = -Math.cos(a) * ballSpeed();
    };

    // a stuck ball leaves at the angle its spot on the paddle gives it
    const release = (b: Ball) => {
      if (b.stuck == null) return;
      const off = Math.max(-1, Math.min(1, b.stuck / (paddleW() / 2)));
      launchAt(b, off * 60);
      b.stuck = null;
    };

    const breakBrick = (br: Brick) => {
      br.hp--;
      if (br.hp > 0) return;
      score += br.points;
      if (Math.random() < DROP_CHANCE) drops.push({ x: br.x + BRICK_W / 2, y: br.y + BRICK_H, kind: pickKind() });
    };

    const hitBrick = (b: Ball): boolean => {
      for (const br of wall) {
        if (br.hp <= 0) continue;
        const nx = Math.max(br.x, Math.min(b.x, br.x + BRICK_W));
        const ny = Math.max(br.y, Math.min(b.y, br.y + BRICK_H));
        const dx = b.x - nx;
        const dy = b.y - ny;
        if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
        // bounce off the side we came through: the shallower overlap
        const overlapX = BALL_R - Math.abs(dx);
        const overlapY = BALL_R - Math.abs(dy);
        if (dx !== 0 && (dy === 0 || overlapX < overlapY)) {
          b.vx = Math.sign(dx) * Math.abs(b.vx);
          b.x = nx + Math.sign(dx) * BALL_R;
        } else if (dy !== 0) {
          b.vy = Math.sign(dy) * Math.abs(b.vy);
          b.y = ny + Math.sign(dy) * BALL_R;
        } else {
          b.vy = -b.vy; // centre already inside the brick: just turn back
        }
        breakBrick(br);
        return true;
      }
      return false;
    };

    const moveBall = (b: Ball, dt: number) => {
      if (b.stuck != null) {
        b.x = px + b.stuck;
        b.y = PADDLE_Y - BALL_R;
        b.stuckFor += dt;
        if (b.stuckFor >= STICK_HOLD) release(b);
        return;
      }
      const f = pace();
      // small steps so a fast ball can't skip through a brick
      const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * f * dt) / 4));
      for (let i = 0; i < steps; i++) {
        b.x += (b.vx * f * dt) / steps;
        b.y += (b.vy * f * dt) / steps;
        if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
        if (b.x > S - BALL_R) { b.x = S - BALL_R; b.vx = -Math.abs(b.vx); }
        if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }
        // paddle: where it lands decides the angle, up to 60 degrees off vertical
        const half = paddleW() / 2;
        if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y + BALL_R <= PADDLE_Y + PADDLE_H + 4 && Math.abs(b.x - px) <= half + BALL_R) {
          if (timers.sticky > 0) {
            b.stuck = Math.max(-half, Math.min(half, b.x - px));
            b.stuckFor = 0;
            b.vx = 0;
            b.vy = 0;
            b.y = PADDLE_Y - BALL_R;
            return;
          }
          const off = Math.max(-1, Math.min(1, (b.x - px) / half));
          launchAt(b, off * 60);
          b.y = PADDLE_Y - BALL_R;
        }
        hitBrick(b);
      }
    };

    const catchDrop = (kind: Kind) => {
      const p = PICKUPS[kind];
      switch (kind) {
        case 'multi': {
          const src = balls.find((b) => b.stuck == null && (b.vx || b.vy));
          if (!src) break;
          for (const turn of [-0.45, 0.45]) {
            const a = Math.atan2(src.vy, src.vx) + turn;
            const sp = Math.hypot(src.vx, src.vy);
            balls.push({ x: src.x, y: src.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, stuck: null, stuckFor: 0 });
          }
          break;
        }
        case 'life':
          lives = Math.min(MAX_LIVES, lives + 1);
          break;
        // opposites cancel: catching one ends the other
        case 'wide': timers.shrink = 0; timers.wide = p.seconds; break;
        case 'shrink': timers.wide = 0; timers.shrink = p.seconds; break;
        case 'slow': timers.fast = 0; timers.slow = p.seconds; break;
        case 'fast': timers.slow = 0; timers.fast = p.seconds; break;
        case 'laser': timers.laser = p.seconds; break;
        case 'sticky': timers.sticky = p.seconds; break;
      }
    };

    const fire = () => {
      const half = paddleW() / 2;
      bolts.push({ x: px - half + 6, y: PADDLE_Y }, { x: px + half - 6, y: PADDLE_Y });
      reload = LASER_GAP;
    };

    const drawBrick = (br: Brick, glow: number) => {
      const c = br.hp > 1 ? '#ffffff' : br.color;
      ctx.fillStyle = `${br.color}${br.hp > 1 ? '66' : '2e'}`;
      ctx.strokeStyle = c;
      ctx.lineWidth = br.hp > 1 ? 2 : 1.5;
      ctx.shadowColor = br.color;
      ctx.shadowBlur = 8 * glow;
      ctx.fillRect(br.x, br.y, BRICK_W, BRICK_H);
      ctx.strokeRect(br.x + 0.75, br.y + 0.75, BRICK_W - 1.5, BRICK_H - 1.5);
    };

    return {
      reset: () => {
        px = S / 2;
        level = 1;
        lives = LIVES;
        score = 0;
        reload = 0;
        held = { left: false, right: false, up: false };
        clearPickups();
        buildWall();
        serve();
        hooks.setScore(0);
      },

      update: (dtMs) => {
        const dt = dtMs / 1000;
        const dirX = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        const half = paddleW() / 2;
        px = Math.max(half, Math.min(S - half, px + dirX * PADDLE_SPEED * dt));
        for (const k of Object.keys(timers) as (keyof typeof timers)[]) timers[k] = Math.max(0, timers[k] - dt);
        reload = Math.max(0, reload - dt);

        if (serveIn > 0) {
          serveIn -= dt;
          balls[0].x = px;
          if (serveIn <= 0) launchAt(balls[0], Math.random() * 40 - 20);
        } else {
          for (const b of balls) moveBall(b, dt);
        }

        // lasers: hold Up to keep firing
        if (held.up && timers.laser > 0 && reload <= 0) fire();
        for (const bo of bolts) bo.y -= BOLT_SPEED * dt;
        bolts = bolts.filter((bo) => {
          if (bo.y < 0) return false;
          const br = wall.find((w) => w.hp > 0 && bo.x >= w.x && bo.x <= w.x + BRICK_W && bo.y >= w.y && bo.y <= w.y + BRICK_H);
          if (!br) return true;
          breakBrick(br);
          return false;
        });

        // pickups fall; catch the good ones, dodge the red ones
        for (const d of drops) d.y += 140 * dt;
        drops = drops.filter((d) => {
          if (d.y >= PADDLE_Y && d.y <= PADDLE_Y + PADDLE_H + 8 && Math.abs(d.x - px) <= paddleW() / 2 + 8) {
            catchDrop(d.kind);
            return false;
          }
          return d.y < S + 10;
        });

        balls = balls.filter((b) => b.y < S + BALL_R);
        if (!balls.length) {
          lives--;
          if (lives <= 0) {
            hooks.setScore(score);
            hooks.gameOver();
            return;
          }
          clearPickups();
          serve();
        }

        wall = wall.filter((br) => br.hp > 0);
        if (!wall.length) {
          score += 100 * level;
          level++;
          buildWall();
          clearPickups();
          serve();
        }
        hooks.setScore(score);
      },

      draw: (glow) => {
        ctx.fillStyle = '#070a10';
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = 'rgba(241, 141, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= S; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, S);
          ctx.stroke();
        }

        for (const br of wall) drawBrick(br, glow);

        ctx.font = 'bold 9px "Cascadia Code", Consolas, monospace';
        ctx.textAlign = 'center';
        for (const d of drops) {
          const p = PICKUPS[d.kind];
          const w = d.kind === 'life' || d.kind === 'sticky' || d.kind === 'shrink' ? 44 : 36;
          ctx.strokeStyle = p.color;
          ctx.fillStyle = `${p.color}33`;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10 * glow;
          ctx.lineWidth = 1.5;
          ctx.fillRect(d.x - w / 2, d.y - 7, w, 14);
          ctx.strokeRect(d.x - w / 2, d.y - 7, w, 14);
          ctx.fillStyle = p.color;
          ctx.fillText(p.label, d.x, d.y + 3);
        }
        ctx.textAlign = 'start';

        ctx.fillStyle = '#ffe66e';
        ctx.shadowColor = '#ffe66e';
        ctx.shadowBlur = 8 * glow;
        for (const bo of bolts) ctx.fillRect(bo.x - 1.5, bo.y - 8, 3, 10);

        const w = paddleW();
        const paddleColor =
          timers.shrink > 0 ? '#ff4f6a' : timers.sticky > 0 ? '#bda6ff' : timers.wide > 0 ? '#3ee5ff' : '#b8f24a';
        ctx.fillStyle = paddleColor;
        ctx.shadowColor = paddleColor;
        ctx.shadowBlur = 14 * glow;
        ctx.fillRect(px - w / 2, PADDLE_Y, w, PADDLE_H);
        if (timers.laser > 0) {
          // gun barrels at each end
          ctx.fillStyle = '#ffe66e';
          ctx.fillRect(px - w / 2 + 4, PADDLE_Y - 5, 4, 5);
          ctx.fillRect(px + w / 2 - 8, PADDLE_Y - 5, 4, 5);
        }

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = timers.fast > 0 ? '#ff4f6a' : timers.slow > 0 ? '#5cf593' : '#f18dff';
        ctx.shadowBlur = 14 * glow;
        for (const b of balls) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(219, 230, 245, 0.85)';
        ctx.font = '12px "Cascadia Code", Consolas, monospace';
        ctx.fillText('●'.repeat(Math.max(0, lives)), 10, 22);
        ctx.textAlign = 'end';
        ctx.fillText(`LEVEL ${level}`, S - 10, 22);
        ctx.textAlign = 'start';

        // what's active and for how long, bottom left
        const active = (Object.keys(timers) as (keyof typeof timers)[]).filter((k) => timers[k] > 0);
        ctx.font = '10px "Cascadia Code", Consolas, monospace';
        active.forEach((k, i) => {
          ctx.fillStyle = PICKUPS[k].color;
          ctx.fillText(`${PICKUPS[k].label} ${Math.ceil(timers[k])}`, 10 + i * 66, S - 6);
        });
      },

      key: (k) => {
        if (LEFT_KEYS.has(k)) held.left = true;
        else if (RIGHT_KEYS.has(k)) held.right = true;
        else if (UP_KEYS.has(k)) {
          held.up = true;
          balls.forEach(release);
          if (timers.laser > 0 && reload <= 0) fire();
        } else return false;
        return true;
      },
      keyUp: (k) => {
        if (LEFT_KEYS.has(k)) held.left = false;
        if (RIGHT_KEYS.has(k)) held.right = false;
        if (UP_KEYS.has(k)) held.up = false;
      },
      releaseKeys: () => {
        held = { left: false, right: false, up: false };
      },
    };
  },
};
