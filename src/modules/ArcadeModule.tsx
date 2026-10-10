import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Panel } from '../components/Panel';
import { fmtTimer } from '../util';
import { GAMES, findGame } from '../arcade';
import { ARCADE_SIZE, type Game } from '../arcade/types';
import { setMusicIntensity, startMusic, stopMusic } from '../arcade/music';

type Status = 'idle' | 'playing' | 'paused' | 'over';

export function ArcadeModule() {
  const banked = useStore((s) => s.bankedBreakSeconds);
  const spendBreak = useStore((s) => s.spendBreak);
  const gameId = useStore((s) => s.arcadeGame);
  const setGameId = useStore((s) => s.setArcadeGame);
  const best = useStore((s) => (s.arcadeGame === 'snake' ? s.bestSnake : (s.bestScores[s.arcadeGame] ?? 0)));
  const setBest = useStore((s) => s.setBestScore);
  const fxEnabled = useStore((s) => s.fxEnabled);
  const musicEnabled = useStore((s) => s.musicEnabled);
  const soundEnabled = useStore((s) => s.soundEnabled);
  const toggleMusic = useStore((s) => s.toggleMusic);

  const def = findGame(gameId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [score, setScore] = useState(0);
  const statusRef = useRef<Status>('idle');
  statusRef.current = status;

  const boxRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState(ARCADE_SIZE); // on-screen size in CSS px
  const [dpr, setDpr] = useState(window.devicePixelRatio); // changes with Ctrl +/- zoom
  const scale = useRef(1); // canvas pixels per game unit

  const glow = () => (useStore.getState().fxEnabled ? scale.current : 0);
  const draw = () => game.current?.draw(glow());

  // the board takes all the room the panel has beside the side column
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const gap = 18;
      const side = sideRef.current?.offsetWidth ?? 240;
      const fit = Math.min(box.clientHeight, box.clientWidth - side - gap);
      setBoard(Math.max(280, Math.floor(fit)));
      setDpr(window.devicePixelRatio);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    measure();
    return () => ro.disconnect();
  }, []);

  // keep the canvas sharp: real pixels to match its size (and the zoom), with
  // the games still drawing in 420 units. Resizing a canvas clears it and its
  // scale, so set the scale again and redraw.
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const px = Math.round(board * dpr);
    cv.width = px;
    cv.height = px;
    scale.current = px / ARCADE_SIZE;
    ctx.setTransform(scale.current, 0, 0, scale.current, 0, 0);
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, dpr]);

  // build the picked game on its canvas; a fresh one on every switch
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    game.current = def.create(ctx, {
      setScore,
      gameOver: () => setStatus('over'),
    });
    game.current.reset();
    setScore(0);
    setStatus('idle');
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);

  const start = () => {
    if (useStore.getState().bankedBreakSeconds <= 0 || !game.current) return;
    game.current.reset();
    setScore(0);
    setStatus('playing');
  };

  const pick = (id: string) => {
    if (statusRef.current === 'playing') return;
    setGameId(id);
  };

  // FX toggled or status changed (overlays, game over): redraw the board
  useEffect(() => {
    if (status !== 'playing') game.current?.releaseKeys?.();
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxEnabled, status]);

  // record a new high score
  useEffect(() => {
    if (status === 'over' && score > best) setBest(def.id, score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // the game loop, one frame per screen refresh while playing
  useEffect(() => {
    if (status !== 'playing') return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      // a backgrounded window can hand us a huge gap; never jump more than 50ms
      const dt = Math.min(50, now - last);
      last = now;
      game.current?.update(dt);
      if (game.current?.intensity) setMusicIntensity(game.current.intensity());
      draw();
      if (statusRef.current === 'playing') raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // music runs only while a game is actually being played
  useEffect(() => {
    if (status === 'playing' && musicEnabled && soundEnabled && def.music) startMusic(def.music);
    else stopMusic();
  }, [status, musicEnabled, soundEnabled, def]);
  useEffect(() => () => stopMusic(), []); // leaving the ARCADE

  // spend banked break time while playing; when it runs out, break's over
  useEffect(() => {
    if (status !== 'playing') return;
    const id = setInterval(() => {
      spendBreak(1);
      if (useStore.getState().bankedBreakSeconds <= 0) setStatus('over');
    }, 1000);
    return () => clearInterval(id);
  }, [status, spendBreak]);

  // the game only moves while the window is on screen, but break time keeps
  // draining, so leaving the window pauses the game
  useEffect(() => {
    const away = () => {
      if (statusRef.current === 'playing') setStatus('paused');
    };
    const onVis = () => document.hidden && away();
    window.addEventListener('blur', away);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', away);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // keyboard: Space starts and pauses, everything else goes to the game
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // don't steal keys while the user is typing (e.g. in the command bar)
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (statusRef.current === 'playing') setStatus('paused');
        else if (statusRef.current === 'paused') setStatus('playing');
        else start();
        return;
      }
      // a held key repeats; games want the press (and the release, for a paddle)
      if (e.repeat) {
        if (statusRef.current === 'playing' && game.current) e.preventDefault();
        return;
      }
      if (statusRef.current === 'playing' && game.current?.key(e.key)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => game.current?.keyUp?.(e.key);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = banked <= 0 && status !== 'over';

  return (
    <Panel title="ARCADE" accent="arcade">
      <div className="arcade" ref={boxRef}>
        <div className="arcade-stage" style={{ '--board': `${board}px` } as React.CSSProperties}>
          <canvas ref={canvasRef} className="arcade-canvas" />

          {locked && status === 'idle' && (
            <div className="arcade-overlay">
              <div className="ov-title">🔒 LOCKED</div>
              <div className="ov-sub">
                <span className="quip">&gt; arcade locked. earn it.</span>
                Finish a focus session in FOCUS to earn break time, then come play.
              </div>
            </div>
          )}
          {!locked && status === 'idle' && (
            <div className="arcade-overlay">
              <div className="ov-title">{def.name}</div>
              <div className="ov-sub">
                <b>Space</b> or START to play · {def.controls}
              </div>
            </div>
          )}
          {status === 'paused' && (
            <div className="arcade-overlay">
              <div className="ov-title">PAUSED</div>
              <div className="ov-sub">press <b>Space</b> to resume</div>
            </div>
          )}
          {status === 'over' && (
            <div className="arcade-overlay">
              <div className="ov-title">GAME OVER</div>
              <div className="ov-sub">
                score <b>{score}</b>
                {score > 0 && score >= best ? ' · new best!' : ''}
              </div>
              <button className="big-btn go" onClick={start} disabled={banked <= 0}>
                [ PLAY AGAIN ]
              </button>
              {banked <= 0 && <div className="ov-sub dim">out of break time — go focus to earn more</div>}
            </div>
          )}
        </div>

        <div className="arcade-side" ref={sideRef}>
          <div className="arcade-picker" role="group" aria-label="Pick a game">
            {GAMES.map((g) => (
              <button
                key={g.id}
                className={`arcade-pick ${g.id === def.id ? 'on' : ''}`}
                aria-pressed={g.id === def.id}
                disabled={status === 'playing' && g.id !== def.id}
                onClick={() => pick(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className="arcade-stat">
            <span>SCORE</span>
            <b>{score}</b>
          </div>
          <div className="arcade-stat">
            <span>BEST</span>
            <b>{best}</b>
          </div>
          <div className="arcade-stat">
            <span>BREAK LEFT</span>
            <b className={banked <= 0 ? 'empty' : ''}>{fmtTimer(banked)}</b>
          </div>

          {status === 'playing' ? (
            <button className="big-btn" onClick={() => setStatus('paused')}>
              [ PAUSE ]
            </button>
          ) : (
            <button className="big-btn go" onClick={start} disabled={banked <= 0 && status !== 'over'}>
              {status === 'over' ? '[ PLAY AGAIN ]' : '[ START ]'}
            </button>
          )}

          <button
            className={`arcade-pick arcade-music ${musicEnabled && soundEnabled ? 'on' : ''}`}
            onClick={toggleMusic}
            disabled={!soundEnabled}
            title={soundEnabled ? 'arcade music on or off' : 'turn SND on to hear music'}
          >
            MUSIC:{musicEnabled && soundEnabled ? 'ON' : 'OFF'}
          </button>

          <p className="arcade-hint dim">
            Playing spends the break time you bank by finishing focus sessions. Earn it, then enjoy it.
          </p>
        </div>
      </div>
    </Panel>
  );
}
