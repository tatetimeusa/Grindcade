import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { fmtClock, fmtTimer } from '../util';
import { AccountPanel } from './AccountPanel';

const SYNC_LABEL: Record<string, string> = {
  off: 'SYNC:OFF',
  syncing: 'SYNC:…',
  synced: 'SYNC:✓',
  error: 'SYNC:ERR',
  offline: 'OFFLINE',
};

export function TopBar() {
  const [now, setNow] = useState(new Date());
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountPw, setAccountPw] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // /passwd carries pw:true so it lands straight on the password form
    const open = (e: Event) => {
      setAccountPw(Boolean((e as CustomEvent<{ pw?: boolean }>).detail?.pw));
      setAccountOpen(true);
    };
    window.addEventListener('termdeck:open-account', open);
    return () => window.removeEventListener('termdeck:open-account', open);
  }, []);

  const running = useStore((s) => s.running);
  const focusMode = useStore((s) => s.focusMode);
  const secondsLeft = useStore((s) => s.secondsLeft);
  const scanlines = useStore((s) => s.scanlines);
  const toggleScanlines = useStore((s) => s.toggleScanlines);
  const soundEnabled = useStore((s) => s.soundEnabled);
  const toggleSound = useStore((s) => s.toggleSound);
  const introEnabled = useStore((s) => s.introEnabled);
  const toggleIntro = useStore((s) => s.toggleIntro);
  const fxEnabled = useStore((s) => s.fxEnabled);
  const toggleFx = useStore((s) => s.toggleFx);
  const syncStatus = useStore((s) => s.syncStatus);

  return (
    <header className="topbar">
      <div className="brand">
        GRINDCADE<span className="cursor">_</span>
      </div>
      <div className="topbar-right">
        <span className={`tb-timer ${focusMode}${running ? ' on' : ''}`}>
          {focusMode === 'work' ? '◐ FOCUS' : '☺ BREAK'} {fmtTimer(secondsLeft)}
        </span>
        <button className="ghost-btn" onClick={toggleSound} title="Toggle sounds">
          {soundEnabled ? 'SND:ON' : 'SND:OFF'}
        </button>
        <button className="ghost-btn" onClick={toggleScanlines} title="Toggle CRT scanlines">
          {scanlines ? 'CRT:ON' : 'CRT:OFF'}
        </button>
        <button className="ghost-btn" onClick={toggleIntro} title="Toggle startup intro">
          {introEnabled ? 'INTRO:ON' : 'INTRO:OFF'}
        </button>
        <button className="ghost-btn" onClick={toggleFx} title="Toggle motion and glow">
          {fxEnabled ? 'FX:ON' : 'FX:OFF'}
        </button>
        <button
          className={`ghost-btn sync-badge sync-${syncStatus}`}
          onClick={() => {
            setAccountPw(false);
            setAccountOpen(true);
          }}
          title="Account & sync"
        >
          {SYNC_LABEL[syncStatus]}
        </button>
        <span className="clock">{fmtClock(now)}</span>
      </div>
      {accountOpen && (
        <AccountPanel openPassword={accountPw} onClose={() => setAccountOpen(false)} />
      )}
    </header>
  );
}
