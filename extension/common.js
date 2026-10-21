// Shared by content script, popup and test. No DOM here.
// threshold 0.5, cross-validation: GTA 6 caught ~66% of YouTube thumbnails / ~82% of other images, ~4% of non-GTA flagged.
const DEFAULTS = { enabled: true, images: true, threshold: 0.5, extra: '' };

// One strong hit is enough.
const STRONG = [
  /\bgta[\s_.-]*(?:6(?!\d)|vi(?![a-z]))/i, // gta 6, gta6, #gta6trailer, gta vi, GTA VI-ban; not gta 60 / gta vice city
  /\bgrand\s*theft\s*auto[\s:._-]*(?:6(?!\d)|vi(?![a-z]))/i,
  /\b(?:jason\s+duval|lucia\s+caminos|cal\s+hampton|boobie\s+ike|dre'?quan\s+priest|raul\s+bautista|brian\s+heder|real\s+dimez|port\s+gellhorn|grassrivers|leonida\s+keys|mount\s+kalaga)\b/i,
];
// Weak terms are common words on their own ("Jason", old Vice City content), so two different ones are needed.
const WEAK = ['gta|grand theft auto', 'vice city', 'leonida', 'lucia', 'jason', 'duval', 'rockstar', 'ambrosia']
  .map((w) => new RegExp(`\\b(?:${w})\\b`, 'i'));

// extra: lowercase user terms (channel names etc.), plain substring match, each one counts as strong.
function isGta(text, extra = []) {
  if (STRONG.some((r) => r.test(text))) return true;
  if (extra.length) {
    const low = text.toLowerCase();
    if (extra.some((k) => low.includes(k))) return true;
  }
  let weak = 0;
  for (const r of WEAK) if (r.test(text) && ++weak >= 2) return true;
  return false;
}
