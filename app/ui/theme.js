function buildOverTypeSelectionColor(themeName, accentColor, surfaceColor) {
  const themeIsDark = themeName === 'dark';
  const mixedSelectionColor = mixHexColors(accentColor, surfaceColor, themeIsDark ? 0.35 : 0.2);
  const selectionRgb = hexToRgb(mixedSelectionColor);
  if (!selectionRgb) {
    return themeIsDark ? 'rgba(111, 207, 151, 0.44)' : 'rgba(11, 95, 255, 0.34)';
  }

  return `rgba(${selectionRgb.r}, ${selectionRgb.g}, ${selectionRgb.b}, ${themeIsDark ? 0.44 : 0.34})`;
}

function createOverTypeThemeFromPalette(themeName, palette) {
  const textColor = palette && palette.text ? palette.text : '#2f2f2f';
  const surfaceColor = palette && palette.surface ? palette.surface : '#ffffff';
  const accentColor = palette && palette.accent ? palette.accent : '#3366cc';
  const borderColor = palette && palette.border ? palette.border : '#dedada';
  const mutedColor = palette && palette.muted ? palette.muted : '#666666';

  return {
    name: themeName,
    colors: {
      bgPrimary: surfaceColor,
      bgSecondary: surfaceColor,
      text: textColor,
      strong: textColor,
      h1: textColor,
      h2: textColor,
      h3: textColor,
      em: mutedColor,
      link: accentColor,
      code: textColor,
      codeBg: mixHexColors(surfaceColor, borderColor, 0.62),
      blockquote: mutedColor,
      hr: borderColor,
      syntaxMarker: mutedColor,
      cursor: textColor,
      selection: buildOverTypeSelectionColor(themeName, accentColor, surfaceColor),
    }
  };
}

function buildCustomOverTypeThemesFromBoardPalettes(palettes) {
  const source = palettes && typeof palettes === 'object' ? palettes : {};
  const lightPalette = source.light || DEFAULT_BOARD_THEME_PALETTES.light;
  const darkPalette = source.dark || DEFAULT_BOARD_THEME_PALETTES.dark;

  return {
    dark: createOverTypeThemeFromPalette('dark', darkPalette),
    light: createOverTypeThemeFromPalette('lite', lightPalette),
  };
}

let customOverTypeThemes = buildCustomOverTypeThemesFromBoardPalettes({
  light: DEFAULT_BOARD_THEME_PALETTES.light,
  dark: DEFAULT_BOARD_THEME_PALETTES.dark,
});

function setCustomOverTypeThemesFromBoardPalettes(palettes) {
  customOverTypeThemes = buildCustomOverTypeThemesFromBoardPalettes(palettes);
}

function applyEditorThemeFromActiveMode() {
  const themeMode = getBoardThemeMode();
  if (themeMode === 'dark') {
    OverType.setTheme(customOverTypeThemes.dark);
    return;
  }

  OverType.setTheme(customOverTypeThemes.light);
}

const OMARCHY_THEME_STYLE_PROPERTIES = Object.freeze([
  '--sb-omarchy-bg',
  '--sb-omarchy-bg-card',
  '--sb-omarchy-text',
  '--sb-omarchy-muted',
  '--sb-omarchy-border',
  '--sb-omarchy-shadow',
  '--sb-omarchy-shadow-card',
  '--sb-omarchy-accent',
  '--sb-omarchy-accent-contrast',
]);

function isFollowingOmarchyTheme() {
  if (typeof getAppAppearanceSettings !== 'function' || typeof getAppOmarchyThemeStatus !== 'function') {
    return false;
  }
  const appearance = getAppAppearanceSettings();
  const status = getAppOmarchyThemeStatus();
  return appearance.themeSource === 'omarchy' && status.available === true && Boolean(status.palette);
}

function setOmarchyThemeVariables(palette) {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--sb-omarchy-bg', palette.boardBackground);
  rootStyle.setProperty('--sb-omarchy-bg-card', palette.surface);
  rootStyle.setProperty('--sb-omarchy-text', palette.text);
  rootStyle.setProperty('--sb-omarchy-muted', palette.muted);
  rootStyle.setProperty('--sb-omarchy-border', palette.border);
  rootStyle.setProperty('--sb-omarchy-shadow', palette.shadow);
  rootStyle.setProperty('--sb-omarchy-shadow-card', palette.shadowCard);
  rootStyle.setProperty('--sb-omarchy-accent', palette.accent);
  rootStyle.setProperty('--sb-omarchy-accent-contrast', palette.accentText);
}

function clearOmarchyThemeVariables() {
  const root = document.documentElement;
  delete root.dataset.appThemeSource;
  for (const propertyName of OMARCHY_THEME_STYLE_PROPERTIES) {
    root.style.removeProperty(propertyName);
  }
}

function restoreCurrentBoardThemeVariables() {
  if (typeof getBoardColorScheme !== 'function') {
    return;
  }
  const schemeId = getBoardColorScheme();
  if (schemeId && typeof applyColorSchemeById === 'function') {
    applyColorSchemeById(schemeId, { renderControls: false });
    return;
  }
  if (typeof applyDerivedBoardThemes === 'function' && typeof getBoardThemeOverrides === 'function') {
    applyDerivedBoardThemes(getBoardThemeOverrides(), { renderControls: false });
  }
}

async function applyConfiguredAppTheme(options = {}) {
  const root = document.documentElement;
  const followingOmarchy = isFollowingOmarchyTheme();

  if (followingOmarchy) {
    const status = getAppOmarchyThemeStatus();
    const palette = status.palette;
    root.dataset.appThemeSource = 'omarchy';
    root.dataset.theme = palette.mode === 'dark' ? 'dark' : '';
    setOmarchyThemeVariables(palette);

    const currentScheme = typeof getBoardColorScheme === 'function' ? getBoardColorScheme() : '';
    if ((!currentScheme || currentScheme === 'default') && typeof applyThemePaletteVariables === 'function') {
      applyThemePaletteVariables(palette.mode, palette);
    }
  } else {
    clearOmarchyThemeVariables();
    const preference = getAppAppearanceMode();
    const mode = preference === 'auto' ? getSystemThemeMode() : preference;
    root.dataset.theme = mode === 'dark' ? 'dark' : '';
    localStorage.setItem('theme', root.dataset.theme);
    restoreCurrentBoardThemeVariables();
  }

  if (typeof applyBoardThemeForCurrentBoard === 'function') {
    applyBoardThemeForCurrentBoard();
  }
  applyEditorThemeFromActiveMode();
  renderAppearanceModeControls();

  if (options.renderBoard !== false && window.boardRoot && typeof renderBoard === 'function') {
    await renderBoard();
  }
}

// The operating system controls the effective mode only when Auto is selected.
const systemThemeQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

function getSystemThemeMode() {
  return systemThemeQuery && systemThemeQuery.matches ? 'dark' : 'light';
}

function getAppAppearanceMode() {
  const mode = getAppAppearanceSettings().mode;
  return ['light', 'dark', 'auto'].includes(mode)
    ? mode
    : (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
}

function renderAppearanceModeControls() {
  const mode = getAppAppearanceMode();
  const followingOmarchy = isFollowingOmarchyTheme();
  for (const button of document.querySelectorAll('[data-appearance-mode]')) {
    const selected = !followingOmarchy && button.dataset.appearanceMode === mode;
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected || (followingOmarchy && button.dataset.appearanceMode === 'light') ? 0 : -1;
  }
  const status = document.getElementById('appearanceModeStatus');
  if (status) {
    status.textContent = followingOmarchy
      ? 'Following Omarchy colors and mode. Select a mode to use board colors.'
      : mode === 'auto' ? `Following system appearance — ${getSystemThemeMode()} now.` : '';
  }
}

async function setAppAppearanceMode(mode) {
  if (!['light', 'dark', 'auto'].includes(mode)) return;
  setAppAppearanceSettings({ ...getAppAppearanceSettings(), themeSource: 'signboard', mode });
  scheduleAppSettingsSave();
  await applyConfiguredAppTheme();
  renderAppSettingsControls();
}

async function toggleAppThemeMode() {
  await setAppAppearanceMode(getBoardThemeMode() === 'dark' ? 'light' : 'dark');
}

for (const button of document.querySelectorAll('[data-appearance-mode]')) {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setAppAppearanceMode(button.dataset.appearanceMode).catch((error) => {
      console.error('Unable to change appearance mode.', error);
    });
  });
  button.addEventListener('keydown', (event) => {
    const buttons = [...document.querySelectorAll('[data-appearance-mode]')];
    const index = buttons.indexOf(button);
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + buttons.length - 1) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    event.stopPropagation();
    buttons[next].focus();
    buttons[next].click();
  });
}

if (systemThemeQuery) {
  systemThemeQuery.addEventListener('change', () => {
    if (getAppAppearanceMode() === 'auto' && !isFollowingOmarchyTheme()) {
      applyConfiguredAppTheme().catch((error) => console.error('Unable to follow system appearance.', error));
    }
    renderBoardThemeSettingsControls();
  });
}

// Retain the legacy choice during bootstrap; app settings take over once loaded.
document.documentElement.dataset.theme = localStorage.getItem('theme') === 'dark' ? 'dark' : '';
renderAppearanceModeControls();
window.addEventListener('DOMContentLoaded', () => {
  if (typeof applyBoardThemeForCurrentBoard === 'function') applyBoardThemeForCurrentBoard();
});

if (window.electronAPI && typeof window.electronAPI.onOmarchyThemeChanged === 'function') {
  window.electronAPI.onOmarchyThemeChanged((status) => {
    if (typeof setAppOmarchyThemeStatus === 'function') {
      setAppOmarchyThemeStatus(status);
    }
    applyConfiguredAppTheme({ renderBoard: true })
      .then(() => {
        if (typeof renderAppSettingsControls === 'function') {
          renderAppSettingsControls();
        }
      })
      .catch((error) => {
        console.error('Unable to apply the updated Omarchy theme.', error);
      });
  });
}
