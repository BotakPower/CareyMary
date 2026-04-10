import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

/**
 * Creates the productivity dashboard window. Anchored to the bottom-left of
 * the primary display's work area, positioned immediately to the right of
 * CareyMary's overlay (which is 200px wide at workArea.x). Always on top so
 * it stays visible while the user works in other apps.
 */
export function createDashboardWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const winWidth = 420;
  const winHeight = 260;

  // Overlay width is 200 and anchors at workArea.x. Sit the dashboard right
  // next to it with a small gutter so the character sprite doesn't feel
  // crowded against the panel.
  const OVERLAY_WIDTH = 200;
  const GUTTER = 12;
  const x = workArea.x + OVERLAY_WIDTH + GUTTER;
  const y = workArea.y + workArea.height - winHeight;

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    title: 'CareyMary — Focus Dashboard',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Same backgroundThrottling fix as the overlay — the dashboard also
      // runs in a non-focused always-on-top window and would otherwise get
      // timer-throttled by Chromium.
      backgroundThrottling: false,
    },
  });

  // Match the overlay's stacking level so the dashboard and character sit
  // on the same always-on-top layer across all Spaces / full-screen apps.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'dashboard.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}
