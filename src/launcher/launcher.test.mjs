import assert from 'node:assert/strict';
import test from 'node:test';

import { Launcher } from './launcher.js';

test('closing the launcher is idempotent and emits a single notification', () => {
  let closeEvents = 0;
  let hiddenCalls = 0;
  const launcher = Object.assign(Object.create(Launcher.prototype), {
    _open: true,
    _el: {
      classList: {
        add(value) {
          assert.equal(value, 'is-hidden');
          hiddenCalls += 1;
        },
      },
    },
    bus: {
      emit() {
        closeEvents += 1;
      },
    },
  });

  launcher.close();
  launcher.close();

  assert.equal(launcher._open, false);
  assert.equal(hiddenCalls, 1);
  assert.equal(closeEvents, 1);
});
