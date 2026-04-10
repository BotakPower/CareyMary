import { app, BrowserWindow } from 'electron';
import { createOverlayWindow } from './overlay-window';

let overlayWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
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
