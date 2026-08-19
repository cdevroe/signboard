const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  getDefaultOmarchyThemeDirectory,
  parseOmarchyColorsToml,
  readOmarchyTheme,
} = require('../lib/omarchyTheme');

const DARK_THEME = `
mode = "dark"
accent = "#7aa2f7"
background = "#1a1b26"
lighter_background = "#24283b"
foreground = "#c0caf5"
muted = "#565f89"
selection = "#33467c"
`;

async function run() {
  assert.strictEqual(
    getDefaultOmarchyThemeDirectory('/home/signboard'),
    path.join('/home/signboard', '.local', 'state', 'omarchy', 'current', 'theme'),
  );

  const parsed = parseOmarchyColorsToml(DARK_THEME);
  assert.strictEqual(parsed.valid, true);
  assert.deepStrictEqual(parsed.errors, []);
  assert.strictEqual(parsed.palette.mode, 'dark');
  assert.strictEqual(parsed.palette.boardBackground, '#1a1b26');
  assert.strictEqual(parsed.palette.surface, '#24283b');
  assert.strictEqual(parsed.palette.text, '#c0caf5');
  assert.strictEqual(parsed.palette.accent, '#7aa2f7');

  const malformed = parseOmarchyColorsToml('mode = "light"\nbackground = "not-css"\n');
  assert.strictEqual(malformed.valid, false);
  assert(malformed.errors[0].includes('background'));
  assert(malformed.errors[0].includes('foreground'));
  assert(malformed.errors[0].includes('accent'));

  const unsupportedPlatform = await readOmarchyTheme({ platform: 'darwin' });
  assert.strictEqual(unsupportedPlatform.detected, false);
  assert.strictEqual(unsupportedPlatform.available, false);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-omarchy-theme-'));
  const themeDirectory = path.join(tempRoot, 'current', 'theme');
  try {
    await fs.mkdir(themeDirectory, { recursive: true });
    await fs.writeFile(path.join(themeDirectory, 'colors.toml'), DARK_THEME, 'utf8');
    await fs.writeFile(path.join(path.dirname(themeDirectory), 'theme.name'), 'Tokyo Night\n', 'utf8');

    const detected = await readOmarchyTheme({ platform: 'linux', themeDirectory });
    assert.strictEqual(detected.detected, true);
    assert.strictEqual(detected.available, true);
    assert.strictEqual(detected.name, 'Tokyo Night');
    assert.strictEqual(detected.mode, 'dark');

    await fs.writeFile(path.join(themeDirectory, 'colors.toml'), `
mode = "light"
accent = "#005faf"
background = "#f6f6f6"
lighter_background = "#ffffff"
foreground = "#202020"
`, 'utf8');
    await fs.writeFile(path.join(path.dirname(themeDirectory), 'theme.name'), 'Paper\n', 'utf8');

    const replaced = await readOmarchyTheme({ platform: 'linux', themeDirectory });
    assert.strictEqual(replaced.available, true);
    assert.strictEqual(replaced.name, 'Paper');
    assert.strictEqual(replaced.mode, 'light');
    assert.strictEqual(replaced.palette.surface, '#ffffff');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  console.log('Omarchy theme tests passed.');
}

run().catch((error) => {
  console.error('Omarchy theme tests failed.');
  console.error(error);
  process.exitCode = 1;
});
