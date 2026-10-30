// keypad.js
export function keypadPress(value, key, expectedLength) {
  if (key === 'back') return { value: value.slice(0, -1), submit: false };
  if (!/^[0-9]$/.test(key)) return { value, submit: false };
  if (value.length >= expectedLength) return { value, submit: false };
  const next = value + key;
  return { value: next, submit: next.length === expectedLength };
}

export function createKeypad(onSubmit) {
  const el = document.createElement('div');
  el.className = 'keypad';

  const display = document.createElement('div');
  display.className = 'keypad-display';
  el.appendChild(display);

  let value = '';
  let expectedLength = 1;
  let locked = false;

  const grid = document.createElement('div');
  grid.className = 'keypad-grid';
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0']) {
    const btn = document.createElement('button');
    btn.className = 'keypad-btn';
    btn.textContent = k === 'back' ? '⌫' : k;
    btn.addEventListener('click', () => {
      if (locked) return;
      const r = keypadPress(value, k, expectedLength);
      value = r.value;
      display.textContent = value;
      if (r.submit) {
        locked = true;
        onSubmit(Number(value));
      }
    });
    grid.appendChild(btn);
  }
  el.appendChild(grid);

  return {
    element: el,
    reset(len) {
      value = '';
      expectedLength = len;
      locked = false;
      display.textContent = '';
    },
    lock() { locked = true; },
  };
}
