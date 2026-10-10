import { ARCADE_SIZE, type GameDef } from './types';
import { snakeTrack } from './tracks';

const CELLS = 21;
const CELL = ARCADE_SIZE / CELLS; // 20px
const SPEED = 110; // ms per step

type P = { x: number; y: number };

const DIRS: Record<string, P> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

export const snake: GameDef = {
  id: 'snake',
  name: 'SNAKE',
  controls: 'Arrows / WASD to steer',
  music: snakeTrack,
  create: (ctx, hooks) => {
    let body: P[] = [];
    let dir: P = { x: 1, y: 0 };
    let nextDir: P = { x: 1, y: 0 };
    let food: P = { x: 5, y: 5 };
    let score = 0;
    let acc = 0; // ms banked toward the next step

    const randFood = (sn: P[]): P => {
      let p: P;
      do {
        p = { x: Math.floor(Math.random() * CELLS), y: Math.floor(Math.random() * CELLS) };
      } while (sn.some((s) => s.x === p.x && s.y === p.y));
      return p;
    };

    const step = () => {
      dir = nextDir;
      const head = body[0];
      const nh = { x: head.x + dir.x, y: head.y + dir.y };
      if (nh.x < 0 || nh.y < 0 || nh.x >= CELLS || nh.y >= CELLS) return hooks.gameOver();
      if (body.some((s) => s.x === nh.x && s.y === nh.y)) return hooks.gameOver();
      const next = [nh, ...body];
      if (nh.x === food.x && nh.y === food.y) {
        hooks.setScore(++score);
        food = randFood(next);
      } else {
        next.pop();
      }
      body = next;
    };

    return {
      reset: () => {
        const mid = Math.floor(CELLS / 2);
        body = [
          { x: mid, y: mid },
          { x: mid - 1, y: mid },
          { x: mid - 2, y: mid },
        ];
        dir = { x: 1, y: 0 };
        nextDir = { x: 1, y: 0 };
        food = randFood(body);
        score = 0;
        acc = 0;
      },

      update: (dt) => {
        acc += dt;
        while (acc >= SPEED) {
          acc -= SPEED;
          const before = body;
          step();
          if (body === before) return; // game over mid-step: stop stepping
        }
      },

      draw: (glow) => {
        ctx.fillStyle = '#080c14';
        ctx.fillRect(0, 0, ARCADE_SIZE, ARCADE_SIZE);

        ctx.strokeStyle = 'rgba(163, 230, 53, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 1; i < CELLS; i++) {
          ctx.beginPath();
          ctx.moveTo(i * CELL, 0);
          ctx.lineTo(i * CELL, ARCADE_SIZE);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i * CELL);
          ctx.lineTo(ARCADE_SIZE, i * CELL);
          ctx.stroke();
        }

        ctx.fillStyle = '#2dd4ee';
        ctx.shadowColor = '#2dd4ee';
        ctx.shadowBlur = 12 * glow;
        ctx.fillRect(food.x * CELL + 4, food.y * CELL + 4, CELL - 8, CELL - 8);

        body.forEach((s, i) => {
          ctx.fillStyle = i === 0 ? '#d4ff7a' : '#a3e635';
          ctx.shadowColor = '#a3e635';
          ctx.shadowBlur = (i === 0 ? 14 : 6) * glow;
          ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
        });
        ctx.shadowBlur = 0;
      },

      intensity: () => Math.min(1, score / 25),

      key: (k) => {
        const nd = DIRS[k];
        if (!nd) return false;
        if (nd.x === -dir.x && nd.y === -dir.y) return true; // no instant reverse
        nextDir = nd;
        return true;
      },
    };
  },
};
