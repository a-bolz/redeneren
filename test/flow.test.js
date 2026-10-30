// test/flow.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlow, submitAnswer, flowTimeout, feedbackDone } from '../flow.js';

test('correct at fast tier advances immediately without feedback', () => {
  const flow = createFlow({ keys: ['1+1', '2+2'], visualOnCorrect: false });
  const r = submitAnswer(flow, true, 1200);
  assert.deepEqual(r, { feedback: null, done: false });
  assert.equal(flow.index, 1);
  assert.equal(flow.phase, 'question');
  assert.deepEqual(flow.results, [{ key: '1+1', correct: true, time: 1200 }]);
});

test('correct at slowest tier shows 700ms feedback, then advances on feedbackDone', () => {
  const flow = createFlow({ keys: ['1+1', '2+2'], visualOnCorrect: true });
  const r = submitAnswer(flow, true, 1200);
  assert.deepEqual(r, { feedback: 'correct', durationMs: 700, done: false });
  assert.equal(flow.phase, 'feedback');
  assert.equal(flow.index, 0);
  const r2 = feedbackDone(flow);
  assert.deepEqual(r2, { feedback: null, done: false });
  assert.equal(flow.index, 1);
});

test('wrong always shows 1500ms feedback', () => {
  const flow = createFlow({ keys: ['1+1'], visualOnCorrect: false });
  const r = submitAnswer(flow, false, 3000);
  assert.deepEqual(r, { feedback: 'wrong', durationMs: 1500, done: false });
});

test('last item leads to done', () => {
  const flow = createFlow({ keys: ['1+1'], visualOnCorrect: false });
  const r = submitAnswer(flow, true, 900);
  assert.deepEqual(r, { feedback: null, done: true });
  assert.equal(flow.phase, 'done');
});

test('wrong on last item: done only after feedback', () => {
  const flow = createFlow({ keys: ['1+1'], visualOnCorrect: false });
  submitAnswer(flow, false, 900);
  const r = feedbackDone(flow);
  assert.deepEqual(r, { feedback: null, done: true });
});

test('double answer is ignored: one result, one advance', () => {
  const flow = createFlow({ keys: ['1+1', '2+2'], visualOnCorrect: false });
  submitAnswer(flow, false, 900);           // -> feedback phase
  assert.equal(submitAnswer(flow, true, 950), null);  // double tap ignored
  assert.equal(flowTimeout(flow), null);              // timer race ignored
  assert.equal(flow.results.length, 1);
  assert.equal(flow.index, 0);
});

test('feedbackDone in question phase is ignored', () => {
  const flow = createFlow({ keys: ['1+1'], visualOnCorrect: false });
  assert.equal(feedbackDone(flow), null);
});

test('timeout records incorrect with null time', () => {
  const flow = createFlow({ keys: ['1+1'], visualOnCorrect: false });
  const r = flowTimeout(flow);
  assert.equal(r.feedback, 'wrong');
  assert.deepEqual(flow.results, [{ key: '1+1', correct: false, time: null }]);
});

test('custom feedback durations flow through to events', () => {
  const flow = createFlow({ keys: ['1+1', '2+2'], visualOnCorrect: true, correctMs: 300, wrongMs: 2500 });
  assert.deepEqual(submitAnswer(flow, true, 900), { feedback: 'correct', durationMs: 300, done: false });
  feedbackDone(flow);
  assert.deepEqual(submitAnswer(flow, false, 900), { feedback: 'wrong', durationMs: 2500, done: false });
});
