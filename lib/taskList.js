const TASK_LIST_ITEM_PATTERN = /^(\s*[-*+]\s*\[([\sxX✓✔]*)\]\s*)(.*)$/;
const TASK_DUE_MARKER_PATTERN = /^\(due:\s*(\d{4}-\d{2}-\d{2})\)\s*/i;
const TASK_DUE_MARKER_LOOSE_PATTERN = /^\(due:\s*([^)]+)\)\s*/i;

function parseIsoDateStringToLocalDate(dateValue) {
  const normalized = String(dateValue || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function normalizeTaskDueDateValue(dateValue) {
  const normalized = String(dateValue || '').trim();
  if (!normalized) {
    return '';
  }

  return parseIsoDateStringToLocalDate(normalized) ? normalized : '';
}

function parseTaskListItemLine(lineValue) {
  const normalizedLine = String(lineValue || '');
  const match = normalizedLine.match(TASK_LIST_ITEM_PATTERN);
  if (!match) {
    return null;
  }

  const prefix = String(match[1] || '').replace(/\s*$/, ' ');
  const checkboxState = String(match[2] || '');
  const normalizedCheckboxState = checkboxState.replace(/\s+/g, '').toLowerCase();
  const isCompleted = (
    normalizedCheckboxState === 'x' ||
    normalizedCheckboxState === '✓' ||
    normalizedCheckboxState === '✔'
  );
  const content = String(match[3] || '');
  const normalizedContent = content.replace(/^\s+/, '');

  let contentWithoutDue = normalizedContent;
  const looseMarkerMatch = normalizedContent.match(TASK_DUE_MARKER_LOOSE_PATTERN);
  if (looseMarkerMatch) {
    contentWithoutDue = normalizedContent.slice(looseMarkerMatch[0].length);
  }

  let due = '';
  const strictMarkerMatch = normalizedContent.match(TASK_DUE_MARKER_PATTERN);
  if (strictMarkerMatch) {
    due = normalizeTaskDueDateValue(strictMarkerMatch[1]);
  }

  return {
    prefix,
    isCompleted,
    content,
    contentWithoutDue,
    due,
  };
}

function parseTaskListItems(bodyValue) {
  const body = String(bodyValue || '');
  if (!body) {
    return [];
  }

  const items = [];
  let lineIndex = 0;
  let cursor = 0;

  while (cursor <= body.length) {
    const lineStart = cursor;
    const newlineIndex = body.indexOf('\n', cursor);
    const lineEnd = newlineIndex === -1 ? body.length : newlineIndex;
    const rawLine = body.slice(lineStart, lineEnd);
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const parsedLine = parseTaskListItemLine(line);

    if (parsedLine) {
      items.push({
        ...parsedLine,
        line,
        lineIndex,
        lineStart,
        lineEnd,
      });
    }

    if (newlineIndex === -1) {
      break;
    }

    cursor = newlineIndex + 1;
    lineIndex += 1;
  }

  return items;
}

function getTaskListSummary(bodyValue) {
  const items = parseTaskListItems(bodyValue);
  let completed = 0;
  for (const item of items) {
    if (item.isCompleted) {
      completed += 1;
    }
  }

  return {
    total: items.length,
    completed,
    remaining: Math.max(0, items.length - completed),
  };
}

function getTaskListDueDates(bodyValue) {
  const items = parseTaskListItems(bodyValue);
  const dueSet = new Set();
  for (const item of items) {
    if (item.due) {
      dueSet.add(item.due);
    }
  }

  return [...dueSet].sort();
}

module.exports = {
  parseIsoDateStringToLocalDate,
  normalizeTaskDueDateValue,
  parseTaskListItemLine,
  parseTaskListItems,
  getTaskListSummary,
  getTaskListDueDates,
};
