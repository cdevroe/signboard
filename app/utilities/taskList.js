const TASK_LIST_ITEM_PATTERN = /^(\s*[-*+]\s*\[([\sxX✓✔]*)\]\s*)(.*)$/;
const TASK_DATE_MARKER_PATTERN = /^\((due|start|scheduled):\s*(\d{4}-\d{2}-\d{2})\)\s*/i;
const TASK_DATE_MARKER_LOOSE_PATTERN = /^\((due|start|scheduled):\s*([^)]+)\)\s*/i;

function normalizeTaskDateValue(dateValue) {
  const normalized = String(dateValue || '').trim();
  if (!normalized) {
    return '';
  }

  const parsedDate = parseIsoDateStringToLocalDate(normalized);
  if (!parsedDate) {
    return '';
  }

  return normalized;
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

function createTaskProgressBadge(taskSummary, className = '') {
  const summary = taskSummary && typeof taskSummary === 'object' ? taskSummary : {};
  const total = Number(summary.total) || 0;
  if (total <= 0) {
    return null;
  }

  const completed = Number(summary.completed) || 0;
  const progressLabel = `${completed}/${total} tasks completed`;
  const badge = document.createElement('span');
  badge.className = `task-progress-badge ${className}`.trim();
  badge.title = progressLabel;
  badge.setAttribute('data-sb-tooltip', progressLabel);
  badge.setAttribute('aria-label', progressLabel);

  if (completed >= total) {
    badge.classList.add('task-progress-badge-complete');
  }

  const icon = document.createElement('i');
  icon.setAttribute('data-feather', 'check-square');
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'task-progress-badge-text';
  text.textContent = `${completed}/${total}`;

  badge.appendChild(icon);
  badge.appendChild(text);
  return badge;
}

function setTaskListItemDateByLineIndex(bodyValue, lineIndex, dateKind, dateValue) {
  const body = String(bodyValue || '');
  const requestedLineIndex = Number(lineIndex);
  if (!Number.isInteger(requestedLineIndex) || requestedLineIndex < 0) {
    return body;
  }

  const lines = body.split(/\r?\n/);
  if (requestedLineIndex >= lines.length) {
    return body;
  }

  const parsedLine = parseTaskListItemLine(lines[requestedLineIndex]);
  if (!parsedLine) {
    return body;
  }

  const normalizedKind = String(dateKind || '').trim().toLowerCase() === 'start' ? 'start' : 'due';
  const normalizedDate = normalizeTaskDateValue(dateValue);
  const trimmedContent = String(parsedLine.contentWithoutDue || '').trimStart();
  const startValue = normalizedKind === 'start' ? normalizedDate : parsedLine.start;
  const dueValue = normalizedKind === 'due' ? normalizedDate : parsedLine.due;
  const startPrefix = startValue ? `(start: ${startValue}) ` : '';
  const duePrefix = dueValue ? `(due: ${dueValue}) ` : '';
  lines[requestedLineIndex] = `${parsedLine.prefix}${startPrefix}${duePrefix}${trimmedContent}`;

  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  return lines.join(newline);
}

function setTaskListItemDueDateByLineIndex(bodyValue, lineIndex, dueDateValue) {
  return setTaskListItemDateByLineIndex(bodyValue, lineIndex, 'due', dueDateValue);
}

function setTaskListItemStartDateByLineIndex(bodyValue, lineIndex, startDateValue) {
  return setTaskListItemDateByLineIndex(bodyValue, lineIndex, 'start', startDateValue);
}

function setTaskListItemCompletionByLineIndex(bodyValue, lineIndex, isCompleted) {
  const body = String(bodyValue || '');
  const requestedLineIndex = Number(lineIndex);
  if (!Number.isInteger(requestedLineIndex) || requestedLineIndex < 0) {
    return body;
  }

  const lines = body.split(/\r?\n/);
  if (requestedLineIndex >= lines.length) {
    return body;
  }

  const parsedLine = parseTaskListItemLine(lines[requestedLineIndex]);
  if (!parsedLine) {
    return body;
  }

  const checkboxMark = isCompleted ? 'x' : ' ';
  lines[requestedLineIndex] = lines[requestedLineIndex].replace(
    TASK_LIST_ITEM_PATTERN,
    (match, prefix, state, content) => {
      const newPrefix = prefix.replace(/\[[\sxX✓✔]*\]/, `[${checkboxMark}]`);
      return `${newPrefix}${content}`;
    },
  );

  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  return lines.join(newline);
}

function getLineEndOffsetByLineIndex(bodyValue, lineIndex) {
  const body = String(bodyValue || '');
  const requestedLineIndex = Number(lineIndex);
  if (!Number.isInteger(requestedLineIndex) || requestedLineIndex < 0) {
    return body.length;
  }

  let currentLineIndex = 0;
  let cursor = 0;

  while (currentLineIndex < requestedLineIndex) {
    const newlineIndex = body.indexOf('\n', cursor);
    if (newlineIndex === -1) {
      return body.length;
    }

    cursor = newlineIndex + 1;
    currentLineIndex += 1;
  }

  let lineEnd = body.indexOf('\n', cursor);
  if (lineEnd === -1) {
    lineEnd = body.length;
  }

  if (lineEnd > cursor && body.charAt(lineEnd - 1) === '\r') {
    lineEnd -= 1;
  }

  return lineEnd;
}
