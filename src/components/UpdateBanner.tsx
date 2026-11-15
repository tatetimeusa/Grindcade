import { useEffect, useState } from 'react';

// Update notice: on launch (and every 6 hours while open) ask GitHub for the
// latest release; if it's newer than this build, show a strip linking to
// grindcade.com. Downloads nothing, so it's safe on unsigned builds and works
// the same on Windows and Mac. Any failure (offline, rate limit) stays silent.

const LATEST_URL = 'https://api.github.com/repos/tatetimeusa/Grindcade/releases/latest';
const SITE_URL = 'https://grindcade.com';
const RECHECK_MS = 6 * 60 * 60 * 1000;
const DISMISS_KEY = 'grindcade:update-dismissed';
// dev only: set this in localStorage to pretend to be an older build
const FAKE_KEY = 'grindcade:dev-fake-version';

const isElectron = navigator.userAgent.includes('Electron');

function currentVersion(): string {
  if (import.meta.env.DEV) {
    try {
      const fake = localStorage.getItem(FAKE_KEY);
      if (fake) return fake;
    } catch {}
  }
  return import.meta.env.VITE_APP_VERSION as string;
}

const clean = (v: string) => v.trim().replace(/^v/i, '');

// true when a is a higher x.y.z than b; anything unparseable counts as not newer
function isNewer(a: string, b: string): boolean {
  const pa = clean(a).split('-')[0].split('.').map(Number);
  const pb = clean(b).split('-')[0].split('.').map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);
  const mine = clean(currentVersion());

  useEffect(() => {
    // the web build has nothing to update; dev runs it so it can be tested
    if (!isElectron && !import.meta.env.DEV) return;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' } });
        if (!res.ok) return;
        const tag = (await res.json())?.tag_name;
        if (alive && typeof tag === 'string') setLatest(clean(tag));
      } catch {}
    };
    check();
    const id = setInterval(check, RECHECK_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!latest || !isNewer(latest, mine) || dismissed === latest) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, latest);
    } catch {}
    setDismissed(latest);
  };

  return (
    <div className="update-banner" role="status">
      <span className="update-tag">▲ UPDATE</span>
      <span className="update-text">
        Grindcade v{latest} is out · you have v{mine}
      </span>
      <span className="update-actions">
        {/* window.open goes to the user's real browser (main.cjs openExternal) */}
        <button className="ghost-btn update-get" onClick={() => window.open(SITE_URL, '_blank')}>
          [ GET IT ]
        </button>
        <button className="ghost-btn" onClick={dismiss} title="Hide until the next version">
          x
        </button>
      </span>
    </div>
  );
}
