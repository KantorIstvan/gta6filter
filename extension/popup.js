const $ = (id) => document.getElementById(id);

// Cross-validated on ~1270 YouTube thumbnails (tools/train-probe.mjs).
const SENS = {
  0.7: 'Rarely wrong (about 2%), but lets half of GTA 6 images through.',
  0.5: 'Catches about 70% of GTA 6 images; about 6% of other images get covered by mistake.',
  0.3: 'Catches about 87% of GTA 6 images, but also covers one in seven other images.',
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
    $('statusBig').textContent = 'Paused';
    $('statusSub').textContent = 'Turn it on above to hide GTA content again.';
  } else if (count === null) {
    st.dataset.state = 'na';
    $('statusBig').textContent = 'Not running here';
    $('statusSub').textContent = 'It does not work on browser pages. If this is a normal website, reload it (F5).';
  } else {
    st.dataset.state = 'on';
    $('statusBig').textContent = count;
    $('statusSub').textContent = count ? count === 1 ? 'item hidden on this page' : 'items hidden on this page' : 'No GTA content on this page.';
  }
}

function renderChips(list) {
  const tpl = $('chipTpl').content.firstElementChild;
  const q = $('kw').value.trim().toLowerCase(); // the add box doubles as search
  const shown = q ? list.filter((k) => k.toLowerCase().includes(q)) : list;
  $('chips').replaceChildren(...shown.map((k) => {
    const li = tpl.cloneNode(true);
    li.querySelector('span').textContent = k;
    li.title = k;
    const del = li.querySelector('button');
    del.setAttribute('aria-label', `Remove ${k}`);
    del.onclick = () => save({ extra: list.filter((x) => x !== k).join('\n') });
    return li;
  }));
  $('chipsEmpty').hidden = shown.length > 0;
  $('chipsEmpty').textContent = list.length
    ? 'No match. Press Enter to add it.'
    : 'No custom keywords yet. GTA YouTubers\' names are a good start.';
  $('kwCount').textContent = q ? `${shown.length} / ${list.length}` : list.length || '';
  $('kwClear').hidden = $('kwCopy').hidden = list.length === 0;
}

function addKeywords(text) {
  const list = keywords();
  const seen = new Set(list.map((k) => k.toLowerCase()));
  for (const k of text.split(/[\r\n\t]+/).map((x) => x.trim()).filter(Boolean)) {
    if (!seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); list.push(k); }
  }
  $('kw').value = '';
  save({ extra: list.join('\n') });
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
$('kw').oninput = () => renderChips(keywords());
$('kwCopy').onclick = async (e) => {
  await navigator.clipboard.writeText(keywords().join('\n'));
  e.target.textContent = 'Copied';
  setTimeout(() => { e.target.textContent = 'Copy all'; }, 1500);
};
$('kw').onkeydown =(e) => { if (e.key === 'Enter') addKeywords(e.target.value); };
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
    e.target.textContent = 'Clear all';
    save({ extra: '' });
    return;
  }
  e.target.dataset.armed = '1';
  e.target.textContent = 'Sure? Click again';
  clearTimer = setTimeout(() => { delete e.target.dataset.armed; e.target.textContent = 'Clear all'; }, 3000);
};

chrome.storage.local.get(DEFAULTS).then((stored) => {
  s = stored;
  render();
  refreshCount();
  setInterval(refreshCount, 1000);
});
