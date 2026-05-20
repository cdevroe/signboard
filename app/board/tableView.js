const BOARD_TABLE_COLUMNS = Object.freeze([
  { id: 'due', label: 'Due' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'title', label: 'Card' },
  { id: 'list', label: 'List' },
  { id: 'labels', label: 'Labels' },
]);

function normalizeBoardTableTitle(titleText) {
  const normalized = String(titleText || '').trim().replace(/^#\s+/, '');
  return normalized || 'Untitled';
}

function getBoardTableListEntries(boardRoot, listsWithCards) {
  const entries = Array.isArray(listsWithCards) ? listsWithCards : [];

  return entries.map((entry) => {
    const listName = typeof entry === 'string'
      ? entry
      : String(entry && entry.listName ? entry.listName : '').trim();
    const listPath = typeof entry === 'string'
      ? `${boardRoot}${entry}`
      : String(entry && entry.listPath ? entry.listPath : `${boardRoot}${listName}`).trim();
    const cards = Array.isArray(entry && entry.cards) ? entry.cards : [];

    return {
      listName,
      listPath,
      listDisplayName: getBoardListDisplayName(listName),
      cards,
      isCompletedList: typeof isBoardListCompletedByWorkflow === 'function'
        ? isBoardListCompletedByWorkflow(listName)
        : false,
    };
  });
}

function getBoardTableListOptions(listEntries) {
  return (Array.isArray(listEntries) ? listEntries : [])
    .filter((entry) => entry && entry.listPath && entry.listName)
    .map((entry) => ({
      listName: entry.listName,
      listPath: entry.listPath,
      listDisplayName: entry.listDisplayName || getBoardListDisplayName(entry.listName),
    }));
}

function boardTableEntryMatchesFilters(entry) {
  const labels = Array.isArray(entry.labels) ? entry.labels : [];
  const taskDueDates = Array.isArray(entry.taskDueDates) ? entry.taskDueDates : [];
  const incompleteTaskDueDates = Array.isArray(entry.incompleteTaskDueDates)
    ? entry.incompleteTaskDueDates
    : taskDueDates;
  const cardDueDates = getCardFilterDueDates(entry.due, taskDueDates);
  const activeFilterDueDates = getActiveBoardFilterDueDates(
    entry.due,
    taskDueDates,
    incompleteTaskDueDates,
  );

  return cardMatchesBoardLabelFilter(labels, cardDueDates, activeFilterDueDates, {
    isCompletedList: Boolean(entry.isCompletedList),
  }) && cardMatchesBoardSearch(entry.title, entry.body);
}

async function collectBoardTableCards(boardRoot, listsWithCards) {
  const listEntries = getBoardTableListEntries(boardRoot, listsWithCards);
  const rowsByList = await Promise.all(
    listEntries.map(async (listEntry) => {
      const rows = await Promise.all(
        listEntry.cards.map(async (cardName) => {
          const cardPath = `${listEntry.listPath}/${cardName}`;
          const card = await window.board.readCard(cardPath);
          const frontmatter = card && card.frontmatter && typeof card.frontmatter === 'object'
            ? card.frontmatter
            : {};
          const body = String(card && typeof card.body === 'string' ? card.body : '');

          return {
            boardRoot,
            cardPath,
            cardName,
            listName: listEntry.listName,
            listPath: listEntry.listPath,
            listDisplayName: listEntry.listDisplayName,
            isCompletedList: Boolean(listEntry.isCompletedList),
            title: normalizeBoardTableTitle(frontmatter.title),
            due: String(frontmatter.due || '').trim(),
            labels: Array.isArray(frontmatter.labels)
              ? frontmatter.labels.map((labelId) => String(labelId))
              : [],
            body,
            taskSummary: getTaskListSummary(body),
            taskDueDates: getTaskListDueDates(body),
            incompleteTaskDueDates: getIncompleteTaskListDueDates(body),
          };
        }),
      );

      return rows;
    }),
  );

  const allCards = rowsByList.flat();
  return {
    listEntries,
    allCards,
    visibleCards: allCards.filter(boardTableEntryMatchesFilters),
  };
}

function createBoardTableHeader() {
  const thead = document.createElement('thead');
  const row = document.createElement('tr');

  for (const column of BOARD_TABLE_COLUMNS) {
    const header = document.createElement('th');
    header.scope = 'col';
    header.className = `board-table-heading board-table-heading-${column.id}`;
    header.textContent = column.label;
    row.appendChild(header);
  }

  thead.appendChild(row);
  return thead;
}

function createBoardTableTitleCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-title';

  const titleButton = document.createElement('button');
  titleButton.type = 'button';
  titleButton.className = 'board-table-card-title-button';
  titleButton.textContent = entry.title;
  titleButton.title = 'Open card';
  titleButton.setAttribute('aria-label', `Open ${entry.title}`);
  titleButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleEditCardModal(entry.cardPath);
  });
  cell.appendChild(titleButton);

  return cell;
}

async function moveBoardTableCardToList(entry, targetListPath) {
  const normalizedTargetListPath = String(targetListPath || '').trim();
  if (!entry || !entry.cardPath || !normalizedTargetListPath || normalizedTargetListPath === entry.listPath) {
    return '';
  }

  if (!window.board || typeof window.board.moveCardToTop !== 'function') {
    return '';
  }

  const result = await window.board.moveCardToTop(entry.cardPath, normalizedTargetListPath);
  return result && result.cardPath ? result.cardPath : '';
}

function createBoardTableListCell(entry, listOptions) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-list';

  const select = document.createElement('select');
  select.className = 'board-table-list-select';
  select.setAttribute('aria-label', `Move ${entry.title} to list`);

  for (const optionEntry of listOptions) {
    const option = document.createElement('option');
    option.value = optionEntry.listPath;
    option.textContent = optionEntry.listDisplayName;
    option.selected = optionEntry.listPath === entry.listPath;
    select.appendChild(option);
  }

  select.value = entry.listPath;
  select.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  select.addEventListener('change', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const previousListPath = entry.listPath;
    const nextListPath = String(select.value || '').trim();
    if (!nextListPath || nextListPath === previousListPath) {
      select.value = previousListPath;
      return;
    }

    select.disabled = true;
    try {
      const newCardPath = await moveBoardTableCardToList(entry, nextListPath);
      if (!newCardPath) {
        select.value = previousListPath;
        return;
      }

      await renderBoard();
    } catch (error) {
      console.error('Failed to move table row card to another list.', error);
      select.value = previousListPath;
    } finally {
      select.disabled = false;
    }
  });

  cell.appendChild(select);
  return cell;
}

function getBoardTableDisplayDueDates(entry) {
  if (entry.due) {
    return {
      dueDates: [entry.due],
      prefix: '',
    };
  }

  const taskDueDates = Array.isArray(entry.incompleteTaskDueDates) && entry.incompleteTaskDueDates.length > 0
    ? entry.incompleteTaskDueDates
    : [];

  return {
    dueDates: getCardFilterDueDates('', taskDueDates),
    prefix: 'Task: ',
  };
}

async function createBoardTableDueCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-due';

  const displayDue = getBoardTableDisplayDueDates(entry);
  const firstDueDate = displayDue.dueDates[0] || '';
  if (!firstDueDate) {
    const empty = document.createElement('span');
    empty.className = 'board-table-empty-value';
    empty.textContent = 'None';
    cell.appendChild(empty);
    return cell;
  }

  const dueEl = document.createElement('span');
  dueEl.className = 'board-table-due';
  const formattedDue = await window.board.formatDueDate(firstDueDate);
  const extraCount = Math.max(0, displayDue.dueDates.length - 1);
  dueEl.textContent = `${displayDue.prefix}${formattedDue}${extraCount > 0 ? ` +${extraCount}` : ''}`;
  dueEl.title = formatLongDueDateLabel(firstDueDate);
  setDueDateVisualClass(dueEl, firstDueDate);
  cell.appendChild(dueEl);

  return cell;
}

function createBoardTableTaskCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-tasks';

  const taskProgressBadge = createTaskProgressBadge(
    entry.taskSummary,
    'board-table-task-progress',
  );
  if (taskProgressBadge) {
    cell.appendChild(taskProgressBadge);
  } else {
    const empty = document.createElement('span');
    empty.className = 'board-table-empty-value';
    empty.textContent = 'None';
    cell.appendChild(empty);
  }

  return cell;
}

function createBoardTableLabelsCell(entry) {
  const cell = document.createElement('td');
  cell.className = 'board-table-cell board-table-cell-labels';

  const labelsWrap = document.createElement('div');
  labelsWrap.className = 'board-table-labels';

  for (const labelId of entry.labels) {
    const label = getBoardLabelById(labelId);
    const labelChip = document.createElement('span');
    labelChip.className = 'card-label-chip';

    if (label) {
      const chipColor = getBoardLabelColor(label);
      labelChip.textContent = label.name;
      labelChip.style.backgroundColor = `${chipColor}22`;
      labelChip.style.borderColor = chipColor;
    } else {
      labelChip.classList.add('card-label-chip-unknown');
      labelChip.textContent = 'Unknown label';
      labelChip.title = labelId;
    }

    labelsWrap.appendChild(labelChip);
  }

  if (labelsWrap.childElementCount === 0) {
    const empty = document.createElement('span');
    empty.className = 'board-table-empty-value';
    empty.textContent = 'None';
    labelsWrap.appendChild(empty);
  }

  cell.appendChild(labelsWrap);
  return cell;
}

async function createBoardTableRow(entry, listOptions) {
  const row = document.createElement('tr');
  row.className = 'board-table-row';
  row.dataset.path = entry.cardPath;
  row.dataset.listPath = entry.listPath;
  row.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest && target.closest('button, select, input, textarea, a')) {
      return;
    }

    toggleEditCardModal(entry.cardPath);
  });

  row.appendChild(await createBoardTableDueCell(entry));
  row.appendChild(createBoardTableTaskCell(entry));
  row.appendChild(createBoardTableTitleCell(entry));
  row.appendChild(createBoardTableListCell(entry, listOptions));
  row.appendChild(createBoardTableLabelsCell(entry));

  return row;
}

function createBoardTableSummary(visibleCount, totalCount) {
  const summary = document.createElement('p');
  summary.className = 'board-table-summary';

  const cardLabel = visibleCount === 1 ? 'card' : 'cards';
  summary.textContent = visibleCount === totalCount
    ? `${visibleCount} ${cardLabel}`
    : `${visibleCount} of ${totalCount} ${totalCount === 1 ? 'card' : 'cards'}`;

  return summary;
}

function createBoardTableEmptyState(totalCount) {
  const empty = document.createElement('div');
  empty.className = 'board-table-empty';
  empty.textContent = totalCount > 0
    ? 'No cards match the current filters.'
    : 'No cards yet.';
  return empty;
}

async function renderTableBoard(boardRoot, listsWithCards) {
  const tableState = await collectBoardTableCards(boardRoot, listsWithCards);
  const listOptions = getBoardTableListOptions(tableState.listEntries);

  const tableView = document.createElement('section');
  tableView.className = 'board-table-view';

  const tableHeader = document.createElement('div');
  tableHeader.className = 'board-table-header';
  tableHeader.appendChild(createBoardTableSummary(
    tableState.visibleCards.length,
    tableState.allCards.length,
  ));
  tableView.appendChild(tableHeader);

  if (tableState.visibleCards.length === 0) {
    tableView.appendChild(createBoardTableEmptyState(tableState.allCards.length));
    return {
      root: tableView,
      listEntries: tableState.listEntries,
      allCards: tableState.allCards,
      visibleCards: tableState.visibleCards,
    };
  }

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'board-table-scroll';

  const table = document.createElement('table');
  table.className = 'board-table';
  table.appendChild(createBoardTableHeader());

  const tbody = document.createElement('tbody');
  const rows = await Promise.all(
    tableState.visibleCards.map((entry) => createBoardTableRow(entry, listOptions)),
  );

  for (const row of rows) {
    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  tableView.appendChild(scrollWrap);

  return {
    root: tableView,
    listEntries: tableState.listEntries,
    allCards: tableState.allCards,
    visibleCards: tableState.visibleCards,
  };
}
