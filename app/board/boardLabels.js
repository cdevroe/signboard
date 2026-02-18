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

function hasThemeModeOverride(themeModeOverrides) {
  return Boolean(themeModeOverrides && typeof themeModeOverrides.boardBackground === 'string' && themeModeOverrides.boardBackground.length > 0);
}

function getBoardLabelState() {
  if (!window.__boardLabelState) {
    window.__boardLabelState = {
      labels: [],
      labelsById: new Map(),
      filterIds: [],
      activeCardLabelPopover: null,
      themeOverrides: { light: {}, dark: {} },
      themePalettes: {
        light: { ...DEFAULT_BOARD_THEME_PALETTES.light },
        dark: { ...DEFAULT_BOARD_THEME_PALETTES.dark },
      },
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

function getBoardThemeOverrides() {
  const state = getBoardLabelState();
  return normalizeThemeOverrides(state.themeOverrides);
}

function setBoardThemeOverrides(themeOverrides) {
  const state = getBoardLabelState();
  state.themeOverrides = normalizeThemeOverrides(themeOverrides);
}

function getBoardThemePalettes() {
  const state = getBoardLabelState();
  return {
    light: { ...state.themePalettes.light },
    dark: { ...state.themePalettes.dark },
  };
}

function getBoardThemeOverrideBackground(themeMode) {
  const overrides = getBoardThemeOverrides();
  const modeOverrides = overrides[themeMode] || {};
  return normalizeHexColor(modeOverrides.boardBackground, '');
}

function getEffectiveBoardThemeBackground(themeMode) {
  const override = getBoardThemeOverrideBackground(themeMode);
  return override || DEFAULT_BOARD_THEME_BACKGROUNDS[themeMode];
}

function createThemeWarningMessage(themeMode, palette) {
  if (!palette) {
    return '';
  }

  if (palette.textContrastRatio < 4.5) {
    return `${themeMode === 'dark' ? 'Dark' : 'Light'} theme was adjusted to keep text readable.`;
  }

  if (palette.adjustedForReadability) {
    return `${themeMode === 'dark' ? 'Dark' : 'Light'} theme colors were auto-adjusted for readability.`;
  }

  return '';
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

function getActiveBoardLabelFilterIds() {
  return getBoardLabelState().filterIds.slice();
}

function isBoardLabelFilterActive() {
  return getActiveBoardLabelFilterIds().length > 0;
}

function cardMatchesBoardLabelFilter(cardLabelIds) {
  const selectedFilterIds = getActiveBoardLabelFilterIds();
  if (selectedFilterIds.length === 0) {
    return true;
  }

  if (!Array.isArray(cardLabelIds) || cardLabelIds.length === 0) {
    return false;
  }

  const selected = new Set(selectedFilterIds);
  return cardLabelIds.some((labelId) => selected.has(labelId));
}

function renderBoardLabelFilterButton() {
  const button = document.getElementById('labelFilterButton');
  if (!button) {
    return;
  }

  const labelSpan = document.getElementById('labelFilterButtonText');
  const labels = getBoardLabels();
  const selectedFilterIds = getActiveBoardLabelFilterIds();

  if (!labelSpan) {
    return;
  }

  if (labels.length === 0 || selectedFilterIds.length === 0) {
    labelSpan.textContent = 'Sort';
    return;
  }

  if (selectedFilterIds.length === 1) {
    const selectedLabel = getBoardLabelById(selectedFilterIds[0]);
    labelSpan.textContent = selectedLabel ? `Sort: ${selectedLabel.name}` : 'Sort: 1';
    return;
  }

  labelSpan.textContent = `Sort: ${selectedFilterIds.length}`;
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

function renderBoardLabelFilterPopover() {
  const popover = document.getElementById('labelFilterPopover');
  if (!popover) {
    return;
  }

  const labels = getBoardLabels();
  const selectedFilterIds = new Set(getActiveBoardLabelFilterIds());
  popover.innerHTML = '';

  if (labels.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'label-popover-empty';
    emptyState.textContent = 'No labels yet. Add labels in Settings.';
    popover.appendChild(emptyState);
    return;
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
  clearButton.disabled = selectedFilterIds.size === 0;
  clearButton.addEventListener('click', async () => {
    resetBoardLabelFilter();
    renderBoardLabelFilterButton();
    renderBoardLabelFilterPopover();
    await renderBoard();
  });
  popover.appendChild(clearButton);
}

function closeBoardLabelFilterPopover() {
  const popover = document.getElementById('labelFilterPopover');
  if (!popover) {
    return;
  }

  popover.classList.add('hidden');
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
  lightInput.title = 'Light mode color';
  lightInput.addEventListener('input', (event) => {
    updateBoardLabel(index, 'colorLight', event.target.value);
  });

  const darkInput = document.createElement('input');
  darkInput.type = 'color';
  darkInput.value = label.colorDark;
  darkInput.className = 'board-settings-label-color';
  darkInput.title = 'Dark mode color';
  darkInput.addEventListener('input', (event) => {
    updateBoardLabel(index, 'colorDark', event.target.value);
  });

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'board-settings-label-delete';
  deleteButton.textContent = 'Delete';
  deleteButton.title = 'Delete label';
  deleteButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await deleteBoardLabelDefinition(label.id);
  });

  row.appendChild(nameInput);
  row.appendChild(lightInput);
  row.appendChild(darkInput);
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
  const lightInput = document.getElementById('boardThemeLightBackground');
  const darkInput = document.getElementById('boardThemeDarkBackground');
  const warning = document.getElementById('boardThemeColorsWarning');
  const palettes = getBoardThemePalettes();
  const overrides = getBoardThemeOverrides();

  if (lightInput) {
    lightInput.value = getEffectiveBoardThemeBackground('light');
  }

  if (darkInput) {
    darkInput.value = getEffectiveBoardThemeBackground('dark');
  }

  renderThemeModePreview('light', palettes.light);
  renderThemeModePreview('dark', palettes.dark);

  if (warning) {
    const messages = [
      createThemeWarningMessage('light', palettes.light),
      createThemeWarningMessage('dark', palettes.dark),
    ].filter(Boolean);

    if (messages.length === 0) {
      warning.classList.add('hidden');
      warning.textContent = '';
    } else {
      warning.classList.remove('hidden');
      warning.textContent = messages.join(' ');
    }
  }

  const resetAllButton = document.getElementById('btnResetAllThemeColors');
  if (resetAllButton) {
    resetAllButton.disabled = !hasThemeModeOverride(overrides.light) && !hasThemeModeOverride(overrides.dark);
  }
}

function updateBoardThemeOverride(themeMode, boardBackground) {
  const normalizedBackground = normalizeHexColor(boardBackground, '');
  const current = getBoardThemeOverrides();
  const next = {
    light: { ...current.light },
    dark: { ...current.dark },
  };

  if (!normalizedBackground || normalizedBackground === DEFAULT_BOARD_THEME_BACKGROUNDS[themeMode]) {
    delete next[themeMode].boardBackground;
  } else {
    next[themeMode].boardBackground = normalizedBackground;
  }

  applyDerivedBoardThemes(next);
  scheduleBoardSettingsSave();
}

function resetBoardThemeMode(themeMode) {
  const current = getBoardThemeOverrides();
  const next = {
    light: { ...current.light },
    dark: { ...current.dark },
  };
  delete next[themeMode].boardBackground;
  applyDerivedBoardThemes(next);
  scheduleBoardSettingsSave();
}

function resetAllBoardThemeOverrides() {
  applyDerivedBoardThemes({ light: {}, dark: {} });
  scheduleBoardSettingsSave();
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
      themeOverrides: sourceOverrides,
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
  const colors = getNextBoardLabelColors();

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
        themeOverrides: getBoardThemeOverrides(),
      });
      setBoardLabels(result.labels || []);
      applyDerivedBoardThemes(result.themeOverrides || {}, { renderControls: false });
      if (!isBoardSettingsModalOpen()) {
        renderBoardSettingsLabels();
        renderBoardThemeSettingsControls();
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

function openBoardSettingsModal() {
  const modal = document.getElementById('modalBoardSettings');
  if (!modal) {
    return;
  }

  closeBoardLabelFilterPopover();
  closeCardLabelPopover();
  renderBoardSettingsLabels();
  renderBoardThemeSettingsControls();
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
  getBoardLabelState().filterIds = [];
}

async function ensureBoardLabelsLoaded() {
  if (!window.boardRoot) {
    setBoardLabels([]);
    applyDerivedBoardThemes({ light: {}, dark: {} }, { renderControls: false });
    renderBoardLabelFilterButton();
    renderBoardLabelFilterPopover();
    renderBoardThemeSettingsControls();
    return;
  }

  const settings = await window.board.readBoardSettings(window.boardRoot);
  setBoardLabels(settings.labels || []);
  applyDerivedBoardThemes(settings.themeOverrides || {}, { renderControls: false });
  renderBoardLabelFilterButton();
  renderBoardLabelFilterPopover();
  renderBoardThemeSettingsControls();
}

function closeAllLabelPopovers() {
  closeBoardLabelFilterPopover();
  closeCardLabelPopover();
}

function initializeBoardLabelControls() {
  const filterButton = document.getElementById('labelFilterButton');
  const filterPopover = document.getElementById('labelFilterPopover');
  const openSettingsButton = document.getElementById('openBoardSettings');
  const closeSettingsButton = document.getElementById('boardSettingsClose');
  const addLabelButton = document.getElementById('btnAddBoardLabel');
  const lightThemeBackgroundInput = document.getElementById('boardThemeLightBackground');
  const darkThemeBackgroundInput = document.getElementById('boardThemeDarkBackground');
  const resetLightThemeButton = document.getElementById('btnResetLightTheme');
  const resetDarkThemeButton = document.getElementById('btnResetDarkTheme');
  const resetAllThemeButton = document.getElementById('btnResetAllThemeColors');
  const applyThemeToOpenBoardsButton = document.getElementById('btnApplyThemeColorsToOpenBoards');

  if (filterButton) {
    filterButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!filterPopover) {
        return;
      }
      closeCardLabelPopover();
      renderBoardLabelFilterPopover();
      const isHidden = filterPopover.classList.contains('hidden');
      filterPopover.classList.toggle('hidden', !isHidden);
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
      await ensureBoardLabelsLoaded();
      openBoardSettingsModal();
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

  if (lightThemeBackgroundInput) {
    lightThemeBackgroundInput.addEventListener('input', (event) => {
      updateBoardThemeOverride('light', event.target.value);
    });
  }

  if (darkThemeBackgroundInput) {
    darkThemeBackgroundInput.addEventListener('input', (event) => {
      updateBoardThemeOverride('dark', event.target.value);
    });
  }

  if (resetLightThemeButton) {
    resetLightThemeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetBoardThemeMode('light');
    });
  }

  if (resetDarkThemeButton) {
    resetDarkThemeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetBoardThemeMode('dark');
    });
  }

  if (resetAllThemeButton) {
    resetAllThemeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetAllBoardThemeOverrides();
    });
  }

  if (applyThemeToOpenBoardsButton) {
    applyThemeToOpenBoardsButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await applyThemeOverridesToOpenBoards();
    });
  }
}
