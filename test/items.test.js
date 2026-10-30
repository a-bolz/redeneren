// test/items.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, renderItem, sampleEvenly } from '../items.js';

const MIN = '−';

const track = id => TRACKS.find(t => t.id === id);
const vLevels = () => track('verhaaltjes').levels;
const allLevelKeys = trackId => track(trackId).levels.flatMap(l => l.keys);

// Recompute the schema formula straight from the key, independent of items.js.
function vExpected(key) {
  const p = key.split(':');
  const schema = p[1], a = +p[3], b = +p[4], c = +p[5];
  switch (schema) {
    case 'erbij': case 'samen': case 'meer': return a + b;
    case 'eraf': case 'minder': return a - b;
    case 'beginonbekend': return b - a; // key fields are <b>:<c>
    case 'tweestappen': return a + b - c;
    case 'welkesom': return p[2] === '1' ? `${a} ${MIN} ${b}` : `${a} + ${b}`;
    default: throw new Error(`unknown schema in ${key}`);
  }
}

// --- Task 3: verhaaltjes ---

test('verhaaltjes: 8 levels with 8-24 unique keys each', () => {
  const levels = vLevels();
  assert.equal(levels.length, 8);
  for (const l of levels) {
    assert.ok(l.keys.length >= 8 && l.keys.length <= 24,
      `level ${l.id} has ${l.keys.length} keys`);
    assert.equal(new Set(l.keys).size, l.keys.length, `level ${l.id} duplicate keys`);
  }
});

test('verhaaltjes: every key renders non-empty Dutch text ending in ? with explain', () => {
  for (const l of vLevels())
    for (const key of l.keys) {
      const item = renderItem(key);
      assert.ok(item.text.length > 10, key);
      assert.ok(item.text.endsWith('?'), `${key}: "${item.text}"`);
      assert.ok(typeof item.explain === 'string' && item.explain.length > 0, key);
    }
});

test('verhaaltjes: keypad answers are integers 1-20 equal to the schema formula', () => {
  for (const l of vLevels())
    for (const key of l.keys) {
      const item = renderItem(key);
      if (item.input !== 'keypad') continue;
      assert.ok(Number.isInteger(item.answer), key);
      assert.ok(item.answer >= 1 && item.answer <= 20, `${key} -> ${item.answer}`);
      assert.equal(item.answer, vExpected(key), key);
    }
});

test('welkesom: choice input, 3 unique sums, answer present exactly once and correct', () => {
  const keys = vLevels().flatMap(l => l.keys).filter(k => k.startsWith('v:welkesom:'));
  assert.ok(keys.length >= 8, `only ${keys.length} welkesom keys`);
  for (const key of keys) {
    const item = renderItem(key);
    assert.equal(item.input, 'choice', key);
    assert.equal(item.choices.length, 3, key);
    assert.equal(new Set(item.choices).size, 3, `${key} duplicate choices`);
    assert.equal(item.choices.filter(c => c === item.answer).length, 1, key);
    assert.equal(item.answer, vExpected(key), key);
    assert.equal(item.explain, item.answer, key);
  }
});

test('verhaaltjes: renderItem is deterministic (double render deep-equal)', () => {
  for (const l of vLevels())
    for (const key of l.keys)
      assert.deepEqual(renderItem(key), renderItem(key), key);
});

test('beginonbekend: answers >= 1', () => {
  const keys = vLevels().flatMap(l => l.keys).filter(k => k.startsWith('v:beginonbekend:'));
  assert.ok(keys.length >= 8, `only ${keys.length} beginonbekend keys`);
  for (const key of keys) assert.ok(renderItem(key).answer >= 1, key);
});

test('tweestappen: a+b <= 20, answer >= 1, tpl1 never dips negative mid-story', () => {
  const keys = vLevels().flatMap(l => l.keys).filter(k => k.startsWith('v:tweestappen:'));
  assert.ok(keys.length >= 8, `only ${keys.length} tweestappen keys`);
  for (const key of keys) {
    const [, , tpl, a, b, c] = key.split(':');
    assert.ok(+a + +b <= 20, `${key}: intermediate over 20`);
    assert.ok(renderItem(key).answer >= 1, key);
    if (tpl === '1') assert.ok(+a - +c >= 1, `${key}: tpl1 goes negative mid-story`);
  }
});

test('sampleEvenly: deterministic, unique, order-preserving', () => {
  const keys = Array.from({ length: 100 }, (_, i) => `k${i}`);
  const out = sampleEvenly(keys, 20);
  assert.equal(out.length, 20);
  assert.equal(new Set(out).size, 20);
  const pos = out.map(k => keys.indexOf(k));
  assert.deepEqual(pos, [...pos].sort((x, y) => x - y), 'must keep input order');
  assert.deepEqual(sampleEvenly(keys, 20), out, 'must be deterministic');
  assert.deepEqual(sampleEvenly(['a', 'b'], 20), ['a', 'b'], 'small lists unchanged');
});

// --- Task 4: patronen, logica, TRACKS ---

// Token tables duplicated from the plan so the test pins items.js's content.
const TOKENS = [
  ['🔴', '🔵'], ['⭐', '🌙'], ['🐶', '🐱'], ['🍎', '🍌'], ['🔺', '⬛'], ['❤️', '🟡'],
];
const TOKENS3 = [
  ['🔴', '🔵', '🟢'], ['⭐', '🌙', '☀️'], ['🍎', '🍌', '🍐'], ['🐶', '🐱', '🐭'], ['🔺', '⬛', '🟡'],
];
const RULES = { ab: [0, 1], abc: [0, 1, 2], aab: [0, 0, 1], abb: [0, 1, 1] };

test('three tracks with expected ids, names and level counts', () => {
  assert.deepEqual(TRACKS.map(t => t.id), ['verhaaltjes', 'patronen', 'logica']);
  assert.deepEqual(TRACKS.map(t => t.name), ['Verhaaltjes', 'Patronen', 'Logica']);
  assert.deepEqual(TRACKS.map(t => t.levels.length), [8, 6, 5]);
});

test('all levels: 8-24 unique keys, every key renders text ending in ?', () => {
  for (const tr of TRACKS)
    for (const l of tr.levels) {
      assert.ok(l.keys.length >= 8 && l.keys.length <= 24,
        `${tr.id} L${l.id} has ${l.keys.length} keys`);
      assert.equal(new Set(l.keys).size, l.keys.length, `${tr.id} L${l.id} dupes`);
      for (const key of l.keys) {
        const item = renderItem(key);
        assert.ok(item.text.length > 0 && item.text.endsWith('?'), `${key}: "${item.text}"`);
        assert.ok(['keypad', 'choice'].includes(item.input), key);
        assert.ok(typeof item.explain === 'string' && item.explain.length > 0, key);
      }
    }
});

test('all items: deterministic double render (choices order included)', () => {
  for (const tr of TRACKS)
    for (const l of tr.levels)
      for (const key of l.keys)
        assert.deepEqual(renderItem(key), renderItem(key), key);
});

test('choice items: 2-4 unique choices containing the answer exactly once', () => {
  for (const tr of TRACKS)
    for (const l of tr.levels)
      for (const key of l.keys) {
        const item = renderItem(key);
        if (item.input !== 'choice') continue;
        assert.ok(item.choices.length >= 2 && item.choices.length <= 4, key);
        assert.equal(new Set(item.choices).size, item.choices.length, `${key} dup choices`);
        assert.equal(item.choices.filter(c => c === item.answer).length, 1, key);
      }
});

test('keypad answers: integers, 1-20 for v: keys, 0-99 for t: keys', () => {
  for (const tr of TRACKS)
    for (const l of tr.levels)
      for (const key of l.keys) {
        const item = renderItem(key);
        if (item.input !== 'keypad') continue;
        assert.ok(Number.isInteger(item.answer), key);
        if (key.startsWith('t:'))
          assert.ok(item.answer >= 0 && item.answer <= 99, `${key} -> ${item.answer}`);
        else
          assert.ok(item.answer >= 1 && item.answer <= 20, `${key} -> ${item.answer}`);
      }
});

test('tokens flag: true for p: keys, absent on every other key type', () => {
  for (const tr of TRACKS)
    for (const l of tr.levels)
      for (const key of l.keys) {
        const item = renderItem(key);
        if (key.startsWith('p:')) assert.equal(item.tokens, true, key);
        else assert.ok(!('tokens' in item), key);
      }
});

test('token patterns: answer continues the rule, text shows the sequence', () => {
  const keys = allLevelKeys('patronen').filter(k => /^p:(ab|abc|aab|abb):/.test(k));
  assert.ok(keys.length >= 8, `only ${keys.length} token-pattern keys`);
  for (const key of keys) {
    const [, rule, setS, lenS] = key.split(':');
    const set = +setS, len = +lenS;
    const toks = rule === 'abc' ? TOKENS3[set] : TOKENS[set];
    const r = RULES[rule];
    const seq = Array.from({ length: len }, (_, i) => toks[r[i % r.length]]);
    const item = renderItem(key);
    assert.equal(item.text, seq.join(' ') + '  …?', key);
    assert.equal(item.answer, toks[r[len % r.length]], key);
    assert.deepEqual([...item.choices].sort(), [...toks].sort(), key);
  }
});

test('groei: answer is n+1 tokens, choices are n/n+1/n+2 repeats', () => {
  const keys = allLevelKeys('patronen').filter(k => k.startsWith('p:groei:'));
  assert.ok(keys.length >= 8, `only ${keys.length} groei keys`);
  for (const key of keys) {
    const [, , setS, nS] = key.split(':');
    const tok = TOKENS[+setS][0];
    const n = +nS;
    const item = renderItem(key);
    assert.equal(item.answer, tok.repeat(n + 1), key);
    assert.deepEqual(new Set(item.choices),
      new Set([tok.repeat(n), tok.repeat(n + 1), tok.repeat(n + 2)]), key);
  }
});

test('telrijen: answer = start + n*step, all terms and answer within 0-99', () => {
  const keys = allLevelKeys('patronen').filter(k => k.startsWith('t:'));
  assert.ok(keys.length >= 16, `only ${keys.length} telrij keys`);
  for (const key of keys) {
    const [, s, st, nS] = key.split(':');
    const start = +s, step = +st, n = +nS;
    const terms = Array.from({ length: n }, (_, i) => start + i * step);
    const item = renderItem(key);
    assert.equal(item.input, 'keypad', key);
    assert.equal(item.answer, start + n * step, key);
    assert.equal(item.text, terms.join(', ') + ', …?', key);
    for (const t of [...terms, item.answer]) assert.ok(t >= 0 && t <= 99, `${key}: ${t}`);
  }
});

test('telrijen level 4: ±1/±2 sequences stay within 0-30', () => {
  const l4 = track('patronen').levels.find(l => l.id === 4);
  const steps = new Set();
  for (const key of l4.keys) {
    const [, s, st, nS] = key.split(':');
    steps.add(st);
    if (st === '10') continue; // +10 with 5 shown terms exceeds 30 by construction
    for (let i = 0; i <= +nS; i++) {
      const t = +s + i * +st;
      assert.ok(t >= 0 && t <= 30, `${key}: term ${t}`);
    }
  }
  for (const st of ['1', '2', '10', '-1', '-2'])
    assert.ok(steps.has(st), `level 4 missing step ${st}`);
});

test('oudst: answer matches the transitive order recomputed from the premises', () => {
  const keys = track('logica').levels.find(l => l.id === 1).keys;
  assert.equal(keys.length, 16);
  for (const key of keys) {
    const item = renderItem(key);
    const rels = [...item.text.matchAll(/(\w+) is (\w+) dan (\w+)\./g)];
    assert.equal(rels.length, 2, key);
    const greater = rels.map(m => m[1]);
    const lesser = rels.map(m => m[3]);
    const names = new Set([...greater, ...lesser]);
    assert.equal(names.size, 3, key);
    const top = [...names].find(n => greater.includes(n) && !lesser.includes(n));
    const bottom = [...names].find(n => lesser.includes(n) && !greater.includes(n));
    const q = item.text.match(/Wie is het (\w+)\?$/);
    assert.ok(q, key);
    const expected = ['oudst', 'grootst', 'snelst', 'sterkst'].includes(q[1]) ? top : bottom;
    assert.equal(item.answer, expected, key);
    assert.equal(item.choices.length, 3, key);
    assert.deepEqual(new Set(item.choices), names, key);
  }
});

test('nietbij: four emoji, exactly one odd category, the odd one is the answer', () => {
  const CAT = {
    '🐶': 'dier', '🐱': 'dier', '🐭': 'dier', '🦁': 'dier', '🐰': 'dier',
    '🍌': 'fruit', '🍎': 'fruit', '🍐': 'fruit', '🍓': 'fruit', '🍇': 'fruit',
    '🚗': 'vervoer', '🚌': 'vervoer', '🚲': 'vervoer', '✈️': 'vervoer', '⛵': 'vervoer', '🚂': 'vervoer',
    '🧦': 'kleding', '👕': 'kleding', '👖': 'kleding', '🧢': 'kleding', '👟': 'kleding',
    '⚽': 'sport', '🏀': 'sport', '🎾': 'sport',
    '🎸': 'muziek', '🥁': 'muziek', '🎺': 'muziek',
    '🌙': 'lucht', '⭐': 'lucht', '☀️': 'lucht',
    '🪑': 'huis', '🛏️': 'huis', '🚪': 'huis',
  };
  const keys = track('logica').levels.find(l => l.id === 2).keys;
  assert.equal(keys.length, 16);
  for (const key of keys) {
    const item = renderItem(key);
    assert.equal(item.text, 'Welke hoort er niet bij?');
    assert.equal(item.choices.length, 4, key);
    const cats = item.choices.map(c => {
      assert.ok(CAT[c], `${key}: emoji ${c} not in category table`);
      return CAT[c];
    });
    const counts = {};
    for (const c of cats) counts[c] = (counts[c] || 0) + 1;
    const entries = Object.entries(counts).sort((x, y) => y[1] - x[1]);
    assert.equal(entries.length, 2, `${key}: expected exactly 2 categories`);
    assert.equal(entries[0][1], 3, key);
    assert.equal(entries[1][1], 1, key);
    const odd = item.choices[cats.indexOf(entries[1][0])];
    assert.equal(item.answer, odd, key);
    assert.ok(item.explain.includes(odd), key);
  }
});

test('kandat: Ja/Nee choices with a valid answer', () => {
  const keys = track('logica').levels.find(l => l.id === 3).keys;
  assert.equal(keys.length, 14);
  for (const key of keys) {
    const item = renderItem(key);
    assert.deepEqual(item.choices, ['Ja', 'Nee'], key);
    assert.ok(['Ja', 'Nee'].includes(item.answer), key);
  }
});

test('alsdan: 3 choices, answer among them, explain is the correct choice', () => {
  const keys = track('logica').levels.find(l => l.id === 4).keys;
  assert.equal(keys.length, 14);
  for (const key of keys) {
    const item = renderItem(key);
    assert.equal(item.choices.length, 3, key);
    assert.ok(item.choices.includes(item.answer), key);
    assert.equal(item.explain, item.answer, key);
  }
});

test('mix levels draw from every source family', () => {
  const cases = [
    { trackId: 'verhaaltjes', mixId: 8, familyIds: [1, 2, 3, 4, 5, 6, 7] },
    { trackId: 'patronen', mixId: 6, familyIds: [1, 2, 3, 4, 5] },
    { trackId: 'logica', mixId: 5, familyIds: [1, 2, 3, 4] },
  ];
  for (const { trackId, mixId, familyIds } of cases) {
    const tr = track(trackId);
    const mixKeys = new Set(tr.levels.find(l => l.id === mixId).keys);
    for (const fid of familyIds) {
      const fam = tr.levels.find(l => l.id === fid).keys;
      assert.ok(fam.some(k => mixKeys.has(k)), `${trackId} mix misses level ${fid}`);
    }
  }
});

test('renderItem rejects unknown keys', () => {
  assert.throws(() => renderItem('x:nope'));
  assert.throws(() => renderItem('v:onzin:0:1:2'));
  assert.throws(() => renderItem('l:oudst:999'));
});

test('generation is deterministic across a fresh import', async () => {
  const fresh = await import('../items.js?fresh');
  assert.deepEqual(
    fresh.TRACKS.map(t => t.levels.map(l => l.keys)),
    TRACKS.map(t => t.levels.map(l => l.keys)),
  );
});

test('no plural noun after the number 1, with verb agreement', () => {
  const plurals = /\b1 (rode |blauwe |grote |kleine )?(knikkers|appels|stickers|blokken|boeken|koekjes|ballonnen|schelpen)\b/;
  const track = TRACKS.find(t => t.id === 'verhaaltjes');
  for (const level of track.levels) {
    for (const key of level.keys) {
      const { text } = renderItem(key);
      assert.ok(!plurals.test(text), `plural after 1: ${key} -> ${text}`);
      assert.ok(!/\bEr (zitten|liggen) 1 /.test(text), `verb agreement: ${key} -> ${text}`);
    }
  }
});

test('correct answer position varies within every choice-input patronen level', () => {
  const track = TRACKS.find(t => t.id === 'patronen');
  for (const level of track.levels) {
    const positions = new Set();
    let choiceItems = 0;
    for (const key of level.keys) {
      const it = renderItem(key);
      if (it.input !== 'choice') continue;
      choiceItems++;
      positions.add(it.choices.indexOf(it.answer));
    }
    if (choiceItems >= 4) {
      assert.ok(positions.size > 1,
        `${level.name}: correct answer always at position ${[...positions][0]}`);
    }
  }
});

test('tweestappen explain narrates steps in story order', () => {
  const track = TRACKS.find(t => t.id === 'verhaaltjes');
  const level = track.levels.find(l => l.name === 'Twee stappen');
  for (const key of level.keys) {
    const [, , tpl, a, , c] = key.split(':');
    const { explain } = renderItem(key);
    if (tpl === '1') assert.ok(explain.startsWith(`${a} − ${c}`), `${key}: ${explain}`);
    else assert.ok(explain.startsWith(`${a} +`), `${key}: ${explain}`);
  }
});
