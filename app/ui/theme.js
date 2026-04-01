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

function renderThemeToggleButtonState() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) {
    return;
  }

  const isDarkMode = document.documentElement.dataset.theme === 'dark';
  const iconName = isDarkMode ? 'sun' : 'moon';
  const label = isDarkMode ? 'Light Mode' : 'Dark Mode';
  const iconMarkup = (
    window.feather &&
    window.feather.icons &&
    typeof window.feather.icons[iconName]?.toSvg === 'function'
  )
    ? window.feather.icons[iconName].toSvg({
      width: 16,
      height: 16,
      stroke: 'currentColor',
    })
    : `<i data-feather="${iconName}"></i>`;

  themeToggle.innerHTML = `
    <span class="board-menu-action-icon" aria-hidden="true">${iconMarkup}</span>
    <span class="board-menu-action-label">${label}</span>
  `;
  themeToggle.setAttribute('title', `Switch to ${isDarkMode ? 'light' : 'dark'} mode`);
  themeToggle.setAttribute('aria-label', `Switch to ${isDarkMode ? 'light' : 'dark'} mode`);

  if (
    !(
      window.feather &&
      window.feather.icons &&
      typeof window.feather.icons[iconName]?.toSvg === 'function'
    ) &&
    typeof feather !== 'undefined' &&
    feather &&
    typeof feather.replace === 'function'
  ) {
    feather.replace();
  }
}

const themeToggle = document.getElementById('themeToggle');
const savedThemeMode = localStorage.getItem('theme');
if (savedThemeMode) {
  document.documentElement.dataset.theme = savedThemeMode;
}

renderThemeToggleButtonState();

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const newTheme = current === 'dark' ? '' : 'dark';
    document.documentElement.dataset.theme = newTheme;
    localStorage.setItem('theme', newTheme);
    renderThemeToggleButtonState();

    if (typeof applyBoardThemeForCurrentBoard === 'function') {
      applyBoardThemeForCurrentBoard();
    }

    applyEditorThemeFromActiveMode();

    if (window.boardRoot && typeof renderBoard === 'function') {
      renderBoard().catch((error) => {
        console.error('Unable to render board after theme change.', error);
      });
    }

    if (typeof closeBoardMenuPopover === 'function') {
      closeBoardMenuPopover();
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    if (typeof applyBoardThemeForCurrentBoard === 'function') {
      applyBoardThemeForCurrentBoard();
    }
  });
}
