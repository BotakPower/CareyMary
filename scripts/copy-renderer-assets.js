'use strict';

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'renderer');
const dst = path.join(__dirname, '..', 'dist', 'renderer');

fs.mkdirSync(dst, { recursive: true });

for (const f of fs.readdirSync(src)) {
  if (/\.(html|css|png)$/i.test(f)) {
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
}
