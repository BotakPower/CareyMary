import { BrowserWindow } from 'electron';
import * as path from 'path';

export function createDashboardWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 260,
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    title: 'CareyMary — Focus Dashboard',
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'dashboard.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}

