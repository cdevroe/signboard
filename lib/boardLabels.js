const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

const SETTINGS_FILE_NAME = 'board-settings.md';
const LEGACY_SETTINGS_FILE_NAME = 'labels.md';
const YAML_FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

const DEFAULT_LABELS = Object.freeze([
  Object.freeze({
    id: 'label-1',
    name: 'Label 1',
    colorLight: '#22c55e',
    colorDark: '#16a34a',
  }),
  Object.freeze({
    id: 'label-2',
    name: 'Label 2',
    colorLight: '#3b82f6',
    colorDark: '#2563eb',
  }),
  Object.freeze({
    id: 'label-3',
    name: 'Label 3',
    colorLight: '#ef4444',
    colorDark: '#dc2626',
  }),
]);

const FALLBACK_LIGHT = '#3b82f6';
const FALLBACK_DARK = '#2563eb';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneDefaultLabels() {
  return DEFAULT_LABELS.map((label) => ({ ...label }));
}

function normalizeHexColor(value, fallback) {
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

function createUniqueId(rawId, index, seenIds) {
  const baseId = String(rawId || '').trim() || `label-${index + 1}`;
  let candidate = baseId;
  let suffix = 2;

  while (seenIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  seenIds.add(candidate);
  return candidate;
}

function normalizeLabel(rawLabel, index, seenIds) {
  const source = isObject(rawLabel) ? rawLabel : {};
  const id = createUniqueId(source.id, index, seenIds);
  const fallbackName = `Label ${index + 1}`;
  const name = String(source.name || '').trim() || fallbackName;

  return {
    id,
    name,
    colorLight: normalizeHexColor(source.colorLight, FALLBACK_LIGHT),
    colorDark: normalizeHexColor(source.colorDark, FALLBACK_DARK),
  };
}

function normalizeLabels(rawLabels) {
  if (!Array.isArray(rawLabels)) {
    return cloneDefaultLabels();
  }

  const seenIds = new Set();
  const normalized = rawLabels
    .map((label, index) => normalizeLabel(label, index, seenIds))
    .filter((label) => label.id.length > 0);

  if (normalized.length === 0) {
    return cloneDefaultLabels();
  }

  return normalized;
}

function parseBoardSettings(rawContent) {
  const match = String(rawContent || '').match(YAML_FRONTMATTER_REGEX);
  if (!match) {
    return {};
  }

  const yamlSource = match[1];
  if (!yamlSource.trim()) {
    return {};
  }

  try {
    const parsed = yaml.load(yamlSource, { schema: yaml.JSON_SCHEMA });
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeBoardSettings(rawSettings = {}) {
  const source = isObject(rawSettings) ? rawSettings : {};
  return {
    labels: normalizeLabels(source.labels),
  };
}

function serializeBoardSettings(settings) {
  const normalized = normalizeBoardSettings(settings);
  const yamlText = yaml.dump(normalized, {
    schema: yaml.JSON_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    noCompatMode: true,
    sortKeys: false,
  });

  return `---\n${yamlText}---\n`;
}

function getPrimarySettingsPath(boardRoot) {
  return path.join(boardRoot, SETTINGS_FILE_NAME);
}

function areLabelCollectionsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((label, index) => {
    const other = right[index];
    return (
      label.id === other.id &&
      label.name === other.name &&
      label.colorLight === other.colorLight &&
      label.colorDark === other.colorDark
    );
  });
}

async function loadExistingBoardSettings(boardRoot) {
  const primaryPath = getPrimarySettingsPath(boardRoot);

  try {
    const raw = await fs.readFile(primaryPath, 'utf8');
    return { raw, sourcePath: primaryPath };
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  const legacyPath = path.join(boardRoot, LEGACY_SETTINGS_FILE_NAME);
  try {
    const raw = await fs.readFile(legacyPath, 'utf8');
    return { raw, sourcePath: legacyPath };
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }

  return null;
}

async function writeBoardSettings(boardRoot, settings) {
  const primaryPath = getPrimarySettingsPath(boardRoot);
  const normalized = normalizeBoardSettings(settings);
  const serialized = serializeBoardSettings(normalized);

  await fs.writeFile(primaryPath, serialized, 'utf8');

  return {
    settingsPath: primaryPath,
    ...normalized,
  };
}

async function readBoardSettings(boardRoot, options = {}) {
  const ensureFile = options.ensureFile !== false;
  const primaryPath = getPrimarySettingsPath(boardRoot);
  const existing = await loadExistingBoardSettings(boardRoot);

  if (!existing) {
    const defaults = normalizeBoardSettings({});
    if (ensureFile) {
      return writeBoardSettings(boardRoot, defaults);
    }

    return {
      settingsPath: primaryPath,
      ...defaults,
    };
  }

  const parsed = parseBoardSettings(existing.raw);
  const normalized = normalizeBoardSettings(parsed);

  if (ensureFile) {
    const shouldRewrite =
      existing.sourcePath !== primaryPath ||
      !areLabelCollectionsEqual(parsed.labels, normalized.labels);

    if (shouldRewrite) {
      return writeBoardSettings(boardRoot, normalized);
    }
  }

  return {
    settingsPath: primaryPath,
    ...normalized,
  };
}

async function updateBoardLabels(boardRoot, labels = []) {
  const current = await readBoardSettings(boardRoot, { ensureFile: true });
  const nextSettings = {
    ...current,
    labels,
  };

  return writeBoardSettings(boardRoot, nextSettings);
}

function cardMatchesLabelFilter(cardLabelIds = [], selectedLabelIds = []) {
  if (!Array.isArray(selectedLabelIds) || selectedLabelIds.length === 0) {
    return true;
  }

  if (!Array.isArray(cardLabelIds) || cardLabelIds.length === 0) {
    return false;
  }

  const selected = new Set(selectedLabelIds.map((id) => String(id).trim()).filter(Boolean));
  if (selected.size === 0) {
    return true;
  }

  return cardLabelIds.some((id) => selected.has(String(id).trim()));
}

module.exports = {
  SETTINGS_FILE_NAME,
  DEFAULT_LABELS: cloneDefaultLabels,
  normalizeBoardSettings,
  readBoardSettings,
  writeBoardSettings,
  updateBoardLabels,
  cardMatchesLabelFilter,
};
