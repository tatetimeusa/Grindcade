const { app, BrowserWindow, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// In dev we point at the Vite server; in the packaged app we load the built files.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

// Window zoom: a little bigger than 100% by default, Ctrl/Cmd + and - to
// adjust, 0 to reset. Saved per machine (zoom.json in the data folder), not
// synced, since the right size depends on the screen.
const ZOOM_DEFAULT = 1.12;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
// the smallest window the layout is built for, at 100%
const MIN_W = 900;
const MIN_H = 600;
const zoomFile = () => path.join(app.getPath('userData'), 'zoom.json');

function readZoom() {
  try {
    const z = JSON.parse(fs.readFileSync(zoomFile(), 'utf8')).factor;
    if (typeof z === 'number' && z >= ZOOM_MIN && z <= ZOOM_MAX) return z;
  } catch {}
  return ZOOM_DEFAULT;
}

function saveZoom(factor) {
  try {
    fs.writeFileSync(zoomFile(), JSON.stringify({ factor }));
  } catch {}
}

function wireZoom(win) {
  let factor = readZoom();
  // Zooming shrinks the page in CSS pixels, so the minimum window size grows
  // with it and the layout never gets squeezed below what it was built for.
  // On a screen too small for the asked zoom, stop at the largest that fits.
  const fit = (f) => {
    const { width, height } = screen.getDisplayMatching(win.getBounds()).workAreaSize;
    return Math.min(f, width / MIN_W, height / MIN_H);
  };
  const apply = () => {
    const f = fit(factor);
    const minW = Math.ceil(MIN_W * f);
    const minH = Math.ceil(MIN_H * f);
    win.setMinimumSize(minW, minH);
    // setMinimumSize doesn't grow a window that's already smaller
    const [w, h] = win.getSize();
    if (w < minW || h < minH) {
      win.setSize(Math.max(w, minW), Math.max(h, minH));
      const area = screen.getDisplayMatching(win.getBounds()).workArea;
      const b = win.getBounds();
      if (b.x + b.width > area.x + area.width || b.y + b.height > area.y + area.height) win.center();
    }
    win.webContents.setZoomFactor(f);
  };
  win.webContents.on('did-finish-load', apply);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    let next = null;
    if (input.key === '=' || input.key === '+') next = factor + ZOOM_STEP;
    else if (input.key === '-' || input.key === '_') next = factor - ZOOM_STEP;
    else if (input.key === '0') next = ZOOM_DEFAULT;
    if (next == null) return;
    event.preventDefault(); // the hidden default menu would zoom too
    factor = Math.round(fit(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))) * 100) / 100;
    apply();
    saveZoom(factor);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: MIN_W,
    minHeight: MIN_H,
    backgroundColor: '#070a10',
    title: 'Grindcade',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      // keep timers (the FOCUS heartbeat) running at full rate while minimized
      backgroundThrottling: false,
      // let the startup whoosh play on launch without a prior click
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  wireZoom(win);

  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // open any external links in the user's real browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Keep the data folder from the TermDeck days. Electron names it after the
// app, so without this the rename to Grindcade would open every existing user
// on an empty deck. Must run before the single-instance lock, which lives in
// this folder too. An explicit --user-data-dir (the demo shortcut's empty
// filming profile) still wins.
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', path.join(app.getPath('appData'), 'termdeck'));
}

// gives the app a stable identity so renderer Notifications become real
// Windows toasts (and don't show up as a generic "electron.app" sender)
if (process.platform === 'win32') app.setAppUserModelId('com.termdeck.app');

// Only one Grindcade at a time. Every copy of the app reads the same Local
// Storage profile, so two instances running together would each write the
// whole store and the last one to save would win, quietly losing whatever
// the other had done.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // someone launched a second copy: surface the window we already have
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
