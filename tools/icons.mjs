// extension/icons/icon.svg -> 16/32/48/128 px PNGs (Chrome needs PNG for extension icons). Run: node tools/icons.mjs
import sharp from 'sharp';

const svg = new URL('../extension/icons/icon.svg', import.meta.url);
for (const size of [16, 32, 48, 128]) {
  await sharp(svg.pathname.slice(1), { density: 600 }).resize(size, size).png().toFile(new URL(`../extension/icons/${size}.png`, import.meta.url).pathname.slice(1));
}
console.log('icons written');
