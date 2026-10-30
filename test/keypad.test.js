// test/keypad.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keypadPress } from '../keypad.js';

test('digit accumulates without submit until expected length', () => {
  assert.deepEqual(keypadPress('', '1', 2), { value: '1', submit: false });
});

test('submits exactly at expected length', () => {
  assert.deepEqual(keypadPress('1', '3', 2), { value: '13', submit: true });
});

test('single-digit answer submits on first press, including 0', () => {
  assert.deepEqual(keypadPress('', '0', 1), { value: '0', submit: true });
});

test('backspace removes last digit, never submits', () => {
  assert.deepEqual(keypadPress('13', 'back', 2), { value: '1', submit: false });
  assert.deepEqual(keypadPress('', 'back', 1), { value: '', submit: false });
});

test('input beyond expected length is ignored', () => {
  assert.deepEqual(keypadPress('13', '7', 2), { value: '13', submit: false });
});

test('non-digit keys are ignored', () => {
  assert.deepEqual(keypadPress('1', 'x', 2), { value: '1', submit: false });
});
