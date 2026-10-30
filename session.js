// session.js
import { getFactStats } from './state.js';

export function calculateWeight(stats, timerDuration, hadErrorLastSession) {
  let weight = 1;
  if (stats.correct > 0) {
    const avgTime = stats.totalTime / stats.correct;
    weight = 1 + (avgTime / timerDuration) * 2;
  }
  if (stats.focused) weight *= 2;
  if (hadErrorLastSession) weight *= 1.5;
  return weight;
}

export function selectKeys(keyList, timerDuration, count, lastSessionErrors) {
  const weighted = keyList.map(key => {
    const stats = getFactStats(key);
    const weight = calculateWeight(stats, timerDuration, lastSessionErrors.has(key));
    return { key, weight };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const cumulative = [];
  let running = 0;
  for (const { key, weight } of weighted) {
    running += weight / totalWeight;
    cumulative.push({ key, threshold: running });
  }

  const selected = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    const pick = cumulative.find(c => r <= c.threshold);
    selected.push(pick ? pick.key : keyList[0]);
  }
  return selected;
}

export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
