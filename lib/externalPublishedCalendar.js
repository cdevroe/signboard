const crypto = require('crypto');
const path = require('path');

const { isCompletedListByWorkflow } = require('./boardLabels');
const { normalizeTaskDueDateValue, parseTaskListItems } = require('./taskList');

const CALENDAR_NAME = 'Signboard External Published Calendar';
const PRODUCT_ID = '-//Signboard//External Published Calendar//EN';

function normalizeIsoDate(value) {
  const normalized = normalizeTaskDueDateValue(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return '';
  }

  return normalized;
}

function toIcsDate(isoDate) {
  return normalizeIsoDate(isoDate).replace(/-/g, '');
}

function addDaysToIsoDate(isoDate, days) {
  const normalized = normalizeIsoDate(isoDate);
  if (!normalized) {
    return '';
  }

  const [year, month, day] = normalized.split('-').map((part) => Number.parseInt(part, 10));
  const nextDate = new Date(Date.UTC(year, month - 1, day + days));
  return nextDate.toISOString().slice(0, 10);
}

function normalizeCalendarText(value, fallback = '') {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

function isMissingCalendarSourceError(error) {
  return Boolean(error && (error.code === 'ENOENT' || error.code === 'ENOTDIR'));
}

function stripMarkdownHeading(value) {
  return normalizeCalendarText(value).replace(/^#\s+/, '').trim();
}

function getListDisplayName(listName) {
  const normalized = String(listName || '').trim();
  if (!normalized) {
    return 'Untitled';
  }

  const listNameMatch = normalized.match(/^\d{3}-(.*?)(-[^-]{5}|-stock)$/);
  if (listNameMatch) {
    return String(listNameMatch[1] || '').trim() || 'Untitled';
  }

  return normalized;
}

function createStableUid(parts) {
  const source = (Array.isArray(parts) ? parts : [])
    .map((part) => String(part || ''))
    .join('\u001f');
  const digest = crypto.createHash('sha256').update(source).digest('base64url');
  return `${digest}@signboard.local`;
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldIcsLine(line) {
  const source = String(line || '');
  const folded = [];
  let cursor = 0;
  const firstLineLength = 74;
  const continuationLength = 73;

  while (cursor < source.length) {
    const maxLength = folded.length === 0 ? firstLineLength : continuationLength;
    const chunk = source.slice(cursor, cursor + maxLength);
    folded.push(`${folded.length === 0 ? '' : ' '}${chunk}`);
    cursor += maxLength;
  }

  return folded.length > 0 ? folded : [''];
}

function createIcsProperty(name, value) {
  return foldIcsLine(`${name}:${value}`);
}

function createEventDescription(event) {
  const lines = [
    event.kind === 'task' ? `Task from card: ${event.cardTitle}` : 'Card due date',
    `Board: ${event.boardName}`,
    `List: ${event.listDisplayName}`,
    `Card path: ${event.cardPath}`,
  ];

  return lines.join('\n');
}

function createCalendarEvent({
  kind,
  boardRoot,
  boardName,
  listName,
  listDisplayName,
  cardPath,
  cardTitle,
  date,
  summary,
  taskLineIndex = null,
}) {
  const normalizedDate = normalizeIsoDate(date);
  if (!normalizedDate) {
    return null;
  }

  const normalizedBoardName = normalizeCalendarText(boardName, path.basename(String(boardRoot || '')) || 'Board');
  const normalizedListDisplayName = normalizeCalendarText(listDisplayName, getListDisplayName(listName));
  const normalizedCardTitle = stripMarkdownHeading(cardTitle) || 'Untitled';
  const normalizedSummary = stripMarkdownHeading(summary) || normalizedCardTitle;
  const normalizedKind = kind === 'task' ? 'task' : 'card';

  return {
    kind: normalizedKind,
    uid: createStableUid([
      normalizedKind,
      boardRoot,
      cardPath,
      normalizedKind === 'task' ? taskLineIndex : 'card',
    ]),
    date: normalizedDate,
    summary: normalizedSummary,
    boardRoot,
    boardName: normalizedBoardName,
    listName,
    listDisplayName: normalizedListDisplayName,
    cardPath,
    cardTitle: normalizedCardTitle,
  };
}

function compareCalendarEvents(left, right) {
  const dateCompare = String(left.date || '').localeCompare(String(right.date || ''));
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const summaryCompare = String(left.summary || '').localeCompare(String(right.summary || ''), undefined, {
    sensitivity: 'base',
  });
  if (summaryCompare !== 0) {
    return summaryCompare;
  }

  return String(left.uid || '').localeCompare(String(right.uid || ''));
}

async function collectExternalPublishedCalendarEvents(options = {}) {
  const boardRoots = Array.isArray(options.boardRoots) ? options.boardRoots : [];
  const readBoardSettings = options.readBoardSettings;
  const listLists = options.listLists;
  const listCards = options.listCards;
  const readCard = options.readCard;
  const getBoardName = typeof options.getBoardName === 'function'
    ? options.getBoardName
    : (boardRoot) => path.basename(String(boardRoot || '').replace(/[/\\]+$/, ''));

  if (
    typeof readBoardSettings !== 'function' ||
    typeof listLists !== 'function' ||
    typeof listCards !== 'function' ||
    typeof readCard !== 'function'
  ) {
    return [];
  }

  const seenBoardRoots = new Set();
  const events = [];

  for (const rawBoardRoot of boardRoots) {
    const boardRoot = String(rawBoardRoot || '').trim();
    if (!boardRoot || seenBoardRoots.has(boardRoot)) {
      continue;
    }
    seenBoardRoots.add(boardRoot);

    try {
      const boardSettings = await readBoardSettings(boardRoot);
      if (boardSettings && boardSettings.externalPublishedCalendar && boardSettings.externalPublishedCalendar.include === false) {
        continue;
      }

      const workflowSettings = boardSettings && boardSettings.workflow;
      const boardName = normalizeCalendarText(await Promise.resolve(getBoardName(boardRoot)), path.basename(boardRoot));
      const listNames = await listLists(boardRoot);
      for (const listName of Array.isArray(listNames) ? listNames : []) {
        if (isCompletedListByWorkflow(listName, workflowSettings)) {
          continue;
        }

        const listPath = path.join(boardRoot, listName);
        const listDisplayName = getListDisplayName(listName);
        const cardNames = await listCards(listPath);
        for (const cardName of Array.isArray(cardNames) ? cardNames : []) {
          const cardPath = path.join(listPath, cardName);
          const card = await readCard(cardPath);
          const frontmatter = card && card.frontmatter && typeof card.frontmatter === 'object'
            ? card.frontmatter
            : {};
          const body = String(card && typeof card.body === 'string' ? card.body : '');
          const cardTitle = stripMarkdownHeading(frontmatter.title) || 'Untitled';
          const cardDueDate = normalizeIsoDate(frontmatter.due);

          if (cardDueDate) {
            const cardEvent = createCalendarEvent({
              kind: 'card',
              boardRoot,
              boardName,
              listName,
              listDisplayName,
              cardPath,
              cardTitle,
              date: cardDueDate,
              summary: cardTitle,
            });
            if (cardEvent) {
              events.push(cardEvent);
            }
          }

          const taskItems = parseTaskListItems(body);
          for (const taskItem of taskItems) {
            if (!taskItem || taskItem.isCompleted) {
              continue;
            }

            const taskDueDate = normalizeIsoDate(taskItem.due);
            if (!taskDueDate) {
              continue;
            }

            const taskSummary = normalizeCalendarText(taskItem.contentWithoutDue || taskItem.content, 'Task due');
            const taskEvent = createCalendarEvent({
              kind: 'task',
              boardRoot,
              boardName,
              listName,
              listDisplayName,
              cardPath,
              cardTitle,
              date: taskDueDate,
              summary: taskSummary,
              taskLineIndex: taskItem.lineIndex,
            });
            if (taskEvent) {
              events.push(taskEvent);
            }
          }
        }
      }
    } catch (error) {
      if (!isMissingCalendarSourceError(error)) {
        console.error(`Unable to publish calendar entries for board: ${boardRoot}`, error);
      }
    }
  }

  return events.sort(compareCalendarEvents);
}

function createCalendarTimestamp(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date();
  if (Number.isNaN(date.getTime())) {
    return createCalendarTimestamp(new Date());
  }

  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildExternalPublishedCalendarIcs(events = [], options = {}) {
  const normalizedEvents = Array.isArray(events) ? events.slice().sort(compareCalendarEvents) : [];
  const calendarName = normalizeCalendarText(options.calendarName, CALENDAR_NAME);
  const now = options.now instanceof Date ? options.now : new Date();
  const timestamp = createCalendarTimestamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODUCT_ID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...createIcsProperty('X-WR-CALNAME', escapeIcsText(calendarName)),
    ...createIcsProperty('X-WR-CALDESC', escapeIcsText('Read-only due dates published by Signboard.')),
    'X-PUBLISHED-TTL:PT15M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
  ];

  for (const event of normalizedEvents) {
    const startDate = toIcsDate(event.date);
    const endDate = toIcsDate(addDaysToIsoDate(event.date, 1));
    if (!startDate || !endDate) {
      continue;
    }

    lines.push('BEGIN:VEVENT');
    lines.push(...createIcsProperty('UID', escapeIcsText(event.uid)));
    lines.push(`DTSTAMP:${timestamp}`);
    lines.push(`DTSTART;VALUE=DATE:${startDate}`);
    lines.push(`DTEND;VALUE=DATE:${endDate}`);
    lines.push(...createIcsProperty('SUMMARY', escapeIcsText(event.summary)));
    lines.push(...createIcsProperty('DESCRIPTION', escapeIcsText(createEventDescription(event))));
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

async function buildExternalPublishedCalendarFeed(options = {}) {
  const events = await collectExternalPublishedCalendarEvents(options);
  return buildExternalPublishedCalendarIcs(events, options);
}

module.exports = {
  buildExternalPublishedCalendarFeed,
  buildExternalPublishedCalendarIcs,
  collectExternalPublishedCalendarEvents,
  createCalendarEvent,
  normalizeIsoDate,
};
