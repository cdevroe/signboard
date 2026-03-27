const BOARD_LABEL_COLOR_PALETTE = [
  { colorLight: '#f59e0b', colorDark: '#d97706' },
  { colorLight: '#a855f7', colorDark: '#7e22ce' },
  { colorLight: '#14b8a6', colorDark: '#0f766e' },
  { colorLight: '#ec4899', colorDark: '#be185d' },
  { colorLight: '#84cc16', colorDark: '#4d7c0f' },
  { colorLight: '#f97316', colorDark: '#c2410c' },
];

const DEFAULT_BOARD_THEME_BACKGROUNDS = Object.freeze({
  light: '#f7f8fa',
  dark: '#091102',
});

const DEFAULT_BOARD_THEME_PALETTES = Object.freeze({
  light: Object.freeze({
    boardBackground: '#f7f8fa',
    surface: '#ffffff',
    text: '#0f172a',
    muted: '#6b7280',
    border: '#e6e8ec',
    accent: '#0b5fff',
    accentText: '#ffffff',
    shadow: 'rgba(15, 23, 42, .04)',
    shadowCard: 'rgba(15, 23, 42, .06)',
  }),
  dark: Object.freeze({
    boardBackground: '#091102',
    surface: '#12200a',
    text: '#e8f0e5',
    muted: '#a0b3a3',
    border: '#1f2e17',
    accent: '#6fcf97',
    accentText: '#07130c',
    shadow: 'rgba(0, 0, 0, 0.45)',
    shadowCard: 'rgba(0, 0, 0, 0.55)',
  }),
});

const BOARD_THEME_STYLE_VAR_MAP = Object.freeze({
  light: Object.freeze({
    boardBackground: '--sb-light-bg',
    surface: '--sb-light-bg-card',
    text: '--sb-light-text',
    muted: '--sb-light-muted',
    border: '--sb-light-border',
    accent: '--sb-light-accent',
    accentText: '--sb-light-accent-contrast',
    shadow: '--sb-light-shadow',
    shadowCard: '--sb-light-shadow-card',
  }),
  dark: Object.freeze({
    boardBackground: '--sb-dark-bg',
    surface: '--sb-dark-bg-card',
    text: '--sb-dark-text',
    muted: '--sb-dark-muted',
    border: '--sb-dark-border',
    accent: '--sb-dark-accent',
    accentText: '--sb-dark-accent-contrast',
    shadow: '--sb-dark-shadow',
    shadowCard: '--sb-dark-shadow-card',
  }),
});
/* ──────────────────────────────────────────────────────────────────────────────
 * COLOR SCHEMES
 *
 * Each scheme provides a full light AND dark palette so the light/dark toggle
 * continues to work.  To tweak a scheme, edit the hex values below — every
 * palette key maps directly to a CSS custom property via BOARD_THEME_STYLE_VAR_MAP.
 *
 * Palette keys:
 *   boardBackground  – page / board background
 *   surface          – card / elevated surface
 *   text             – primary text
 *   muted            – secondary / hint text
 *   border           – borders & dividers
 *   accent           – buttons, links, focus rings
 *   accentText       – text rendered ON the accent color
 *   shadow           – subtle drop shadow
 *   shadowCard       – slightly stronger card shadow
 * ────────────────────────────────────────────────────────────────────────── */
const COLOR_SCHEMES = [
  {
    id: 'default',
    name: 'Default',
    light: {
      boardBackground: '#f7f8fa',
      surface:         '#ffffff',
      text:            '#0f172a',
      muted:           '#6b7280',
      border:          '#e6e8ec',
      accent:          '#0b5fff',
      accentText:      '#ffffff',
      shadow:          'rgba(15, 23, 42, .04)',
      shadowCard:      'rgba(15, 23, 42, .06)',
    },
    dark: {
      boardBackground: '#091102',
      surface:         '#12200a',
      text:            '#e8f0e5',
      muted:           '#a0b3a3',
      border:          '#1f2e17',
      accent:          '#6fcf97',
      accentText:      '#07130c',
      shadow:          'rgba(0, 0, 0, 0.45)',
      shadowCard:      'rgba(0, 0, 0, 0.55)',
    },
  },

  /* ── Meadow  ─  palette #EAF7CF · #EBEFBF · #CEB5A7 · #92828D · #ADAABF ─ */
  {
    id: 'lavender',
    name: 'Lavender',
    light: {
      boardBackground: '#f2f5ec',
      surface:         '#fafbf7',
      text:            '#2b2833',
      muted:           '#706878',
      border:          '#dddbd3',
      accent:          '#7b6e8a',
      accentText:      '#ffffff',
      shadow:          'rgba(43, 40, 51, 0.05)',
      shadowCard:      'rgba(43, 40, 51, 0.08)',
    },
    dark: {
      boardBackground: '#1e1b24',
      surface:         '#292631',
      text:            '#e6eed5',
      muted:           '#a29dae',
      border:          '#3a3644',
      accent:          '#c4bdd2',
      accentText:      '#1e1b24',
      shadow:          'rgba(0, 0, 0, 0.40)',
      shadowCard:      'rgba(0, 0, 0, 0.50)',
    },
  },

  /* ── Harvest  ─  palette #F9A03F · #F7D488 · #EAEFB1 · #E9F7CA · #CEB5A7 ─ */
  {
    id: 'harvest',
    name: 'Harvest',
    light: {
      boardBackground: '#f6f2e8',
      surface:         '#fcfaf4',
      text:            '#33280f',
      muted:           '#8a7b62',
      border:          '#e5dece',
      accent:          '#c4850a',
      accentText:      '#ffffff',
      shadow:          'rgba(51, 40, 15, 0.05)',
      shadowCard:      'rgba(51, 40, 15, 0.08)',
    },
    dark: {
      boardBackground: '#1c1709',
      surface:         '#282012',
      text:            '#f0eacd',
      muted:           '#b5a67f',
      border:          '#3b3220',
      accent:          '#f9a03f',
      accentText:      '#1c1709',
      shadow:          'rgba(0, 0, 0, 0.40)',
      shadowCard:      'rgba(0, 0, 0, 0.50)',
    },
  },

  /* ── Olive  ─  palette #606C38 · #283618 · #FEFAE0 · #DDA15E · #BC6C25 ── */
  {
    id: 'olive',
    name: 'Olive',
    light: {
      boardBackground: '#faf6dc',
      surface:         '#fefcee',
      text:            '#283618',
      muted:           '#6b6543',
      border:          '#e4ddb8',
      accent:          '#5d6832',
      accentText:      '#fefae0',
      shadow:          'rgba(40, 54, 24, 0.06)',
      shadowCard:      'rgba(40, 54, 24, 0.09)',
    },
    dark: {
      boardBackground: '#161e0c',
      surface:         '#212a14',
      text:            '#f3efd2',
      muted:           '#a39e72',
      border:          '#303a1f',
      accent:          '#dda15e',
      accentText:      '#161e0c',
      shadow:          'rgba(0, 0, 0, 0.45)',
      shadowCard:      'rgba(0, 0, 0, 0.55)',
    },
  },

  /* ── Evergreen  ─  palette #DAD7CD · #A3B18A · #588157 · #3A5A40 · #344E41 */
  {
    id: 'evergreen',
    name: 'Evergreen',
    light: {
      boardBackground: '#e8e5dc',
      surface:         '#f2f0ea',
      text:            '#1e2f22',
      muted:           '#5c6e5e',
      border:          '#cbc7ba',
      accent:          '#4e7550',
      accentText:      '#ffffff',
      shadow:          'rgba(30, 47, 34, 0.06)',
      shadowCard:      'rgba(30, 47, 34, 0.09)',
    },
    dark: {
      boardBackground: '#1a2620',
      surface:         '#243029',
      text:            '#dad7cd',
      muted:           '#8da18a',
      border:          '#2f3e34',
      accent:          '#a3b18a',
      accentText:      '#1a2620',
      shadow:          'rgba(0, 0, 0, 0.45)',
      shadowCard:      'rgba(0, 0, 0, 0.55)',
    },
  },

  /* ── Rosewood  ─  palette #EDAFB8 · #F7E1D7 · #DEDBD2 · #B0C4B1 · #4A5759 */
  {
    id: 'rosewood',
    name: 'Rosewood',
    light: {
      boardBackground: '#f3ece6',
      surface:         '#faf7f4',
      text:            '#2e3435',
      muted:           '#6d7879',
      border:          '#ddd7cf',
      accent:          '#b5707c',
      accentText:      '#ffffff',
      shadow:          'rgba(46, 52, 53, 0.05)',
      shadowCard:      'rgba(46, 52, 53, 0.08)',
    },
    dark: {
      boardBackground: '#1e2526',
      surface:         '#292f30',
      text:            '#f0e4da',
      muted:           '#97a69a',
      border:          '#383f40',
      accent:          '#edafb8',
      accentText:      '#1e2526',
      shadow:          'rgba(0, 0, 0, 0.40)',
      shadowCard:      'rgba(0, 0, 0, 0.50)',
    },
  },
];

function getColorSchemeById(id) {
  return COLOR_SCHEMES.find((scheme) => scheme.id === id) || null;
}

function getDefaultColorScheme() {
  return COLOR_SCHEMES[0];
}

const DEFAULT_BOARD_NOTIFICATION_SETTINGS = Object.freeze({
  enabled: false,
  time: '09:00',
});
const DEFAULT_BOARD_TOOLTIPS_ENABLED = true;
const BOARD_IMPORT_TEST_OVERRIDE_KEY = '__signboardImportOverrides';

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value, fallback = '') {
  const source = String(value || '').trim().toLowerCase();
  if (!source) {
    return fallback;
  }

  if (/^#?[a-f0-9]{3}$/.test(source)) {
    const compact = source.replace('#', '');
    return `#${compact[0]}${compact[0]}${compact[1]}${compact[1]}${compact[2]}${compact[2]}`;
  }

  if (/^#?[a-f0-9]{6}$/.test(source)) {
    return source.startsWith('#') ? source : `#${source}`;
  }

  return fallback;
}

function hexToRgb(hexColor) {
  const normalized = normalizeHexColor(hexColor, '');
  if (!normalized) {
    return null;
  }

  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => clampNumber(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHexColors(firstColor, secondColor, secondWeight = 0.5) {
  const first = hexToRgb(firstColor);
  const second = hexToRgb(secondColor);
  if (!first || !second) {
    return normalizeHexColor(firstColor, normalizeHexColor(secondColor, '#000000'));
  }

  const weight = clampNumber(Number(secondWeight), 0, 1);
  const firstWeight = 1 - weight;
  return rgbToHex(
    first.r * firstWeight + second.r * weight,
    first.g * firstWeight + second.g * weight,
    first.b * firstWeight + second.b * weight,
  );
}

function rgbToHsl(red, green, blue) {
  const r = clampNumber(Number(red) / 255, 0, 1);
  const g = clampNumber(Number(green) / 255, 0, 1);
  const b = clampNumber(Number(blue) / 255, 0, 1);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs((2 * lightness) - 1));
    switch (max) {
      case r:
        hue = ((g - b) / delta) % 6;
        break;
      case g:
        hue = ((b - r) / delta) + 2;
        break;
      default:
        hue = ((r - g) / delta) + 4;
        break;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  return { h: hue, s: saturation * 100, l: lightness * 100 };
}

function hslToRgb(hue, saturation, lightness) {
  const h = (((Number(hue) % 360) + 360) % 360) / 360;
  const s = clampNumber(Number(saturation) / 100, 0, 1);
  const l = clampNumber(Number(lightness) / 100, 0, 1);

  if (s === 0) {
    const channel = Math.round(l * 255);
    return { r: channel, g: channel, b: channel };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - (l * s);
  const p = (2 * l) - q;

  const toChannel = (t) => {
    let normalized = t;
    if (normalized < 0) normalized += 1;
    if (normalized > 1) normalized -= 1;
    if (normalized < (1 / 6)) return p + (q - p) * 6 * normalized;
    if (normalized < (1 / 2)) return q;
    if (normalized < (2 / 3)) return p + (q - p) * ((2 / 3) - normalized) * 6;
    return p;
  };

  return {
    r: Math.round(toChannel(h + (1 / 3)) * 255),
    g: Math.round(toChannel(h) * 255),
    b: Math.round(toChannel(h - (1 / 3)) * 255),
  };
}

function toLinearChannel(channel) {
  const normalized = clampNumber(Number(channel) / 255, 0, 1);
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(hexColor) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) {
    return 0;
  }

  return (
    (0.2126 * toLinearChannel(rgb.r)) +
    (0.7152 * toLinearChannel(rgb.g)) +
    (0.0722 * toLinearChannel(rgb.b))
  );
}

function getContrastRatio(firstColor, secondColor) {
  const firstLuminance = getRelativeLuminance(firstColor);
  const secondLuminance = getRelativeLuminance(secondColor);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureMinContrast(color, backgroundColor, minimumRatio) {
  let nextColor = normalizeHexColor(color, '#000000');
  const background = normalizeHexColor(backgroundColor, '#ffffff');
  const minRatio = Number(minimumRatio) || 4.5;

  if (getContrastRatio(nextColor, background) >= minRatio) {
    return { color: nextColor, adjusted: false };
  }

  const backgroundLuminance = getRelativeLuminance(background);
  const adjustmentTargets = backgroundLuminance < 0.5 ? ['#ffffff', '#000000'] : ['#000000', '#ffffff'];
  const seedColor = nextColor;

  for (const targetColor of adjustmentTargets) {
    for (let step = 1; step <= 30; step += 1) {
      const candidate = mixHexColors(seedColor, targetColor, step / 30);
      if (getContrastRatio(candidate, background) >= minRatio) {
        return { color: candidate, adjusted: true };
      }
    }
  }

  const fallback = getContrastRatio('#ffffff', background) >= getContrastRatio('#000000', background)
    ? '#ffffff'
    : '#000000';
  return { color: fallback, adjusted: true };
}

function chooseReadableTextColor(backgroundColor) {
  const candidates = ['#0f172a', '#f8fafc', '#000000', '#ffffff'];
  let best = candidates[0];
  let bestRatio = 0;

  for (const candidate of candidates) {
    const ratio = getContrastRatio(candidate, backgroundColor);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }

  const adjusted = ensureMinContrast(best, backgroundColor, 4.5);
  return {
    color: adjusted.color,
    adjusted: adjusted.adjusted || bestRatio < 4.5,
    ratio: getContrastRatio(adjusted.color, backgroundColor),
  };
}

function chooseReadableTextColorAcross(backgroundColors, minimumRatio = 4.5) {
  const backgrounds = Array.isArray(backgroundColors) ? backgroundColors.filter(Boolean) : [];
  const candidates = ['#0f172a', '#111827', '#f8fafc', '#e5e7eb', '#000000', '#ffffff'];
  let bestColor = candidates[0];
  let bestWorstRatio = -1;
  let bestAverageRatio = -1;

  for (const candidate of candidates) {
    const ratios = backgrounds.map((background) => getContrastRatio(candidate, background));
    const worstRatio = ratios.length > 0 ? Math.min(...ratios) : 0;
    const averageRatio = ratios.length > 0
      ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
      : 0;

    if (
      worstRatio > bestWorstRatio ||
      (worstRatio === bestWorstRatio && averageRatio > bestAverageRatio)
    ) {
      bestColor = candidate;
      bestWorstRatio = worstRatio;
      bestAverageRatio = averageRatio;
    }
  }

  const firstBackground = backgrounds[0] || '#ffffff';
  const adjusted = ensureMinContrast(bestColor, firstBackground, minimumRatio);
  return {
    color: adjusted.color,
    adjusted: adjusted.adjusted || bestWorstRatio < minimumRatio,
  };
}

function deriveAccentColor(backgroundColor, themeMode, isBackgroundDark) {
  const backgroundRgb = hexToRgb(backgroundColor);
  if (!backgroundRgb) {
    return DEFAULT_BOARD_THEME_PALETTES[themeMode].accent;
  }

  const backgroundHsl = rgbToHsl(backgroundRgb.r, backgroundRgb.g, backgroundRgb.b);
  const hueShift = themeMode === 'dark' ? 118 : 148;
  const accentHue = (backgroundHsl.h + hueShift) % 360;
  const accentSaturation = clampNumber(Math.max(backgroundHsl.s + 16, 58), 52, 85);
  const accentLightness = isBackgroundDark ? 62 : 44;

  const rgb = hslToRgb(accentHue, accentSaturation, accentLightness);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function deriveThemePalette(themeMode, backgroundColor) {
  const defaults = DEFAULT_BOARD_THEME_PALETTES[themeMode] || DEFAULT_BOARD_THEME_PALETTES.light;
  const boardBackground = normalizeHexColor(backgroundColor, defaults.boardBackground);
  const backgroundLuminance = getRelativeLuminance(boardBackground);
  const isBackgroundDark = backgroundLuminance < 0.42;
  let adjustedForReadability = false;

  const surface = isBackgroundDark
    ? mixHexColors(boardBackground, '#ffffff', 0.1)
    : mixHexColors(boardBackground, '#ffffff', 0.74);

  const textSelection = chooseReadableTextColorAcross([surface, boardBackground], 4.5);
  let text = textSelection.color;
  adjustedForReadability = adjustedForReadability || textSelection.adjusted;

  const surfaceTextAdjustment = ensureMinContrast(text, surface, 4.5);
  text = surfaceTextAdjustment.color;
  adjustedForReadability = adjustedForReadability || surfaceTextAdjustment.adjusted;

  const borderBase = isBackgroundDark
    ? mixHexColors(boardBackground, '#ffffff', 0.2)
    : mixHexColors(boardBackground, '#000000', 0.12);
  const borderAdjustment = ensureMinContrast(borderBase, boardBackground, 1.35);
  const border = borderAdjustment.color;
  adjustedForReadability = adjustedForReadability || borderAdjustment.adjusted;

  let muted = mixHexColors(text, surface, 0.42);
  const mutedAdjustment = ensureMinContrast(muted, surface, 3.05);
  muted = mutedAdjustment.color;
  adjustedForReadability = adjustedForReadability || mutedAdjustment.adjusted;

  const accentBase = deriveAccentColor(boardBackground, themeMode, isBackgroundDark);
  const accentAdjustment = ensureMinContrast(accentBase, boardBackground, 2.7);
  const accent = accentAdjustment.color;
  adjustedForReadability = adjustedForReadability || accentAdjustment.adjusted;

  const accentText = chooseReadableTextColor(accent).color;

  return {
    boardBackground,
    surface,
    text,
    muted,
    border,
    accent,
    accentText,
    shadow: defaults.shadow,
    shadowCard: defaults.shadowCard,
    adjustedForReadability,
    textContrastRatio: getContrastRatio(text, surface),
  };
}

function normalizeThemeModeOverrides(rawModeOverrides) {
  const source = rawModeOverrides && typeof rawModeOverrides === 'object' ? rawModeOverrides : {};
  const boardBackground = normalizeHexColor(source.boardBackground, '');
  if (!boardBackground) {
    return {};
  }

  return { boardBackground };
}

function normalizeThemeOverrides(rawThemeOverrides) {
  const source = rawThemeOverrides && typeof rawThemeOverrides === 'object' ? rawThemeOverrides : {};
  return {
    light: normalizeThemeModeOverrides(source.light),
    dark: normalizeThemeModeOverrides(source.dark),
  };
}

function normalizeNotificationTime(value) {
  const candidate = String(value || '').trim();
  if (/^(?:0[1-9]|1\d|2[0-4]):[0-5]\d$/.test(candidate)) {
    return candidate;
  }

  return DEFAULT_BOARD_NOTIFICATION_SETTINGS.time;
}

function normalizeBoardNotificationSettings(rawNotificationSettings) {
  const source = rawNotificationSettings && typeof rawNotificationSettings === 'object'
    ? rawNotificationSettings
    : {};

  return {
    enabled: source.enabled === true,
    time: normalizeNotificationTime(source.time),
  };
}

function normalizeBoardTooltipsEnabled(value) {
  return value === false ? false : DEFAULT_BOARD_TOOLTIPS_ENABLED;
}

function hasThemeModeOverride(themeModeOverrides) {
  return Boolean(themeModeOverrides && typeof themeModeOverrides.boardBackground === 'string' && themeModeOverrides.boardBackground.length > 0);
}

function getBoardLabelState() {
  if (!window.__boardLabelState) {
    window.__boardLabelState = {
      labels: [],
      labelsById: new Map(),
      filterIds: [],
      hasDueDateFilter: false,
      activeCardLabelPopover: null,
      colorScheme: '',
      themeOverrides: { light: {}, dark: {} },
      themePalettes: {
        light: { ...DEFAULT_BOARD_THEME_PALETTES.light },
        dark: { ...DEFAULT_BOARD_THEME_PALETTES.dark },
      },
      notificationSettings: { ...DEFAULT_BOARD_NOTIFICATION_SETTINGS },
      tooltipsEnabled: DEFAULT_BOARD_TOOLTIPS_ENABLED,
      activeSettingsPanel: 'general',
      importInProgress: '',
      importSummary: null,
      importSummaryBoardRoot: '',
      settingsSaveTimer: null,
      settingsSaveInFlight: Promise.resolve(),
    };
  }

  return window.__boardLabelState;
}

function setBoardLabels(labels) {
  const state = getBoardLabelState();
  state.labels = Array.isArray(labels) ? labels.map((label) => ({ ...label })) : [];
  state.labelsById = new Map(state.labels.map((label) => [label.id, label]));

  const validIds = new Set(state.labels.map((label) => label.id));
  state.filterIds = state.filterIds.filter((id) => validIds.has(id));
}

function getBoardLabels() {
  return getBoardLabelState().labels;
}

function getBoardLabelById(labelId) {
  if (!labelId) {
    return null;
  }

  return getBoardLabelState().labelsById.get(String(labelId)) || null;
}

function getBoardThemeMode() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function getBoardColorScheme() {
  return getBoardLabelState().colorScheme || '';
}

function setBoardColorScheme(schemeId) {
  const state = getBoardLabelState();
  state.colorScheme = typeof schemeId === 'string' ? schemeId : '';
}

function getBoardThemeOverrides() {
  const state = getBoardLabelState();
  return normalizeThemeOverrides(state.themeOverrides);
}

function setBoardThemeOverrides(themeOverrides) {
  const state = getBoardLabelState();
  state.themeOverrides = normalizeThemeOverrides(themeOverrides);
}

function getBoardNotificationSettings() {
  const state = getBoardLabelState();
  return normalizeBoardNotificationSettings(state.notificationSettings);
}

function setBoardNotificationSettings(notificationSettings) {
  const state = getBoardLabelState();
  state.notificationSettings = normalizeBoardNotificationSettings(notificationSettings);
}

function getBoardTooltipsEnabled() {
  return normalizeBoardTooltipsEnabled(getBoardLabelState().tooltipsEnabled);
}

function setBoardTooltipsEnabled(value) {
  const state = getBoardLabelState();
  state.tooltipsEnabled = normalizeBoardTooltipsEnabled(value);

  if (typeof setTooltipsEnabled === 'function') {
    setTooltipsEnabled(state.tooltipsEnabled);
  }
}

function getBoardThemePalettes() {
  const state = getBoardLabelState();
  return {
    light: { ...state.themePalettes.light },
    dark: { ...state.themePalettes.dark },
  };
}



function applyThemePaletteVariables(themeMode, palette) {
  const modeMap = BOARD_THEME_STYLE_VAR_MAP[themeMode];
  if (!modeMap || !palette) {
    return;
  }

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty(modeMap.boardBackground, palette.boardBackground);
  rootStyle.setProperty(modeMap.surface, palette.surface);
  rootStyle.setProperty(modeMap.text, palette.text);
  rootStyle.setProperty(modeMap.muted, palette.muted);
  rootStyle.setProperty(modeMap.border, palette.border);
  rootStyle.setProperty(modeMap.accent, palette.accent);
  rootStyle.setProperty(modeMap.accentText, palette.accentText || '#ffffff');
  rootStyle.setProperty(modeMap.shadow, palette.shadow);
  rootStyle.setProperty(modeMap.shadowCard, palette.shadowCard);
}

function applyColorSchemeById(schemeId, options = {}) {
  const state = getBoardLabelState();
  const scheme = getColorSchemeById(schemeId) || getDefaultColorScheme();
  setBoardColorScheme(scheme.id);

  // Clear legacy overrides when using a curated scheme
  setBoardThemeOverrides({ light: {}, dark: {} });

  const lightPalette = { ...scheme.light };
  const darkPalette = { ...scheme.dark };
  state.themePalettes = { light: lightPalette, dark: darkPalette };

  applyThemePaletteVariables('light', lightPalette);
  applyThemePaletteVariables('dark', darkPalette);

  if (typeof setCustomOverTypeThemesFromBoardPalettes === 'function') {
    setCustomOverTypeThemesFromBoardPalettes(state.themePalettes);
  }

  if (options.renderControls !== false) {
    renderBoardThemeSettingsControls();
  }
}

function applyDerivedBoardThemes(themeOverrides, options = {}) {
  const state = getBoardLabelState();
  const normalized = normalizeThemeOverrides(themeOverrides);
  setBoardThemeOverrides(normalized);

  const lightBackground = hasThemeModeOverride(normalized.light)
    ? normalized.light.boardBackground
    : DEFAULT_BOARD_THEME_BACKGROUNDS.light;
  const darkBackground = hasThemeModeOverride(normalized.dark)
    ? normalized.dark.boardBackground
    : DEFAULT_BOARD_THEME_BACKGROUNDS.dark;

  const lightPalette = deriveThemePalette('light', lightBackground);
  const darkPalette = deriveThemePalette('dark', darkBackground);
  state.themePalettes = {
    light: { ...lightPalette },
    dark: { ...darkPalette },
  };

  applyThemePaletteVariables('light', lightPalette);
  applyThemePaletteVariables('dark', darkPalette);

  if (typeof setCustomOverTypeThemesFromBoardPalettes === 'function') {
    setCustomOverTypeThemesFromBoardPalettes(state.themePalettes);
  }

  if (options.renderControls !== false) {
    renderBoardThemeSettingsControls();
  }
}

function applyBoardThemeForCurrentBoard(themeMode) {
  const mode = themeMode || getBoardThemeMode();
  const palettes = getBoardThemePalettes();
  const palette = palettes[mode];
  if (!palette) {
    return;
  }

  if (typeof setCustomOverTypeThemesFromBoardPalettes === 'function') {
    setCustomOverTypeThemesFromBoardPalettes(palettes);
  }
}

function getBoardLabelColor(label) {
  if (!label) {
    return '';
  }

  return getBoardThemeMode() === 'dark' ? label.colorDark : label.colorLight;
}

function createReadableLabelColors(baseColor, fallbackColor = '#3b82f6') {
  const normalizedBaseColor = normalizeHexColor(baseColor, normalizeHexColor(fallbackColor, '#3b82f6'));
  const palettes = getBoardThemePalettes();
  const darkSurface = normalizeHexColor(
    palettes && palettes.dark ? palettes.dark.surface : '',
    DEFAULT_BOARD_THEME_PALETTES.dark.surface,
  );

  const darkAdjusted = ensureMinContrast(normalizedBaseColor, darkSurface, 4.5).color;

  return {
    colorLight: normalizedBaseColor,
    colorDark: darkAdjusted,
  };
}

function getActiveBoardLabelFilterIds() {
  return getBoardLabelState().filterIds.slice();
}

function isBoardDueDateFilterActive() {
  return getBoardLabelState().hasDueDateFilter === true;
}

function isBoardLabelFilterActive() {
  return getActiveBoardLabelFilterIds().length > 0 || isBoardDueDateFilterActive();
}

function cardMatchesBoardLabelFilter(cardLabelIds, hasDueDate = false) {
  const selectedFilterIds = getActiveBoardLabelFilterIds();
  const requireDueDate = isBoardDueDateFilterActive();
  const hasLabelFilters = selectedFilterIds.length > 0;

  if (!hasLabelFilters && !requireDueDate) {
    return true;
  }

  const normalizedCardLabelIds = Array.isArray(cardLabelIds)
    ? cardLabelIds.map((labelId) => String(labelId))
    : [];

  const matchesLabelFilter = hasLabelFilters
    ? normalizedCardLabelIds.some((labelId) => selectedFilterIds.includes(labelId))
    : true;
  const matchesDueDateFilter = requireDueDate ? Boolean(hasDueDate) : true;

  return matchesLabelFilter && matchesDueDateFilter;
}

function renderBoardLabelFilterButton() {
  const button = document.getElementById('labelFilterButton');
  if (!button) {
    return;
  }

  const labelSpan = document.getElementById('labelFilterButtonText');
  const selectedFilterIds = getActiveBoardLabelFilterIds();
  const hasDueDateFilter = isBoardDueDateFilterActive();
  const activeFilterCount = selectedFilterIds.length + (hasDueDateFilter ? 1 : 0);

  if (!labelSpan) {
    return;
  }

  if (activeFilterCount === 0) {
    labelSpan.textContent = 'Sort';
    return;
  }

  if (activeFilterCount === 1) {
    if (hasDueDateFilter) {
      labelSpan.textContent = 'Sort: Due Date';
      return;
    }

    const selectedLabel = getBoardLabelById(selectedFilterIds[0]);
    labelSpan.textContent = selectedLabel ? `Sort: ${selectedLabel.name}` : 'Sort: 1';
    return;
  }

  labelSpan.textContent = `Sort: ${activeFilterCount}`;
}

async function handleBoardLabelFilterChange(labelId, enabled) {
  const state = getBoardLabelState();
  const next = new Set(state.filterIds);

  if (enabled) {
    next.add(labelId);
  } else {
    next.delete(labelId);
  }

  state.filterIds = [...next];
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();

  await renderBoard();
}

async function handleBoardDueDateFilterChange(enabled) {
  const state = getBoardLabelState();
  state.hasDueDateFilter = Boolean(enabled);
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();

  await renderBoard();
}

function renderBoardLabelFilterPopover() {
  const popover = document.getElementById('labelFilterPopover');
  if (!popover) {
    return;
  }

  const labels = getBoardLabels();
  const selectedFilterIds = new Set(getActiveBoardLabelFilterIds());
  const hasDueDateFilter = isBoardDueDateFilterActive();
  popover.innerHTML = '';

  const dueDateRow = document.createElement('label');
  dueDateRow.className = 'label-popover-row';

  const dueDateCheckbox = document.createElement('input');
  dueDateCheckbox.type = 'checkbox';
  dueDateCheckbox.checked = hasDueDateFilter;
  dueDateCheckbox.addEventListener('change', async (event) => {
    await handleBoardDueDateFilterChange(event.target.checked);
  });

  const dueDateIcon = document.createElement('i');
  dueDateIcon.className = 'label-filter-feature-icon';
  dueDateIcon.setAttribute('data-feather', 'clock');

  const dueDateText = document.createElement('span');
  dueDateText.textContent = 'Due Date';

  dueDateRow.appendChild(dueDateCheckbox);
  dueDateRow.appendChild(dueDateIcon);
  dueDateRow.appendChild(dueDateText);
  popover.appendChild(dueDateRow);

  if (labels.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'label-popover-empty';
    emptyState.textContent = 'No labels yet. Add labels in Settings.';
    popover.appendChild(emptyState);
  }

  for (const label of labels) {
    const row = document.createElement('label');
    row.className = 'label-popover-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedFilterIds.has(label.id);
    checkbox.addEventListener('change', async (event) => {
      await handleBoardLabelFilterChange(label.id, event.target.checked);
    });

    const swatch = document.createElement('span');
    swatch.className = 'label-color-swatch';
    swatch.style.backgroundColor = getBoardLabelColor(label);

    const text = document.createElement('span');
    text.textContent = label.name;

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    popover.appendChild(row);
  }

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'label-popover-clear';
  clearButton.textContent = 'Clear filter';
  clearButton.title = 'Clear label and due date filters';
  clearButton.disabled = selectedFilterIds.size === 0 && !hasDueDateFilter;
  clearButton.addEventListener('click', async () => {
    resetBoardLabelFilter();
    renderBoardLabelFilterButton();
    renderBoardLabelFilterPopover();
    await renderBoard();
  });
  popover.appendChild(clearButton);

  if (typeof feather !== 'undefined' && feather && typeof feather.replace === 'function') {
    feather.replace();
  }
}

function closeBoardLabelFilterPopover() {
  const popover = document.getElementById('labelFilterPopover');
  if (!popover) {
    return;
  }

  popover.classList.add('hidden');
}

function positionBoardLabelFilterPopover(anchorElement, popover) {
  if (!(anchorElement instanceof Element) || !(popover instanceof Element)) {
    return;
  }

  const viewportPadding = 8;
  const anchorBounds = anchorElement.getBoundingClientRect();

  popover.style.position = 'fixed';
  popover.style.left = '0px';
  popover.style.top = '0px';

  const popoverRect = popover.getBoundingClientRect();
  const preferredLeft = anchorBounds.right - popoverRect.width;
  const clampedLeft = Math.min(
    window.innerWidth - popoverRect.width - viewportPadding,
    Math.max(viewportPadding, preferredLeft),
  );

  let nextTop = anchorBounds.bottom + 6;
  if (nextTop + popoverRect.height > window.innerHeight - viewportPadding) {
    const aboveAnchor = anchorBounds.top - popoverRect.height - 6;
    if (aboveAnchor >= viewportPadding) {
      nextTop = aboveAnchor;
    } else {
      nextTop = window.innerHeight - popoverRect.height - viewportPadding;
    }
  }

  popover.style.left = `${Math.round(clampedLeft)}px`;
  popover.style.top = `${Math.round(Math.max(viewportPadding, nextTop))}px`;
}

function closeLabelFilterIfClickOutside(target) {
  const button = document.getElementById('labelFilterButton');
  const popover = document.getElementById('labelFilterPopover');
  if (!button || !popover || popover.classList.contains('hidden')) {
    return;
  }

  if (button.contains(target) || popover.contains(target)) {
    return;
  }

  closeBoardLabelFilterPopover();
}

function closeCardLabelPopover() {
  const state = getBoardLabelState();
  if (state.activeCardLabelPopover && state.activeCardLabelPopover.parentNode) {
    state.activeCardLabelPopover.parentNode.removeChild(state.activeCardLabelPopover);
  }

  state.activeCardLabelPopover = null;
}

function closeCardLabelSelectorIfClickOutside(target) {
  const state = getBoardLabelState();
  const popover = state.activeCardLabelPopover;
  if (!popover) {
    return;
  }

  const anchor = popover.__anchorElement;
  if ((anchor && anchor.contains(target)) || popover.contains(target)) {
    return;
  }

  closeCardLabelPopover();
}

function positionCardLabelPopover(popover, anchorElement) {
  const bounds = anchorElement.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.top = `${Math.min(window.innerHeight - 220, bounds.bottom + 6)}px`;
  popover.style.left = `${Math.min(window.innerWidth - 260, Math.max(8, bounds.left - 60))}px`;
}

function createCardLabelPopoverContent(selectedLabelIds, onChange) {
  const labels = getBoardLabels();
  const knownLabelIds = new Set(labels.map((label) => label.id));
  const unknownLabelIds = selectedLabelIds.filter((labelId) => !knownLabelIds.has(labelId));
  const knownSelection = new Set(selectedLabelIds.filter((labelId) => knownLabelIds.has(labelId)));

  const fragment = document.createDocumentFragment();

  if (labels.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'label-popover-empty';
    emptyState.textContent = 'No labels yet. Add labels in Settings.';
    fragment.appendChild(emptyState);
    return fragment;
  }

  for (const label of labels) {
    const row = document.createElement('label');
    row.className = 'label-popover-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = knownSelection.has(label.id);
    checkbox.addEventListener('change', async (event) => {
      if (event.target.checked) {
        knownSelection.add(label.id);
      } else {
        knownSelection.delete(label.id);
      }

      const orderedKnownSelection = labels
        .map((entry) => entry.id)
        .filter((entryId) => knownSelection.has(entryId));

      const nextLabelIds = [...orderedKnownSelection, ...unknownLabelIds];
      await onChange(nextLabelIds);
    });

    const swatch = document.createElement('span');
    swatch.className = 'label-color-swatch';
    swatch.style.backgroundColor = getBoardLabelColor(label);

    const text = document.createElement('span');
    text.textContent = label.name;

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    fragment.appendChild(row);
  }

  if (unknownLabelIds.length > 0) {
    const unknownHint = document.createElement('p');
    unknownHint.className = 'label-popover-empty';
    unknownHint.textContent = `${unknownLabelIds.length} unknown label reference(s) preserved`;
    fragment.appendChild(unknownHint);
  }

  return fragment;
}

function toggleCardLabelSelector(anchorElement, cardPath, selectedLabelIds, onChange) {
  const state = getBoardLabelState();
  const popover = state.activeCardLabelPopover;

  if (popover && popover.__anchorElement === anchorElement) {
    closeCardLabelPopover();
    return;
  }

  closeBoardLabelFilterPopover();
  closeCardLabelPopover();
  if (typeof closeListActionsPopover === 'function') {
    closeListActionsPopover();
  }

  const menu = document.createElement('div');
  menu.className = 'label-popover card-label-popover';
  menu.__anchorElement = anchorElement;
  menu.__cardPath = cardPath;

  const content = createCardLabelPopoverContent(
    Array.isArray(selectedLabelIds) ? selectedLabelIds : [],
    onChange,
  );
  menu.appendChild(content);

  menu.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.body.appendChild(menu);
  positionCardLabelPopover(menu, anchorElement);

  state.activeCardLabelPopover = menu;
}

function createBoardSettingsLabelRow(label, index) {
  const row = document.createElement('div');
  row.className = 'board-settings-label-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = label.name;
  nameInput.placeholder = `Label ${index + 1}`;
  nameInput.className = 'board-settings-label-name';
  nameInput.addEventListener('input', (event) => {
    updateBoardLabel(index, 'name', event.target.value);
  });

  const lightInput = document.createElement('input');
  lightInput.type = 'color';
  lightInput.value = label.colorLight;
  lightInput.className = 'board-settings-label-color';
  lightInput.title = 'Label color';
  const handleColorChange = (event) => {
    updateBoardLabel(index, 'colorLight', event.target.value);
  };
  lightInput.addEventListener('input', handleColorChange);
  lightInput.addEventListener('change', handleColorChange);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'board-settings-label-delete';
  deleteButton.innerHTML = '<i data-feather="trash-2"></i>';
  deleteButton.title = 'Delete label';
  deleteButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await deleteBoardLabelDefinition(label.id);
  });

  row.appendChild(nameInput);
  row.appendChild(lightInput);
  row.appendChild(deleteButton);

  return row;
}

function renderBoardSettingsLabels() {
  const labelsContainer = document.getElementById('boardSettingsLabels');
  if (!labelsContainer) {
    return;
  }

  labelsContainer.innerHTML = '';
  const labels = getBoardLabels();

  for (const [index, label] of labels.entries()) {
    labelsContainer.appendChild(createBoardSettingsLabelRow(label, index));
  }

  if (typeof feather !== 'undefined' && feather && typeof feather.replace === 'function') {
    feather.replace();
  }
}

function renderThemeModePreview(themeMode, palette) {
  const preview = document.getElementById(`boardTheme${themeMode === 'light' ? 'Light' : 'Dark'}Preview`);
  if (!preview || !palette) {
    return;
  }

  preview.style.background = palette.boardBackground;
  preview.style.color = palette.text;
  preview.style.borderColor = palette.border;
  preview.style.boxShadow = `0 6px 14px ${palette.shadow}`;
  preview.innerHTML = '';

  const previewSurface = document.createElement('div');
  previewSurface.className = 'board-theme-preview-surface';
  previewSurface.style.background = palette.surface;
  previewSurface.style.borderColor = palette.border;
  previewSurface.style.color = palette.text;
  previewSurface.style.boxShadow = `0 4px 10px ${palette.shadowCard}`;

  const title = document.createElement('strong');
  title.textContent = themeMode === 'dark' ? 'Dark Preview' : 'Light Preview';

  const body = document.createElement('span');
  body.textContent = 'Body text keeps readable contrast.';
  body.style.color = palette.muted;

  const accent = document.createElement('button');
  accent.type = 'button';
  accent.textContent = 'Primary';
  accent.className = 'board-theme-preview-button';
  accent.style.background = palette.accent;
  accent.style.borderColor = palette.border;
  accent.style.color = palette.accentText || chooseReadableTextColor(palette.accent).color;

  previewSurface.appendChild(title);
  previewSurface.appendChild(body);
  previewSurface.appendChild(accent);
  preview.appendChild(previewSurface);
}

function renderBoardThemeSettingsControls() {
  const select = document.getElementById('boardColorSchemeSelect');
  const palettes = getBoardThemePalettes();
  const activeSchemeId = getBoardColorScheme() || 'light';

  if (select) {
    const hadOptions = select.options.length > 0;
    if (!hadOptions) {
      for (const scheme of COLOR_SCHEMES) {
        const option = document.createElement('option');
        option.value = scheme.id;
        option.textContent = scheme.name;
        select.appendChild(option);
      }
    }
    select.value = activeSchemeId;
  }

  renderThemeModePreview('light', palettes.light);
  renderThemeModePreview('dark', palettes.dark);
}

async function applyThemeOverridesToOpenBoards() {
  if (!window.boardRoot) {
    return;
  }

  const sourceOverrides = getBoardThemeOverrides();
  const sourceBoard = window.boardRoot;
  const openBoards = typeof getStoredOpenBoards === 'function' ? getStoredOpenBoards() : [sourceBoard];

  const targets = Array.isArray(openBoards) ? openBoards : [];
  for (const boardPath of targets) {
    if (!boardPath) {
      continue;
    }

    await window.board.updateBoardSettings(boardPath, {
      colorScheme: getBoardColorScheme(),
      themeOverrides: sourceOverrides,
    });
  }

  if (window.boardRoot === sourceBoard) {
    await ensureBoardLabelsLoaded();
    await renderBoard();
  }
}

async function applyNotificationSettingsToOpenBoards() {
  if (!window.boardRoot) {
    return;
  }

  const sourceNotifications = getBoardNotificationSettings();
  const sourceBoard = window.boardRoot;
  const openBoards = typeof getStoredOpenBoards === 'function' ? getStoredOpenBoards() : [sourceBoard];
  const targets = Array.isArray(openBoards) ? openBoards : [];

  for (const boardPath of targets) {
    if (!boardPath) {
      continue;
    }

    await window.board.updateBoardSettings(boardPath, {
      notifications: sourceNotifications,
    });
  }

  if (window.boardRoot === sourceBoard) {
    await ensureBoardLabelsLoaded();
    await renderBoard();
  }
}

function updateBoardLabel(index, key, value) {
  const labels = getBoardLabels();
  if (!labels[index]) {
    return;
  }

  const nextLabels = labels.map((label, labelIndex) => {
    if (labelIndex !== index) {
      return { ...label };
    }

    if (key === 'colorLight') {
      const nextColors = createReadableLabelColors(String(value || ''), label.colorLight);
      return {
        ...label,
        colorLight: nextColors.colorLight,
        colorDark: nextColors.colorDark,
      };
    }

    return {
      ...label,
      [key]: key === 'name' ? String(value || '') : String(value || '').toLowerCase(),
    };
  });

  setBoardLabels(nextLabels);
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();
  scheduleBoardLabelSettingsSave();
}

function generateBoardLabelId() {
  return `label-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getNextBoardLabelColors() {
  const labels = getBoardLabels();
  const colorPair = BOARD_LABEL_COLOR_PALETTE[labels.length % BOARD_LABEL_COLOR_PALETTE.length];
  return { ...colorPair };
}

function addBoardLabelDefinition() {
  const labels = getBoardLabels();
  const nextIndex = labels.length + 1;
  const candidateColors = getNextBoardLabelColors();
  const colors = createReadableLabelColors(candidateColors.colorLight, candidateColors.colorLight);

  const nextLabels = [
    ...labels.map((label) => ({ ...label })),
    {
      id: generateBoardLabelId(),
      name: `Label ${nextIndex}`,
      colorLight: colors.colorLight,
      colorDark: colors.colorDark,
    },
  ];

  setBoardLabels(nextLabels);
  renderBoardSettingsLabels();
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();
  scheduleBoardLabelSettingsSave();
}

async function removeBoardLabelReferencesFromCards(labelId) {
  if (!window.boardRoot || !labelId) {
    return 0;
  }

  const targetLabelId = String(labelId);
  const listNames = await window.board.listLists(window.boardRoot);
  const listEntries = await Promise.all(
    (Array.isArray(listNames) ? listNames : []).map(async (listName) => {
      const listPath = `${window.boardRoot}${listName}`;
      const cardNames = await window.board.listCards(listPath);
      return {
        listPath,
        cardNames: Array.isArray(cardNames) ? cardNames : [],
      };
    }),
  );

  let updatedCardCount = 0;
  for (const { listPath, cardNames } of listEntries) {
    for (const cardName of cardNames) {
      const cardPath = `${listPath}/${cardName}`;
      const card = await window.board.readCard(cardPath);
      const currentLabelIds = card && card.frontmatter && Array.isArray(card.frontmatter.labels)
        ? card.frontmatter.labels.map((entryId) => String(entryId))
        : [];

      if (!currentLabelIds.includes(targetLabelId)) {
        continue;
      }

      const nextLabelIds = currentLabelIds.filter((entryId) => entryId !== targetLabelId);
      await window.board.updateFrontmatter(cardPath, { labels: nextLabelIds });
      updatedCardCount += 1;
    }
  }

  return updatedCardCount;
}

async function deleteBoardLabelDefinition(labelId) {
  const targetLabelId = String(labelId || '');
  if (!targetLabelId) {
    return;
  }

  const labels = getBoardLabels();
  const label = labels.find((entry) => entry.id === targetLabelId);
  if (!label) {
    return;
  }

  const labelName = String(label.name || '').trim() || 'this label';
  const warningMessage = `Delete "${labelName}"?\n\nDeleting this label will remove it from every card in this board.`;
  if (!window.confirm(warningMessage)) {
    return;
  }

  await flushBoardSettingsSave();
  closeCardLabelPopover();

  const nextLabels = labels
    .filter((entry) => entry.id !== targetLabelId)
    .map((entry) => ({ ...entry }));

  setBoardLabels(nextLabels);
  renderBoardSettingsLabels();
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();
  scheduleBoardLabelSettingsSave();

  try {
    await removeBoardLabelReferencesFromCards(targetLabelId);
    await flushBoardSettingsSave();
    await renderBoard();
  } catch (error) {
    console.error('Unable to delete board label.', error);
  }
}

function scheduleBoardSettingsSave() {
  const state = getBoardLabelState();

  if (state.settingsSaveTimer) {
    clearTimeout(state.settingsSaveTimer);
  }

  state.settingsSaveTimer = setTimeout(() => {
    state.settingsSaveTimer = null;
    persistBoardSettings();
  }, 250);
}

function scheduleBoardLabelSettingsSave() {
  scheduleBoardSettingsSave();
}

function persistBoardSettings() {
  const state = getBoardLabelState();

  state.settingsSaveInFlight = state.settingsSaveInFlight
    .then(async () => {
      if (!window.boardRoot) {
        return;
      }

      const result = await window.board.updateBoardSettings(window.boardRoot, {
        labels: getBoardLabels(),
        colorScheme: getBoardColorScheme(),
        themeOverrides: getBoardThemeOverrides(),
        notifications: getBoardNotificationSettings(),
        tooltipsEnabled: getBoardTooltipsEnabled(),
      });
      setBoardLabels(result.labels || []);
      const savedSchemeId = result.colorScheme || '';
      if (savedSchemeId && getColorSchemeById(savedSchemeId)) {
        applyColorSchemeById(savedSchemeId, { renderControls: false });
      } else {
        applyDerivedBoardThemes(result.themeOverrides || {}, { renderControls: false });
      }
      setBoardNotificationSettings(result.notifications || DEFAULT_BOARD_NOTIFICATION_SETTINGS);
      setBoardTooltipsEnabled(result.tooltipsEnabled);
      if (!isBoardSettingsModalOpen()) {
        renderBoardSettingsLabels();
        renderBoardThemeSettingsControls();
        renderBoardGeneralSettingsControls();
        renderNotificationSettingsControls();
      }
      renderBoardLabelFilterButton();
      renderBoardLabelFilterPopover();
      await renderBoard();
    })
    .catch((error) => {
      console.error('Unable to save board settings.', error);
    });

  return state.settingsSaveInFlight;
}

function persistBoardLabelSettings() {
  return persistBoardSettings();
}

async function flushBoardSettingsSave() {
  const state = getBoardLabelState();

  if (state.settingsSaveTimer) {
    clearTimeout(state.settingsSaveTimer);
    state.settingsSaveTimer = null;
    await persistBoardSettings();
    return;
  }

  await state.settingsSaveInFlight;
}

async function flushBoardLabelSettingsSave() {
  await flushBoardSettingsSave();
}

function sanitizeBoardDirectoryName(rawName) {
  return String(rawName || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[ .]+$/g, '');
}

function getBoardRootInfo(boardRoot = window.boardRoot) {
  const normalizedRoot = normalizeBoardPath(boardRoot);
  if (!normalizedRoot) {
    return null;
  }

  const trimmedRoot = normalizedRoot.replace(/\/+$/, '');
  const separatorIndex = trimmedRoot.lastIndexOf('/');
  const parentRoot = separatorIndex >= 0 ? `${trimmedRoot.slice(0, separatorIndex)}/` : '';
  const boardName = separatorIndex >= 0 ? trimmedRoot.slice(separatorIndex + 1) : trimmedRoot;

  return {
    normalizedRoot,
    parentRoot,
    boardName,
  };
}

function renderBoardSettingsPanelState() {
  const state = getBoardLabelState();
  const activePanel = String(state.activeSettingsPanel || 'general');
  const navButtons = document.querySelectorAll('.board-settings-nav-button[data-settings-panel]');
  const panels = document.querySelectorAll('.board-settings-panel[data-settings-panel]');

  for (const button of navButtons) {
    const panelId = String(button.getAttribute('data-settings-panel') || '');
    const isActive = panelId === activePanel;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }

  for (const panel of panels) {
    const panelId = String(panel.getAttribute('data-settings-panel') || '');
    panel.classList.toggle('is-active', panelId === activePanel);
  }
}

function setActiveBoardSettingsPanel(panelId) {
  const normalizedPanelId = ['general', 'labels', 'colors', 'notifications', 'import'].includes(panelId)
    ? panelId
    : 'general';
  const state = getBoardLabelState();
  state.activeSettingsPanel = normalizedPanelId;
  renderBoardSettingsPanelState();
}

function renderBoardGeneralSettingsControls() {
  const boardNameInput = document.getElementById('boardSettingsBoardNameInput');
  const boardPathInput = document.getElementById('boardSettingsBoardPathInput');
  const tooltipsToggle = document.getElementById('boardSettingsTooltipsToggle');
  const boardInfo = getBoardRootInfo();

  if (boardNameInput) {
    boardNameInput.value = boardInfo ? boardInfo.boardName : '';
  }

  if (boardPathInput) {
    boardPathInput.value = boardInfo ? boardInfo.normalizedRoot.replace(/\/+$/, '') : '';
  }

  if (tooltipsToggle) {
    tooltipsToggle.checked = getBoardTooltipsEnabled();
  }
}

function renderNotificationSettingsControls() {
  const notificationsToggle = document.getElementById('boardSettingsNotificationsToggle');
  const notificationsTimeInput = document.getElementById('boardSettingsNotificationsTime');
  const notifications = getBoardNotificationSettings();

  if (notificationsToggle) {
    notificationsToggle.checked = notifications.enabled;
  }

  if (notificationsTimeInput) {
    notificationsTimeInput.value = notifications.time;
  }
}

function formatImportSummaryText(summary) {
  if (!summary || typeof summary !== 'object') {
    return '';
  }

  const sources = Array.isArray(summary.sources) ? summary.sources.length : 0;
  const parts = [
    `Imported ${sources === 1 ? '1 source' : `${sources} sources`}.`,
    `${summary.listsCreated || 0} list${summary.listsCreated === 1 ? '' : 's'} created.`,
    `${summary.cardsCreated || 0} card${summary.cardsCreated === 1 ? '' : 's'} created.`,
  ];

  if ((summary.labelsCreated || 0) > 0) {
    parts.push(`${summary.labelsCreated} label${summary.labelsCreated === 1 ? '' : 's'} created.`);
  }

  if ((summary.archivedCards || 0) > 0) {
    parts.push(`${summary.archivedCards} archived.`);
  }

  return parts.join(' ');
}

function getBoardImportOverrides() {
  if (typeof window === 'undefined') {
    return null;
  }

  const overrides = window[BOARD_IMPORT_TEST_OVERRIDE_KEY];
  return overrides && typeof overrides === 'object' ? overrides : null;
}

function getBoardImportPicker() {
  const overrides = getBoardImportOverrides();
  if (overrides && typeof overrides.pickImportSources === 'function') {
    return overrides.pickImportSources;
  }

  return window.chooser && typeof window.chooser.pickImportSources === 'function'
    ? window.chooser.pickImportSources
    : null;
}

function getBoardImportRunner(importer) {
  const overrides = getBoardImportOverrides();
  const overrideKey = importer === 'trello' ? 'importTrello' : 'importObsidian';
  if (overrides && typeof overrides[overrideKey] === 'function') {
    return overrides[overrideKey];
  }

  if (!window.board) {
    return null;
  }

  const defaultRunner = importer === 'trello' ? window.board.importTrello : window.board.importObsidian;
  return typeof defaultRunner === 'function' ? defaultRunner : null;
}

function renderBoardImportControls() {
  const state = getBoardLabelState();
  const trelloButton = document.getElementById('btnImportBoardFromTrello');
  const obsidianButton = document.getElementById('btnImportBoardFromObsidian');
  const status = document.getElementById('boardSettingsImportStatus');
  const warnings = document.getElementById('boardSettingsImportWarnings');
  const isBusy = Boolean(state.importInProgress);
  const canImport = Boolean(window.boardRoot) && !isBusy;
  const currentBoardRoot = normalizeBoardPath(window.boardRoot);
  const summaryBoardRoot = normalizeBoardPath(state.importSummaryBoardRoot);
  const hasVisibleSummary = Boolean(state.importSummary) && summaryBoardRoot === currentBoardRoot;

  if (trelloButton) {
    trelloButton.disabled = !canImport;
    trelloButton.textContent = state.importInProgress === 'trello' ? 'Importing Trello' : 'Import from Trello';
  }

  if (obsidianButton) {
    obsidianButton.disabled = !canImport;
    obsidianButton.textContent = state.importInProgress === 'obsidian' ? 'Importing Obsidian' : 'Import from Obsidian';
  }

  if (status) {
    status.classList.toggle('hidden', !hasVisibleSummary);
    status.textContent = hasVisibleSummary ? formatImportSummaryText(state.importSummary) : '';
  }

  if (warnings) {
    warnings.innerHTML = '';
    const warningMessages = hasVisibleSummary && Array.isArray(state.importSummary.warnings)
      ? state.importSummary.warnings
      : [];

    warnings.classList.toggle('hidden', warningMessages.length === 0);
    for (const warningMessage of warningMessages) {
      const message = document.createElement('p');
      message.textContent = warningMessage;
      warnings.appendChild(message);
    }
  }
}

async function runBoardImport(importer) {
  const state = getBoardLabelState();
  if (!window.boardRoot || state.importInProgress) {
    return;
  }

  const pickImportSources = getBoardImportPicker();
  const runImporter = getBoardImportRunner(importer);
  if (!pickImportSources || !runImporter) {
    return;
  }

  const boardInfo = getBoardRootInfo();
  const defaultPath = boardInfo ? boardInfo.parentRoot.replace(/\/+$/, '') : undefined;

  await flushBoardSettingsSave();
  state.importInProgress = importer;
  renderBoardImportControls();

  let shouldRefreshBoard = false;

  try {
    const selections = await pickImportSources({ importer, defaultPath });
    if (!Array.isArray(selections) || selections.length === 0) {
      return;
    }

    let summary = null;
    if (importer === 'trello') {
      summary = await runImporter(window.boardRoot, selections[0].token);
    } else {
      summary = await runImporter(window.boardRoot, selections.map((selection) => selection.token));
    }

    state.importSummary = summary;
    state.importSummaryBoardRoot = normalizeBoardPath(window.boardRoot);
    shouldRefreshBoard = true;
  } catch (error) {
    console.error(`Unable to import from ${importer}.`, error);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`Unable to import from ${importer}.\n\n${String(error?.message || error || 'Unknown error')}`);
    }
  } finally {
    state.importInProgress = '';
    renderBoardImportControls();
  }

  if (shouldRefreshBoard) {
    Promise.allSettled([
      ensureBoardLabelsLoaded(),
      renderBoard(),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error(`Unable to refresh the board after importing from ${importer}.`, result.reason);
        }
      }
    });
  }
}

async function moveBoardDirectory(nextBoardRoot) {
  const boardInfo = getBoardRootInfo();
  const normalizedTargetRoot = normalizeBoardPath(nextBoardRoot);
  if (!boardInfo || !normalizedTargetRoot || normalizedTargetRoot === boardInfo.normalizedRoot) {
    return false;
  }

  await flushBoardSettingsSave();
  await window.board.moveList(boardInfo.normalizedRoot, normalizedTargetRoot);

  if (typeof replaceStoredBoardPath === 'function') {
    replaceStoredBoardPath(boardInfo.normalizedRoot, normalizedTargetRoot);
  }

  window.boardRoot = normalizedTargetRoot;
  setStoredActiveBoard(normalizedTargetRoot);
  renderBoardTabs();
  await renderBoard();
  renderBoardGeneralSettingsControls();
  return true;
}

async function renameCurrentBoardDirectory(nextBoardNameRaw) {
  const boardInfo = getBoardRootInfo();
  if (!boardInfo) {
    return false;
  }

  const nextBoardName = sanitizeBoardDirectoryName(nextBoardNameRaw);
  if (!nextBoardName) {
    return false;
  }

  const nextBoardRoot = normalizeBoardPath(`${boardInfo.parentRoot}${nextBoardName}`);
  return moveBoardDirectory(nextBoardRoot);
}

async function moveCurrentBoardDirectory(nextParentDirectory) {
  const boardInfo = getBoardRootInfo();
  if (!boardInfo) {
    return false;
  }

  const normalizedParentDirectory = normalizeBoardPath(nextParentDirectory);
  if (!normalizedParentDirectory) {
    return false;
  }

  const nextBoardRoot = normalizeBoardPath(`${normalizedParentDirectory}${boardInfo.boardName}`);
  return moveBoardDirectory(nextBoardRoot);
}

function openBoardSettingsModal() {
  const modal = document.getElementById('modalBoardSettings');
  if (!modal) {
    return;
  }

  closeBoardLabelFilterPopover();
  closeCardLabelPopover();
  renderBoardSettingsLabels();
  renderBoardThemeSettingsControls();
  renderBoardGeneralSettingsControls();
  renderNotificationSettingsControls();
  renderBoardImportControls();
  setActiveBoardSettingsPanel('general');
  modal.style.display = 'block';

  if (typeof setBoardInteractive === 'function') {
    setBoardInteractive(false);
  }
}

async function closeBoardSettingsModal() {
  const modal = document.getElementById('modalBoardSettings');
  if (!modal || modal.style.display !== 'block') {
    return;
  }

  await flushBoardSettingsSave();
  modal.style.display = 'none';

  if (typeof setBoardInteractive === 'function') {
    setBoardInteractive(true);
  }
}

function isBoardSettingsModalOpen() {
  const modal = document.getElementById('modalBoardSettings');
  return Boolean(modal && modal.style.display === 'block');
}

function resetBoardLabelFilter() {
  const state = getBoardLabelState();
  state.filterIds = [];
  state.hasDueDateFilter = false;
}

async function ensureBoardLabelsLoaded() {
  if (!window.boardRoot) {
    const state = getBoardLabelState();
    state.importSummaryBoardRoot = '';
    setBoardLabels([]);
    applyColorSchemeById('light', { renderControls: false });
    setBoardNotificationSettings(DEFAULT_BOARD_NOTIFICATION_SETTINGS);
    setBoardTooltipsEnabled(DEFAULT_BOARD_TOOLTIPS_ENABLED);
    renderBoardLabelFilterButton();
    renderBoardLabelFilterPopover();
    renderBoardThemeSettingsControls();
    renderBoardGeneralSettingsControls();
    renderNotificationSettingsControls();
    renderBoardImportControls();
    return;
  }

  const settings = await window.board.readBoardSettings(window.boardRoot);
  setBoardLabels(settings.labels || []);
  const loadedSchemeId = settings.colorScheme || '';
  if (loadedSchemeId && getColorSchemeById(loadedSchemeId)) {
    applyColorSchemeById(loadedSchemeId, { renderControls: false });
  } else {
    applyDerivedBoardThemes(settings.themeOverrides || {}, { renderControls: false });
  }
  setBoardNotificationSettings(settings.notifications || DEFAULT_BOARD_NOTIFICATION_SETTINGS);
  setBoardTooltipsEnabled(settings.tooltipsEnabled);
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();
  renderBoardThemeSettingsControls();
  renderBoardGeneralSettingsControls();
  renderNotificationSettingsControls();
  renderBoardImportControls();
}

function closeAllLabelPopovers() {
  closeBoardLabelFilterPopover();
  closeCardLabelPopover();
  if (typeof closeBoardViewPopover === 'function') {
    closeBoardViewPopover();
  }
  if (typeof closeListActionsPopover === 'function') {
    closeListActionsPopover();
  }
}

function initializeBoardLabelControls() {
  const filterButton = document.getElementById('labelFilterButton');
  const filterPopover = document.getElementById('labelFilterPopover');
  const openSettingsButton = document.getElementById('openBoardSettings');
  const closeSettingsButton = document.getElementById('boardSettingsClose');
  const settingsNavButtons = document.querySelectorAll('.board-settings-nav-button[data-settings-panel]');
  const addLabelButton = document.getElementById('btnAddBoardLabel');
  const renameBoardInput = document.getElementById('boardSettingsBoardNameInput');
  const renameBoardButton = document.getElementById('btnRenameBoard');
  const moveBoardButton = document.getElementById('btnMoveBoard');
  const colorSchemeSelect = document.getElementById('boardColorSchemeSelect');
  const applyThemeToOpenBoardsButton = document.getElementById('btnApplyThemeColorsToOpenBoards');
  const notificationsToggle = document.getElementById('boardSettingsNotificationsToggle');
  const notificationsTimeInput = document.getElementById('boardSettingsNotificationsTime');
  const applyNotificationsToOpenBoardsButton = document.getElementById('btnApplyNotificationsToOpenBoards');
  const tooltipsToggle = document.getElementById('boardSettingsTooltipsToggle');
  const importFromTrelloButton = document.getElementById('btnImportBoardFromTrello');
  const importFromObsidianButton = document.getElementById('btnImportBoardFromObsidian');

  if (filterButton) {
    filterButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!filterPopover) {
        return;
      }
      closeCardLabelPopover();
      if (typeof closeBoardViewPopover === 'function') {
        closeBoardViewPopover();
      }
      if (typeof closeListActionsPopover === 'function') {
        closeListActionsPopover();
      }
      renderBoardLabelFilterPopover();
      const isHidden = filterPopover.classList.contains('hidden');
      if (!isHidden) {
        filterPopover.classList.add('hidden');
        return;
      }

      filterPopover.classList.remove('hidden');
      positionBoardLabelFilterPopover(filterButton, filterPopover);
    });
  }

  if (filterPopover) {
    filterPopover.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  if (openSettingsButton) {
    openSettingsButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!window.boardRoot) {
        return;
      }
      if (typeof closeAllModals === 'function') {
        await closeAllModals({ key: 'Escape' });
      }
      await ensureBoardLabelsLoaded();
      openBoardSettingsModal();
    });
  }

  for (const navButton of settingsNavButtons) {
    navButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const panelId = String(navButton.getAttribute('data-settings-panel') || '');
      setActiveBoardSettingsPanel(panelId);
    });
  }

  if (closeSettingsButton) {
    closeSettingsButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await closeBoardSettingsModal();
    });
  }

  if (addLabelButton) {
    addLabelButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addBoardLabelDefinition();
    });
  }

  if (renameBoardButton) {
    renameBoardButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (renameBoardButton.disabled) {
        return;
      }

      renameBoardButton.disabled = true;
      try {
        const nextBoardName = renameBoardInput ? renameBoardInput.value : '';
        const renamed = await renameCurrentBoardDirectory(nextBoardName);
        if (!renamed) {
          renderBoardGeneralSettingsControls();
        }
      } catch (error) {
        console.error('Unable to rename board.', error);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(`Unable to rename board.\n\n${String(error?.message || error || 'Unknown error')}`);
        }
      } finally {
        renameBoardButton.disabled = false;
      }
    });
  }

  if (renameBoardInput) {
    renameBoardInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      if (renameBoardButton && !renameBoardButton.disabled) {
        renameBoardButton.click();
      }
    });
  }

  if (moveBoardButton) {
    moveBoardButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!window.chooser || typeof window.chooser.pickDirectory !== 'function') {
        return;
      }

      if (moveBoardButton.disabled) {
        return;
      }

      const boardInfo = getBoardRootInfo();
      const defaultPath = boardInfo ? boardInfo.parentRoot.replace(/\/+$/, '') : undefined;

      moveBoardButton.disabled = true;
      try {
        const nextParentDirectorySelection = await window.chooser.pickDirectory({ defaultPath });
        const nextParentDirectory = getDirectorySelectionPath(nextParentDirectorySelection);
        if (!nextParentDirectory) {
          return;
        }

        await moveCurrentBoardDirectory(nextParentDirectory);
      } catch (error) {
        console.error('Unable to move board.', error);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(`Unable to move board.\n\n${String(error?.message || error || 'Unknown error')}`);
        }
      } finally {
        moveBoardButton.disabled = false;
      }
    });
  }

  if (colorSchemeSelect) {
    colorSchemeSelect.addEventListener('change', (event) => {
      const schemeId = event.target.value;
      applyColorSchemeById(schemeId);
      scheduleBoardSettingsSave();
    });
  }

  if (applyThemeToOpenBoardsButton) {
    applyThemeToOpenBoardsButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await applyThemeOverridesToOpenBoards();
    });
  }

  if (notificationsToggle) {
    notificationsToggle.addEventListener('change', (event) => {
      const currentSettings = getBoardNotificationSettings();
      setBoardNotificationSettings({
        ...currentSettings,
        enabled: Boolean(event.target.checked),
      });
      renderNotificationSettingsControls();
      scheduleBoardSettingsSave();
    });
  }

  if (tooltipsToggle) {
    tooltipsToggle.addEventListener('change', (event) => {
      setBoardTooltipsEnabled(Boolean(event.target.checked));
      renderBoardGeneralSettingsControls();
      scheduleBoardSettingsSave();
    });
  }

  if (notificationsTimeInput) {
    notificationsTimeInput.addEventListener('change', (event) => {
      const currentSettings = getBoardNotificationSettings();
      setBoardNotificationSettings({
        ...currentSettings,
        time: normalizeNotificationTime(event.target.value),
      });
      renderNotificationSettingsControls();
      scheduleBoardSettingsSave();
    });
  }

  if (applyNotificationsToOpenBoardsButton) {
    applyNotificationsToOpenBoardsButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await applyNotificationSettingsToOpenBoards();
    });
  }

  if (importFromTrelloButton) {
    importFromTrelloButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await runBoardImport('trello');
    });
  }

  if (importFromObsidianButton) {
    importFromObsidianButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await runBoardImport('obsidian');
    });
  }

  renderBoardSettingsPanelState();
  renderBoardImportControls();
}
