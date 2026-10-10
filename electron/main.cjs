const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// In dev we point at the Vite server; in the packaged app we load the built files.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 900,
    minHeight: 600,
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
