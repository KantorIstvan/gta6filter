// Keyword rules self-check: node test.js
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ctx = {};
vm.runInNewContext(fs.readFileSync(__dirname + '/extension/common.js', 'utf8') + '; this.isGta = isGta;', ctx);
const { isGta } = ctx;

for (const t of [
  'GTA 6 Trailer 3 breakdown', 'gta6 leaks', '#GTA6trailer', 'GTA VI', 'Mindenki a GTA VI-ról beszél', 'GTA 6-ot játszom',
  'Grand Theft Auto VI', 'grand theft auto: vi', 'Jason Duval and Lucia Caminos', 'Port Gellhorn map', 'r/GTA6',
  'Jason & Lucia ending', 'Rockstar dropped GTA news', 'Leonida in Vice City',
  'GTA Vice City looks insane', // two weak hits; also catches old Vice City posts, deliberately
]) assert.ok(isGta(t), `should hide: ${t}`);

for (const t of [
  'GTA 5 online heist', 'Vice City nostalgia 2002', 'Jason Statham new movie',
  'Lucia from Spain', 'rockstar energy drink', 'GTA 60 fps mod', 'gta video compilation', 'Minecraft 1.21',
]) assert.ok(!isGta(t), `should keep: ${t}`);

assert.ok(isGta('Video by GTA Series Videos', ['gta series videos']));
assert.ok(!isGta('Kitty videos', ['gta series videos']));
console.log('ok');
