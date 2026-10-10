import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { playWhoosh } from '../sound';

// Boot sequence: fly down a glowing green wireframe tunnel, accelerate into a
// flash, then land on the solid GRINDCADE_ wordmark before dissolving into the app.
const FLASH_AT = 1750; // ms — tunnel hits top speed and flashes white
const LOGO_AT = 1900; // ms — the solid wordmark appears
const TOTAL = 2500; // ms — overlay begins its fade-out
const BRAND = 'GRINDCADE';

// green-only ring palette (a few shades for depth)
const COLORS = ['#4ade80', '#4ade80', '#86efac', '#22c55e', '#a3e635'];

type Phase = 'tunnel' | 'flash' | 'logo' | 'out';

export function Intro({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('tunnel');
  const doneRef = useRef(false);
  const playedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // whoosh once (StrictMode mounts effects twice in dev — guard it)
    if (!playedRef.current) {
      playedRef.current = true;
      if (useStore.getState().soundEnabled) playWhoosh();
    }

    // a corridor of square rings spread across depth (z: ~0.04 far .. 1 near)
    const rings = Array.from({ length: 26 }, (_, i) => ({
      z: 0.04 + (i / 26) * 0.96,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    }));

    let raf = 0;
    let last = performance.now();
    const start = last;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = now - start;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // progress through the tunnel (0 at start .. 1 at the flash)
      const ramp = Math.min(elapsed / FLASH_AT, 1);
      const cx = w / 2;
      const cy = h / 2;
      const focal = Math.max(w, h) * 0.06;
      // speed ramps up as we approach the flash, then we coast
      const speed = 0.25 + ramp * ramp * 1.25;
      // tunnel fades out over 320ms once the flash hits
      const fade = elapsed < FLASH_AT ? 1 : Math.max(0, 1 - (elapsed - FLASH_AT) / 320);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#04060a';
      ctx.fillRect(0, 0, w, h);

      // central glow at the vanishing point, brightening with speed
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.5);
      glow.addColorStop(0, `rgba(74,222,128,${0.10 + ramp * 0.22})`);
      glow.addColorStop(0.4, 'rgba(74,222,128,0.05)');
      glow.addColorStop(1, 'rgba(4,6,10,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      rings.sort((a, b) => b.z - a.z); // far first, near last
      ctx.lineJoin = 'round';
      for (const r of rings) {
        r.z -= speed * dt;
        if (r.z <= 0.03) r.z += 1; // recycle to the far distance

        const half = focal * (1 / r.z - 1);
        if (half < 0.5 || half > Math.max(w, h) * 1.6) continue;
        const near = 1 - r.z; // 0 far .. ~1 near
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalAlpha = Math.min(1, 0.12 + near * 1.1) * fade;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = Math.max(1, near * 3.5);
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 4 + near * 22;
        ctx.strokeRect(-half, -half, half * 2, half * 2);
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // phase timers
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setPhase('flash'), FLASH_AT));
    timers.push(window.setTimeout(() => setPhase('logo'), LOGO_AT));

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setPhase('out');
      window.setTimeout(onDone, 420);
    };
    timers.push(window.setTimeout(finish, TOTAL));

    const skip = () => finish();
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`intro phase-${phase}`} role="presentation">
      <canvas ref={canvasRef} className="intro-canvas" />
      <div className="intro-burst" />
      <div className="intro-logo">
        <span className="brand">
          {BRAND}
          <span className="cursor">_</span>
        </span>
      </div>
      <div className="intro-skip">press any key to skip</div>
    </div>
  );
}
