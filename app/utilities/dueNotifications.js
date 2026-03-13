const DUE_NOTIFICATION_MAX_CARD_TITLE_LENGTH = 80;
const DUE_NOTIFICATION_MAX_TASK_SNIPPET_LENGTH = 120;
const DUE_NOTIFICATION_MAX_BODY_LENGTH = 220;

function normalizeDueNotificationText(value, maxLength) {
  const collapsed = String(value || '').replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return '';
  }

  const limit = Number(maxLength) || 0;
  if (!limit || collapsed.length <= limit) {
    return collapsed;
  }

  return `${collapsed.slice(0, Math.max(1, limit - 1)).trimEnd()}...`;
}

function formatDueNotificationItemSummary(itemValue) {
  const item = itemValue && typeof itemValue === 'object' ? itemValue : {};
  const cardTitle = normalizeDueNotificationText(
    item.cardTitle || 'Untitled',
    DUE_NOTIFICATION_MAX_CARD_TITLE_LENGTH,
  );

  if (item.kind === 'task') {
    const taskSnippet = normalizeDueNotificationText(
      item.taskText || '',
      DUE_NOTIFICATION_MAX_TASK_SNIPPET_LENGTH,
    );
    if (taskSnippet) {
      return `${cardTitle}: ${taskSnippet}`;
    }
  }

  return cardTitle;
}

function buildDueNotificationBody(dueItemsValue) {
  const dueItems = Array.isArray(dueItemsValue) ? dueItemsValue : [];
  if (dueItems.length === 0) {
    return '';
  }

  if (dueItems.length === 1) {
    return formatDueNotificationItemSummary(dueItems[0]);
  }

  const representativeItem = dueItems.find((item) => item && item.kind === 'task') || dueItems[0];
  const firstSummary = formatDueNotificationItemSummary(representativeItem);
  const summary = `Due today: ${dueItems.length} items. First: ${firstSummary}`;
  return normalizeDueNotificationText(summary, DUE_NOTIFICATION_MAX_BODY_LENGTH);
}

async function collectDueTodayItemsForBoard(boardApi, boardRoot, todayIsoDate) {
  const dueItems = [];
  if (!boardApi || typeof boardApi.listLists !== 'function' || typeof boardApi.listCards !== 'function' || typeof boardApi.readCard !== 'function') {
    return dueItems;
  }

  const normalizedBoardRoot = typeof normalizeBoardPath === 'function'
    ? normalizeBoardPath(boardRoot)
    : String(boardRoot || '').trim();

  if (!normalizedBoardRoot) {
    return dueItems;
  }

  let lists = [];
  try {
    lists = await boardApi.listLists(normalizedBoardRoot);
  } catch {
    return dueItems;
  }

  for (const listName of lists) {
    const listPath = `${normalizedBoardRoot}${listName}`;
    let cardFiles = [];

    try {
      cardFiles = await boardApi.listCards(listPath);
    } catch {
      continue;
    }

    for (const cardFileName of cardFiles) {
      const cardPath = `${listPath}/${cardFileName}`;
      try {
        const card = await boardApi.readCard(cardPath);
        const cardTitle = normalizeDueNotificationText(
          String(card?.frontmatter?.title || '').trim() || 'Untitled',
          DUE_NOTIFICATION_MAX_CARD_TITLE_LENGTH,
        );
        const cardDueDate = normalizeTaskDueDateValue(card?.frontmatter?.due);

        if (cardDueDate === todayIsoDate) {
          dueItems.push({
            kind: 'card',
            cardTitle,
            taskText: '',
          });
        }

        const taskItems = parseTaskListItems(card?.body || '');
        for (const taskItem of taskItems) {
          if (taskItem.isCompleted) {
            continue;
          }

          const taskDueDate = normalizeTaskDueDateValue(taskItem.due);
          if (taskDueDate !== todayIsoDate) {
            continue;
          }

          const taskText = normalizeDueNotificationText(
            taskItem.contentWithoutDue || taskItem.content || '',
            DUE_NOTIFICATION_MAX_TASK_SNIPPET_LENGTH,
          );
          if (!taskText) {
            continue;
          }

          dueItems.push({
            kind: 'task',
            cardTitle,
            taskText,
          });
        }
      } catch {
        // Ignore unreadable cards and continue scanning.
      }
    }
  }

  return dueItems;
}
