// v2: CLIP image embedding (runs locally, wasm) + a small logistic regression trained on GTA 6 vs other thumbnails.
import { AutoImageProcessor, CLIPVisionModelWithProjection, RawImage, env } from './vendor/transformers.min.js';

env.useWasmCache = false; // would load the wasm glue from a blob: URL, which the extension CSP blocks
env.backends.onnx.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL('vendor/ort-wasm-simd-threaded.asyncify.mjs'),
  wasm: chrome.runtime.getURL('vendor/ort-wasm-simd-threaded.asyncify.wasm'),
};

let loading = null;
function load() {
  loading ??= fetch('probe.json').then((r) => r.json()).then((probe) => Promise.all([
    probe,
    AutoImageProcessor.from_pretrained(probe.model),
    CLIPVisionModelWithProjection.from_pretrained(probe.model, { dtype: 'q8', device: 'wasm' }),
  ])).catch((e) => { loading = null; throw e; });
  return loading;
}

async function score(url) {
  const [probe, processor, vision] = await load();
  const { image_embeds: { data } } = await vision(await processor(await RawImage.read(url)));
  const norm = Math.hypot(...data);
  let z = probe.b;
  for (let i = 0; i < data.length; i++) z += probe.w[i] * data[i] / norm;
  return 1 / (1 + Math.exp(-z));
}

const cache = new Map(); // url -> Promise<score>
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type !== 'clip') return;
  if (!cache.has(msg.url)) cache.set(msg.url, score(msg.url).catch((e) => { console.warn(msg.url, e); return 0; }));
  cache.get(msg.url).then(reply);
  return true;
});
