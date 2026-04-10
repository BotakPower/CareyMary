import { Tray, Menu, app, nativeImage, ipcMain } from 'electron';
import * as path from 'path';

/**
 * Creates the system tray icon and context menu.
 * SimYee (Dev 3) owns this module.
 *
 * Tray actions are fired as synthetic ipcMain events so Edmund can
 * wire them into the main loop with ipcMain.on():
 *   'tray:mic-toggle'  (isMuted: boolean)
 *   'tray:pause-toggle' (isPaused: boolean)
 *   'tray:ack-water'
 *   'tray:ack-break'
 */
export function createTray(): Tray {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  let icon = nativeImage.createFromPath(iconPath);

  // Fallback: if asset isn't ready yet, use a small transparent placeholder
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAC0lEQVQ42mNk+A8AAQUBAScAAAAAElFTkSuQmCC'
    );
  }

  const tray = new Tray(icon);
  tray.setToolTip('CareyMary');

  let isMuted = false;
  let isPaused = false;

  const rebuildMenu = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: '📊 Dashboard',
        click: () => ipcMain.emit('tray:toggle-dashboard'),
      },
      { type: 'separator' },
      {
        label: isMuted ? '🎙️ Unmute Mic' : '🎙️ Mute Mic',
        click: () => {
          isMuted = !isMuted;
          ipcMain.emit('tray:mic-toggle', null, isMuted);
          tray.setContextMenu(rebuildMenu());
        },
      },
      {
        label: isPaused ? '▶️ Resume' : '⏸️ Pause CareyMary',
        click: () => {
          isPaused = !isPaused;
          ipcMain.emit('tray:pause-toggle', null, isPaused);
          tray.setContextMenu(rebuildMenu());
        },
      },
      { type: 'separator' },
      {
        label: '💧 I drank water',
        click: () => ipcMain.emit('tray:ack-water'),
      },
      {
        label: '🧘 Taking a break',
        click: () => ipcMain.emit('tray:ack-break'),
      },
      { type: 'separator' },
      {
        label: '❌ Quit',
        click: () => app.quit(),
      },
    ]);
    return menu;
  };

  tray.setContextMenu(rebuildMenu());

  return tray;
}
