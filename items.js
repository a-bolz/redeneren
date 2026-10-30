// items.js — tracks, deterministic item generation and renderItem for redeneren.
//
// Key grammar (stable forever — stats are keyed on these):
//   v:<schema>:<tpl>:<a>:<b>[:<c>]   verhaaltjes (beginonbekend fields are <b>:<c>)
//   p:<rule>:<set>:<len>             token patterns (rule ab|abc|aab|abb|groei)
//   t:<start>:<step>:<n>             telrijen (n shown terms, ask the next)
//   l:<kind>:<index>                 logica (hand-authored append-only arrays)
//
// No Math.random/Date in this file: generation AND display order (choice
// rotation) are fully deterministic from the key.

// --- Seeded sampling (copied from rekenen facts.js) ---

// Fixed-seed PRNG (mulberry32) so sampling is deterministic across runs.
const SAMPLE_SEED = 0xc0ffee;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleEvenly(keys, max = 25) {
  if (keys.length <= max) return keys;
  const rand = mulberry32(SAMPLE_SEED);
  const shuffled = keys.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = new Set();
  for (let i = 0; i < max; i++) {
    picked.add(shuffled[Math.round((i * (shuffled.length - 1)) / (max - 1))]);
  }
  // Keep the level listing human-readable: original list order.
  return keys.filter(k => picked.has(k));
}

function interleave(lists) {
  const out = [];
  const longest = Math.max(...lists.map(l => l.length));
  for (let i = 0; i < longest; i++)
    for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

function mix(lists, max = 20) {
  // Sample each source family first so every family is evenly represented
  // and spread across its own range, then interleave, dedupe and cap.
  const per = Math.ceil(max / lists.length);
  const sampled = lists.map(l => sampleEvenly(l, per));
  return [...new Set(interleave(sampled))].slice(0, max);
}

// --- Shared helpers ---

const MIN = '−';
const rotate = (list, r) => list.slice(r).concat(list.slice(0, r));

// --- Verhaaltjes content tables ---

const NAMES = ['Jan', 'Piet', 'Mo', 'Sara', 'Lisa', 'Tom', 'Noor', 'Finn'];
const SHE = { Sara: true, Lisa: true, Noor: true };            // hij/zij, Hij/Ze
const THINGS = [
  { ev: 'knikker', mv: 'knikkers', het: false }, { ev: 'appel', mv: 'appels', het: false },
  { ev: 'sticker', mv: 'stickers', het: false }, { ev: 'blok', mv: 'blokken', het: true },
  { ev: 'boek', mv: 'boeken', het: true }, { ev: 'koekje', mv: 'koekjes', het: true },
  { ev: 'ballon', mv: 'ballonnen', het: false }, { ev: 'schelp', mv: 'schelpen', het: false },
];
// Adjective pairs: [de-/plural form, het-word singular form]
const ROOD = ['rode', 'rood'], BLAUW = ['blauwe', 'blauw'];
const GROOT = ['grote', 'groot'], KLEIN = ['kleine', 'klein'];
const pick = (list, ...nums) => list[nums.reduce((s, n, i) => s + n * (i * 7 + 3), 0) % list.length];

// --- Verhaaltjes rendering ---

function renderV(key) {
  const p = key.split(':');
  const schema = p[1], tpl = +p[2], n1 = +p[3], n2 = +p[4], n3 = +p[5];
  const name = pick(NAMES, n1, n2, tpl);
  const thing = pick(THINGS, n2, n1, tpl);
  const mv = thing.mv;
  const Hij = SHE[name] ? 'Ze' : 'Hij';
  // "1 koekje" vs "3 koekjes"; adjectives inflect for het-words: "1 rood blok", "3 rode blokken"
  const amt = n => `${n} ${n === 1 ? thing.ev : thing.mv}`;
  const adjAmt = (n, adj) => `${n} ${n === 1 && thing.het ? adj[1] : adj[0]} ${n === 1 ? thing.ev : thing.mv}`;

  switch (schema) {
    case 'erbij': {
      const a = n1, b = n2;
      const text = tpl === 0
        ? `${name} heeft ${amt(a)}. ${Hij} krijgt er ${b} bij. Hoeveel ${mv} heeft ${name} nu?`
        : `Er ${a === 1 ? 'zit' : 'zitten'} ${amt(a)} in de mand. ${name} doet er ${b} bij. Hoeveel ${mv} zitten er nu in de mand?`;
      return { text, answer: a + b, input: 'keypad', explain: `${a} + ${b} = ${a + b}` };
    }
    case 'eraf': {
      const a = n1, b = n2;
      const text = tpl === 0
        ? `${name} heeft ${amt(a)}. ${Hij} geeft er ${b} weg. Hoeveel ${mv} heeft ${name} nog?`
        : `Er ${a === 1 ? 'ligt' : 'liggen'} ${amt(a)} op tafel. ${name} pakt er ${b}. Hoeveel ${mv} liggen er nog?`;
      return { text, answer: a - b, input: 'keypad', explain: `${a} ${MIN} ${b} = ${a - b}` };
    }
    case 'samen': {
      const a = n1, b = n2;
      const text = tpl === 0
        ? `${name} heeft ${adjAmt(a, ROOD)} en ${adjAmt(b, BLAUW)}. Hoeveel ${mv} zijn dat samen?`
        : `In de doos zitten ${adjAmt(a, GROOT)} en ${adjAmt(b, KLEIN)}. Hoeveel ${mv} zitten er samen in de doos?`;
      return { text, answer: a + b, input: 'keypad', explain: `${a} + ${b} = ${a + b}` };
    }
    case 'meer':
    case 'minder': {
      const a = n1, b = n2;
      let name2 = pick(NAMES, a + 1, b, tpl);
      if (name2 === name) name2 = NAMES[(NAMES.indexOf(name2) + 1) % NAMES.length];
      const word = schema === 'meer' ? 'meer' : 'minder';
      const text = `${name} heeft ${amt(a)}. ${name2} heeft er ${b} ${word}. Hoeveel ${mv} heeft ${name2}?`;
      const answer = schema === 'meer' ? a + b : a - b;
      const explain = schema === 'meer' ? `${a} + ${b} = ${answer}` : `${a} ${MIN} ${b} = ${answer}`;
      return { text, answer, input: 'keypad', explain };
    }
    case 'beginonbekend': {
      const b = n1, c = n2; // key is v:beginonbekend:<tpl>:<b>:<c>
      const text = tpl === 0
        ? `${name} had een aantal ${mv}. ${Hij} kreeg er ${b} bij. Nu heeft ${name} er ${c}. Hoeveel ${mv} had ${name} eerst?`
        : `${name} had ${amt(b)}. ${Hij} kreeg er een aantal bij. Nu heeft ${name} er ${c}. Hoeveel ${mv} kreeg ${name} erbij?`;
      return { text, answer: c - b, input: 'keypad', explain: `${c} ${MIN} ${b} = ${c - b}` };
    }
    case 'tweestappen': {
      const a = n1, b = n2, c = n3;
      const text = tpl === 0
        ? `${name} heeft ${amt(a)}. ${Hij} krijgt er ${b} bij en geeft er ${c} weg. Hoeveel ${mv} heeft ${name} nu?`
        : `${name} heeft ${amt(a)}. ${Hij} geeft er ${c} weg en krijgt er ${b} bij. Hoeveel ${mv} heeft ${name} nu?`;
      const answer = a + b - c;
      const explain = tpl === 1
        ? `${a} ${MIN} ${c} + ${b} = ${answer}`
        : `${a} + ${b} ${MIN} ${c} = ${answer}`;
      return { text, answer, input: 'keypad', explain };
    }
    case 'welkesom': {
      // tpl slot holds the story schema: 0=erbij, 1=eraf, 2=samen.
      const a = n1, b = n2;
      const story = tpl === 0
        ? `${name} heeft ${amt(a)}. ${Hij} krijgt er ${b} bij.`
        : tpl === 1
          ? `${name} heeft ${amt(a)}. ${Hij} geeft er ${b} weg.`
          : `${name} heeft ${adjAmt(a, ROOD)} en ${adjAmt(b, BLAUW)}.`;
      const text = `${story} Welke som hoort erbij?`;
      const correct = tpl === 1 ? `${a} ${MIN} ${b}` : `${a} + ${b}`;
      let others = tpl === 1
        ? [`${a} + ${b}`, `${b} ${MIN} ${a}`]            // operator swap + operand swap
        : [`${a} ${MIN} ${b}`, `${a} + ${b + 1}`];        // operator swap + off-by-one
      if (others.includes(correct) || others[0] === others[1])
        others = [others[0], `${a + 1} + ${b}`];
      const choices = rotate([correct, ...others], (a + b) % 3);
      return { text, answer: correct, input: 'choice', choices, explain: correct };
    }
    default:
      throw new Error(`Bad item key: ${key}`);
  }
}

// --- Verhaaltjes level generators ---

function vErbij() {
  const keys = [];
  for (let a = 1; a <= 9; a++)
    for (let b = 1; b <= 9; b++)
      if (a + b <= 10) keys.push(`v:erbij:${(a + b) % 2}:${a}:${b}`);
  return sampleEvenly(keys, 20);
}

function vEraf() {
  const keys = [];
  for (let a = 2; a <= 10; a++)
    for (let b = 1; b <= a - 1; b++) keys.push(`v:eraf:${(a + b) % 2}:${a}:${b}`);
  return sampleEvenly(keys, 20);
}

function vSamen() {
  const keys = [];
  for (let a = 1; a <= 9; a++)
    for (let b = 1; b <= 9; b++)
      if (a + b <= 12 && a !== b) keys.push(`v:samen:${(a + b) % 2}:${a}:${b}`);
  return sampleEvenly(keys, 20);
}

function vWelkesom() {
  const keys = [];
  for (let a = 1; a <= 9; a++)       // schema 0 = erbij
    for (let b = 1; b <= 9; b++)
      if (a + b <= 10) keys.push(`v:welkesom:0:${a}:${b}`);
  for (let a = 2; a <= 10; a++)      // schema 1 = eraf
    for (let b = 1; b <= a - 1; b++) keys.push(`v:welkesom:1:${a}:${b}`);
  for (let a = 1; a <= 9; a++)       // schema 2 = samen
    for (let b = 1; b <= 9; b++)
      if (a + b <= 10 && a !== b) keys.push(`v:welkesom:2:${a}:${b}`);
  return sampleEvenly(keys, 20);
}

function vMeerMinder() {
  const keys = [];
  for (let a = 2; a <= 9; a++)
    for (let b = 1; b <= 5; b++)
      if (a + b <= 12) keys.push(`v:meer:${(a + b) % 2}:${a}:${b}`);
  for (let a = 4; a <= 10; a++)
    for (let b = 1; b <= 3; b++) keys.push(`v:minder:${(a + b) % 2}:${a}:${b}`);
  return sampleEvenly(keys, 20);
}

function vBeginOnbekend() {
  const keys = [];
  for (const tpl of [0, 1])
    for (let b = 2; b <= 6; b++)
      for (let c = b + 2; c <= 10; c++) keys.push(`v:beginonbekend:${tpl}:${b}:${c}`);
  return sampleEvenly(keys, 20);
}

function vTweeStappen() {
  const keys = [];
  for (let a = 2; a <= 7; a++)
    for (let b = 2; b <= 6; b++)
      for (let c = 1; c <= 4; c++) {
        if (a + b > 12 || a + b - c < 1) continue;
        let tpl = (a + b + c) % 2;
        // tpl1 tells the story weg-first: never let it dip below zero mid-story.
        if (tpl === 1 && c >= a) tpl = 0;
        keys.push(`v:tweestappen:${tpl}:${a}:${b}:${c}`);
      }
  return sampleEvenly(keys, 20);
}

const V1 = vErbij(), V2 = vEraf(), V3 = vSamen(), V4 = vWelkesom(),
  V5 = vMeerMinder(), V6 = vBeginOnbekend(), V7 = vTweeStappen();

// --- Patronen content tables ---

const TOKENS = [
  ['🔴', '🔵'], ['⭐', '🌙'], ['🐶', '🐱'], ['🍎', '🍌'], ['🔺', '⬛'], ['❤️', '🟡'],
];
const TOKENS3 = [
  ['🔴', '🔵', '🟢'], ['⭐', '🌙', '☀️'], ['🍎', '🍌', '🍐'], ['🐶', '🐱', '🐭'], ['🔺', '⬛', '🟡'],
];
const RULES = { ab: [0, 1], abc: [0, 1, 2], aab: [0, 0, 1], abb: [0, 1, 1] };

// --- Patronen rendering ---

function renderP(key) {
  const p = key.split(':');
  const rule = p[1], set = +p[2];
  if (rule === 'groei') {
    const n = +p[3]; // p:groei:<set>:<n> — groups of 1..n tokens, ask group n+1
    const tok = TOKENS[set][0];
    const groups = Array.from({ length: n }, (_, i) => tok.repeat(i + 1));
    const answer = tok.repeat(n + 1);
    const choices = rotate([tok.repeat(n), tok.repeat(n + 1), tok.repeat(n + 2)], n % 3);
    return {
      text: groups.join(' | ') + ' | …?',
      answer, input: 'choice', choices,
      explain: groups.join(' | ') + ' | ' + answer,
      tokens: true,
    };
  }
  const r = RULES[rule];
  if (!r) throw new Error(`Bad item key: ${key}`);
  const len = +p[3];
  const toks = rule === 'abc' ? TOKENS3[set] : TOKENS[set];
  const seq = Array.from({ length: len }, (_, i) => toks[r[i % r.length]]);
  const answer = toks[r[len % r.length]];
  const choices = rotate(toks.slice(), (len + set) % toks.length);
  return {
    text: seq.join(' ') + '  …?',
    answer, input: 'choice', choices,
    explain: [...seq, answer].join(' '),
    tokens: true,
  };
}

function renderT(key) {
  const p = key.split(':'); // t:<start>:<step>:<n>
  const start = +p[1], step = +p[2], n = +p[3];
  const terms = Array.from({ length: n }, (_, i) => start + i * step);
  const answer = start + n * step;
  return {
    text: terms.join(', ') + ', …?',
    answer, input: 'keypad',
    explain: terms.join(', ') + ', ' + answer,
  };
}

// --- Patronen level generators ---

function pHerhaal() {
  const keys = [];
  for (let s = 0; s < TOKENS.length; s++) keys.push(`p:ab:${s}:6`);
  for (let s = 0; s < TOKENS3.length; s++) keys.push(`p:abc:${s}:6`);
  return sampleEvenly(keys, 20);
}

function pHerhaalMoeilijker() {
  const keys = [];
  for (let s = 0; s < TOKENS.length; s++) keys.push(`p:aab:${s}:7`);
  for (let s = 0; s < TOKENS.length; s++) keys.push(`p:abb:${s}:7`);
  for (let s = 0; s < TOKENS.length; s++) keys.push(`p:ab:${s}:9`);
  return sampleEvenly(keys, 20);
}

function pGroei() {
  const keys = [];
  for (let s = 0; s < TOKENS.length; s++)
    for (let n = 2; n <= 5; n++) keys.push(`p:groei:${s}:${n}`);
  return sampleEvenly(keys, 20);
}

function pTelrijen() {
  // 5 shown terms; ±1/±2 stay within 0..30. +10 cannot stay under 30 with
  // 5 shown terms, so it runs on decades/off-decades up to answer 60.
  const keys = [];
  for (let start = 0; start <= 25; start++) keys.push(`t:${start}:1:5`);
  for (let start = 0; start <= 20; start++) keys.push(`t:${start}:2:5`);
  for (let start = 0; start <= 10; start++) keys.push(`t:${start}:10:5`);
  for (let start = 5; start <= 30; start++) keys.push(`t:${start}:-1:5`);
  for (let start = 10; start <= 30; start++) keys.push(`t:${start}:-2:5`);
  return sampleEvenly(keys, 20);
}

function pTelrijenMoeilijker() {
  const keys = [];
  for (let start = 1; start <= 74; start++) keys.push(`t:${start}:5:5`);
  for (let start = 50; start <= 99; start++) keys.push(`t:${start}:-10:5`);
  for (let start = 1; start <= 84; start++) keys.push(`t:${start}:3:5`);
  return sampleEvenly(keys, 20);
}

const P1 = pHerhaal(), P2 = pHerhaalMoeilijker(), P3 = pGroei(),
  P4 = pTelrijen(), P5 = pTelrijenMoeilijker();

// --- Logica content (hand-authored arrays; APPEND-ONLY — keys are indexes) ---

const REL = { ouder: ['oudst', 'jongst'], groter: ['grootst', 'kleinst'], sneller: ['snelst', 'langzaamst'], sterker: ['sterkst', 'zwakst'] };
const OUDST = [ // 16: {rel, names:[x,y,z] meaning x>y>z, ask:0|1 (superlative index), flip: premise order reversed}
  { rel: 'ouder', names: ['Jan', 'Piet', 'Mo'], ask: 0, flip: false },
  { rel: 'ouder', names: ['Sara', 'Lisa', 'Noor'], ask: 1, flip: false },
  { rel: 'groter', names: ['Tom', 'Finn', 'Jan'], ask: 0, flip: false },
  { rel: 'groter', names: ['Noor', 'Sara', 'Piet'], ask: 1, flip: true },
  { rel: 'sneller', names: ['Mo', 'Tom', 'Lisa'], ask: 0, flip: true },
  { rel: 'sneller', names: ['Finn', 'Noor', 'Sara'], ask: 1, flip: false },
  { rel: 'sterker', names: ['Piet', 'Jan', 'Tom'], ask: 0, flip: false },
  { rel: 'sterker', names: ['Lisa', 'Mo', 'Finn'], ask: 1, flip: true },
  { rel: 'ouder', names: ['Noor', 'Tom', 'Jan'], ask: 0, flip: true },
  { rel: 'groter', names: ['Sara', 'Mo', 'Lisa'], ask: 0, flip: false },
  { rel: 'sneller', names: ['Jan', 'Finn', 'Piet'], ask: 1, flip: true },
  { rel: 'ouder', names: ['Tom', 'Lisa', 'Sara'], ask: 1, flip: false },
  { rel: 'groter', names: ['Finn', 'Piet', 'Noor'], ask: 0, flip: true },
  { rel: 'sterker', names: ['Mo', 'Sara', 'Tom'], ask: 1, flip: false },
  { rel: 'sneller', names: ['Lisa', 'Jan', 'Noor'], ask: 0, flip: false },
  { rel: 'ouder', names: ['Piet', 'Finn', 'Mo'], ask: 0, flip: true },
];

const NIETBIJ = [ // 16: 4 emoji, odd one's index
  { items: ['🐶', '🐱', '🐭', '🍌'], odd: 3 }, { items: ['🍎', '🚗', '🍐', '🍓'], odd: 1 },
  { items: ['🚌', '🚲', '✈️', '🧦'], odd: 3 }, { items: ['👕', '👖', '⚽', '🧢'], odd: 2 },
  { items: ['🦁', '🐰', '🎸', '🐶'], odd: 2 }, { items: ['🍇', '🍌', '🍎', '🚂'], odd: 3 },
  { items: ['⛵', '🚗', '🐱', '🚌'], odd: 2 }, { items: ['🧢', '👟', '👖', '🍐'], odd: 3 },
  { items: ['🥁', '🎺', '🎸', '🏀'], odd: 3 }, { items: ['🐭', '⚽', '🏀', '🎾'], odd: 0 },
  { items: ['🌙', '⭐', '☀️', '🐰'], odd: 3 }, { items: ['🍓', '🪑', '🛏️', '🚪'], odd: 0 },
  { items: ['🚂', '✈️', '👕', '🚲'], odd: 2 }, { items: ['🐱', '🦁', '🐶', '🎾'], odd: 3 },
  { items: ['🍐', '🍇', '🥁', '🍓'], odd: 2 }, { items: ['👟', '🧦', '👕', '🌙'], odd: 3 },
];

const KANDAT = [ // 14: {text, ja}
  { text: 'Mo is groter dan Jan. Jan is groter dan Mo. Kan dat allebei waar zijn?', ja: false },
  { text: 'Sara is jonger dan Lisa. Lisa is ouder dan Sara. Kan dat allebei waar zijn?', ja: true },
  { text: 'Tom is sneller dan Finn. Finn is sneller dan Noor. Tom is sneller dan Noor. Kan dat?', ja: true },
  { text: 'De hond is groter dan de kat. De kat is groter dan de hond. Kan dat allebei?', ja: false },
  { text: 'Jan is even oud als Piet. Piet is even oud als Jan. Kan dat allebei?', ja: true },
  { text: 'Noor heeft meer stickers dan Sara. Sara heeft meer stickers dan Noor. Kan dat allebei?', ja: false },
  { text: 'Finn is kleiner dan Tom. Tom is groter dan Finn. Kan dat allebei waar zijn?', ja: true },
  { text: 'Mo zit bij Lisa in de klas. Lisa is de oudste van de klas. Mo is ouder dan Lisa. Kan dat allebei?', ja: false },
  { text: 'De bal is rood. De bal is helemaal blauw. Kan dat allebei?', ja: false },
  { text: 'Piet heeft 3 knikkers. Piet heeft minder dan 5 knikkers. Kan dat allebei?', ja: true },
  { text: 'Sara zit voor Noor. Noor zit achter Sara. Kan dat allebei waar zijn?', ja: true },
  { text: 'Tom heeft 8 boeken. Tom heeft meer dan 10 boeken. Kan dat allebei?', ja: false },
  { text: 'Mo woont naast Jan. Jan woont naast Mo. Kan dat allebei?', ja: true },
  { text: 'Het is nu dag. Het is nu nacht. Kan dat allebei op dezelfde plek?', ja: false },
];

const ALSDAN = [ // 14: {text, choices:[3], answer: index}
  { text: 'Als het regent, pakt Noor haar paraplu. Het regent. Wat doet Noor?', choices: ['Ze pakt haar paraplu', 'Ze pakt haar zonnebril', 'Ze gaat zwemmen'], answer: 0 },
  { text: 'Als Jan jarig is, trakteert hij op school. Jan is vandaag jarig. Wat doet Jan?', choices: ['Hij blijft thuis', 'Hij trakteert op school', 'Hij gaat vroeg slapen'], answer: 1 },
  { text: 'Als het sneeuwt, doet Mo zijn wanten aan. Het sneeuwt. Wat doet Mo?', choices: ['Hij doet zijn wanten aan', 'Hij doet zijn zwembroek aan', 'Hij eet een ijsje'], answer: 0 },
  { text: 'Als de bel gaat, gaan de kinderen naar binnen. De bel gaat. Wat doen de kinderen?', choices: ['Ze blijven buiten', 'Ze gaan naar huis', 'Ze gaan naar binnen'], answer: 2 },
  { text: 'Als Sara haar kamer opruimt, krijgt ze een sticker. Sara ruimt haar kamer op. Wat krijgt Sara?', choices: ['Een sticker', 'Een fiets', 'Niets'], answer: 0 },
  { text: 'Als het donker wordt, gaan de lantaarns aan. Het wordt donker. Wat gebeurt er?', choices: ['De lantaarns gaan uit', 'De lantaarns gaan aan', 'Er gebeurt niets'], answer: 1 },
  { text: 'Als Tom honger heeft, eet hij een boterham. Tom heeft honger. Wat doet Tom?', choices: ['Hij gaat slapen', 'Hij drinkt alleen water', 'Hij eet een boterham'], answer: 2 },
  { text: 'Als het regent, pakt Noor haar paraplu. Het regent NIET. Pakt Noor haar paraplu?', choices: ['Ja, zeker', 'Dat weten we niet', 'Nee, dat kan niet'], answer: 1 },
  { text: 'Als Lisa zwemles heeft, neemt ze haar badpak mee. Lisa heeft vandaag zwemles. Wat neemt ze mee?', choices: ['Haar badpak', 'Haar schaatsen', 'Haar gitaar'], answer: 0 },
  { text: 'Als Finn zijn tanden poetst, mag hij een verhaaltje. Finn poetst zijn tanden. Wat mag Finn?', choices: ['Niets', 'Een verhaaltje', 'Snoep'], answer: 1 },
  { text: 'Als de zon schijnt, smelt de sneeuwpop. De zon schijnt. Wat gebeurt er met de sneeuwpop?', choices: ['Hij smelt', 'Hij wordt groter', 'Er gebeurt niets'], answer: 0 },
  { text: 'Als Mo zijn huiswerk af heeft, mag hij buiten spelen. Mo speelt buiten. Is zijn huiswerk af?', choices: ['Ja, zeker', 'Dat weten we niet', 'Nee, zeker niet'], answer: 1 },
  { text: 'Als het herfst is, vallen de blaadjes. Het is herfst. Wat doen de blaadjes?', choices: ['Ze vallen', 'Ze worden groen', 'Ze groeien'], answer: 0 },
  { text: 'Als Piet te laat is, mist hij de bus. Piet is te laat. Wat gebeurt er?', choices: ['Hij haalt de bus', 'Hij mist de bus', 'De bus wacht'], answer: 1 },
];

// --- Logica rendering ---

function renderL(key) {
  const p = key.split(':');
  const kind = p[1], i = +p[2];
  if (kind === 'oudst') {
    const t = OUDST[i];
    if (!t) throw new Error(`Bad item key: ${key}`);
    const [x, y, z] = t.names;
    const p1 = `${x} is ${t.rel} dan ${y}.`;
    const p2 = `${y} is ${t.rel} dan ${z}.`;
    const sup = REL[t.rel][t.ask];
    const answer = t.ask === 0 ? x : z;
    return {
      text: `${t.flip ? `${p2} ${p1}` : `${p1} ${p2}`} Wie is het ${sup}?`,
      answer, input: 'choice',
      choices: rotate(t.names.slice(), i % 3),
      explain: `${answer} is het ${sup}`,
    };
  }
  if (kind === 'nietbij') {
    const t = NIETBIJ[i];
    if (!t) throw new Error(`Bad item key: ${key}`);
    const odd = t.items[t.odd];
    return {
      text: 'Welke hoort er niet bij?',
      answer: odd, input: 'choice',
      choices: t.items.slice(),
      explain: `${odd} hoort er niet bij`,
    };
  }
  if (kind === 'kandat') {
    const t = KANDAT[i];
    if (!t) throw new Error(`Bad item key: ${key}`);
    return {
      text: t.text,
      answer: t.ja ? 'Ja' : 'Nee', input: 'choice',
      choices: ['Ja', 'Nee'],
      explain: t.ja ? 'Ja, dat kan' : 'Nee, dat kan niet',
    };
  }
  if (kind === 'alsdan') {
    const t = ALSDAN[i];
    if (!t) throw new Error(`Bad item key: ${key}`);
    return {
      text: t.text,
      answer: t.choices[t.answer], input: 'choice',
      choices: t.choices.slice(),
      explain: t.choices[t.answer],
    };
  }
  throw new Error(`Bad item key: ${key}`);
}

const oudstKeys = OUDST.map((_, i) => `l:oudst:${i}`);
const nietbijKeys = NIETBIJ.map((_, i) => `l:nietbij:${i}`);
const kandatKeys = KANDAT.map((_, i) => `l:kandat:${i}`);
const alsdanKeys = ALSDAN.map((_, i) => `l:alsdan:${i}`);

// --- renderItem dispatch ---

export function renderItem(key) {
  if (key.startsWith('v:')) return renderV(key);
  if (key.startsWith('p:')) return renderP(key);
  if (key.startsWith('t:')) return renderT(key);
  if (key.startsWith('l:')) return renderL(key);
  throw new Error(`Bad item key: ${key}`);
}

export const TRACKS = [
  {
    id: 'verhaaltjes', name: 'Verhaaltjes',
    levels: [
      { id: 1, name: 'Erbij', keys: V1 },
      { id: 2, name: 'Eraf', keys: V2 },
      { id: 3, name: 'Samen', keys: V3 },
      { id: 4, name: 'Welke som?', keys: V4 },
      { id: 5, name: 'Meer en minder', keys: V5 },
      { id: 6, name: 'Begin onbekend', keys: V6 },
      { id: 7, name: 'Twee stappen', keys: V7 },
      { id: 8, name: 'Mix verhaaltjes', keys: mix([V1, V2, V3, V4, V5, V6, V7]) },
    ],
  },
  {
    id: 'patronen', name: 'Patronen',
    levels: [
      { id: 1, name: 'Herhaal', keys: P1 },
      { id: 2, name: 'Herhaal moeilijker', keys: P2 },
      { id: 3, name: 'Groei', keys: P3 },
      { id: 4, name: 'Telrijen', keys: P4 },
      { id: 5, name: 'Telrijen moeilijker', keys: P5 },
      { id: 6, name: 'Mix patronen', keys: mix([P1, P2, P3, P4, P5]) },
    ],
  },
  {
    id: 'logica', name: 'Logica',
    levels: [
      { id: 1, name: 'Wie is…?', keys: oudstKeys },
      { id: 2, name: 'Welke hoort er niet bij?', keys: nietbijKeys },
      { id: 3, name: 'Kan dat?', keys: kandatKeys },
      { id: 4, name: 'Als… dan…', keys: alsdanKeys },
      { id: 5, name: 'Mix logica', keys: mix([oudstKeys, nietbijKeys, kandatKeys, alsdanKeys]) },
    ],
  },
];
