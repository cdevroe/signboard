const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const OMARCHY_THEME_RELATIVE_PATH = path.join('.local', 'state', 'omarchy', 'current', 'theme');
const OMARCHY_COLOR_KEYS = Object.freeze([
  'accent',
  'background',
  'bright_foreground',
  'dark_background',
  'dark_foreground',
  'darker_background',
  'foreground',
  'light_foreground',
  'lighter_background',
  'muted',
  'selection',
]);

function normalizeHexColor(value) {
  const candidate = String(value || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(candidate)) {
    return candidate;
  }
  if (/^#[0-9a-f]{3}$/.test(candidate)) {
    return `#${candidate.slice(1).split('').map((character) => character.repeat(2)).join('')}`;
  }
  return '';
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value);
  if (!normalized) {
    return null;
  }
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHexColors(foreground, background, backgroundWeight) {
  const foregroundRgb = hexToRgb(foreground);
  const backgroundRgb = hexToRgb(background);
  if (!foregroundRgb || !backgroundRgb) {
    return normalizeHexColor(foreground) || normalizeHexColor(background);
  }
  const weight = Math.max(0, Math.min(1, Number(backgroundWeight) || 0));
  return rgbToHex(
    (foregroundRgb.r * (1 - weight)) + (backgroundRgb.r * weight),
    (foregroundRgb.g * (1 - weight)) + (backgroundRgb.g * weight),
    (foregroundRgb.b * (1 - weight)) + (backgroundRgb.b * weight),
  );
}

function getRelativeLuminance(value) {
  const rgb = hexToRgb(value);
  if (!rgb) {
    return 0;
  }
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (channels[0] * 0.2126) + (channels[1] * 0.7152) + (channels[2] * 0.0722);
}

function chooseContrastColor(background) {
  return getRelativeLuminance(background) > 0.42 ? '#111111' : '#ffffff';
}

function parseTomlScalar(rawValue) {
  const candidate = String(rawValue || '').trim();
  const quotedMatch = candidate.match(/^(["'])(.*)\1$/);
  return quotedMatch ? quotedMatch[2].trim() : candidate.split(/\s+#/, 1)[0].trim();
}

function parseOmarchyColorsToml(contents) {
  const values = {};
  for (const rawLine of String(contents || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('[')) {
      continue;
    }
    const assignment = line.match(/^([a-z][a-z0-9_]*)\s*=\s*(.+)$/i);
    if (!assignment) {
      continue;
    }
    const key = assignment[1].toLowerCase();
    const scalar = parseTomlScalar(assignment[2]);
    if (key === 'mode') {
      values.mode = scalar.toLowerCase() === 'light' ? 'light' : 'dark';
    } else if (OMARCHY_COLOR_KEYS.includes(key)) {
      const color = normalizeHexColor(scalar);
      if (color) {
        values[key] = color;
      }
    }
  }

  const mode = values.mode === 'light' ? 'light' : 'dark';
  const background = values.background || values.dark_background || values.darker_background;
  const text = values.foreground || values.bright_foreground || values.light_foreground;
  const accent = values.accent || values.selection;
  const missing = [];
  if (!background) missing.push('background');
  if (!text) missing.push('foreground');
  if (!accent) missing.push('accent');

  if (missing.length > 0) {
    return {
      valid: false,
      values,
      palette: null,
      errors: [`Missing required Omarchy color${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`],
    };
  }

  const surface = values.lighter_background || mixHexColors(background, mode === 'dark' ? '#ffffff' : '#000000', mode === 'dark' ? 0.1 : 0.035);
  const muted = values.muted || values.dark_foreground || values.light_foreground || mixHexColors(text, background, 0.46);
  const border = mixHexColors(text, background, mode === 'dark' ? 0.78 : 0.84);

  return {
    valid: true,
    values,
    errors: [],
    palette: {
      mode,
      boardBackground: background,
      surface,
      text,
      muted,
      border,
      accent,
      accentText: chooseContrastColor(accent),
      selection: values.selection || accent,
      shadow: mode === 'dark' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(15, 23, 42, 0.06)',
      shadowCard: mode === 'dark' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(15, 23, 42, 0.09)',
    },
  };
}

function getDefaultOmarchyThemeDirectory(homeDirectory = os.homedir()) {
  return path.join(homeDirectory, OMARCHY_THEME_RELATIVE_PATH);
}

function normalizeThemeName(value) {
  return String(value || '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function readOmarchyTheme(options = {}) {
  const platform = String(options.platform || process.platform);
  const explicitThemeDirectory = String(options.themeDirectory || '').trim();
  if (platform !== 'linux' && !explicitThemeDirectory) {
    return {
      detected: false,
      available: false,
      name: '',
      mode: '',
      palette: null,
      themeDirectory: '',
      message: 'Omarchy theme integration is available on Linux.',
    };
  }

  const themeDirectory = path.resolve(explicitThemeDirectory || getDefaultOmarchyThemeDirectory(options.homeDirectory));
  const colorsPath = path.join(themeDirectory, 'colors.toml');
  // Quattro atomically replaces `current/theme` and writes the selected name
  // beside it at `current/theme.name`.
  const themeNamePath = path.join(path.dirname(themeDirectory), 'theme.name');

  let colorsContents = '';
  try {
    colorsContents = await fs.readFile(colorsPath, 'utf8');
  } catch (error) {
    const isMissing = error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
    return {
      detected: !isMissing,
      available: false,
      name: '',
      mode: '',
      palette: null,
      themeDirectory,
      message: isMissing ? 'Omarchy was not detected.' : 'Signboard could not read the active Omarchy theme.',
    };
  }

  let name = '';
  try {
    name = normalizeThemeName(await fs.readFile(themeNamePath, 'utf8'));
  } catch {
    name = '';
  }

  const parsed = parseOmarchyColorsToml(colorsContents);
  if (!parsed.valid || !parsed.palette) {
    return {
      detected: true,
      available: false,
      name,
      mode: '',
      palette: null,
      themeDirectory,
      message: parsed.errors.join(' '),
    };
  }

  return {
    detected: true,
    available: true,
    name,
    mode: parsed.palette.mode,
    palette: parsed.palette,
    themeDirectory,
    message: name ? `Following ${name}.` : 'Following the active Omarchy theme.',
  };
}

module.exports = {
  OMARCHY_COLOR_KEYS,
  OMARCHY_THEME_RELATIVE_PATH,
  getDefaultOmarchyThemeDirectory,
  normalizeHexColor,
  parseOmarchyColorsToml,
  readOmarchyTheme,
};
