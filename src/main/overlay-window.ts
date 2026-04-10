import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

/**
 * Creates the transparent click-through overlay window anchored bottom-left.
 * SimYee (Dev 3) owns this module post-foundation - must preserve this signature.
 *
 * macOS gotcha: `focusable: false` + `transparent: true` renders an invisible
 * window. Keep `focusable: true` and rely on setIgnoreMouseEvents for click-through.
 */
export function createOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const winWidth = 200;
  const winHeight = 200;
  const x = workArea.x;
  const y = workArea.y + workArea.height - winHeight;

  const overlay = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(process.platform === 'win32' && { backgroundColor: '#00000000' }),
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });

  overlay.once('ready-to-show', () => {
    overlay.show();
  });

  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  return overlay;
}
