import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../focusTrap';

// `/help` and `?` open this. Every line below is checked against the real
// handlers (CommandBar.tsx, App.tsx and the modules), so keep it in step when a
// command or key changes.

const COMMANDS: [string, string][] = [
  ['/todo <text>', 'add a task'],
  ['/note <title>', 'create a note and open NOTES'],
  ['/goal <name>', 'create a 30-day goal and open GOALS'],
  ['/start', 'open FOCUS and start the timer'],
  ['/pause', 'pause the focus timer'],
  ['/reset', 'reset the focus timer (mid-session, costs the plant a level)'],
  ['/go <module>', 'switch module, e.g. /go board'],
  ['/<module>', 'same thing: /todo /board /cal /notes /focus /arcade /goals /streaks /reminders'],
  ['/login', 'sign in or create an account to sync'],
  ['/logout', 'sign out (your data stays on this computer)'],
  ['/sync', 'sync now'],
  ['/forgot', 'reset your password'],
  ['/help', 'this page'],
];

const KEYS: [string, string][] = [
  ['1-9', 'switch module (when not typing in a box)'],
  ['/', 'jump to the command bar'],
  ['?', 'open this page'],
  ['Esc', 'leave a text box, close a popup, or cancel a task edit in TODO'],
  ['Tab / Shift+Tab', 'move between buttons and boxes; Enter or Space presses'],
  ['Arrows', 'CALENDAR: move the selected day (up/down is a week)'],
  ['◂ ▸ on a card', 'BOARD: move it to the next column (Tab to them)'],
  ['Space', 'ARCADE: start or pause the game'],
  ['Arrows / WASD', 'ARCADE: steer (SNAKE) or change lanes (NIGHT DRIVE)'],
  ['Ctrl + / Ctrl -', 'make everything bigger or smaller (Cmd on Mac)'],
  ['Ctrl 0', 'back to the default size'],
];

const TOP_BAR: [string, string][] = [
  ['SND', 'sounds on or off'],
  ['CRT', 'CRT scanlines on or off'],
  ['INTRO', 'the boot animation at startup'],
  ['FX', 'motion and glow; off for a still, flat screen'],
  ['SYNC', 'account and sync'],
];

const TYPING: [string, string][] = [
  ['NOTES', 'creates a note with that title'],
  ['FOCUS', 'adds a task and focuses on it'],
  ['anywhere else', 'adds a task'],
];

function Section({ name, rows }: { name: string; rows: [string, string][] }) {
  return (
    <section className="help-section">
      <h3 className="help-h">{name}</h3>
      <dl className="help-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="help-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef);

  // While open, the page owns the keyboard: Esc or ? closes it, and nothing
  // else leaks through to the app behind (a stray 3 or Space would otherwise
  // switch modules or start Snake under the popup). Capture phase so it runs
  // before the app's own handlers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="account-layer" onClick={onClose}>
      <div className="account-card help-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <div className="account-head">
          <span className="account-title">GRINDCADE(1) · HELP</span>
          <button className="reminder-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>
        {/* focusable so arrow keys can scroll it on a short window */}
        <div className="help-body" tabIndex={0}>
          <Section name="COMMANDS" rows={COMMANDS} />
          <Section name="KEYS" rows={KEYS} />
          <Section name="TOP BAR" rows={TOP_BAR} />
          <Section name="TYPING WITHOUT A /" rows={TYPING} />
        </div>
        <div className="help-foot">press Esc to close</div>
      </div>
    </div>
  );
}
