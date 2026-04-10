import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

/**
 * Creates the transparent click-through overlay window anchored bottom-left.
 * SimYee (Dev 3) owns this module post-foundation - must preserve this signature.
 */
export function createOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { height: screenHeight } = primaryDisplay.workAreaSize;

  const overlay = new BrowserWindow({
    width: 200,
    height: 200,
    x: 0,
    y: screenHeight - 200,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(process.platform === 'win32' && { backgroundColor: '#00000000' }),
  });

  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  return overlay;
}
