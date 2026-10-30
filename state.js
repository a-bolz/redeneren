// state.js

// Flitsen and rekenen live on the same origin (a-bolz.github.io): flitsen
// uses bare key names, rekenen uses 'rekenen:' — the prefix keeps the three
// apps from corrupting each other.
const NS = 'redeneren:';

function load(key) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key, data) {
  localStorage.setItem(NS + key, JSON.stringify(data));
}

export function makeKey(trackId, levelId) {
  return `${trackId}:${levelId}`;
}

export function initProgress(track) {
  const progress = load('progress') || {};
  let changed = false;

  // Backfill cells for levels added after the track was first run
  for (const level of track.levels) {
    const key = makeKey(track.id, level.id);
    if (progress[key] === undefined) {
      progress[key] = 'locked';
      changed = true;
    }
  }

  // Fresh track: open the first level
  const anyActive = track.levels.some(l => {
    const s = progress[makeKey(track.id, l.id)];
    return s === 'available' || s === 'completed';
  });
  if (!anyActive) {
    progress[makeKey(track.id, track.levels[0].id)] = 'available';
    changed = true;
  }

  // Repair pass: backfilled cells never saw completeCell's cascade, so
  // unlock any locked level whose predecessor is already completed.
  for (let li = 1; li < track.levels.length; li++) {
    const prev = progress[makeKey(track.id, track.levels[li - 1].id)];
    const key = makeKey(track.id, track.levels[li].id);
    if (prev === 'completed' && progress[key] === 'locked') {
      progress[key] = 'available';
      changed = true;
    }
  }

  if (changed) save('progress', progress);
  return progress;
}

export function completeCell(track, levelId) {
  const progress = load('progress') || {};
  progress[makeKey(track.id, levelId)] = 'completed';

  const levelIdx = track.levels.findIndex(l => l.id === levelId);
  if (levelIdx >= 0 && levelIdx < track.levels.length - 1) {
    const next = makeKey(track.id, track.levels[levelIdx + 1].id);
    if (progress[next] === 'locked') progress[next] = 'available';
  }

  save('progress', progress);
  return progress;
}

export function nextCell(track) {
  const progress = load('progress') || {};
  for (const level of track.levels)
    if (progress[makeKey(track.id, level.id)] === 'available')
      return level.id;
  return null;
}

const EMPTY_STATS = { attempts: 0, correct: 0, totalTime: 0, focused: false };

export function getFactStats(key) {
  const all = load('factStats') || {};
  return all[key] || { ...EMPTY_STATS };
}

export function updateFactStats(key, result) {
  const all = load('factStats') || {};
  const stats = all[key] || { ...EMPTY_STATS };
  stats.attempts += 1;
  if (result.correct) {
    stats.correct += 1;
    stats.totalTime += result.time;
  }
  all[key] = stats;
  save('factStats', all);
  return stats;
}

export function toggleFocus(key) {
  const all = load('factStats') || {};
  const stats = all[key] || { ...EMPTY_STATS };
  stats.focused = !stats.focused;
  all[key] = stats;
  save('factStats', all);
  return stats;
}

const DEFAULT_SETTINGS = {
  itemsPerSession: 10, track: 'verhaaltjes', wrongAnimMs: 2000,
};

function clampNumber(value, min, max, fallback) {
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function getSettings() {
  // Merge per-field so a foreign or outdated settings object can never
  // produce undefined fields (which would silently break sessions).
  const settings = { ...DEFAULT_SETTINGS, ...(load('settings') || {}) };
  settings.itemsPerSession = clampNumber(settings.itemsPerSession, 5, 20, DEFAULT_SETTINGS.itemsPerSession);
  settings.wrongAnimMs = clampNumber(settings.wrongAnimMs, 500, 5000, DEFAULT_SETTINGS.wrongAnimMs);
  return settings;
}

export function saveSettings(settings) {
  save('settings', settings);
}

export function getLastErrors() {
  const v = load('lastErrors');
  return new Set(Array.isArray(v) ? v : []);
}

export function saveLastErrors(keys) {
  save('lastErrors', [...keys]);
}

const STATE_KEYS = ['progress', 'factStats', 'settings', 'lastErrors'];

export function exportState() {
  const out = {};
  for (const k of STATE_KEYS) {
    const v = load(k);
    if (v !== null) out[k] = v;
  }
  return JSON.stringify(out);
}

export function importState(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return false;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  for (const k of STATE_KEYS) {
    const v = data[k];
    if (v === undefined) continue;
    if (k === 'lastErrors' && !Array.isArray(v)) continue;
    if (k !== 'lastErrors' && (typeof v !== 'object' || v === null || Array.isArray(v))) continue;
    save(k, v);
  }
  return true;
}
