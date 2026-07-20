const DEFAULT_RELEASE_NOTES_MAX_CHARS = 1600;

const HTML_TAG_PATTERN = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^<>]*?)?\s*\/?>/g;

const HTML_ENTITY_VALUES = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  quot: '"',
  rdquo: '”',
  rsquo: '’',
});

function extractReleaseNotes(info) {
  const releaseNotes = info?.releaseNotes;

  if (typeof releaseNotes === 'string') {
    return releaseNotes.trim();
  }

  if (Array.isArray(releaseNotes)) {
    const notes = releaseNotes
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }
        if (entry && typeof entry.note === 'string') {
          const entryVersion = typeof entry.version === 'string' ? entry.version.trim() : '';
          const heading = entryVersion ? `Version ${entryVersion}\n` : '';
          return `${heading}${entry.note.trim()}`.trim();
        }
        return '';
      })
      .filter(Boolean);

    return notes.join('\n\n');
  }

  return '';
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (match, hexValue) => decodeNumericEntity(match, hexValue, 16))
    .replace(/&#(\d+);/g, (match, decimalValue) => decodeNumericEntity(match, decimalValue, 10))
    .replace(/&([a-z]+);/gi, (match, entityName) => {
      const decoded = HTML_ENTITY_VALUES[String(entityName || '').toLowerCase()];
      return typeof decoded === 'string' ? decoded : match;
    });
}

function decodeNumericEntity(fallback, rawValue, radix) {
  const codePoint = Number.parseInt(rawValue, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function normalizeHtmlReleaseNotes(notes) {
  let source = decodeHtmlEntities(String(notes || '')).replace(/\r\n?/g, '\n');
  if (!source) {
    return '';
  }

  source = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_match, level, content) => (
      `\n${'#'.repeat(Number(level))} ${content}\n`
    ))
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n---\n')
    .replace(/<\/(?:blockquote|dd|details|div|dl|dt|figcaption|figure|footer|header|main|nav|ol|p|pre|section|summary|table|tbody|tfoot|thead|tr|ul)\s*>/gi, '\n')
    .replace(/<(?:blockquote|dd|details|div|dl|dt|figcaption|figure|footer|header|main|nav|ol|p|pre|section|summary|table|tbody|tfoot|thead|tr|ul)\b[^>]*>/gi, '\n')
    .replace(/<\/?(?:td|th)\b[^>]*>/gi, ' ')
    .replace(HTML_TAG_PATTERN, '');

  return decodeHtmlEntities(source)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripReleaseNotesSection(notes, headingText) {
  const source = typeof notes === 'string' ? notes.trim() : '';
  const heading = String(headingText || '').trim();
  if (!source || !heading) {
    return source;
  }

  const sectionPattern = new RegExp(
    `(?:^|\\n)##\\s+${escapeRegExp(heading)}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`,
    'i'
  );

  return source
    .replace(sectionPattern, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function releaseNotesMarkupToPlainText(notes) {
  return decodeHtmlEntities(String(notes || ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatReleaseNotesForDialog(info, options = {}) {
  const normalizedNotes = normalizeHtmlReleaseNotes(extractReleaseNotes(info));
  const notesWithoutDownloads = stripReleaseNotesSection(normalizedNotes, 'Downloads');
  const notes = releaseNotesMarkupToPlainText(notesWithoutDownloads);

  if (!notes) {
    return 'No changelog details were provided in the release metadata.';
  }

  const configuredMaxChars = Number(options.maxChars);
  const maxChars = Number.isFinite(configuredMaxChars) && configuredMaxChars > 0
    ? Math.floor(configuredMaxChars)
    : DEFAULT_RELEASE_NOTES_MAX_CHARS;
  if (notes.length <= maxChars) {
    return notes;
  }

  return `${notes.slice(0, maxChars).trim()}\n\n...`;
}

module.exports = {
  decodeHtmlEntities,
  extractReleaseNotes,
  formatReleaseNotesForDialog,
  normalizeHtmlReleaseNotes,
  releaseNotesMarkupToPlainText,
  stripReleaseNotesSection,
};
