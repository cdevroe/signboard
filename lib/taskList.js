const TASK_LIST_ITEM_PATTERN = /^(\s*[-*+]\s*\[([\sxX✓✔]*)\]\s*)(.*)$/;
const TASK_DATE_MARKER_PATTERN = /^\((due|start|scheduled):\s*(\d{4}-\d{2}-\d{2})\)\s*/i;
const TASK_DATE_MARKER_LOOSE_PATTERN = /^\((due|start|scheduled):\s*([^)]+)\)\s*/i;

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

function normalizeTaskDateValue(dateValue) {
  const normalized = String(dateValue || '').trim();
  if (!normalized) {
    return '';
  }

  return parseIsoDateStringToLocalDate(normalized) ? normalized : '';
}

function normalizeTaskDueDateValue(dateValue) {
  return normalizeTaskDateValue(dateValue);
}

function normalizeTaskStartDateValue(dateValue) {
  return normalizeTaskDateValue(dateValue);
}

function parseTaskDateMarkers(contentValue) {
  let remaining = String(contentValue || '').replace(/^\s+/, '');
  let due = '';
  let start = '';
  let consumedAnyMarker = false;

  while (remaining) {
    const strictMatch = remaining.match(TASK_DATE_MARKER_PATTERN);
    const looseMatch = remaining.match(TASK_DATE_MARKER_LOOSE_PATTERN);
    const markerMatch = strictMatch || looseMatch;
    if (!markerMatch) {
      break;
    }

    consumedAnyMarker = true;
    const markerName = String(markerMatch[1] || '').trim().toLowerCase();
    const markerValue = strictMatch ? normalizeTaskDateValue(markerMatch[2]) : '';
    if (markerValue) {
      if (markerName === 'due') {
        due = markerValue;
      } else {
        start = markerValue;
      }
    }
    remaining = remaining.slice(markerMatch[0].length);
  }

  return {
    due,
    start,
    contentWithoutDateMarkers: consumedAnyMarker ? remaining : String(contentValue || '').replace(/^\s+/, ''),
  };
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

  const dateMarkers = parseTaskDateMarkers(normalizedContent);

  return {
    prefix,
    isCompleted,
    content,
    contentWithoutDue: dateMarkers.contentWithoutDateMarkers,
    contentWithoutDateMarkers: dateMarkers.contentWithoutDateMarkers,
    due: dateMarkers.due,
    start: dateMarkers.start,
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

function getIncompleteTaskListDueDates(bodyValue) {
  const items = parseTaskListItems(bodyValue);
  const dueSet = new Set();
  for (const item of items) {
    if (item.isCompleted || !item.due) {
      continue;
    }

    dueSet.add(item.due);
  }

  return [...dueSet].sort();
}

function getTaskListStartDates(bodyValue) {
  const items = parseTaskListItems(bodyValue);
  const startSet = new Set();
  for (const item of items) {
    if (item.start) {
      startSet.add(item.start);
    }
  }

  return [...startSet].sort();
}

function getIncompleteTaskListStartDates(bodyValue) {
  const items = parseTaskListItems(bodyValue);
  const startSet = new Set();
  for (const item of items) {
    if (item.isCompleted || !item.start) {
      continue;
    }

    startSet.add(item.start);
  }

  return [...startSet].sort();
}

module.exports = {
  parseIsoDateStringToLocalDate,
  normalizeTaskDateValue,
  normalizeTaskDueDateValue,
  normalizeTaskStartDateValue,
  parseTaskListItemLine,
  parseTaskListItems,
  getTaskListSummary,
  getTaskListDueDates,
  getIncompleteTaskListDueDates,
  getTaskListStartDates,
  getIncompleteTaskListStartDates,
};
