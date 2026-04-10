// NOTE: This file is loaded as a plain script, not as an ES module.
// It must have no top-level imports/exports or tsc will emit CommonJS
// wrappers that reference `exports` (undefined in the browser context).

type CharacterState = 'idle' | 'talking' | 'alert' | 'happy' | 'sleeping';

interface CareyMaryAPI {
  onCharacterState: (callback: (state: CharacterState) => void) => void;
  setOverlayPassthrough: (passthrough: boolean) => void;
  quitCareyMary: () => void;
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
const exitBtn = document.getElementById('exit-careymary');
const api = (window as Window & { careymary?: CareyMaryAPI }).careymary;

function wireExitControl(bridge: CareyMaryAPI): void {
  if (!exitBtn) {
    return;
  }

  let passthrough = true;

  function setPassthrough(next: boolean): void {
    if (next === passthrough) {
      return;
    }
    passthrough = next;
    bridge.setOverlayPassthrough(next);
  }

  document.addEventListener(
    'mousemove',
    (ev: MouseEvent) => {
      const r = exitBtn.getBoundingClientRect();
      const over =
        ev.clientX >= r.left &&
        ev.clientX <= r.right &&
        ev.clientY >= r.top &&
        ev.clientY <= r.bottom;
      setPassthrough(!over);
    },
    { passive: true },
  );

  document.addEventListener('mouseleave', () => {
    setPassthrough(true);
  });

  exitBtn.addEventListener('click', () => {
    bridge.quitCareyMary();
  });
}

if (!el) {
  console.warn('#character missing');
} else {
  applyCharacterState(el, 'idle');
  if (api) {
    api.onCharacterState((state) => {
      applyCharacterState(el, state);
    });
    wireExitControl(api);
  } else {
    console.warn('window.careymary not available - preload failed?');
  }
}
