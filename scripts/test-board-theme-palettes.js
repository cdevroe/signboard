const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app/board/boardLabels.js'), 'utf8');
const start = source.indexOf('const COLOR_SCHEMES = [');
const end = source.indexOf('\nfunction getColorSchemeById', start);
assert(start >= 0 && end > start);
const schemes = JSON.parse(vm.runInNewContext(`${source.slice(start, end)}; JSON.stringify(COLOR_SCHEMES)`, {}, { timeout: 1000 }));
assert.equal(schemes.length, 51);
assert.equal(new Set(schemes.map(scheme => scheme.id)).size, schemes.length);
const originalIds = new Set(['default', 'lavender', 'harvest', 'olive', 'evergreen', 'rosewood', 'mid-winter', 'cozy-blush', 'coffee']);
const added = schemes.filter(scheme => !originalIds.has(scheme.id));
// The existing schemes retain their established appearance. These checks guard
// the 42 new contributions against unreadable metadata, links and button text.
assert.equal(added.length, 42);
const keys = Object.keys(schemes[0].light).sort();
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(h => parseInt(h, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
for (const scheme of added) for (const mode of ['light', 'dark']) {
  const palette = scheme[mode];
  assert.deepEqual(Object.keys(palette).sort(), keys);
  for (const [key, value] of Object.entries(palette)) {
    assert(key.startsWith('shadow') ? /^rgba\([\d.,\s]+\)$/.test(value) : /^#[0-9a-f]{6}$/i.test(value), `${scheme.id}.${mode}.${key}`);
  }
  for (const token of ['text', 'muted', 'accent']) for (const background of ['surface', 'boardBackground']) {
    assert(contrast(palette[token], palette[background]) >= 4.5, `${scheme.id}.${mode}: ${token} on ${background}`);
  }
  assert(contrast(palette.accentText, palette.accent) >= 4.5, `${scheme.id}.${mode}: button text`);
}
console.log('All 42 new schemes pass text contrast checks in both modes.');
