// flow.js
export function createFlow({ keys, visualOnCorrect, correctMs = 700, wrongMs = 1500 }) {
  return { keys, visualOnCorrect, correctMs, wrongMs, index: 0, phase: 'question', results: [] };
}

function advance(flow) {
  flow.index += 1;
  if (flow.index >= flow.keys.length) {
    flow.phase = 'done';
    return { feedback: null, done: true };
  }
  flow.phase = 'question';
  return { feedback: null, done: false };
}

export function submitAnswer(flow, correct, time) {
  if (flow.phase !== 'question') return null;
  flow.results.push({ key: flow.keys[flow.index], correct, time });
  if (!correct) {
    flow.phase = 'feedback';
    return { feedback: 'wrong', durationMs: flow.wrongMs, done: false };
  }
  if (flow.visualOnCorrect) {
    flow.phase = 'feedback';
    return { feedback: 'correct', durationMs: flow.correctMs, done: false };
  }
  return advance(flow);
}

export function flowTimeout(flow) {
  return submitAnswer(flow, false, null);
}

export function feedbackDone(flow) {
  if (flow.phase !== 'feedback') return null;
  return advance(flow);
}
