// NOTE: This file is loaded as a plain script, not as an ES module.
// It must have no top-level imports/exports or tsc will emit CommonJS
// wrappers that reference `exports` (undefined in the browser context).
// Cody replaces this stub with the real sprite animation.

type CharacterState = 'idle' | 'talking' | 'alert' | 'happy' | 'sleeping';

interface CareyMaryAPI {
  onCharacterState: (callback: (state: CharacterState) => void) => void;
}

console.log('renderer loaded');

const api = (window as Window & { careymary?: CareyMaryAPI }).careymary;
if (api) {
  api.onCharacterState((state) => {
    console.log('character-state:', state);
  });
} else {
  console.warn('window.careymary not available - preload failed?');
}
