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
      selection: mixHexColors(accentColor, surfaceColor, 0.72),
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

const themeToggle = document.getElementById('themeToggle');
const savedThemeMode = localStorage.getItem('theme');
if (savedThemeMode) {
  document.documentElement.dataset.theme = savedThemeMode;
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const newTheme = current === 'dark' ? '' : 'dark';
    document.documentElement.dataset.theme = newTheme;
    localStorage.setItem('theme', newTheme);

    if (typeof applyBoardThemeForCurrentBoard === 'function') {
      applyBoardThemeForCurrentBoard();
    }

    applyEditorThemeFromActiveMode();

    if (window.boardRoot && typeof renderBoard === 'function') {
      renderBoard().catch((error) => {
        console.error('Unable to render board after theme change.', error);
      });
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    if (typeof applyBoardThemeForCurrentBoard === 'function') {
      applyBoardThemeForCurrentBoard();
    }
  });
}
