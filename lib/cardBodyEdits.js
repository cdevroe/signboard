const TIMESTAMP_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function trimTrailingBlankLines(lines) {
  const nextLines = Array.isArray(lines) ? [...lines] : [];
  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') {
    nextLines.pop();
  }
  return nextLines;
}

function trimLeadingBlankLines(lines) {
  const nextLines = Array.isArray(lines) ? [...lines] : [];
  while (nextLines.length > 0 && nextLines[0] === '') {
    nextLines.shift();
  }
  return nextLines;
}

function blockToLines(value) {
  const normalized = normalizeText(value).replace(/\n+$/g, '');
  return normalized ? normalized.split('\n') : [];
}

function parseHeadingLine(line) {
  const match = String(line || '').match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    text: match[2].trim(),
    line: String(line || '').trim(),
  };
}

function parseHeadingReference(headingRef) {
  const input = String(headingRef || '').trim();
  if (!input) {
    throw new Error('Heading reference is required.');
  }

  const parsed = parseHeadingLine(input);
  if (parsed) {
    return parsed;
  }

  return {
    level: null,
    text: input,
    line: '',
  };
}

function headingMatches(line, reference) {
  const heading = parseHeadingLine(line);
  if (!heading) {
    return false;
  }

  if (reference.level != null && heading.level !== reference.level) {
    return false;
  }

  return heading.text.toLowerCase() === reference.text.toLowerCase();
}

function splitBodyLines(body) {
  const normalized = normalizeText(body);
  return normalized ? normalized.split('\n') : [];
}

function joinBodyLines(lines) {
  return trimTrailingBlankLines(lines).join('\n');
}

function findHeadingSection(lines, headingRef) {
  const reference = parseHeadingReference(headingRef);
  const startIndex = lines.findIndex((line) => headingMatches(line, reference));
  if (startIndex === -1) {
    throw new Error(`Could not find heading: ${headingRef}`);
  }

  const heading = parseHeadingLine(lines[startIndex]);
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const nextHeading = parseHeadingLine(lines[index]);
    if (nextHeading && nextHeading.level <= heading.level) {
      endIndex = index;
      break;
    }
  }

  return {
    startIndex,
    endIndex,
    heading,
  };
}

function replaceSection(body, headingRef, replacementText) {
  const lines = splitBodyLines(body);
  const section = findHeadingSection(lines, headingRef);
  const replacementLines = blockToLines(replacementText);
  const nextLines = [
    ...lines.slice(0, section.startIndex + 1),
    ...replacementLines,
    ...lines.slice(section.endIndex),
  ];

  return joinBodyLines(nextLines);
}

function insertAfterHeading(body, headingRef, insertionText) {
  const lines = splitBodyLines(body);
  const section = findHeadingSection(lines, headingRef);
  const insertionLines = blockToLines(insertionText);
  let insertIndex = section.startIndex + 1;

  if (lines[insertIndex] === '') {
    insertIndex += 1;
  }

  const nextLines = [
    ...lines.slice(0, insertIndex),
    ...insertionLines,
    ...lines.slice(insertIndex),
  ];

  return joinBodyLines(nextLines);
}

function formatTimestamp(date = new Date()) {
  let normalizedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(normalizedDate.getTime())) {
    normalizedDate = new Date();
  }
  const monthName = TIMESTAMP_MONTHS[normalizedDate.getMonth()];
  const day = normalizedDate.getDate();
  const hours = String(normalizedDate.getHours()).padStart(2, '0');
  const minutes = String(normalizedDate.getMinutes()).padStart(2, '0');
  return `${monthName} ${day}, ${hours}:${minutes}`;
}

function buildNoteLine(text, options = {}) {
  const noteText = String(text || '').trim();
  if (!noteText) {
    throw new Error('Note text is required.');
  }

  if (options.timestamp === true) {
    return `- ${formatTimestamp(options.date)} - ${noteText}`;
  }

  return `- ${noteText}`;
}

function appendLinesToSection(lines, headingRef, linesToAppend, options = {}) {
  const section = findHeadingSection(lines, headingRef);
  const before = trimTrailingBlankLines(lines.slice(0, section.endIndex));
  const after = trimLeadingBlankLines(lines.slice(section.endIndex));
  const appendLines = blockToLines(linesToAppend.join('\n'));
  const nextLines = [...before];

  if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
    nextLines.push('');
  }

  nextLines.push(...appendLines);

  if (after.length > 0) {
    if (nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }
    nextLines.push(...after);
  }

  if (options.ensureTrailingBlankLine === true && nextLines[nextLines.length - 1] !== '') {
    nextLines.push('');
  }

  return nextLines;
}

function appendNote(body, text, options = {}) {
  const section = String(options.section || 'Notes').trim() || 'Notes';
  const noteLine = buildNoteLine(text, options);
  const lines = splitBodyLines(body);

  try {
    return joinBodyLines(appendLinesToSection(lines, section, [noteLine]));
  } catch (error) {
    if (!String(error.message || '').startsWith('Could not find heading:')) {
      throw error;
    }
  }

  const nextLines = trimTrailingBlankLines(lines);
  if (nextLines.length > 0) {
    nextLines.push('', `## ${section}`, '', noteLine);
  } else {
    nextLines.push(`## ${section}`, '', noteLine);
  }

  return joinBodyLines(nextLines);
}

module.exports = {
  appendNote,
  buildNoteLine,
  formatTimestamp,
  insertAfterHeading,
  parseHeadingLine,
  replaceSection,
};
