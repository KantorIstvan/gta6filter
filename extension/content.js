// Blurs GTA 6 content: text rules from common.js, plus an optional local image check (offscreen.js).
// A "container" is what gets blurred: the nearest site card, else article/li, else the nearest block.

// Messenger rows are role="article" too, but their bubble is a hole in the row that shows a chat-wide gradient:
// blurring the row smears that gradient across it. So rows are not cards, their text falls back to block level.
const ARTICLE = '[role="article"]:not(:has([data-scope="messages_table"]))';
const SITE = [
  [/(^|\.)youtube\.com$/, 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-renderer, ytd-radio-renderer, ytd-compact-radio-renderer, ytd-channel-renderer, ytd-reel-item-renderer, ytd-reel-video-renderer, ytd-post-renderer, ytd-backstage-post-thread-renderer, ytd-comment-view-model, ytd-comment-renderer, ytd-notification-renderer, ytd-playlist-panel-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-rich-item-renderer, ytm-comment-renderer, .ytp-videowall-still, .ytp-modern-videowall-still, .ytp-ce-element, .ytp-autonav-endscreen-upnext-container, #primary-inner'],
  [/(^|\.)reddit\.com$/, 'shreddit-post, shreddit-comment, search-telemetry-tracker, reddit-pdp-right-rail-post, .thing'],
  [/(^|\.)(x|twitter)\.com$/, 'article, [data-testid="trend"], [data-testid="UserCell"], [data-testid="typeaheadResult"]'],
  [/(^|\.)tiktok\.com$/, '[data-e2e="recommend-list-item-container"], [data-e2e="search_top-item"], [data-e2e="comment-level-1"], [data-e2e="comment-level-2"]'],
  [/(^|\.)google\.[a-z.]+$/, '.MjjYud, div.g, g-inner-card, video-voyager, .related-question-pair'],
  // Feed posts lost role="article" (comments kept it), so a post is found by its feed slot instead.
  [/(^|\.)facebook\.com$/, `[aria-posinset], [role="feed"] > div, [data-pagelet^="FeedUnit"], [data-pagelet^="TimelineFeedUnit"], [data-pagelet="ProfileTimeline"] > div, ${ARTICLE}`],
].find(([re]) => re.test(location.hostname))?.[1];
const CARD = `article, ${ARTICLE}, li`;
const BLOCK = 'p, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td, dd, dt, div, section';
const LEVELS = [SITE, CARD, BLOCK].filter(Boolean);
// Elements that own their own text when nested inside a container of level i.
const PRUNE = LEVELS.map((_, i) => LEVELS.slice(0, i + 1).join(','));
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'TEXTAREA']);

let settings = DEFAULTS;
let extra = [];
let revealed = new WeakSet();
let href = location.href;
const imgHit = new WeakMap(); // img -> { url, score }
const scores = new Map(); // url -> Promise<score>

function containerOf(node) {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!el || SKIP_TAGS.has(el.tagName) || el.isContentEditable) return null;
  let c = el;
  for (const sel of LEVELS) {
    const hit = el.closest(sel);
    if (hit) { c = hit; break; }
  }
  return c === document.body || c === document.documentElement ? null : c;
}

// Text (and img alt) that belongs to c itself, not to containers nested inside it.
function ownText(c) {
  const level = LEVELS.findIndex((sel) => c.matches(sel));
  const prune = PRUNE[level < 0 ? PRUNE.length - 1 : level];
  const w = document.createTreeWalker(c, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType === Node.TEXT_NODE) return containerOf(n) === c ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      if (SKIP_TAGS.has(n.tagName) || n.matches(prune)) return NodeFilter.FILTER_REJECT;
      return n.tagName === 'IMG' && n.alt ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  let s = '';
  for (let n; (n = w.nextNode());) s += (n.nodeType === Node.TEXT_NODE ? n.data : n.alt) + ' ';
  return s;
}

const srcOf = (img) => img.currentSrc || img.src;
const imageContainer = (img) => (SITE && img.closest(SITE)) || img.closest(CARD) || img;

// An image hit only counts for its own card, never for the grid/feed around it.
function imgHitIn(c) {
  if (!settings.images) return false;
  for (const img of c.tagName === 'IMG' ? [c] : c.getElementsByTagName('img')) {
    const h = imgHit.get(img);
    if (h && h.score >= settings.threshold && h.url === srcOf(img) && imageContainer(img) === c) return true;
  }
  return false;
}

function evaluate(c) {
  if (!c) return;
  const hit = settings.enabled && !revealed.has(c) && (imgHitIn(c) || isGta(ownText(c), extra));
  if (hit && !c.dataset.gta6f) {
    c.dataset.gta6f = 'hidden';
    for (const v of c.querySelectorAll('video')) v.pause();
  } else if (!hit && c.dataset.gta6f) {
    delete c.dataset.gta6f;
  }
}

function collect(node, set) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.data.trim()) set.add(containerOf(node));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t; (t = w.nextNode());) if (t.data.trim()) set.add(containerOf(t));
  for (const img of node.tagName === 'IMG' ? [node] : node.getElementsByTagName('img')) {
    if (img.alt) set.add(containerOf(img));
    io.observe(img);
  }
}

function scanAll() {
  const set = new Set(document.querySelectorAll('[data-gta6f]'));
  if (document.documentElement) collect(document.documentElement, set);
  for (const img of document.images) {
    if (imgHit.has(img)) set.add(imageContainer(img));
    io.unobserve(img); // re-observing re-fires the callback, so a settings change rechecks visible images
    io.observe(img);
  }
  set.forEach(evaluate);
}

// --- v2: image check, only for images near the viewport ---
function classify(url) {
  if (!scores.has(url)) {
    scores.set(url, Promise.resolve()
      .then(() => chrome.runtime.sendMessage({ type: 'classify', url }))
      .then((s) => s || 0, () => 0));
  }
  return scores.get(url);
}

function checkImg(img) {
  const url = srcOf(img);
  if (!settings.enabled || !settings.images || !/^https?:/.test(url)) return;
  if (img.width < 120 || img.height < 60) return; // avatars, icons
  if (imgHit.get(img)?.url === url || img.closest('[data-gta6f]')) return;
  classify(url).then((score) => {
    if (srcOf(img) !== url) return;
    imgHit.set(img, { url, score });
    evaluate(imageContainer(img));
  });
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) checkImg(e.target);
}, { rootMargin: '1000px' });

// --- wiring ---
const mo = new MutationObserver((records) => {
  if (location.href !== href) { // SPA navigation: forget reveals, recheck everything
    href = location.href;
    revealed = new WeakSet();
    scanAll();
    return;
  }
  const set = new Set();
  for (const r of records) {
    if (r.type === 'attributes') {
      if (r.target.tagName !== 'IMG') continue;
      set.add(imageContainer(r.target));
      io.unobserve(r.target);
      io.observe(r.target);
      continue;
    }
    set.add(containerOf(r.target));
    for (const n of r.addedNodes) collect(n, set);
  }
  set.forEach(evaluate);
});
mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src'] });

// Hidden containers swallow pointer events (no hover previews, no navigation); the first click reveals.
for (const type of ['click', 'auxclick', 'mousedown', 'pointerdown', 'mouseover', 'pointerover', 'mouseenter', 'pointerenter']) {
  addEventListener(type, (e) => {
    const c = e.target.closest?.('[data-gta6f]');
    if (!c) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== 'click') return;
    for (const el of [c, ...c.querySelectorAll('[data-gta6f]')]) {
      revealed.add(el);
      delete el.dataset.gta6f;
    }
  }, true);
}
addEventListener('play', (e) => { if (e.target.closest?.('[data-gta6f]')) e.target.pause(); }, true);
chrome.runtime.onMessage.addListener((msg, _sender, reply) => { // popup's status counter
  if (msg.type === 'count') reply(document.querySelectorAll('[data-gta6f]').length);
});

function apply(s) {
  settings = s;
  extra = s.extra.split('\n').map((k) => k.trim().toLowerCase()).filter(Boolean);
  scanAll();
}
chrome.storage.local.get(DEFAULTS).then(apply);
chrome.storage.onChanged.addListener(() => chrome.storage.local.get(DEFAULTS).then(apply));
scanAll();
