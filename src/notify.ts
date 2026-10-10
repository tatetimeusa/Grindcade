// Native notification helpers for the REMINDERS module. In the packaged
// Electron app, renderer-side `new Notification(...)` routes straight to a
// Windows toast (the AppUserModelID is set in electron/main.cjs). In a dev
// browser the same API works once the user grants permission.

import { fmtClockTime } from './reminders';

// Ask for permission at a moment we know is a user gesture (creating a
// reminder), so the browser doesn't swallow the prompt.
export function ensureNotifyPermission(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

export function notifyReminder(text: string, opts: { missed: boolean; scheduledFor: number }): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const body = opts.missed ? `MISSED (was ${fmtClockTime(opts.scheduledFor)}): ${text}` : text;
  try {
    // silent — the in-app chime handles sound (and respects the SND toggle)
    new Notification('Grindcade reminder', { body, silent: true });
  } catch {
    // some environments throw instead of ignoring; a lost toast is fine
  }
}
