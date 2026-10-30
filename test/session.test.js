// test/session.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { store = {}; },
};

const { calculateWeight, selectKeys, shuffle } = await import('../session.js');
const { updateFactStats, toggleFocus } = await import('../state.js');

beforeEach(() => { store = {}; });

test('unseen fact has weight 1', () => {
  assert.equal(calculateWeight({ attempts: 0, correct: 0, totalTime: 0, focused: false }, 5000, false), 1);
});

test('slow facts weigh more than fast facts', () => {
  const slow = calculateWeight({ attempts: 1, correct: 1, totalTime: 4500, focused: false }, 5000, false);
  const fast = calculateWeight({ attempts: 1, correct: 1, totalTime: 1000, focused: false }, 5000, false);
  assert.ok(slow > fast);
});

test('focus doubles, last-session error multiplies 1.5x', () => {
  const base = calculateWeight({ attempts: 0, correct: 0, totalTime: 0, focused: false }, 5000, false);
  assert.equal(calculateWeight({ attempts: 0, correct: 0, totalTime: 0, focused: true }, 5000, false), base * 2);
  assert.equal(calculateWeight({ attempts: 0, correct: 0, totalTime: 0, focused: false }, 5000, true), base * 1.5);
});

test('selectKeys returns requested count from the list', () => {
  const keys = ['1+1', '2+2', '3+3'];
  const out = selectKeys(keys, 5000, 10, new Set());
  assert.equal(out.length, 10);
  for (const k of out) assert.ok(keys.includes(k));
});

test('shuffle returns an unbiased permutation of the input', () => {
  const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const firstSeen = new Set();
  for (let i = 0; i < 500; i++) {
    const out = shuffle(input);
    assert.deepEqual([...out].sort(), [...input].sort());
    firstSeen.add(out[0]);
  }
  // Fisher–Yates: every element should reach position 0 within 500 runs
  assert.equal(firstSeen.size, input.length);
});

test('heavily weighted key dominates selection', () => {
  const keys = ['1+1', '2+2'];
  toggleFocus('2+2');
  updateFactStats('2+2', { correct: true, time: 4900 });
  let count22 = 0;
  for (let i = 0; i < 30; i++) {
    for (const k of selectKeys(keys, 5000, 10, new Set(['2+2']))) if (k === '2+2') count22++;
  }
  assert.ok(count22 > 150, `expected 2+2 to dominate, got ${count22}/300`);
});
