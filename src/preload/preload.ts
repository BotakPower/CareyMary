import { contextBridge, ipcRenderer } from 'electron';
import type { CareyMaryAPI, CharacterState } from '../types';

const api: CareyMaryAPI = {
  onCharacterState: (callback: (state: CharacterState) => void) => {
    ipcRenderer.on('character-state', (_event, state: CharacterState) => {
      callback(state);
    });
  },
};

contextBridge.exposeInMainWorld('careymary', api);
