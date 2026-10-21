// Rebuilds extension/probe.json: YouTube thumbnails + Bing images -> CLIP image embeddings -> logistic regression.
// Run: node tools/train-probe.mjs   (after npm install; downloads ~3500 images, caches in tools/.cache)
import fs from 'node:fs';
import { AutoImageProcessor, CLIPVisionModelWithProjection, RawImage } from '@huggingface/transformers';

const MODEL = 'Xenova/clip-vit-base-patch32';
const LAMBDA = 1e-4; // L2; picked by 5-fold CV (1e-3 underfits, 1e-5 flags more non-GTA images)
const Q = {
  pos: ['gta 6 trailer', 'gta 6 gameplay leak', 'gta 6 news', 'gta 6 vice city', 'gta vi lucia jason', 'gta 6 trailer 2',
    'gta 6 trailer 3', 'gta 6 leaks', 'gta 6 map', 'gta 6 lucia', 'gta 6 jason', 'gta 6 trailer reaction',
    'gta 6 release date', 'gta 6 screenshots', 'gta 6 trailer breakdown', 'grand theft auto vi', 'gta 6 gameplay',
    'gta 6 cars', 'gta 6 characters', 'gta 6 leonida', 'gta 6 analysis', 'gta 6 graphics', 'gta 6 hype'],
  neg: ['gta 5 gameplay', 'cyberpunk 2077 gameplay', 'red dead redemption 2', 'minecraft lets play', 'fortnite', 'miami vlog',
    'florida beach sunset', 'cooking recipe', 'car review', 'football highlights', 'music video 2026', 'news today',
    'call of duty gameplay', 'forza horizon 5', 'iphone review', 'podcast', 'gta san andreas', 'watch dogs 2',
    'mafia the old country', 'saints row', 'need for speed', 'spider-man 2 ps5', 'assassins creed shadows',
    'elden ring', 'roblox', 'ea fc 26', 'battlefield 6', 'the last of us', 'miami beach drone', 'florida travel',
    'los angeles night drive', 'supercar review', 'rap music video', 'movie trailer 2026', 'makeup tutorial',
    'documentary', 'reaction video', 'nba highlights', 'police chase', 'gta 5 online', 'the crew motorfest',
    'sleeping dogs', 'grand theft auto vice city 2002', 'game awards', 'ps5 unboxing', 'mukbang',
    // Hard negatives: face + big bold text/year thumbnails (AI, business, finance), they look like GTA 6 news thumbnails to CLIP.
    'ai news', 'ai agents tutorial', 'chatgpt tutorial', 'future of ai 2027', 'make money online', 'business advice',
    'startup podcast', 'self improvement', 'productivity tips', 'tech news', 'stock market news', 'crypto news',
    'personal finance', 'motivation speech', 'learn to code', 'mrbeast', 'celebrity interview', 'magyar podcast',
    'magyar vlog', 'what will happen in 2027'],
};
// Bing image search: posters, logos, artworks and social-media news cards, which YouTube thumbnails never cover.
const IMG = {
  pos: ['gta 6 news instagram post', 'gta 6 news graphic', 'gta vi logo', 'gta 6 logo palm', 'gta 6 artwork',
    'gta 6 official artwork', 'gta 6 poster', 'gta 6 wallpaper', 'gta 6 screenshot', 'gta 6 vice city screenshot',
    'gta 6 lucia', 'gta 6 jason and lucia', 'gta 6 leonida', 'gta 6 meme', 'gta vi fan art', 'gta 6 release date poster',
    'gta 6 facebook post', 'grand theft auto vi cover', 'gta 6 trailer 2 screenshot', 'gta 6 hírek'],
  neg: ['xbox news', 'next xbox console', 'playstation news instagram post', 'gaming news instagram post',
    'nintendo switch 2 news', 'gta 5 artwork', 'gta 5 loading screen', 'gta vice city artwork', 'gta san andreas artwork',
    'red dead redemption 2 artwork', 'cyberpunk 2077 poster', 'mafia the old country poster', 'synthwave sunset palm trees',
    'miami sunset palm trees', 'miami art deco buildings', 'vaporwave aesthetic', 'purple sunset city', 'florida keys aerial',
    'movie poster 2026', 'news instagram post template', 'quote instagram post', 'tech news instagram post',
    'football news graphic', 'music festival poster', 'magyar hírek', 'game of the year poster', 'video game meme',
    'car meme', 'beach vacation photo', 'concert photo'],
};

const cache = new URL('./.cache/', import.meta.url);
fs.mkdirSync(cache, { recursive: true });
const load = (f, d) => (fs.existsSync(new URL(f, cache)) ? JSON.parse(fs.readFileSync(new URL(f, cache), 'utf8')) : d);
const save = (f, v) => fs.writeFileSync(new URL(f, cache), JSON.stringify(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Image URLs per search query. Slow on purpose, both sites rate-limit fast scraping.
const get = async (url) => (await fetch(url, { headers: {
  'accept-language': 'en-US', cookie: 'SOCS=CAI; CONSENT=YES+',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
} })).text();
const youtube = async (q) => [...new Set([...(await get('https://www.youtube.com/results?search_query=' + encodeURIComponent(q)))
  .matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]))].slice(0, 20).map((id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
const bing = async (q) => [...new Set([...(await get('https://www.bing.com/images/search?q=' + encodeURIComponent(q)))
  .matchAll(/turl&quot;:&quot;(.+?)&quot;/g)].map((m) => m[1].replace(/&amp;/g, '&')))];

const thumbs = load('thumbs.json', {});
const jobs = [
  ...Object.entries(Q).flatMap(([kind, qs]) => qs.map((q) => [q, kind, youtube, q])),
  ...Object.entries(IMG).flatMap(([kind, qs]) => qs.map((q) => ['img:' + q, kind, bing, q])),
];
for (const [key, kind, search, q] of jobs) {
  if (thumbs[key]?.urls.length >= 15) continue;
  await sleep(4000);
  try {
    thumbs[key] = { kind, urls: await search(q) };
    save('thumbs.json', thumbs);
    console.log(kind, key, thumbs[key].urls.length);
  } catch (e) { console.log('skip', key, e.cause?.message ?? e.message); }
}

// 2. Normalized CLIP image embeddings.
const emb = load('emb.json', {});
const todo = [...new Set(Object.values(thumbs).flatMap((t) => t.urls))].filter((u) => !emb[u]);
if (todo.length) {
  const processor = await AutoImageProcessor.from_pretrained(MODEL);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8);
    const imgs = await Promise.all(batch.map((u) => RawImage.read(u).catch(() => null)));
    for (const [j, img] of imgs.entries()) {
      if (!img) continue;
      const { image_embeds: { data } } = await vision(await processor(img));
      const n = Math.hypot(...data);
      emb[batch[j]] = [...data].map((x) => +(x / n).toFixed(5));
    }
    if (i % 160 === 0) { console.log('embedded', i, '/', todo.length); save('emb.json', emb); }
  }
  save('emb.json', emb);
}

// 3. Logistic regression (Adam, full batch). Videos found by both a pos and a neg query are dropped.
const kinds = {}; const query = {};
for (const [q, { kind, urls }] of Object.entries(thumbs)) for (const u of urls) { (kinds[u] ??= new Set()).add(kind); query[u] ??= q; }
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const data = Object.keys(emb).filter((u) => kinds[u]?.size === 1)
  .map((u) => ({ u, e: emb[u], y: kinds[u].has('pos') ? 1 : 0, q: query[u] }))
  .sort(() => rnd() - 0.5);
console.log('samples', data.length, 'gta6', data.filter((r) => r.y).length);

const sig = (z) => 1 / (1 + Math.exp(-z));
function fit(rows) {
  const d = rows[0].e.length; const w = new Float64Array(d); let b = 0;
  const m = new Float64Array(d + 1), v = new Float64Array(d + 1);
  for (let it = 1; it <= 1500; it++) {
    const g = new Float64Array(d + 1);
    for (const { e, y } of rows) {
      let z = b;
      for (let i = 0; i < d; i++) z += w[i] * e[i];
      const err = sig(z) - y;
      for (let i = 0; i < d; i++) g[i] += err * e[i];
      g[d] += err;
    }
    for (let i = 0; i <= d; i++) {
      const gi = g[i] / rows.length + (i < d ? LAMBDA * w[i] : 0);
      m[i] = 0.9 * m[i] + 0.1 * gi;
      v[i] = 0.999 * v[i] + 0.001 * gi * gi;
      const step = 0.05 * (m[i] / (1 - 0.9 ** it)) / (Math.sqrt(v[i] / (1 - 0.999 ** it)) + 1e-8);
      if (i < d) w[i] -= step; else b -= step;
    }
  }
  return { w, b };
}
const predict = ({ w, b }, e) => sig(e.reduce((s, x, i) => s + x * w[i], b));

const K = 5; const pred = new Map();
for (let k = 0; k < K; k++) {
  const model = fit(data.filter((_, i) => i % K !== k));
  data.forEach((r, i) => { if (i % K === k) pred.set(r.u, predict(model, r.e)); });
}
const pos = data.filter((r) => r.y), neg = data.filter((r) => !r.y);
const isImg = (r) => r.q.startsWith('img:');
for (const th of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
  const rate = (rows) => `${(rows.filter((r) => pred.get(r.u) >= th).length / rows.length * 100).toFixed(1)}%`;
  const split = (rows) => `${rate(rows.filter((r) => !isImg(r)))} thumbnails / ${rate(rows.filter(isImg))} images`;
  console.log(`threshold ${th}: GTA 6 caught ${split(pos)}, other flagged ${split(neg)}`);
}

const final = fit(data);
fs.writeFileSync(new URL('../extension/probe.json', import.meta.url),
  JSON.stringify({ model: MODEL, b: +final.b.toFixed(4), w: [...final.w].map((x) => +x.toFixed(4)) }));
console.log('wrote extension/probe.json');
