'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const src = path.join(projectRoot, 'src', 'renderer');
const dst = path.join(projectRoot, 'dist', 'renderer');

fs.mkdirSync(dst, { recursive: true });

for (const f of fs.readdirSync(src)) {
  if (/\.(html|css|png)$/i.test(f)) {
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
}

// Copy the Agora RTC SDK into dist/renderer/ so index.html can reference it
// locally. This keeps the renderer self-contained and survives electron-builder
// packaging (asar + node_modules pruning).
const sdkSrc = path.join(
  projectRoot,
  'node_modules',
  'agora-rtc-sdk-ng',
  'AgoraRTC_N-production.js',
);
const sdkDst = path.join(dst, 'AgoraRTC_N-production.js');

if (!fs.existsSync(sdkSrc)) {
  console.error(
    '[copy-renderer-assets] Agora RTC SDK not found at',
    sdkSrc,
    '\n  Run `npm install` first.',
  );
  process.exit(1);
}

fs.copyFileSync(sdkSrc, sdkDst);
