const TASK_LIST_ITEM_PATTERN = /^(\s*[-*+]\s*\[([\sxX✓✔]*)\]\s*)(.*)$/;
const TASK_DUE_MARKER_PATTERN = /^\(due:\s*(\d{4}-\d{2}-\d{2})\)\s*/i;
const TASK_DUE_MARKER_LOOSE_PATTERN = /^\(due:\s*([^)]+)\)\s*/i;

function normalizeTaskDueDateValue(dateValue) {
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

function createTaskProgressBadge(taskSummary, className = '') {
  const summary = taskSummary && typeof taskSummary === 'object' ? taskSummary : {};
  const total = Number(summary.total) || 0;
  if (total <= 0) {
    return null;
  }

  const completed = Number(summary.completed) || 0;
  const badge = document.createElement('span');
  badge.className = `task-progress-badge ${className}`.trim();
  badge.title = `${completed}/${total} tasks completed`;
  badge.setAttribute('aria-label', `${completed}/${total} tasks completed`);

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

function setTaskListItemDueDateByLineIndex(bodyValue, lineIndex, dueDateValue) {
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

  const normalizedDueDate = normalizeTaskDueDateValue(dueDateValue);
  const trimmedContent = String(parsedLine.contentWithoutDue || '').trimStart();
  const duePrefix = normalizedDueDate ? `(due: ${normalizedDueDate}) ` : '';
  lines[requestedLineIndex] = `${parsedLine.prefix}${duePrefix}${trimmedContent}`;

  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  return lines.join(newline);
}
