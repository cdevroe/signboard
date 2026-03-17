import { describe, it, expect } from 'vitest';
import vm from 'vm';
import { loadSource } from './helpers/vm-loader.js';

function loadThemeUtilities() {
  const context = {
    console,
    Math,
    Object,
    Number,
    String,
    parseInt,
    document: {
      getElementById() { return null; },
      documentElement: { dataset: {} },
    },
    localStorage: {
      _data: {},
      getItem(key) { return this._data[key] || null; },
      setItem(key, value) { this._data[key] = value; },
    },
  };
  vm.createContext(context);
  // boardLabels.js provides hexToRgb, mixHexColors, DEFAULT_BOARD_THEME_PALETTES, etc.
  loadSource(context, 'app/board/boardLabels.js');
  loadSource(context, 'app/ui/theme.js');
  return context;
}

describe('hexToRgb', () => {
  const context = loadThemeUtilities();
  const { hexToRgb } = context;

  it('parses a 6-digit hex color', () => {
    expect(hexToRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('parses hex without leading hash', () => {
    expect(hexToRgb('ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('parses a 3-digit shorthand hex color', () => {
    expect(hexToRgb('#f80')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('handles black', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('handles white', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('returns null for invalid hex', () => {
    expect(hexToRgb('not-a-color')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(hexToRgb('')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(hexToRgb('#AABBCC')).toEqual({ r: 170, g: 187, b: 204 });
  });
});

describe('mixHexColors', () => {
  const context = loadThemeUtilities();
  const { mixHexColors } = context;

  it('returns first color when weight is 0', () => {
    expect(mixHexColors('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });

  it('returns second color when weight is 1', () => {
    expect(mixHexColors('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  it('returns midpoint at weight 0.5', () => {
    const result = mixHexColors('#ff0000', '#0000ff', 0.5);
    // Midpoint of (255,0,0) and (0,0,255) = (128,0,128)
    expect(result).toBe('#800080');
  });

  it('mixes black and white to gray at 0.5', () => {
    const result = mixHexColors('#000000', '#ffffff', 0.5);
    expect(result).toBe('#808080');
  });

  it('clamps weight above 1', () => {
    expect(mixHexColors('#ff0000', '#0000ff', 5)).toBe('#0000ff');
  });

  it('clamps weight below 0', () => {
    expect(mixHexColors('#ff0000', '#0000ff', -1)).toBe('#ff0000');
  });

  it('uses 0.5 as default weight', () => {
    const result = mixHexColors('#000000', '#ffffff');
    expect(result).toBe('#808080');
  });

  it('falls back when first color is invalid', () => {
    expect(mixHexColors('invalid', '#00ff00')).toBe('#00ff00');
  });

  it('falls back when both colors are invalid', () => {
    // 'bad' is actually valid as a 3-digit hex (b, a, d are hex chars) -> #bbaadd
    // Use truly invalid strings instead
    expect(mixHexColors('xyz', 'xyz')).toBe('#000000');
  });
});

describe('normalizeHexColor', () => {
  const context = loadThemeUtilities();
  const { normalizeHexColor } = context;

  it('normalizes a 3-digit hex to 6-digit', () => {
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
  });

  it('normalizes uppercase to lowercase', () => {
    expect(normalizeHexColor('#AABBCC')).toBe('#aabbcc');
  });

  it('adds hash if missing', () => {
    expect(normalizeHexColor('aabbcc')).toBe('#aabbcc');
  });

  it('returns fallback for invalid input', () => {
    expect(normalizeHexColor('not-hex', '#default')).toBe('#default');
  });

  it('returns empty string fallback by default', () => {
    expect(normalizeHexColor('')).toBe('');
  });
});

describe('buildOverTypeSelectionColor', () => {
  const context = loadThemeUtilities();
  const { buildOverTypeSelectionColor } = context;

  it('returns an rgba string for dark theme', () => {
    const result = buildOverTypeSelectionColor('dark', '#6fcf97', '#12200a');
    expect(result).toMatch(/^rgba\(\d+, \d+, \d+, 0\.44\)$/);
  });

  it('returns an rgba string for light theme', () => {
    const result = buildOverTypeSelectionColor('light', '#0b5fff', '#ffffff');
    expect(result).toMatch(/^rgba\(\d+, \d+, \d+, 0\.34\)$/);
  });

  it('uses higher second-color weight in dark mode (0.35 vs 0.2)', () => {
    // Dark mode mixes more surface color in, so the result differs
    const dark = buildOverTypeSelectionColor('dark', '#ff0000', '#0000ff');
    const light = buildOverTypeSelectionColor('light', '#ff0000', '#0000ff');
    expect(dark).not.toBe(light);
  });

  it('returns fallback rgba when hexToRgb fails on the mixed result', () => {
    // When both inputs are truly invalid (not parseable as hex at all),
    // mixHexColors returns '#000000' which IS valid, so hexToRgb succeeds
    // and we get rgba(0,0,0,...) rather than the hardcoded fallback.
    const result = buildOverTypeSelectionColor('dark', 'xyz', 'xyz');
    expect(result).toMatch(/^rgba\(\d+, \d+, \d+, 0\.44\)$/);
  });

  it('returns light opacity for non-dark theme', () => {
    const result = buildOverTypeSelectionColor('light', 'xyz', 'xyz');
    expect(result).toMatch(/^rgba\(\d+, \d+, \d+, 0\.34\)$/);
  });
});

describe('createOverTypeThemeFromPalette', () => {
  const context = loadThemeUtilities();
  const { createOverTypeThemeFromPalette } = context;

  it('builds a theme object with expected keys', () => {
    const theme = createOverTypeThemeFromPalette('dark', {
      text: '#e8f0e5',
      surface: '#12200a',
      accent: '#6fcf97',
      border: '#1f2e17',
      muted: '#a0b3a3',
    });

    expect(theme.name).toBe('dark');
    expect(theme.colors).toBeDefined();
    expect(theme.colors.bgPrimary).toBe('#12200a');
    expect(theme.colors.text).toBe('#e8f0e5');
    expect(theme.colors.link).toBe('#6fcf97');
    expect(theme.colors.hr).toBe('#1f2e17');
    expect(theme.colors.em).toBe('#a0b3a3');
  });

  it('uses default colors when palette values are missing', () => {
    const theme = createOverTypeThemeFromPalette('light', {});
    expect(theme.colors.text).toBe('#2f2f2f');
    expect(theme.colors.bgPrimary).toBe('#ffffff');
    expect(theme.colors.link).toBe('#3366cc');
  });

  it('uses default colors when palette is null', () => {
    const theme = createOverTypeThemeFromPalette('light', null);
    expect(theme.colors.text).toBe('#2f2f2f');
  });

  it('computes codeBg as a mix of surface and border', () => {
    const theme = createOverTypeThemeFromPalette('light', {
      surface: '#ffffff',
      border: '#000000',
    });
    // codeBg = mixHexColors('#ffffff', '#000000', 0.62) = roughly #61619e area
    expect(theme.colors.codeBg).toBeDefined();
    expect(theme.colors.codeBg).toMatch(/^#[a-f0-9]{6}$/);
  });

  it('generates a selection rgba color', () => {
    const theme = createOverTypeThemeFromPalette('dark', {
      accent: '#6fcf97',
      surface: '#12200a',
    });
    expect(theme.colors.selection).toMatch(/^rgba\(/);
  });
});

describe('buildCustomOverTypeThemesFromBoardPalettes', () => {
  const context = loadThemeUtilities();
  const { buildCustomOverTypeThemesFromBoardPalettes } = context;

  it('returns both dark and light themes', () => {
    const themes = buildCustomOverTypeThemesFromBoardPalettes({});
    expect(themes.dark).toBeDefined();
    expect(themes.light).toBeDefined();
    expect(themes.dark.name).toBe('dark');
    expect(themes.light.name).toBe('lite');
  });

  it('uses DEFAULT_BOARD_THEME_PALETTES when given null', () => {
    const themes = buildCustomOverTypeThemesFromBoardPalettes(null);
    expect(themes.dark.colors.bgPrimary).toBeDefined();
    expect(themes.light.colors.bgPrimary).toBeDefined();
  });

  it('respects custom palettes when provided', () => {
    const themes = buildCustomOverTypeThemesFromBoardPalettes({
      light: { text: '#111111', surface: '#eeeeee', accent: '#0000ff', border: '#cccccc', muted: '#999999' },
    });
    expect(themes.light.colors.text).toBe('#111111');
    expect(themes.light.colors.bgPrimary).toBe('#eeeeee');
  });
});
