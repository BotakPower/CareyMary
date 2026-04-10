import { app, BrowserWindow, ipcMain } from 'electron';
import { createOverlayWindow } from './overlay-window';

// Chromium could not create its on-disk GPU/shader cache (common on Windows with locked profile dirs).
// Harmless for CareyMary; this avoids noisy console errors. Remove if you rely on that cache for perf.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let overlayWindow: BrowserWindow | null = null;

function registerOverlayIpcHandlers(): void {
  ipcMain.on('overlay:set-passthrough', (_event, passthrough: unknown) => {
    if (typeof passthrough !== 'boolean') {
      return;
    }
    const win = overlayWindow;
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(passthrough, { forward: true });
    }
  });

  ipcMain.on('overlay:quit', () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  registerOverlayIpcHandlers();
  overlayWindow = createOverlayWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      overlayWindow = createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
