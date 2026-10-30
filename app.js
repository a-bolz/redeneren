// app.js
import { TRACKS, renderItem } from './items.js';
import {
  makeKey, initProgress, completeCell, nextCell,
  getFactStats, updateFactStats, toggleFocus,
  getSettings, saveSettings, exportState, importState,
  getLastErrors, saveLastErrors,
} from './state.js';
import { selectKeys, shuffle } from './session.js';
import { createFlow, submitAnswer, feedbackDone } from './flow.js';
import { createKeypad } from './keypad.js';

// --- Screen routing ---

const screens = document.querySelectorAll('.screen');

function showScreen(id) {
  screens.forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

// --- State ---

let current = null; // { track, level, type, flow, startTime, keypad, item }

function resolveTrack() {
  const settings = getSettings();
  return TRACKS.find(t => t.id === settings.track) || TRACKS[0];
}

// --- Home ---

function renderMatrix() {
  const track = resolveTrack();
  const progress = initProgress(track);

  const grid = document.getElementById('matrix-grid');
  grid.innerHTML = '';
  for (const level of track.levels) {
    const row = document.createElement('div');
    row.className = 'matrix-row';

    const label = document.createElement('div');
    label.className = 'level-label';
    label.textContent = level.name;
    row.appendChild(label);

    const cell = document.createElement('div');
    const state = progress[makeKey(track.id, level.id)];
    cell.className = `matrix-cell cell-${state}`;
    if (state === 'available' || state === 'completed') {
      cell.addEventListener('click', () => openCellModal(level.id));
    }
    row.appendChild(cell);
    grid.appendChild(row);
  }

  const next = nextCell(track);
  const vandaag = document.getElementById('btn-vandaag');
  vandaag.disabled = next === null;
  vandaag.textContent = next !== null ? 'Vandaag' : 'Alles af!';
}

function openCellModal(levelId) {
  const track = resolveTrack();
  const levelData = track.levels.find(l => l.id === levelId);
  const modal = document.getElementById('cell-modal');
  document.getElementById('modal-title').textContent = levelData.name;
  modal.classList.remove('hidden');
  document.getElementById('btn-practice').onclick = () => {
    modal.classList.add('hidden');
    startSession(levelId, 'practice');
  };
  document.getElementById('btn-exam').onclick = () => {
    modal.classList.add('hidden');
    startSession(levelId, 'exam');
  };
  document.getElementById('btn-cancel').onclick = () => modal.classList.add('hidden');
}

function initTrackSelect() {
  const select = document.getElementById('track-select');
  for (const track of TRACKS) {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.name;
    select.appendChild(option);
  }
  select.value = resolveTrack().id;
  select.addEventListener('change', () => {
    saveSettings({ ...getSettings(), track: select.value });
    renderMatrix();
  });
}

function initVandaag() {
  document.getElementById('btn-vandaag').addEventListener('click', () => {
    const levelId = nextCell(resolveTrack());
    if (levelId !== null) startSession(levelId, 'practice');
  });
}

// --- Session ---

// Nominal duration used only to weight practice selection (session.js);
// there is no visible timer in this app.
const WEIGHT_DURATION_MS = 30000;
const CORRECT_MS = 600;

function startSession(levelId, type) {
  const track = resolveTrack();
  const levelData = track.levels.find(l => l.id === levelId);
  const settings = getSettings();
  const lastErrors = getLastErrors();

  const keys = type === 'practice'
    ? selectKeys(levelData.keys, WEIGHT_DURATION_MS, settings.itemsPerSession, lastErrors)
    : shuffle(levelData.keys);

  current = {
    track, level: levelId, type,
    flow: createFlow({
      keys,
      visualOnCorrect: true, // always pause CORRECT_MS so the green state is visible
      correctMs: CORRECT_MS,
      wrongMs: settings.wrongAnimMs,
    }),
    startTime: 0,
    keypad: null,
    item: null,
  };

  showScreen('session');
  renderSessionScreen();
  showItem();
}

function renderSessionScreen() {
  const container = document.getElementById('screen-session');
  container.innerHTML = `
    <button class="btn-abort" id="btn-abort">×</button>
    <div class="item-text" id="item-text"></div>
    <div class="explain-line" id="explain-line"></div>
    <div class="choices" id="choices"></div>
    <div id="keypad-mount"></div>
    <div class="session-progress" id="session-progress"></div>
  `;

  document.getElementById('btn-abort').addEventListener('click', abortSession);

  current.keypad = createKeypad(entered => {
    current.keypad.lock();
    answerKeypad(entered);
  });
  document.getElementById('keypad-mount').appendChild(current.keypad.element);
}

function currentKey() {
  return current.flow.keys[current.flow.index];
}

function abortSession() {
  current = null;
  showScreen('home');
  renderMatrix();
}

function showItem() {
  const key = currentKey();
  const item = renderItem(key);
  current.item = item;

  const textEl = document.getElementById('item-text');
  textEl.textContent = item.text;
  textEl.className = `item-text${item.tokens ? ' tokens' : ''}`;

  const explainEl = document.getElementById('explain-line');
  explainEl.textContent = '';
  explainEl.className = 'explain-line';

  document.getElementById('session-progress').textContent =
    `${current.flow.index + 1} / ${current.flow.keys.length}`;

  const choicesEl = document.getElementById('choices');
  const keypadMount = document.getElementById('keypad-mount');
  choicesEl.innerHTML = '';

  if (item.input === 'keypad') {
    keypadMount.style.display = '';
    current.keypad.reset(String(item.answer).length);
  } else {
    keypadMount.style.display = 'none';
    for (const choice of item.choices) {
      const btn = document.createElement('button');
      btn.className = `choice-btn${item.tokens ? ' token' : ''}`;
      btn.textContent = choice;
      btn.addEventListener('click', () => answerChoice(btn, choice));
      choicesEl.appendChild(btn);
    }
  }

  current.startTime = Date.now();
}

function answerChoice(btn, choice) {
  const item = current.item;
  const correct = choice === item.answer;
  const buttons = document.querySelectorAll('#choices .choice-btn');
  buttons.forEach(b => { b.disabled = true; });
  btn.classList.add(correct ? 'correct' : 'wrong');
  // Always reveal the correct choice (the answer appears exactly once).
  buttons.forEach(b => {
    if (b.textContent === item.answer) b.classList.add('correct');
  });
  showExplain(correct);
  handleAnswer(correct);
}

function answerKeypad(entered) {
  const correct = entered === current.item.answer;
  showExplain(correct);
  handleAnswer(correct);
}

function showExplain(correct) {
  const explainEl = document.getElementById('explain-line');
  explainEl.textContent = current.item.explain;
  explainEl.className = `explain-line ${correct ? 'correct' : 'wrong'}`;
}

function handleAnswer(correct) {
  const key = currentKey();
  const time = Date.now() - current.startTime;
  const r = submitAnswer(current.flow, correct, time);
  if (!r) return;
  updateFactStats(key, { correct, time });
  if (r.feedback) {
    // The feedback phase is just a pause on the inline explain-line.
    const flow = current.flow;
    setTimeout(() => {
      if (!current || current.flow !== flow) return; // session aborted
      const r2 = feedbackDone(current.flow);
      if (!r2) return;
      if (r2.done) endSession();
      else showItem();
    }, r.durationMs);
  } else if (r.done) {
    endSession();
  } else {
    showItem();
  }
}

// --- Results ---

function endSession() {
  const results = current.flow.results;
  const errors = results.filter(r => !r.correct).map(r => r.key);
  saveLastErrors(errors);

  current.passed = current.type === 'exam' && errors.length <= 1;
  if (current.passed) completeCell(current.track, current.level);

  showScreen('results');
  renderResults();
}

function renderResults() {
  const container = document.getElementById('screen-results');
  const results = current.flow.results;
  const correct = results.filter(r => r.correct).length;
  const total = results.length;
  const clean = correct === total;

  const rows = results.map(r => {
    const item = renderItem(r.key);
    const stats = getFactStats(r.key);
    const statusClass = r.correct ? 'correct' : 'wrong';
    return `
      <div class="result-row ${statusClass}">
        <span class="result-icon">${r.correct ? '✓' : '×'}</span>
        <span class="result-word">${item.explain}</span>
        <span class="result-time">${r.time === null ? '—' : (r.time / 1000).toFixed(1) + 's'}</span>
        <button class="btn-star ${stats.focused ? 'focused' : ''}" data-key="${r.key}">★</button>
      </div>`;
  }).join('');

  const header = current.type === 'exam'
    ? (current.passed ? 'Gehaald!' : `${correct} / ${total} — nog niet gehaald`)
    : `${correct} / ${total}`;

  const toetsPrompt = current.type === 'practice' && clean
    ? '<button class="btn btn-primary" id="btn-start-toets">Klaar voor de toets?</button>'
    : '';

  container.innerHTML = `
    <div class="results-header"><h2>${header}</h2></div>
    <div class="results-list">${rows}</div>
    ${toetsPrompt}
    <button class="btn btn-secondary" id="btn-back-home">Terug</button>
  `;

  container.querySelectorAll('.btn-star').forEach(btn => {
    btn.addEventListener('click', () => {
      // The same item can appear in several rows — sync every star for it
      const stats = toggleFocus(btn.dataset.key);
      container.querySelectorAll('.btn-star').forEach(b => {
        if (b.dataset.key === btn.dataset.key) b.classList.toggle('focused', stats.focused);
      });
    });
  });

  const toetsBtn = document.getElementById('btn-start-toets');
  if (toetsBtn) {
    toetsBtn.addEventListener('click', () => startSession(current.level, 'exam'));
  }

  document.getElementById('btn-back-home').addEventListener('click', () => {
    showScreen('home');
    renderMatrix();
  });
}

// --- Settings ---

function renderSettings() {
  const container = document.getElementById('screen-settings');
  const settings = getSettings();
  container.innerHTML = `
    <header class="home-header"><h1>Instellingen</h1></header>
    <div class="settings-list">
      <div class="settings-item">
        <div><div class="settings-item-label">Opgaven per oefensessie</div></div>
        <div class="stepper">
          <button class="stepper-btn" id="stepper-down">−</button>
          <span class="stepper-value" id="stepper-value">${settings.itemsPerSession}</span>
          <button class="stepper-btn" id="stepper-up">+</button>
        </div>
      </div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Tijd bij fout (ms)</div>
          <div class="settings-item-desc">Tijd om het goede antwoord te bekijken</div>
        </div>
        <div class="stepper">
          <button class="stepper-btn" id="anim-fout-down">−</button>
          <span class="stepper-value" id="anim-fout-value">${settings.wrongAnimMs}</span>
          <button class="stepper-btn" id="anim-fout-up">+</button>
        </div>
      </div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Voortgang overzetten</div>
          <div class="settings-item-desc">Kopieer deze tekst naar een ander apparaat</div>
        </div>
      </div>
      <textarea class="export-area" id="export-area"></textarea>
      <button class="btn btn-secondary" id="btn-export">Exporteren</button>
      <button class="btn btn-secondary" id="btn-import">Importeren</button>
      <div id="import-status"></div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Versie</div>
          <div class="settings-item-desc" id="version-label">…</div>
        </div>
      </div>
    </div>
    <button class="btn btn-primary" id="btn-settings-back" style="margin:16px;">Terug</button>
  `;

  function bindStepper(prefix, field, { min, max, step }) {
    const valueEl = document.getElementById(`${prefix}-value`);
    const change = delta => () => {
      const s = getSettings();
      const next = Math.min(max, Math.max(min, s[field] + delta));
      if (next !== s[field]) {
        saveSettings({ ...s, [field]: next });
        valueEl.textContent = next;
      }
    };
    document.getElementById(`${prefix}-down`).addEventListener('click', change(-step));
    document.getElementById(`${prefix}-up`).addEventListener('click', change(step));
  }

  bindStepper('stepper', 'itemsPerSession', { min: 5, max: 20, step: 5 });
  bindStepper('anim-fout', 'wrongAnimMs', { min: 500, max: 5000, step: 100 });

  document.getElementById('btn-export').addEventListener('click', () => {
    document.getElementById('export-area').value = exportState();
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    const text = document.getElementById('export-area').value;
    const ok = importState(text);
    if (ok) {
      // Re-sync UI that was rendered from pre-import state
      document.getElementById('track-select').value = resolveTrack().id;
      renderMatrix();
      renderSettings();
      document.getElementById('export-area').value = text;
    }
    document.getElementById('import-status').textContent = ok
      ? 'Gelukt! Voortgang geladen.'
      : 'Dat lukte niet — controleer de tekst.';
  });

  document.getElementById('btn-settings-back').addEventListener('click', () => {
    showScreen('home');
    renderMatrix();
  });

  if ('caches' in window) {
    caches.keys().then(keys => {
      const label = document.getElementById('version-label');
      if (label) label.textContent = keys.filter(k => k.startsWith('redeneren-')).join(', ') || 'nog niet offline opgeslagen';
    });
  }
}

// --- Init ---

initTrackSelect();
initVandaag();
document.getElementById('btn-settings').addEventListener('click', () => {
  showScreen('settings');
  renderSettings();
});
renderMatrix();

if ('serviceWorker' in navigator) {
  // updateViaCache:'none' defeats the CDN's 10-minute cache on sw.js
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => reg.update());
  // When a new version activates, reload once so the update applies on
  // this launch instead of the next — but never mid-session.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // first install
    if (!current) location.reload();
  });
}
