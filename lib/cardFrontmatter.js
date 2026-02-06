const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

const LEGACY_DELIMITER = '**********';
const YAML_FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;
const KNOWN_KEYS = new Set(['title', 'due', 'labels']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sortUnknownKeys(frontmatter) {
  return Object.keys(frontmatter)
    .filter((key) => !KNOWN_KEYS.has(key))
    .sort((a, b) => a.localeCompare(b));
}

function toIsoDateString(value) {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const asString = String(value).trim();
  if (!asString) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) {
    return asString;
  }

  const asDate = new Date(asString);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toISOString().slice(0, 10);
  }

  return asString;
}

function normalizeLabels(labels) {
  let values = [];

  if (Array.isArray(labels)) {
    values = labels;
  } else if (typeof labels === 'string') {
    values = labels.split(',');
  } else if (labels != null) {
    values = [labels];
  }

  const seen = new Set();
  const cleaned = [];

  for (const value of values) {
    const label = String(value).trim();
    if (!label || seen.has(label)) {
      continue;
    }

    seen.add(label);
    cleaned.push(label);
  }

  return cleaned;
}

function orderFrontmatter(frontmatter) {
  const ordered = {
    title: frontmatter.title || '',
  };

  if (typeof frontmatter.due === 'string' && frontmatter.due.trim().length > 0) {
    ordered.due = frontmatter.due.trim();
  }

  ordered.labels = Array.isArray(frontmatter.labels) ? frontmatter.labels : [];

  for (const key of sortUnknownKeys(frontmatter)) {
    ordered[key] = frontmatter[key];
  }

  return ordered;
}

function normalizeFrontmatter(frontmatter = {}) {
  const source = isObject(frontmatter) ? { ...frontmatter } : {};

  if (source.title == null && source.Title != null) {
    source.title = source.Title;
  }

  if (source.due == null && source['Due-date'] != null) {
    source.due = source['Due-date'];
  }

  if (source.labels == null && source.Labels != null) {
    source.labels = source.Labels;
  }

  delete source.Title;
  delete source['Due-date'];
  delete source.Labels;

  source.title = source.title == null ? '' : String(source.title).trim();

  const due = toIsoDateString(source.due);
  if (due === undefined) {
    delete source.due;
  } else {
    source.due = due;
  }

  source.labels = normalizeLabels(source.labels);

  return orderFrontmatter(source);
}

function deriveTitleFromPath(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const withoutOrderPrefix = baseName.replace(/^\d+\s*[-_]\s*/, '');
  return withoutOrderPrefix || 'Untitled';
}

function parseYamlCard(rawContent) {
  const match = rawContent.match(YAML_FRONTMATTER_REGEX);
  if (!match) {
    return null;
  }

  const yamlSource = match[1];
  const body = rawContent.slice(match[0].length);

  let frontmatter = {};
  if (yamlSource.trim()) {
    try {
      const parsed = yaml.load(yamlSource, { schema: yaml.JSON_SCHEMA });
      if (isObject(parsed)) {
        frontmatter = parsed;
      }
    } catch {
      return null;
    }
  }

  return { frontmatter, body };
}

function parseLegacyFrontmatter(headerLines) {
  const legacy = {};

  for (const line of headerLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    legacy[key] = value;
  }

  return legacy;
}

function parseLegacyCard(rawContent) {
  const delimiterIndex = rawContent.indexOf(LEGACY_DELIMITER);

  if (delimiterIndex >= 0) {
    const rawHeader = rawContent.slice(0, delimiterIndex);
    const rawBody = rawContent.slice(delimiterIndex + LEGACY_DELIMITER.length);
    const headerLines = rawHeader.split(/\r?\n/);

    let title = '';
    if (headerLines[0] && /^\s*#\s+/.test(headerLines[0])) {
      title = headerLines[0].replace(/^\s*#\s+/, '').trim();
    }

    const metadata = parseLegacyFrontmatter(headerLines.slice(1));

    return {
      frontmatter: {
        title,
        ...metadata,
      },
      body: rawBody.replace(/^\r?\n/, '').replace(/^\r?\n/, ''),
    };
  }

  const lines = rawContent.split(/\r?\n/);
  const firstLine = lines[0] || '';

  if (/^\s*#\s+/.test(firstLine)) {
    return {
      frontmatter: {
        title: firstLine.replace(/^\s*#\s+/, '').trim(),
      },
      body: lines.slice(1).join('\n').replace(/^\n+/, ''),
    };
  }

  return {
    frontmatter: {},
    body: rawContent,
  };
}

function parseCardContent(rawContent) {
  return parseYamlCard(rawContent) || parseLegacyCard(rawContent);
}

function frontmatterForWrite(frontmatter, filePath) {
  const normalized = normalizeFrontmatter(frontmatter);

  if (!normalized.title) {
    normalized.title = deriveTitleFromPath(filePath);
  }

  const ordered = {
    title: normalized.title,
  };

  if (normalized.due) {
    ordered.due = normalized.due;
  }

  if (Array.isArray(normalized.labels) && normalized.labels.length > 0) {
    ordered.labels = normalized.labels;
  }

  for (const key of sortUnknownKeys(normalized)) {
    ordered[key] = normalized[key];
  }

  return ordered;
}

function serializeCard(frontmatter, body, filePath) {
  const serializableFrontmatter = frontmatterForWrite(frontmatter, filePath);

  const yamlText = yaml.dump(serializableFrontmatter, {
    schema: yaml.JSON_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    noCompatMode: true,
    sortKeys: false,
  });

  const bodyText = typeof body === 'string' ? body : String(body || '');

  return `---\n${yamlText}---\n${bodyText}`;
}

async function readCard(filePath) {
  const rawContent = await fs.readFile(filePath, 'utf8');
  const parsed = parseCardContent(rawContent);
  const normalized = normalizeFrontmatter(parsed.frontmatter);

  if (!normalized.title) {
    normalized.title = deriveTitleFromPath(filePath);
  }

  return {
    frontmatter: normalized,
    body: parsed.body,
  };
}

async function writeCard(filePath, card = {}) {
  const frontmatter = isObject(card.frontmatter) ? card.frontmatter : {};
  const body = typeof card.body === 'string' ? card.body : '';

  const serialized = serializeCard(frontmatter, body, filePath);

  await fs.writeFile(filePath, serialized, 'utf8');
}

async function updateFrontmatter(filePath, partialFrontmatter = {}) {
  const currentCard = await readCard(filePath);
  const nextFrontmatter = {
    ...currentCard.frontmatter,
    ...(isObject(partialFrontmatter) ? partialFrontmatter : {}),
  };

  const normalized = normalizeFrontmatter(nextFrontmatter);

  await writeCard(filePath, {
    frontmatter: normalized,
    body: currentCard.body,
  });

  return normalized;
}

module.exports = {
  readCard,
  writeCard,
  updateFrontmatter,
  normalizeFrontmatter,
  parseCardContent,
};
