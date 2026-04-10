// NOTE: This file is loaded as a plain script, not as an ES module.
// It must have no top-level imports/exports or tsc will emit CommonJS
// wrappers that reference `exports` (undefined in the browser context).

type CharacterState = 'idle' | 'talking' | 'alert' | 'happy' | 'sleeping';

interface CareyMaryAPI {
  onCharacterState: (callback: (state: CharacterState) => void) => void;
}

const STATE_CLASSES: CharacterState[] = [
  'idle',
  'talking',
  'alert',
  'happy',
  'sleeping',
];

function applyCharacterState(el: HTMLElement, state: CharacterState) {
  for (const s of STATE_CLASSES) {
    el.classList.remove(`state-${s}`);
  }
  el.classList.add(`state-${state}`);
}

const el = document.getElementById('character');
const api = (window as Window & { careymary?: CareyMaryAPI }).careymary;

if (!el) {
  console.warn('#character missing');
} else {
  applyCharacterState(el, 'idle');
  if (api) {
    api.onCharacterState((state) => {
      applyCharacterState(el, state);
    });
  } else {
    console.warn('window.careymary not available - preload failed?');
  }
}
