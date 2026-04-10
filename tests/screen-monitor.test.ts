import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { ScreenMonitor } from '../src/core/screen-monitor';
import { ScreenState, AppCategory } from '../src/types/index';

describe('ScreenMonitor', () => {
  describe('classifyApp()', () => {
    let monitor: ScreenMonitor;

    beforeEach(() => {
      monitor = new ScreenMonitor();
    });

    it('classifies VS Code as productive', () => {
      const category = monitor.classifyApp('Visual Studio Code', 'Visual Studio Code');
      assert.equal(category, 'productive');
    });

    it('classifies YouTube browser title as distraction', () => {
      const category = monitor.classifyApp('Google Chrome', 'YouTube - Google Chrome');
      assert.equal(category, 'distraction');
    });

    it('classifies Reddit browser title as distraction', () => {
      const category = monitor.classifyApp('Google Chrome', 'Reddit - Google Chrome');
      assert.equal(category, 'distraction');
    });

    it('classifies Slack as neutral', () => {
      const category = monitor.classifyApp('Slack', 'Slack');
      assert.equal(category, 'neutral');
    });

    it('classifies unknown apps as neutral', () => {
      const category = monitor.classifyApp('SomeRandomApp', 'SomeRandomApp');
      assert.equal(category, 'neutral');
    });

    it('classifies zoom.us as break', () => {
      const category = monitor.classifyApp('zoom.us', 'zoom.us');
      assert.equal(category, 'break');
    });
  });

  describe('getState()', () => {
    it('returns a valid initial ScreenState', () => {
      const monitor = new ScreenMonitor();
      const state: ScreenState = monitor.getState();
      assert.equal(typeof state.appName, 'string');
      assert.ok(['productive', 'distraction', 'neutral', 'break'].includes(state.category));
      assert.equal(typeof state.activeFor, 'number');
      assert.equal(typeof state.distractionStreak, 'number');
      assert.equal(typeof state.productiveStreak, 'number');
    });
  });

  describe('start() / stop()', () => {
    it('starts and stops without throwing', (_, done) => {
      const monitor = new ScreenMonitor();
      monitor.start();
      setTimeout(() => {
        monitor.stop();
        done();
      }, 100);
    });
  });

  describe('on("change")', () => {
    it('registers a change listener without throwing', () => {
      const monitor = new ScreenMonitor();
      assert.doesNotThrow(() => {
        monitor.on('change', (_state: ScreenState) => {});
      });
    });
  });
});
