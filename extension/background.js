// Routes image checks to the offscreen page, where the model can run (service workers can't import() the wasm runtime).
let ready = null;

function ensureOffscreen() {
  ready ??= chrome.offscreen.hasDocument()
    .then((has) => has || chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Local image classifier for the spoiler filter',
    }))
    .catch((e) => { ready = null; throw e; });
  return ready;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type !== 'classify') return;
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ type: 'clip', url: msg.url }))
    .then(reply, (e) => { console.warn(e); reply(0); });
  return true;
});
