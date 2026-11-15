import { useEffect, useState } from 'react';
import { useStore } from './store';
import { playClick } from './sound';
import { Intro } from './components/Intro';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { CommandBar } from './components/CommandBar';
import { TodoModule } from './modules/TodoModule';
import { NotesModule } from './modules/NotesModule';
import { FocusModule } from './modules/FocusModule';
import { BoardModule } from './modules/BoardModule';
import { CalendarModule } from './modules/CalendarModule';
import { ArcadeModule } from './modules/ArcadeModule';
import { GoalsModule } from './modules/GoalsModule';
import { StreaksModule } from './modules/StreaksModule';
import { RemindersModule } from './modules/RemindersModule';
import { ReminderPopup } from './components/ReminderPopup';
import { HelpPanel } from './components/HelpPanel';
import { UpdateBanner } from './components/UpdateBanner';
import type { ModuleId } from './types';

const moduleKeys: Record<string, ModuleId> = {
  '1': 'todo',
  '2': 'board',
  '3': 'calendar',
  '4': 'notes',
  '5': 'focus',
  '6': 'arcade',
  '7': 'goals',
  '8': 'streaks',
  '9': 'reminders',
};

export default function App() {
  const activeModule = useStore((s) => s.activeModule);
  const setModule = useStore((s) => s.setModule);
  const tick = useStore((s) => s.tick);
  const checkReminders = useStore((s) => s.checkReminders);
  const scanlines = useStore((s) => s.scanlines);
  const fxEnabled = useStore((s) => s.fxEnabled);
  // play the boot intro on launch (read once at mount so toggling it mid-session
  // never disturbs the running app)
  // (FX off skips it too: the intro is the biggest motion in the app)
  const [introActive, setIntroActive] = useState(() => {
    const s = useStore.getState();
    return s.introEnabled && s.fxEnabled;
  });
  const [helpOpen, setHelpOpen] = useState(false);

  // `/help` in the command bar asks for the help page through this event
  useEffect(() => {
    const open = () => setHelpOpen(true);
    window.addEventListener('termdeck:open-help', open);
    return () => window.removeEventListener('termdeck:open-help', open);
  }, []);

  // 1-second heartbeat that drives the focus timer and the reminder checks
  useEffect(() => {
    const beat = () => {
      tick();
      checkReminders();
    };
    // run once right away so reminders missed while the app was closed pop
    // immediately at launch instead of waiting for the first interval
    beat();
    const id = setInterval(beat, 1000);
    // The heartbeat gets throttled while the window is minimized/hidden, so
    // re-sync the moment it comes back to the foreground (the timer is anchored
    // to a real end-time, so this snaps it to the correct value instantly).
    window.addEventListener('focus', beat);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', beat);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [tick, checkReminders]);

  // soft UI tick on any interactive click (gated by the SND toggle). Capture
  // phase so it still fires when a handler calls stopPropagation (e.g. cal chips).
  useEffect(() => {
    const isInteractive = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      if (el.closest('button, a, input, select, textarea, label, [role="button"]')) return true;
      let node: HTMLElement | null = el;
      for (let i = 0; node && i < 5; i++, node = node.parentElement) {
        if (getComputedStyle(node).cursor === 'pointer') return true;
      }
      return false;
    };
    let last = 0;
    const onClick = (e: MouseEvent) => {
      const now = Date.now();
      if (now - last < 40) return; // de-dupe label→input double fire
      if (!useStore.getState().soundEnabled) return;
      if (!isInteractive(e.target as HTMLElement)) return;
      last = now;
      playClick();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

      // Esc gets you out of any text box, so 1-9 and / work again
      if (e.key === 'Escape' && typing) {
        el.blur();
        return;
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('termdeck:focus-command'));
        return;
      }
      if (e.key === '?' && !typing) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && moduleKeys[e.key]) {
        // TODO, GOALS and REMINDERS focus their input on open; without this the
        // digit that switched modules would land in that box
        e.preventDefault();
        setModule(moduleKeys[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setModule]);

  return (
    <div className={`app${scanlines ? ' scanlines' : ''}${fxEnabled ? '' : ' no-fx'}`}>
      {introActive && <Intro onDone={() => setIntroActive(false)} />}
      <TopBar />
      <UpdateBanner />
      <Sidebar />
      <main className="main">
        {activeModule === 'todo' && <TodoModule />}
        {activeModule === 'notes' && <NotesModule />}
        {activeModule === 'focus' && <FocusModule />}
        {activeModule === 'board' && <BoardModule />}
        {activeModule === 'calendar' && <CalendarModule />}
        {activeModule === 'arcade' && <ArcadeModule />}
        {activeModule === 'goals' && <GoalsModule />}
        {activeModule === 'streaks' && <StreaksModule />}
        {activeModule === 'reminders' && <RemindersModule />}
      </main>
      <CommandBar />
      <ReminderPopup />
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
