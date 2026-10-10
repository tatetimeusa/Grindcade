import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../store';
import { forceSync, signOut } from '../sync';
import type { ModuleId } from '../types';
import { addDays, todayISO } from '../util';

const moduleAliases: Record<string, ModuleId> = {
  todo: 'todo',
  board: 'board',
  calendar: 'calendar',
  cal: 'calendar',
  notes: 'notes',
  note: 'notes',
  focus: 'focus',
  arcade: 'arcade',
  game: 'arcade',
  goals: 'goals',
  streaks: 'streaks',
  streak: 'streaks',
  reminders: 'reminders',
  remind: 'reminders',
};

export function CommandBar() {
  const ref = useRef<HTMLInputElement>(null);
  const hintTimer = useRef<number | null>(null);
  const [val, setVal] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  const activeModule = useStore((s) => s.activeModule);
  const addTask = useStore((s) => s.addTask);
  const addNote = useStore((s) => s.addNote);
  const addGoal = useStore((s) => s.addGoal);
  const setModule = useStore((s) => s.setModule);
  const setActiveTask = useStore((s) => s.setActiveTask);
  const startTimer = useStore((s) => s.startTimer);
  const pauseTimer = useStore((s) => s.pauseTimer);
  const resetTimer = useStore((s) => s.resetTimer);

  useEffect(() => {
    const focus = () => ref.current?.focus();
    window.addEventListener('termdeck:focus-command', focus);
    return () => window.removeEventListener('termdeck:focus-command', focus);
  }, []);

  // NOTES keeps its own selection, so tell it which note was just made; if NOTES
  // isn't open yet it mounts on the newest note anyway
  const openNote = (id: string) =>
    window.dispatchEvent(new CustomEvent('termdeck:open-note', { detail: { id } }));

  const flash = (msg: string) => {
    setHint(msg);
    if (hintTimer.current != null) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 2000);
  };

  const run = (e: FormEvent) => {
    e.preventDefault();
    const raw = val.trim();
    if (!raw) return;
    setVal('');

    if (raw.startsWith('/')) {
      const [cmd, ...rest] = raw.slice(1).split(' ');
      const arg = rest.join(' ').trim();
      const c = cmd.toLowerCase();

      // a bare alias switches modules; with an argument the handlers below win
      // (so `/todo buy milk` adds a task instead of just opening TODO)
      if (moduleAliases[c] && !arg) return setModule(moduleAliases[c]);
      if (c === 'go' && moduleAliases[arg.toLowerCase()])
        return setModule(moduleAliases[arg.toLowerCase()]);
      if (c === 'todo' && arg) {
        addTask(arg);
        return flash(`task added: ${arg}`);
      }
      if (c === 'note' && arg) {
        openNote(addNote(arg));
        return setModule('notes');
      }
      if (c === 'goal') {
        if (arg) {
          const today = todayISO();
          addGoal(arg, today, addDays(today, 30));
          flash(`goal created: ${arg}`);
        }
        return setModule('goals');
      }
      if (c === 'start') {
        setModule('focus');
        return startTimer();
      }
      if (c === 'pause') return pauseTimer();
      if (c === 'reset') return resetTimer();
      if (c === 'login' || c === 'account') {
        window.dispatchEvent(new CustomEvent('termdeck:open-account'));
        return;
      }
      // not /reset — that one resets the focus timer
      if (c === 'forgot' || c === 'passwd') {
        window.dispatchEvent(new CustomEvent('termdeck:open-account', { detail: { pw: true } }));
        return;
      }
      if (c === 'logout') {
        void signOut();
        return flash('signed out — data stays on this computer');
      }
      if (c === 'sync') {
        forceSync();
        return flash('syncing…');
      }
      if (c === 'help') {
        ref.current?.blur(); // so the help page's keys (Esc, ?) aren't eaten by the input
        window.dispatchEvent(new CustomEvent('termdeck:open-help'));
        return;
      }
      if (moduleAliases[c]) return setModule(moduleAliases[c]); // alias + stray text
      return flash(`unknown command: /${c}  ·  try /help`);
    }

    // plain text → context-aware action
    if (activeModule === 'notes') {
      openNote(addNote(raw));
      return flash('note created');
    }
    if (activeModule === 'focus') {
      const id = addTask(raw);
      if (id) setActiveTask(id);
      return flash(`focusing on: ${raw}`);
    }
    addTask(raw);
    flash(`task added: ${raw}`);
  };

  const placeholder =
    activeModule === 'notes'
      ? 'type a note title + Enter…    (or /help)'
      : activeModule === 'focus'
        ? 'type a task to focus on + Enter…    (or /start)'
        : 'quick-add a task + Enter…    (or /help)';

  return (
    <form className="cmdbar" onSubmit={run}>
      <span className="cmd-prompt">
        grindcade<span className="cmd-mod"> {activeModule}</span> &gt;
      </span>
      <input
        ref={ref}
        className="cmd-input"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      {hint ? (
        <span className="cmd-hint">{hint}</span>
      ) : (
        <span className="cmd-help">
          <kbd>/</kbd> jump here · <kbd>1-9</kbd> switch module
        </span>
      )}
    </form>
  );
}
