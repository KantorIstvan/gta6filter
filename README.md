# GTA 6 spoiler-szűrő (Brave)

Elhomályosítja a GTA 6-os videókat, posztokat és kommenteket. Minden a gépeden fut, semmit nem küld sehova.

## Telepítés

1. Brave-ben nyisd meg: `brave://extensions`, és jobb fent kapcsold be a **Fejlesztői módot**.
2. **Kicsomagolt bővítmény betöltése**, majd válaszd ki az `extension` mappát.
3. A puzzle ikonnál tűzd ki, így a beállítások egy kattintásra elérhetők.

Az `extension/vendor` mappa már benne van. Ha törölted, az `npm install` visszamásolja.

## Használat

- A GTA-tartalom szürke és elmosott. Egy kattintás felfedi (ilyenkor nem nyitja meg). Új oldalra lépve újra elrejti.
- Az elrejtett videó nem indul el, a hover-előnézet sem.
- Popup: ki/be kapcsolás, képfelismerés, kép-küszöb, saját kulcsszavak és csatornanevek (soronként egy, például GTA-s youtuberek nevei).

## Mit szűr

- **Szöveg:** egy erős találat (GTA 6, GTA VI, #gta6, Grand Theft Auto VI, Jason Duval, Port Gellhorn…) vagy két különböző gyenge (GTA, Vice City, Jason, Lucia, Leonida, Rockstar…) ugyanazon a kártyán belül. Benne vannak az alt szövegek is (az Instagram ezekbe gyakran beleírja, mi van a képen).
- **Kép:** helyi CLIP modell és egy rá tanított osztályozó. Első használatkor kb. 85 MB-ot tölt le a Hugging Face-ről, utána a gyorsítótárból fut. Csak a képernyő közelében lévő, legalább thumbnail méretű képeket nézi.
- Kártyaszintű szabályok: YouTube, Reddit, X, TikTok, Google, Facebook. Minden más oldalon `article`/`li`/bekezdés szinten szűr.

## Fejlesztés

- `npm test`: kulcsszószabályok önellenőrzése.
- `node tools/train-probe.mjs`: újratanítja az `extension/probe.json`-t (YouTube-thumbnailek és Bing-képek, CLIP-vektorok, logisztikus regresszió, CV-riport küszöbönként és forrásonként).
- A képfelismerő naplója: `brave://extensions`, a bővítménynél „Nézetek vizsgálata: offscreen.html”.

## Korlátok

- Instagram Reels oldalon csak a felirat mosódik el, maga a videó nem.
- A Reddit, X, Instagram és Facebook kártyaszabályait nem tudtam élesben tesztelni (bot-védelem, illetve bejelentkezés kell). Ha valami átcsúszik, új szelektor kell a `content.js` `SITE` listájába.
- Képfelismerés 0.5-ös küszöbnél: a GTA 6-os YouTube-thumbnailek kb. 66%-át, a többi GTA 6-os kép (poszter, artwork, hírkártya) kb. 82%-át fogja meg, a nem GTA-s képek kb. 4%-át jelöli. Főleg más open-world játékokat és Miami/Florida képeket néz GTA-nak.
- A kicsi feliratot vagy logót nem látja (a modell 224×224 pixelre kicsinyít). Ha egy oldal saját sablonjában csak egy „GRAND THEFT AUTO VI” címke jelzi a témát (pl. Hungarian Rockstar Club), vedd fel az oldal nevét a popupban a csatornanevek közé. Ha egy témakör rendszeresen fennakad, tegyél hozzá pár ilyen keresést a `tools/train-probe.mjs` `neg` listájához, és tanítsd újra.
