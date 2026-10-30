// test/state.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { store = {}; },
};

const {
  makeKey, initProgress, completeCell, nextCell,
  getFactStats, updateFactStats, toggleFocus,
  getSettings, saveSettings, exportState, importState,
  getLastErrors, saveLastErrors,
} = await import('../state.js');

const track = {
  id: 'verhaaltjes',
  levels: [{ id: 1 }, { id: 2 }, { id: 3 }],
};

beforeEach(() => { store = {}; });

test('makeKey is 1-D: track and level only', () => {
  assert.equal(makeKey('verhaaltjes', 4), 'verhaaltjes:4');
});

test('initProgress unlocks only the first level', () => {
  const p = initProgress(track);
  assert.equal(p['verhaaltjes:1'], 'available');
  assert.equal(p['verhaaltjes:2'], 'locked');
  assert.equal(p['verhaaltjes:3'], 'locked');
  assert.equal(Object.keys(p).length, track.levels.length);
});

test('completeCell marks the level done and unlocks the next', () => {
  initProgress(track);
  const p = completeCell(track, 1);
  assert.equal(p['verhaaltjes:1'], 'completed');
  assert.equal(p['verhaaltjes:2'], 'available');
  assert.equal(p['verhaaltjes:3'], 'locked');
});

test('completeCell at the last level does not create out-of-range keys', () => {
  initProgress(track);
  const p = completeCell(track, 3);
  assert.equal(p['verhaaltjes:3'], 'completed');
  assert.equal(Object.keys(p).length, track.levels.length);
  for (const key of Object.keys(p)) {
    assert.match(key, /^verhaaltjes:[123]$/);
  }
});

test('nextCell returns first available level id; null when none', () => {
  initProgress(track);
  assert.equal(nextCell(track), 1);
  completeCell(track, 1);
  assert.equal(nextCell(track), 2);
  for (const l of [1, 2, 3]) completeCell(track, l);
  assert.equal(nextCell(track), null);
});

test('initProgress does not reopen a fully completed track', () => {
  initProgress(track);
  for (const l of [1, 2, 3]) completeCell(track, l);
  const p = initProgress(track);
  assert.equal(p['verhaaltjes:1'], 'completed');
  assert.equal(p['verhaaltjes:3'], 'completed');
  assert.equal(nextCell(track), null);
});

test('tracks are independent: second track init leaves the first intact', () => {
  initProgress(track);
  completeCell(track, 1);
  const patronen = { id: 'patronen', levels: [{ id: 1 }, { id: 2 }] };
  const p = initProgress(patronen);
  assert.equal(p['patronen:1'], 'available');
  assert.equal(p['patronen:2'], 'locked');
  assert.equal(p['verhaaltjes:1'], 'completed');
  assert.equal(nextCell(patronen), 1);
  assert.equal(nextCell(track), 2);
});

test('fact stats accumulate; time only counted when correct', () => {
  updateFactStats('v:erbij:0:4:3', { correct: true, time: 2100 });
  updateFactStats('v:erbij:0:4:3', { correct: false, time: 4000 });
  const s = getFactStats('v:erbij:0:4:3');
  assert.equal(s.attempts, 2);
  assert.equal(s.correct, 1);
  assert.equal(s.totalTime, 2100);
});

test('toggleFocus flips the flag', () => {
  toggleFocus('v:erbij:0:4:3');
  assert.equal(getFactStats('v:erbij:0:4:3').focused, true);
  toggleFocus('v:erbij:0:4:3');
  assert.equal(getFactStats('v:erbij:0:4:3').focused, false);
});

test('settings defaults and roundtrip', () => {
  assert.deepEqual(getSettings(), {
    itemsPerSession: 10, track: 'verhaaltjes', wrongAnimMs: 2000,
  });
  saveSettings({ itemsPerSession: 15, track: 'logica', wrongAnimMs: 2000 });
  assert.equal(getSettings().track, 'logica');
  assert.equal(getSettings().itemsPerSession, 15);
});

test('export/import roundtrip', () => {
  initProgress(track);
  updateFactStats('v:erbij:0:4:3', { correct: true, time: 1500 });
  const blob = exportState();
  store = {};
  assert.equal(importState(blob), true);
  assert.equal(getFactStats('v:erbij:0:4:3').correct, 1);
  assert.equal(initProgress(track)['verhaaltjes:1'], 'available');
});

test('importState rejects garbage and leaves state untouched', () => {
  updateFactStats('v:erbij:0:4:3', { correct: true, time: 1500 });
  assert.equal(importState('not json {'), false);
  assert.equal(importState('"a string"'), false);
  assert.equal(importState('[1,2]'), false);
  assert.equal(getFactStats('v:erbij:0:4:3').correct, 1);
});

test('corrupt localStorage falls back to defaults', () => {
  store['redeneren:settings'] = '{broken';
  assert.equal(getSettings().itemsPerSession, 10);
  assert.equal(getSettings().track, 'verhaaltjes');
});

test('storage keys are namespaced so flitsen and rekenen (same origin) are untouched', () => {
  saveSettings({ itemsPerSession: 15, track: 'patronen', wrongAnimMs: 1000 });
  updateFactStats('v:erbij:0:4:3', { correct: true, time: 900 });
  saveLastErrors(['v:erbij:0:4:3']);
  initProgress(track);
  for (const k of Object.keys(store)) assert.match(k, /^redeneren:/);
});

test('flitsen settings under the bare key are ignored — redeneren gets its own defaults', () => {
  // flitsen's shape: bare key, no itemsPerSession, no track
  store.settings = JSON.stringify({ mode: 'together', wordsPerSession: 20, groep: 'g3', font: 'default' });
  const s = getSettings();
  assert.deepEqual(s, { itemsPerSession: 10, track: 'verhaaltjes', wrongAnimMs: 2000 });
});

test('rekenen settings under the rekenen: prefix are ignored too', () => {
  store['rekenen:settings'] = JSON.stringify({
    mode: 'solo', itemsPerSession: 50, track: 'tot10', correctAnimMs: 700, wrongAnimMs: 1500,
  });
  assert.deepEqual(getSettings(), { itemsPerSession: 10, track: 'verhaaltjes', wrongAnimMs: 2000 });
});

test('foreign progress objects (bare and rekenen:) never leak into redeneren progress', () => {
  store.progress = JSON.stringify({ 'g3:1': 'completed' });
  store['rekenen:progress'] = JSON.stringify({ 'tot10:1:8000': 'completed' });
  const p = initProgress(track);
  assert.equal(Object.keys(p).length, track.levels.length);
  for (const key of Object.keys(p)) assert.match(key, /^verhaaltjes:/);
});

test('getSettings merges defaults per-field over a partial stored object', () => {
  store['redeneren:settings'] = JSON.stringify({ track: 'patronen' });
  const s = getSettings();
  assert.equal(s.track, 'patronen');
  assert.equal(s.itemsPerSession, 10);
  assert.equal(s.wrongAnimMs, 2000);
});

test('getSettings sanitizes out-of-range itemsPerSession (clamp 5-20)', () => {
  store['redeneren:settings'] = JSON.stringify({ itemsPerSession: 'veel', track: 'verhaaltjes' });
  assert.equal(getSettings().itemsPerSession, 10);
  store['redeneren:settings'] = JSON.stringify({ itemsPerSession: 0, track: 'verhaaltjes' });
  assert.equal(getSettings().itemsPerSession, 10);
  store['redeneren:settings'] = JSON.stringify({ itemsPerSession: 50, track: 'verhaaltjes' });
  assert.equal(getSettings().itemsPerSession, 10);
  store['redeneren:settings'] = JSON.stringify({ itemsPerSession: 5, track: 'verhaaltjes' });
  assert.equal(getSettings().itemsPerSession, 5);
  store['redeneren:settings'] = JSON.stringify({ itemsPerSession: 20, track: 'verhaaltjes' });
  assert.equal(getSettings().itemsPerSession, 20);
});

test('wrongAnimMs defaults and is sanitized (clamp 500-5000)', () => {
  assert.equal(getSettings().wrongAnimMs, 2000);
  store['redeneren:settings'] = JSON.stringify({ wrongAnimMs: 'snel' });
  assert.equal(getSettings().wrongAnimMs, 2000);  // non-numeric -> default
  store['redeneren:settings'] = JSON.stringify({ wrongAnimMs: 100 });
  assert.equal(getSettings().wrongAnimMs, 2000);  // below floor -> default
  store['redeneren:settings'] = JSON.stringify({ wrongAnimMs: 9999 });
  assert.equal(getSettings().wrongAnimMs, 2000);  // above ceiling -> default
  store['redeneren:settings'] = JSON.stringify({ wrongAnimMs: 500 });
  assert.equal(getSettings().wrongAnimMs, 500);
  store['redeneren:settings'] = JSON.stringify({ wrongAnimMs: 5000 });
  assert.equal(getSettings().wrongAnimMs, 5000);
});

test('getLastErrors tolerates corrupt or non-array values', () => {
  store['redeneren:lastErrors'] = '{broken';
  assert.equal(getLastErrors().size, 0);
  store['redeneren:lastErrors'] = '42';
  assert.equal(getLastErrors().size, 0);
  saveLastErrors(['v:erbij:0:4:3', 'p:ab:0:6']);
  assert.deepEqual([...getLastErrors()].sort(), ['p:ab:0:6', 'v:erbij:0:4:3']);
});

test('importState skips malformed sections but imports the rest', () => {
  const blob = JSON.stringify({
    progress: { 'verhaaltjes:1': 'completed' },
    lastErrors: 'not-an-array',
    settings: ['not', 'an', 'object'],
  });
  assert.equal(importState(blob), true);
  assert.equal(getLastErrors().size, 0);
  assert.equal(getSettings().itemsPerSession, 10);
  assert.equal(initProgress(track)['verhaaltjes:1'], 'completed');
});

test('imported progress feeds the repair pass: level behind completed work unlocks', () => {
  assert.equal(importState(JSON.stringify({ progress: { 'verhaaltjes:1': 'completed' } })), true);
  const p = initProgress(track);
  assert.equal(p['verhaaltjes:1'], 'completed');
  assert.equal(p['verhaaltjes:2'], 'available'); // predecessor completed
  assert.equal(p['verhaaltjes:3'], 'locked');
  assert.equal(nextCell(track), 2);
});

test('initProgress backfills levels added after first run and unlocks behind completed work', () => {
  const twoLevels = { id: 'verhaaltjes', levels: [{ id: 1 }, { id: 2 }] };
  initProgress(twoLevels);
  completeCell(twoLevels, 1);
  completeCell(twoLevels, 2);
  const threeLevels = { ...twoLevels, levels: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  const p = initProgress(threeLevels);
  assert.equal(p['verhaaltjes:3'], 'available'); // predecessor completed
});

test('backfilled level stays locked when its predecessor is not completed', () => {
  const twoLevels = { id: 'verhaaltjes', levels: [{ id: 1 }, { id: 2 }] };
  initProgress(twoLevels);
  completeCell(twoLevels, 1);
  const threeLevels = { ...twoLevels, levels: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  const p = initProgress(threeLevels);
  assert.equal(p['verhaaltjes:2'], 'available');
  assert.equal(p['verhaaltjes:3'], 'locked');
});
