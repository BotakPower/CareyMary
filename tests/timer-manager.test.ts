import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { TimerManager } from '../src/core/timer-manager';
import { ReminderType, TimerState } from '../src/types/index';

describe('TimerManager', () => {
  describe('getState()', () => {
    it('returns valid initial state', () => {
      const manager = new TimerManager();
      const state: TimerState = manager.getState();
      assert.equal(typeof state.lastWaterReminder, 'number');
      assert.equal(typeof state.lastBreakReminder, 'number');
      assert.equal(typeof state.lastPostureCheck, 'number');
      assert.equal(typeof state.lastStretchReminder, 'number');
      assert.equal(state.waterCount, 0);
      assert.equal(state.breaksTaken, 0);
    });
  });

  describe('getDueReminders()', () => {
    it('returns empty array when nothing is due', () => {
      const manager = new TimerManager();
      assert.deepEqual(manager.getDueReminders(), []);
    });

    it('returns water when water interval has elapsed', () => {
      const manager = new TimerManager({ waterIntervalMs: 1 }); // 1ms — already overdue
      // Wait a tick for "now" to pass the interval
      const due = manager.getDueReminders();
      assert.ok(due.includes('water'), `Expected 'water' in ${JSON.stringify(due)}`);
    });

    it('returns break when break interval has elapsed', () => {
      const manager = new TimerManager({ breakIntervalMs: 1 });
      const due = manager.getDueReminders();
      assert.ok(due.includes('break'), `Expected 'break' in ${JSON.stringify(due)}`);
    });

    it('returns posture when posture interval has elapsed', () => {
      const manager = new TimerManager({ postureCheckMs: 1 });
      const due = manager.getDueReminders();
      assert.ok(due.includes('posture'), `Expected 'posture' in ${JSON.stringify(due)}`);
    });

    it('returns stretch when stretch interval has elapsed', () => {
      const manager = new TimerManager({ stretchIntervalMs: 1 });
      const due = manager.getDueReminders();
      assert.ok(due.includes('stretch'), `Expected 'stretch' in ${JSON.stringify(due)}`);
    });
  });

  describe('acknowledge()', () => {
    it('clears water from due reminders after acknowledge', () => {
      const manager = new TimerManager({ waterIntervalMs: 1 });
      assert.ok(manager.getDueReminders().includes('water'));
      manager.acknowledge('water');
      assert.ok(!manager.getDueReminders().includes('water'));
    });

    it('increments waterCount on water acknowledge', () => {
      const manager = new TimerManager({ waterIntervalMs: 1 });
      manager.acknowledge('water');
      assert.equal(manager.getState().waterCount, 1);
    });

    it('increments breaksTaken on break acknowledge', () => {
      const manager = new TimerManager({ breakIntervalMs: 1 });
      manager.acknowledge('break');
      assert.equal(manager.getState().breaksTaken, 1);
    });
  });

  describe('on("reminder")', () => {
    it('emits reminder event when due (fast interval)', (_, done) => {
      const manager = new TimerManager({ waterIntervalMs: 50 });
      manager.on('reminder', (type: ReminderType) => {
        assert.equal(type, 'water');
        manager.stop();
        done();
      });
      manager.start();
    });
  });

  describe('start() / stop()', () => {
    it('starts and stops without throwing', () => {
      const manager = new TimerManager();
      assert.doesNotThrow(() => {
        manager.start();
        manager.stop();
      });
    });
  });
});
