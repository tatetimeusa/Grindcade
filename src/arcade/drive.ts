import { ARCADE_SIZE as S, type GameDef } from './types';

// NIGHT DRIVE: three lanes down the neon grid toward a striped sun. Dodge the
// traffic, grab the orbs, go faster the longer you last.
//
// Simple pinhole projection: world X is sideways, z is distance ahead of the
// camera. A point (X, z) lands at screen (CX + X / z, HY + CAM_H / z).

const CX = S / 2;
const HY = 170; // horizon
const CAM_H = S - HY; // z = 1 sits on the bottom edge
const ROAD_W = 210; // half width of the road
const LANE_W = 140;
const LANES = [-LANE_W, 0, LANE_W];
const PLAYER_Z = 1.35;
const SPAWN_Z = 26;
const CAR_W = 92;
const CAR_H = 52;
const HIT_Z = 0.32; // how close in depth counts as touching the player
const HIT_X = 78;
const ORB_POINTS = 25;

const sy = (z: number) => HY + CAM_H / z;
const sx = (x: number, z: number) => CX + x / z;

type Thing = { kind: 'car' | 'orb'; lane: number; z: number; color: string };

const CAR_COLORS = ['#3ee5ff', '#ffc052', '#bda6ff', '#5cf593', '#ffa652'];

// fixed star field so it doesn't flicker
const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 97.13) % S,
  y: (i * 53.71) % (HY - 20),
  r: i % 5 === 0 ? 1.4 : 0.8,
}));

export const drive: GameDef = {
  id: 'drive',
  name: 'NIGHT DRIVE',
  controls: 'Left / Right or A / D to change lanes',
  create: (ctx, hooks) => {
    let lane = 1;
    let px = 0; // player's world X, eases toward its lane
    let speed = 0; // z units per second
    let t = 0; // seconds driven
    let dist = 0;
    let bonus = 0;
    let things: Thing[] = [];
    let spawnIn = 0;
    let gridPhase = 0;
    let lastScore = -1;
    let flash = 0; // orb pickup glow, seconds left
    let crash: { x: number; y: number } | null = null;

    const report = () => {
      const sc = Math.floor(dist) + bonus;
      if (sc !== lastScore) hooks.setScore((lastScore = sc));
    };

    // one row of traffic; never blocks all three lanes
    const spawnRow = () => {
      const cars = t > 18 && Math.random() < Math.min(0.55, (t - 18) / 60) ? 2 : 1;
      const order = [0, 1, 2].sort(() => Math.random() - 0.5);
      const taken = order.slice(0, cars);
      for (const l of taken) {
        things.push({ kind: 'car', lane: l, z: SPAWN_Z, color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] });
      }
      if (Math.random() < 0.45) {
        const free = order[cars];
        things.push({ kind: 'orb', lane: free, z: SPAWN_Z + 4, color: '#f18dff' });
      }
    };

    const drawSky = () => {
      const sky = ctx.createLinearGradient(0, 0, 0, HY);
      sky.addColorStop(0, '#070312');
      sky.addColorStop(1, '#3a0d4f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, S, HY);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const st of STARS) ctx.fillRect(st.x, st.y, st.r, st.r);
    };

    const drawSun = (glow: number) => {
      const r = 74;
      const top = HY - r * 1.15;
      ctx.save();
      // slice the bottom of the sun into bands that thin out toward the top
      ctx.beginPath();
      ctx.rect(0, 0, S, HY - r * 0.45);
      let y = HY - r * 0.45;
      let gap = 3;
      let band = 9;
      while (y < HY) {
        y += gap;
        ctx.rect(0, y, S, band);
        y += band;
        gap += 1.2;
        band = Math.max(3, band - 1.5);
      }
      ctx.clip();
      const g = ctx.createLinearGradient(0, top, 0, HY);
      g.addColorStop(0, '#ffe66e');
      g.addColorStop(0.55, '#ff5fa2');
      g.addColorStop(1, '#b03cff');
      ctx.fillStyle = g;
      ctx.shadowColor = '#ff4fa0';
      ctx.shadowBlur = 30 * glow;
      ctx.beginPath();
      ctx.arc(CX, HY - r * 0.15, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawMountains = () => {
      ctx.fillStyle = '#14061f';
      ctx.beginPath();
      ctx.moveTo(0, HY);
      const peaks = [0, 18, 40, 10, 70, 30, 110, 14, 150, 34, 185, 8, 235, 8, 270, 30, 310, 12, 345, 38, 380, 16, 420, 26];
      for (let i = 0; i < peaks.length; i += 2) ctx.lineTo(peaks[i], HY - peaks[i + 1]);
      ctx.lineTo(S, HY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 79, 160, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const drawGround = (glow: number) => {
      ctx.fillStyle = '#0a0414';
      ctx.fillRect(0, HY, S, S - HY);

      // grid lines across the ground, scrolling toward the camera
      ctx.lineWidth = 1;
      const spacing = 2;
      for (let k = 0; k < 16; k++) {
        const z = 1 + k * spacing - gridPhase;
        if (z < 0.9) continue;
        const y = sy(z);
        const a = Math.min(0.55, 0.9 / z);
        ctx.strokeStyle = `rgba(241, 141, 255, ${a})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(S, y);
        ctx.stroke();
      }
      // grid lines running to the horizon
      for (let j = -9; j <= 9; j++) {
        const x = j * 120;
        ctx.strokeStyle = 'rgba(62, 229, 255, 0.28)';
        ctx.beginPath();
        ctx.moveTo(CX, HY);
        ctx.lineTo(sx(x, 1), S);
        ctx.stroke();
      }

      // the road
      ctx.fillStyle = 'rgba(7, 10, 16, 0.88)';
      ctx.beginPath();
      ctx.moveTo(CX, HY);
      ctx.lineTo(sx(ROAD_W, 1), S);
      ctx.lineTo(sx(-ROAD_W, 1), S);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#3ee5ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#3ee5ff';
      ctx.shadowBlur = 10 * glow;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(CX, HY);
        ctx.lineTo(sx(side * ROAD_W, 1), S);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // dashed lane lines
      ctx.strokeStyle = 'rgba(219, 230, 245, 0.75)';
      for (const lx of [-LANE_W / 2, LANE_W / 2]) {
        for (let k = 0; k < 14; k++) {
          const z0 = 1 + k * spacing - gridPhase;
          const z1 = z0 + spacing * 0.45;
          if (z1 < 0.9) continue;
          const a = Math.max(z0, 0.9);
          ctx.lineWidth = Math.max(1, 3 / a);
          ctx.beginPath();
          ctx.moveTo(sx(lx, a), sy(a));
          ctx.lineTo(sx(lx, z1), sy(z1));
          ctx.stroke();
        }
      }
    };

    // a car seen from behind, standing on (x, z)
    const drawCar = (x: number, z: number, color: string, glow: number, player = false) => {
      const w = CAR_W / z;
      const h = CAR_H / z;
      const cx = sx(x, z);
      const by = sy(z);
      const l = cx - w / 2;
      ctx.lineWidth = Math.max(1, 2.2 / z);
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = (player ? 16 : 9) * glow;
      ctx.fillStyle = 'rgba(8, 12, 20, 0.92)';
      // body
      ctx.beginPath();
      ctx.rect(l, by - h * 0.55, w, h * 0.55);
      ctx.fill();
      ctx.stroke();
      // cabin
      ctx.beginPath();
      ctx.moveTo(l + w * 0.18, by - h * 0.55);
      ctx.lineTo(l + w * 0.28, by - h);
      ctx.lineTo(l + w * 0.72, by - h);
      ctx.lineTo(l + w * 0.82, by - h * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // tail lights
      ctx.fillStyle = player ? '#ff4fa0' : '#ff8797';
      ctx.shadowColor = '#ff4fa0';
      ctx.shadowBlur = 12 * glow;
      const lw = w * 0.2;
      const lh = Math.max(2, h * 0.1);
      ctx.fillRect(l + w * 0.07, by - h * 0.42, lw, lh);
      ctx.fillRect(l + w * 0.93 - lw, by - h * 0.42, lw, lh);
      ctx.shadowBlur = 0;
    };

    const drawOrb = (x: number, z: number, glow: number) => {
      const r = 16 / z;
      const cx = sx(x, z);
      const cy = sy(z) - r * 1.6;
      ctx.fillStyle = '#f18dff';
      ctx.shadowColor = '#f18dff';
      ctx.shadowBlur = 14 * glow;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.7, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.7, cy);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const drawCrash = (glow: number) => {
      if (!crash) return;
      ctx.strokeStyle = '#ffe66e';
      ctx.shadowColor = '#ff4fa0';
      ctx.shadowBlur = 18 * glow;
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r0 = 10 + (i % 3) * 4;
        const r1 = 34 + (i % 4) * 9;
        ctx.beginPath();
        ctx.moveTo(crash.x + Math.cos(a) * r0, crash.y + Math.sin(a) * r0);
        ctx.lineTo(crash.x + Math.cos(a) * r1, crash.y + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };

    return {
      reset: () => {
        lane = 1;
        px = 0;
        speed = 9;
        t = 0;
        dist = 0;
        bonus = 0;
        things = [];
        spawnIn = 0.8;
        gridPhase = 0;
        lastScore = -1;
        flash = 0;
        crash = null;
        report();
      },

      update: (dtMs) => {
        const dt = dtMs / 1000;
        t += dt;
        speed = Math.min(26, 9 + t * 0.32);
        dist += speed * dt * 2;
        gridPhase = (gridPhase + speed * dt) % 2;
        px += (LANES[lane] - px) * Math.min(1, dt * 14);
        flash = Math.max(0, flash - dt);

        spawnIn -= dt;
        if (spawnIn <= 0) {
          spawnRow();
          spawnIn = Math.max(0.42, 1.25 - t * 0.012);
        }

        for (const th of things) th.z -= speed * dt;
        for (const th of things) {
          if (Math.abs(th.z - PLAYER_Z) > HIT_Z) continue;
          if (Math.abs(LANES[th.lane] - px) > HIT_X) continue;
          if (th.kind === 'orb') {
            bonus += ORB_POINTS;
            flash = 0.25;
            th.z = -1; // collected
          } else {
            crash = { x: sx(px, PLAYER_Z), y: sy(PLAYER_Z) - CAR_H / PLAYER_Z / 2 };
            report();
            hooks.gameOver();
            return;
          }
        }
        things = things.filter((th) => th.z > 0.6);
        report();
      },

      draw: (glow) => {
        drawSky();
        drawSun(glow);
        drawMountains();
        drawGround(glow);
        // far things first
        const sorted = [...things].sort((a, b) => b.z - a.z);
        for (const th of sorted) {
          if (th.z < PLAYER_Z) continue; // passed the player: hidden behind their car
          if (th.kind === 'car') drawCar(LANES[th.lane], th.z, th.color, glow);
          else drawOrb(LANES[th.lane], th.z, glow);
        }
        drawCar(px, PLAYER_Z, flash > 0 ? '#ffffff' : '#f18dff', glow, true);
        for (const th of sorted) {
          if (th.z >= PLAYER_Z || th.kind !== 'car') continue;
          drawCar(LANES[th.lane], th.z, th.color, glow);
        }
        drawCrash(glow);
        // speed readout, bottom left
        ctx.fillStyle = 'rgba(219, 230, 245, 0.85)';
        ctx.font = '12px "Cascadia Code", Consolas, monospace';
        ctx.fillText(`${Math.round(speed * 10)} km/h`, 10, S - 10);
      },

      key: (k) => {
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
          lane = Math.max(0, lane - 1);
          return true;
        }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') {
          lane = Math.min(2, lane + 1);
          return true;
        }
        return false;
      },
    };
  },
};
