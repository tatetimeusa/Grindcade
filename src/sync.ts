import { supabase } from './lib/supabase';
import { useStore } from './store';
import type { CloudData } from './store';

// Local-first sync: the app is fully usable signed-out/offline; when signed in,
// the whole deck syncs as one blob to the user's row in the `decks` table.
// Conflict rule is last-write-wins on the server's updated_at clock.

const PUSH_DEBOUNCE_MS = 2_500;
// focus accrual changes the blob every second during a work session — without a
// max wait the debounce would starve until the session ends
const PUSH_MAX_WAIT_MS = 30_000;
const FOCUS_RECONCILE_MIN_MS = 30_000;

let userId: string | null = null;
let applyingRemote = false;
let reconciling = false;
let lastSnapshot: string | null = null; // JSON of the blob this machine last pushed or pulled
let pushTimer: number | null = null;
let firstPendingAt: number | null = null;
let lastReconcileAt = 0;

function buildBlob(s = useStore.getState()): CloudData {
  return {
    tasks: s.tasks,
    notes: s.notes,
    goals: s.goals,
    reminders: s.reminders,
    completedSessions: s.completedSessions,
    bankedBreakSeconds: s.bankedBreakSeconds,
    bestSnake: s.bestSnake,
    bestScores: s.bestScores,
    settings: s.settings,
    plant: s.plant,
    finishedPlants: s.finishedPlants,
    plantChoices: s.plantChoices,
    pendingGrowth: s.pendingGrowth,
    scanlines: s.scanlines,
    soundEnabled: s.soundEnabled,
    introEnabled: s.introEnabled,
    fxEnabled: s.fxEnabled,
  };
}

function setStatus(status: 'off' | 'syncing' | 'synced' | 'error' | 'offline') {
  useStore.getState().setSyncStatus(status);
}

function failStatus() {
  setStatus(navigator.onLine ? 'error' : 'offline');
}

function clearPushTimer() {
  if (pushTimer != null) window.clearTimeout(pushTimer);
  pushTimer = null;
  firstPendingAt = null;
}

async function pushNow(): Promise<void> {
  if (!supabase || !userId) return;
  clearPushTimer();
  const snap = JSON.stringify(buildBlob());
  setStatus('syncing');
  const { data, error } = await supabase
    .from('decks')
    .upsert({ user_id: userId, data: JSON.parse(snap) as CloudData })
    .select('updated_at')
    .single();
  if (error || !data) {
    failStatus();
    return;
  }
  lastSnapshot = snap;
  useStore.getState().setLastSyncedAt(data.updated_at as string);
  setStatus('synced');
}

// Startup / sign-in / window-focus / back-online: pull if the cloud moved on
// without us, otherwise push anything local that hasn't been pushed yet.
async function reconcile(): Promise<void> {
  if (!supabase || !userId || reconciling) return;
  reconciling = true;
  lastReconcileAt = Date.now();
  try {
    setStatus('syncing');
    const { data: row, error } = await supabase
      .from('decks')
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      failStatus();
      return;
    }

    if (!row) {
      // brand-new account — seed the cloud with this machine's deck
      await pushNow();
      return;
    }

    const st = useStore.getState();
    const cloudIsNewer =
      st.lastSyncedAt == null || // first sign-in on this machine → cloud wins
      new Date(row.updated_at as string).getTime() > new Date(st.lastSyncedAt).getTime();

    if (cloudIsNewer) {
      clearPushTimer();
      applyingRemote = true;
      try {
        st.applyCloudData(row.data as CloudData);
      } finally {
        applyingRemote = false;
      }
      lastSnapshot = JSON.stringify(buildBlob());
      useStore.getState().setLastSyncedAt(row.updated_at as string);
      setStatus('synced');
      return;
    }

    // cloud hasn't moved — push if this machine has unpushed changes
    // (lastSnapshot === null right after startup: push once to be safe, it
    // heals edits made in the final debounce window before the app last quit)
    const snap = JSON.stringify(buildBlob(st));
    if (lastSnapshot === null || snap !== lastSnapshot) {
      await pushNow();
    } else {
      setStatus('synced');
    }
  } finally {
    reconciling = false;
  }
}

function schedulePush() {
  if (!userId || applyingRemote) return;
  const snap = JSON.stringify(buildBlob());
  if (snap === lastSnapshot) return;
  const now = Date.now();
  if (firstPendingAt == null) firstPendingAt = now;
  if (pushTimer != null) window.clearTimeout(pushTimer);
  const overdue = now - firstPendingAt >= PUSH_MAX_WAIT_MS;
  pushTimer = window.setTimeout(() => void pushNow(), overdue ? 0 : PUSH_DEBOUNCE_MS);
}

export function initSync(): void {
  if (!supabase) return;

  supabase.auth.onAuthStateChange((event, session) => {
    // defer supabase calls out of the auth callback (it runs under auth-js's lock)
    //
    // USER_UPDATED carries a full session: it's how a finished password recovery
    // turns into a real sign-in. PASSWORD_RECOVERY is deliberately NOT handled —
    // verifying a recovery code creates a session, but the sync engine must stay
    // dormant until the new password is actually set, so a half-finished reset
    // can't pull the cloud deck over this machine's and the account panel keeps
    // showing the reset form.
    if (
      session?.user &&
      (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED')
    ) {
      const isNewUser = userId !== session.user.id;
      userId = session.user.id;
      useStore.getState().setAuth(session.user.email ?? '(no email)');
      if (isNewUser || event === 'INITIAL_SESSION') window.setTimeout(() => void reconcile(), 0);
    } else if (event === 'SIGNED_OUT') {
      userId = null;
      clearPushTimer();
      lastSnapshot = null;
      const st = useStore.getState();
      st.setAuth(null);
      st.setLastSyncedAt(null); // a later sign-in starts fresh: cloud wins
      st.setSyncStatus('off');
    }
  });

  useStore.subscribe(() => {
    schedulePush();
  });

  window.addEventListener('online', () => void reconcile());
  window.addEventListener('offline', () => {
    if (userId) setStatus('offline');
  });
  window.addEventListener('focus', () => {
    if (userId && Date.now() - lastReconcileAt >= FOCUS_RECONCILE_MIN_MS) void reconcile();
  });
}

// ---- called by the account UI ----

// some of these calls have something friendly to say on success, which the
// plain `string | null` error convention below can't express
export type AuthResult = { ok: boolean; message?: string };

export const syncConfigured = supabase !== null;

// Supabase's own minimum. The panel checks this before spending a round trip.
export const MIN_PASSWORD = 6;

const NOT_CONFIGURED = 'sync is not configured in this build';
const UNREACHABLE = 'could not reach the server — try again';

// a recovery code has been verified but the new password isn't set yet
let recoveryPending = false;

type AuthErrorLike = { code?: string; message: string; status?: number; reasons?: string[] };

// Supabase's raw messages swing between terse and jargony; say it plainly instead.
function friendlyAuthError(e: AuthErrorLike): string {
  if (!navigator.onLine || e.status === 0) return "you're offline — reconnect and try again";
  switch (e.code) {
    case 'otp_expired':
      // GoTrue answers the same way for a typo and for a stale code
      return 'that code is wrong or expired — request a new one';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': {
      const secs = /after (\d+) seconds?/.exec(e.message)?.[1];
      return secs
        ? `too many attempts — wait ${secs}s and try again`
        : 'too many attempts — wait a minute and try again';
    }
    case 'same_password':
      return 'new password must be different from your old one';
    case 'weak_password':
      return e.reasons?.length
        ? `password is too weak: ${e.reasons.join(', ')}`
        : `password is too weak — use at least ${MIN_PASSWORD} characters`;
    case 'invalid_credentials':
      return 'wrong email or password';
    case 'user_not_found':
      return 'no account for that email';
    case 'signup_disabled':
      return 'new sign-ups are closed on this server';
    case 'email_address_not_authorized':
      return "the server can't send email to that address yet";
    case 'email_provider_disabled':
      return 'email sign-in is disabled on the server';
    case 'reauthentication_needed':
      return 'for security, sign out and use "forgot password?" instead';
    default:
      return e.message;
  }
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? friendlyAuthError(error) : null; // success flows through onAuthStateChange
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, message: friendlyAuthError(error) };
  // with email confirmation disabled a session comes back immediately
  if (!data.session) return { ok: true, message: 'check your email to confirm the account, then sign in' };
  return { ok: true };
}

// ---- password recovery ----
// The packaged app runs from a file:// page, so the link in a reset email can
// never reach it. We use the 6-digit code instead: request → verify → set.

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    // no redirectTo on purpose — we never consume the emailed link
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { ok: false, message: friendlyAuthError(error) };
    // GoTrue answers 200 even for an address with no account (it won't reveal
    // who has one), so word this so it can't be read as confirmation
    return { ok: true, message: `if ${email} has an account, a code is on its way` };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export async function verifyRecoveryCode(email: string, code: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'recovery',
    });
    if (error) return { ok: false, message: friendlyAuthError(error) };
    if (!data.session) return { ok: false, message: 'that code did not open a session — try again' };
    recoveryPending = true;
    return { ok: true };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

// serves both the recovery flow and changing the password while signed in
export async function setNewPassword(password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: friendlyAuthError(error) };
    recoveryPending = false;
    return { ok: true };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

// Abandoning a reset half-way must not leave a usable session behind. Guarded so
// the account panel can call it unconditionally when it unmounts.
export async function cancelRecovery(): Promise<void> {
  if (!supabase || !recoveryPending) return;
  recoveryPending = false;
  await supabase.auth.signOut();
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export function forceSync(): void {
  void reconcile();
}
