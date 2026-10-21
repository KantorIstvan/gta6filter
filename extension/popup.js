const $ = (id) => document.getElementById(id);

// Cross-validated on ~1270 YouTube thumbnails (tools/train-probe.mjs).
const SENS = {
  0.7: 'Ritkán téved (kb. 2%), de a GTA 6-os képek felét átengedi.',
  0.5: 'A GTA 6-os képek kb. 70%-át elkapja, más képeknél kb. 6% a téves takarás.',
  0.3: 'A GTA 6-os képek kb. 87%-át elkapja, de minden hetedik más képet is letakar.',
};
const segButtons = [...$('seg').children];
let s = DEFAULTS;
let count = null; // hidden items on the active tab; null = content script not running there

const keywords = () => s.extra.split('\n').map((k) => k.trim()).filter(Boolean);
function save(patch) {
  s = { ...s, ...patch };
  chrome.storage.local.set(s);
  render();
}

function render() {
  $('enabled').checked = s.enabled;
  $('images').checked = s.images;
  $('sens').hidden = !s.images;

  const th = Object.keys(SENS).map(Number).reduce((a, b) => (Math.abs(b - s.threshold) < Math.abs(a - s.threshold) ? b : a));
  segButtons.forEach((b, i) => {
    const on = +b.dataset.th === th;
    b.setAttribute('aria-checked', on);
    b.tabIndex = on ? 0 : -1;
    if (on) $('seg').style.setProperty('--i', i);
  });
  $('sensHint').textContent = SENS[th];
  renderStatus();
  renderChips(keywords());
}

function renderStatus() {
  const st = $('status');
  if (!s.enabled) {
    st.dataset.state = 'off';
    $('statusBig').textContent = 'Szünetel';
    $('statusSub').textContent = 'Kapcsold be fent, és újra elrejti a GTA-tartalmat.';
  } else if (count === null) {
    st.dataset.state = 'na';
    $('statusBig').textContent = 'Itt nem fut';
    $('statusSub').textContent = 'Böngészőoldalon nem működik. Ha ez rendes weboldal, frissítsd (F5).';
  } else {
    st.dataset.state = 'on';
    $('statusBig').textContent = count;
    $('statusSub').textContent = count ? 'elem elrejtve ezen az oldalon' : 'Ezen az oldalon nincs GTA-tartalom.';
  }
}

function renderChips(list) {
  const tpl = $('chipTpl').content.firstElementChild;
  $('chips').replaceChildren(...list.map((k) => {
    const li = tpl.cloneNode(true);
    li.querySelector('span').textContent = k;
    li.title = k;
    const del = li.querySelector('button');
    del.setAttribute('aria-label', `${k} törlése`);
    del.onclick = () => save({ extra: list.filter((x) => x !== k).join('\n') });
    return li;
  }));
  $('chipsEmpty').hidden = list.length > 0;
  $('kwCount').textContent = list.length || '';
  $('kwClear').hidden = list.length === 0;
}

function addKeywords(text) {
  const list = keywords();
  const seen = new Set(list.map((k) => k.toLowerCase()));
  for (const k of text.split(/[\r\n\t]+/).map((x) => x.trim()).filter(Boolean)) {
    if (!seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); list.push(k); }
  }
  save({ extra: list.join('\n') });
  $('kw').value = '';
}

async function refreshCount() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    count = await chrome.tabs.sendMessage(tab.id, { type: 'count' }, { frameId: 0 }) ?? null;
  } catch {
    count = null;
  }
  renderStatus();
}

$('enabled').onchange = (e) => save({ enabled: e.target.checked });
$('images').onchange = (e) => save({ images: e.target.checked });
segButtons.forEach((b, i) => {
  b.onclick = () => save({ threshold: +b.dataset.th });
  b.onkeydown = (e) => { // radiogroup arrow keys
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = segButtons[(i + step + segButtons.length) % segButtons.length];
    save({ threshold: +next.dataset.th });
    next.focus();
  };
});
$('kw').onkeydown = (e) => { if (e.key === 'Enter') addKeywords(e.target.value); };
$('kw').onpaste = (e) => {
  const text = e.clipboardData.getData('text');
  if (!/[\r\n]/.test(text)) return; // single line: normal paste, Enter adds it
  e.preventDefault();
  addKeywords(text);
};
$('kwAdd').onclick = () => { addKeywords($('kw').value); $('kw').focus(); };

let clearTimer;
$('kwClear').onclick = (e) => { // two-step, it can wipe a long pasted list
  clearTimeout(clearTimer);
  if (e.target.dataset.armed) {
    delete e.target.dataset.armed;
    e.target.textContent = 'Mind törlése';
    save({ extra: '' });
    return;
  }
  e.target.dataset.armed = '1';
  e.target.textContent = 'Biztos? Kattints újra';
  clearTimer = setTimeout(() => { delete e.target.dataset.armed; e.target.textContent = 'Mind törlése'; }, 3000);
};

chrome.storage.local.get(DEFAULTS).then((stored) => {
  s = stored;
  render();
  refreshCount();
  setInterval(refreshCount, 1000);
});
