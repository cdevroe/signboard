const BOARD_CARD_ACTIVATION_INTERACTIVE_SELECTOR = [
  'button:not(.card-title-button)',
  'a',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '.card-label-chip',
].join(', ');

const BOARD_CARD_POINTER_ACTIVATION_MAX_DISTANCE_PX = 6;
const BOARD_CARD_POINTER_ACTIVATION_MAX_AGE_MS = 1000;

let boardCardPointerActivationState = null;
let boardCardPointerActivationFallbackInitialized = false;
let activeCardDatePopover = null;

function parseBoardCardDateValue(dateValue) {
  if (typeof parseIsoDateStringToLocalDate === 'function') {
    return parseIsoDateStringToLocalDate(dateValue);
  }

  const normalized = String(dateValue || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsedDate = new Date(year, monthIndex, day);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== monthIndex ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

function getCardDateRangeDisplayLabel(startDateValue, dueDateValue, startLabel, dueLabel) {
  if (startDateValue === dueDateValue || startLabel === dueLabel) {
    return dueLabel;
  }

  const startDate = parseBoardCardDateValue(startDateValue);
  const dueDate = parseBoardCardDateValue(dueDateValue);

  if (
    startDate &&
    dueDate &&
    startDate.getFullYear() === dueDate.getFullYear() &&
    startDate.getMonth() === dueDate.getMonth()
  ) {
    return `${startLabel}-${dueDate.getDate()}`;
  }

  return `${startLabel} - ${dueLabel}`;
}

function isBoardCardActivationElement(target) {
  return typeof Element !== 'undefined' && target instanceof Element;
}

function isBoardCardInteractiveActivationTarget(target) {
  if (!isBoardCardActivationElement(target) || typeof target.closest !== 'function') {
    return false;
  }

  return Boolean(target.closest(BOARD_CARD_ACTIVATION_INTERACTIVE_SELECTOR));
}

function isBoardCardEditorVisible() {
  const modalEditCard = document.getElementById('modalEditCard');
  return Boolean(
    modalEditCard &&
    !modalEditCard.classList.contains('hidden') &&
    modalEditCard.getAttribute('aria-hidden') !== 'true' &&
    modalEditCard.style.display !== 'none'
  );
}

function isBoardCardPointerActivationBlocked() {
  if (typeof document === 'undefined' || !document.body) {
    return true;
  }

  return Boolean(
    document.body.classList.contains('board-card-drag-active') ||
    document.querySelector('.card-sortable--dragging, .card-sortable--fallback')
  );
}

function getNormalizedBoardCardActivationPath(cardPath) {
  const normalized = typeof normalizeBoardPath === 'function'
    ? normalizeBoardPath(cardPath)
    : String(cardPath || '').replace(/\\/g, '/').trim();

  return normalized;
}

function isBoardCardActivationPathOnCurrentBoard(cardPath) {
  const normalizedCardPath = getNormalizedBoardCardActivationPath(cardPath);
  const normalizedBoardRoot = getNormalizedBoardCardActivationPath(window.boardRoot || '');

  if (!normalizedCardPath || !normalizedBoardRoot) {
    return false;
  }

  const normalizedBoardRootWithSlash = normalizedBoardRoot.endsWith('/')
    ? normalizedBoardRoot
    : `${normalizedBoardRoot}/`;

  return normalizedCardPath.startsWith(normalizedBoardRootWithSlash);
}

function beginBoardCardPointerActivationFallback(event) {
  boardCardPointerActivationState = null;

  if (!event || event.isPrimary === false || (typeof event.button === 'number' && event.button !== 0)) {
    return;
  }

  const target = isBoardCardActivationElement(event.target) ? event.target : null;
  if (!target || isBoardCardInteractiveActivationTarget(target)) {
    return;
  }

  const cardEl = target.closest('.card[data-path]');
  if (!cardEl || isBoardCardPointerActivationBlocked()) {
    return;
  }

  const cardPath = String(cardEl.dataset.path || '').trim();
  if (!cardPath) {
    return;
  }

  boardCardPointerActivationState = {
    cardPath,
    pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
    clientX: typeof event.clientX === 'number' ? event.clientX : 0,
    clientY: typeof event.clientY === 'number' ? event.clientY : 0,
    startedAt: Date.now(),
  };
}

function cancelBoardCardPointerActivationFallback() {
  boardCardPointerActivationState = null;
}

function completeBoardCardPointerActivationFallback(event) {
  const activationState = boardCardPointerActivationState;
  boardCardPointerActivationState = null;

  if (!activationState || !event || event.isPrimary === false) {
    return;
  }

  if (
    activationState.pointerId !== null &&
    typeof event.pointerId === 'number' &&
    event.pointerId !== activationState.pointerId
  ) {
    return;
  }

  const clientX = typeof event.clientX === 'number' ? event.clientX : activationState.clientX;
  const clientY = typeof event.clientY === 'number' ? event.clientY : activationState.clientY;
  const movedDistance = Math.hypot(clientX - activationState.clientX, clientY - activationState.clientY);
  if (movedDistance > BOARD_CARD_POINTER_ACTIVATION_MAX_DISTANCE_PX) {
    return;
  }

  const activationAge = Date.now() - activationState.startedAt;
  if (activationAge > BOARD_CARD_POINTER_ACTIVATION_MAX_AGE_MS) {
    return;
  }

  if (isBoardCardInteractiveActivationTarget(event.target) || isBoardCardPointerActivationBlocked()) {
    return;
  }

  window.setTimeout(async () => {
    if (
      isBoardCardEditorVisible() ||
      isBoardCardPointerActivationBlocked() ||
      !isBoardCardActivationPathOnCurrentBoard(activationState.cardPath) ||
      typeof toggleEditCardModal !== 'function'
    ) {
      return;
    }

    try {
      await toggleEditCardModal(activationState.cardPath);
    } catch (error) {
      console.error('Failed to open card after delayed pointer activation.', error);
    }
  }, 0);
}

function initializeBoardCardPointerActivationFallback() {
  if (boardCardPointerActivationFallbackInitialized || typeof document === 'undefined') {
    return;
  }

  boardCardPointerActivationFallbackInitialized = true;
  document.addEventListener('pointerdown', beginBoardCardPointerActivationFallback, true);
  document.addEventListener('pointerup', completeBoardCardPointerActivationFallback, true);
  document.addEventListener('pointercancel', cancelBoardCardPointerActivationFallback, true);
}

function closeCardDatePopover(options = {}) {
  const shouldKeepDatePicker = Boolean(options && options.keepDatePicker);
  if (!shouldKeepDatePicker && typeof destroyActiveDueDatePicker === 'function') {
    destroyActiveDueDatePicker();
  }

  if (activeCardDatePopover && activeCardDatePopover.parentNode) {
    activeCardDatePopover.parentNode.removeChild(activeCardDatePopover);
  }

  activeCardDatePopover = null;
}

function isCardDatePopoverOpen() {
  return Boolean(activeCardDatePopover && activeCardDatePopover.parentNode);
}

function closeCardDatePopoverIfClickOutside(target) {
  const popover = activeCardDatePopover;
  if (!popover || !isBoardCardActivationElement(target)) {
    return;
  }

  const anchorElement = popover.__anchorElement;
  if (
    (anchorElement && anchorElement.contains(target)) ||
    popover.contains(target) ||
    target.closest('.sb-themed-fdatepicker, [data-fdatepicker="due-date-anchor"]')
  ) {
    return;
  }

  closeCardDatePopover();
}

function getUsableCardDateAnchorRect(anchorElement) {
  if (
    !anchorElement ||
    anchorElement.isConnected === false ||
    typeof anchorElement.getBoundingClientRect !== 'function'
  ) {
    return null;
  }

  const rect = anchorElement.getBoundingClientRect();
  if (
    !rect ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.bottom) ||
    !Number.isFinite(rect.right) ||
    (rect.width <= 0 && rect.height <= 0)
  ) {
    return null;
  }

  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function positionCardDatePopover(popover, anchorElement) {
  if (
    !popover ||
    typeof popover.getBoundingClientRect !== 'function'
  ) {
    return;
  }

  const viewportPadding = 8;
  const anchorRect = getUsableCardDateAnchorRect(anchorElement) || popover.__lastAnchorRect;
  if (!anchorRect) {
    return;
  }

  popover.__lastAnchorRect = anchorRect;
  const popoverRect = popover.getBoundingClientRect();
  const nextWidth = popoverRect.width || 260;
  let nextLeft = anchorRect.left;
  let nextTop = anchorRect.bottom + 6;

  if (nextLeft + nextWidth > window.innerWidth - viewportPadding) {
    nextLeft = window.innerWidth - nextWidth - viewportPadding;
  }
  if (nextTop + popoverRect.height > window.innerHeight - viewportPadding) {
    nextTop = anchorRect.top - popoverRect.height - 6;
  }

  popover.style.left = `${Math.round(Math.max(viewportPadding, nextLeft))}px`;
  popover.style.top = `${Math.round(Math.max(viewportPadding, nextTop))}px`;
}

function focusFirstCardDatePopoverControl(popover) {
  if (!popover || typeof popover.querySelector !== 'function') {
    return;
  }

  const firstControl = popover.querySelector('button:not([disabled])');
  if (firstControl && typeof firstControl.focus === 'function') {
    firstControl.focus();
  }
}

function handleCardDatePopoverKeyboard(event, popover) {
  if (!event || !popover) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    const anchorElement = popover.__anchorElement;
    closeCardDatePopover();
    if (anchorElement && typeof anchorElement.focus === 'function') {
      anchorElement.focus();
    }
    return;
  }

  const verticalDirection = event.key === 'ArrowDown'
    ? 1
    : (event.key === 'ArrowUp' ? -1 : 0);
  if (!verticalDirection && event.key !== 'Home' && event.key !== 'End') {
    return;
  }

  const controls = Array.from(popover.querySelectorAll('button:not([disabled])'));
  if (controls.length === 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const activeIndex = controls.indexOf(document.activeElement);
  let nextIndex = activeIndex >= 0 ? activeIndex : 0;
  if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = controls.length - 1;
  } else {
    nextIndex = (nextIndex + verticalDirection + controls.length) % controls.length;
  }

  controls[nextIndex].focus();
}

async function getCardDatePopoverDisplayValue(options, dateValue) {
  const normalizedDateValue = String(dateValue || '').trim();
  if (!normalizedDateValue) {
    return 'Not set';
  }

  if (options && typeof options.formatDateValue === 'function') {
    return await options.formatDateValue(normalizedDateValue);
  }

  return normalizedDateValue;
}

function createCardDatePopoverFieldRow(popover, fieldName, labelText, dateValue, displayValue) {
  const row = document.createElement('div');
  row.className = 'card-date-popover-row';
  row.dataset.field = fieldName;
  row.classList.toggle('has-clear', Boolean(dateValue));

  const fieldButton = document.createElement('button');
  fieldButton.type = 'button';
  fieldButton.className = 'card-date-popover-field';
  fieldButton.setAttribute('aria-label', `${dateValue ? 'Change' : 'Set'} ${labelText.toLowerCase()}`);

  const label = document.createElement('span');
  label.className = 'card-date-popover-field-label';
  label.textContent = labelText;

  const value = document.createElement('span');
  value.className = 'card-date-popover-field-value';
  value.textContent = displayValue;
  if (!dateValue) {
    value.classList.add('is-empty');
  }

  fieldButton.append(label, value);
  fieldButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const options = popover.__dateOptions || {};
    const getValue = fieldName === 'start'
      ? options.getStartDateValue
      : options.getDueDateValue;
    const onSelect = fieldName === 'start'
      ? options.onSelectStart
      : options.onSelectDue;
    const currentValue = typeof getValue === 'function'
      ? String(getValue() || '').trim()
      : '';

    openDueDatePickerAtTrigger({
      triggerElement: fieldButton,
      dueDateValue: currentValue,
      onSelect: async (nextDateValue) => {
        if (typeof onSelect === 'function') {
          await onSelect(nextDateValue);
        }

        if (activeCardDatePopover === popover && popover.parentNode) {
          await renderCardDatePopover(popover);
          positionCardDatePopover(popover, popover.__anchorElement);
        }
      },
    });
  });

  row.appendChild(fieldButton);

  if (dateValue) {
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'card-date-popover-clear';
    clearButton.title = `Clear ${labelText.toLowerCase()}`;
    clearButton.setAttribute('aria-label', `Clear ${labelText.toLowerCase()}`);
    clearButton.innerHTML = '<i data-feather="x"></i>';
    clearButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (typeof destroyActiveDueDatePicker === 'function') {
        destroyActiveDueDatePicker();
      }

      const options = popover.__dateOptions || {};
      const onSelect = fieldName === 'start'
        ? options.onSelectStart
        : options.onSelectDue;
      if (typeof onSelect === 'function') {
        await onSelect('');
      }

      if (activeCardDatePopover === popover && popover.parentNode) {
        await renderCardDatePopover(popover);
        positionCardDatePopover(popover, popover.__anchorElement);
        focusFirstCardDatePopoverControl(popover);
      }
    });
    row.appendChild(clearButton);
  }

  return row;
}

async function renderCardDatePopover(popover) {
  if (!popover || !popover.__dateOptions) {
    return;
  }

  const options = popover.__dateOptions;
  const startDateValue = typeof options.getStartDateValue === 'function'
    ? String(options.getStartDateValue() || '').trim()
    : '';
  const dueDateValue = typeof options.getDueDateValue === 'function'
    ? String(options.getDueDateValue() || '').trim()
    : '';
  const startDisplayValue = await getCardDatePopoverDisplayValue(options, startDateValue);
  const dueDisplayValue = await getCardDatePopoverDisplayValue(options, dueDateValue);

  const content = document.createElement('div');
  content.className = 'card-date-popover-content';

  const header = document.createElement('div');
  header.className = 'card-date-popover-header';

  const title = document.createElement('span');
  title.className = 'card-date-popover-title';
  title.textContent = 'Dates';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'card-date-popover-close';
  closeButton.title = 'Close dates';
  closeButton.setAttribute('aria-label', 'Close dates');
  closeButton.innerHTML = '<i data-feather="x"></i>';
  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeCardDatePopover();
    if (popover.__anchorElement && typeof popover.__anchorElement.focus === 'function') {
      popover.__anchorElement.focus();
    }
  });

  header.append(title, closeButton);
  content.appendChild(header);
  content.appendChild(createCardDatePopoverFieldRow(popover, 'start', 'Start date', startDateValue, startDisplayValue));
  content.appendChild(createCardDatePopoverFieldRow(popover, 'due', 'Due date', dueDateValue, dueDisplayValue));

  popover.replaceChildren(content);
  if (typeof feather !== 'undefined' && feather && typeof feather.replace === 'function') {
    feather.replace();
  }
}

async function toggleCardDateSelector(options = {}) {
  const anchorElement = options.anchorElement;
  if (!anchorElement || typeof document === 'undefined' || !document.body) {
    return;
  }

  if (activeCardDatePopover && activeCardDatePopover.__anchorElement === anchorElement) {
    closeCardDatePopover();
    return;
  }

  closeCardDatePopover();
  if (typeof closeBoardLabelFilterPopover === 'function') {
    closeBoardLabelFilterPopover();
  }
  if (typeof closeCardLabelPopover === 'function') {
    closeCardLabelPopover();
  }
  if (typeof closeListActionsPopover === 'function') {
    closeListActionsPopover();
  }
  if (typeof closeBoardViewPopover === 'function') {
    closeBoardViewPopover();
  }
  if (typeof closeBoardMenuPopover === 'function') {
    closeBoardMenuPopover();
  }

  const popover = document.createElement('div');
  popover.className = 'card-date-popover';
  popover.setAttribute('role', 'group');
  popover.setAttribute('aria-label', 'Card dates');
  popover.setAttribute('aria-hidden', 'false');
  popover.__anchorElement = anchorElement;
  popover.__dateOptions = options;
  popover.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  popover.addEventListener('keydown', (event) => {
    handleCardDatePopoverKeyboard(event, popover);
  });

  document.body.appendChild(popover);
  activeCardDatePopover = popover;
  await renderCardDatePopover(popover);
  positionCardDatePopover(popover, anchorElement);
  focusFirstCardDatePopoverControl(popover);
}

async function createCardElement(cardPath, options = {}) {
  const suppliedCard = options && typeof options === 'object'
    ? (typeof getBoardSnapshotCardData === 'function'
      ? getBoardSnapshotCardData(options.card || options.cardRecord)
      : (options.card || options.cardRecord || null))
    : null;
  const card = suppliedCard || await window.board.readCard(cardPath);
  const listDirectoryName = String(cardPath || '').replace(/\\/g, '/').split('/').slice(-2, -1)[0] || '';
  const isCompletedList = typeof isBoardListCompletedByWorkflow === 'function'
    ? isBoardListCompletedByWorkflow(listDirectoryName)
    : false;
  const titleContent = card.frontmatter.title || '';
  let startDateValue = String(card.frontmatter.start || '').trim();
  let dueDateValue = String(card.frontmatter.due || '').trim();
  let selectedLabelIds = Array.isArray(card.frontmatter.labels)
    ? card.frontmatter.labels.map((labelId) => String(labelId))
    : [];
  const taskSummary = card.taskSummary && typeof card.taskSummary === 'object'
    ? card.taskSummary
    : getTaskListSummary(card.body);
  const taskStartDates = Array.isArray(card.taskStartDates)
    ? card.taskStartDates
    : (typeof getTaskListStartDates === 'function' ? getTaskListStartDates(card.body) : []);
  const incompleteTaskStartDates = Array.isArray(card.incompleteTaskStartDates)
    ? card.incompleteTaskStartDates
    : (typeof getIncompleteTaskListStartDates === 'function' ? getIncompleteTaskListStartDates(card.body) : taskStartDates);
  const taskDueDates = Array.isArray(card.taskDueDates) ? card.taskDueDates : getTaskListDueDates(card.body);
  const incompleteTaskDueDates = Array.isArray(card.incompleteTaskDueDates)
    ? card.incompleteTaskDueDates
    : getIncompleteTaskListDueDates(card.body);
  const linkedObjectCount = typeof getFrontmatterLinkedObjectCount === 'function'
    ? getFrontmatterLinkedObjectCount(card.frontmatter)
    : 0;

  const previewText = card.body
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) || '';

  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.dataset.path = cardPath;
  cardEl.setAttribute('role', 'listitem');

  const cardFrame = document.createElement('div');
  cardFrame.className = 'card-drag-frame';
  cardEl.appendChild(cardFrame);

  const title = document.createElement('h3');
  const visibleTitle = titleContent.replace('# ', '') || 'Untitled';
  const titleId = typeof createStableDomId === 'function'
    ? createStableDomId('card-title', cardPath)
    : '';
  if (titleId) {
    title.id = titleId;
    cardEl.setAttribute('aria-labelledby', titleId);
  }

  const titleButton = document.createElement('button');
  titleButton.type = 'button';
  titleButton.className = 'card-title-button';
  titleButton.textContent = visibleTitle;
  titleButton.setAttribute('aria-label', `Open card: ${visibleTitle}`);
  titleButton.setAttribute('data-sb-tooltip-disabled', 'true');
  title.appendChild(titleButton);
  cardFrame.appendChild(title);

  const body = document.createElement('div');
  body.className = 'card-body';
  const cardPreview = (previewText && previewText.length > 50) ? `${previewText.slice(0, 35)}...` : previewText;
  const preview = document.createElement('p');
  preview.textContent = cardPreview;
  body.appendChild(preview);

  const metadata = document.createElement('div');
  metadata.className = 'metadata';

  const dateButton = document.createElement('button');
  dateButton.type = 'button';
  dateButton.className = 'metadata-action card-date-action';

  const dateIcon = document.createElement('i');
  dateIcon.setAttribute('data-feather', 'calendar');
  dateButton.appendChild(dateIcon);

  const formattedDates = document.createElement('span');
  formattedDates.className = 'card-date-label';
  dateButton.appendChild(formattedDates);
  metadata.appendChild(dateButton);

  const taskProgressBadge = createTaskProgressBadge(
    taskSummary,
    'metadata-action task-progress-badge-inline',
  );
  if (taskProgressBadge) {
    metadata.appendChild(taskProgressBadge);
  }

  const linkedObjectsBadge = typeof createLinkedObjectsMetadataBadge === 'function'
    ? createLinkedObjectsMetadataBadge(linkedObjectCount, 'metadata-action linked-objects-badge-inline')
    : null;
  if (linkedObjectsBadge) {
    metadata.appendChild(linkedObjectsBadge);
  }

  const labelButton = document.createElement('button');
  labelButton.type = 'button';
  labelButton.className = 'metadata-action card-label-button';
  labelButton.title = 'Set labels';
  const labelIcon = document.createElement('i');
  labelIcon.setAttribute('data-feather', 'tag');
  labelButton.appendChild(labelIcon);
  metadata.appendChild(labelButton);

  const cardLabelsWrap = document.createElement('div');
  cardLabelsWrap.className = 'card-labels';
  metadata.appendChild(cardLabelsWrap);

  function getAllCardFilterDates() {
    return getCardFilterDueDates(
      [startDateValue, dueDateValue],
      [...taskStartDates, ...taskDueDates],
    );
  }

  function getActiveCardFilterDates() {
    return getActiveBoardFilterDueDates(
      [startDateValue, dueDateValue],
      [...taskStartDates, ...taskDueDates],
      [...incompleteTaskStartDates, ...incompleteTaskDueDates],
    );
  }

  function setMetadataActionVisibility() {
    const hasStartDate = startDateValue.length > 0;
    const hasDueDate = dueDateValue.length > 0;
    const hasDates = hasStartDate || hasDueDate;
    const hasLabels = selectedLabelIds.length > 0;
    const hasTasks = taskSummary.total > 0;
    const hasLinkedObjects = linkedObjectCount > 0;
    const hasAnyMetadata = hasDates || hasLabels || hasTasks || hasLinkedObjects;

    metadata.classList.toggle('metadata-discovery', !hasAnyMetadata);
    dateButton.classList.toggle('metadata-action-empty', !hasDates);
    labelButton.classList.toggle('metadata-action-empty', !hasLabels);
  }

  async function renderCardDateDisplay() {
    const hasStartDate = startDateValue.length > 0;
    const hasDueDate = dueDateValue.length > 0;
    const [startLabel, dueLabel] = await Promise.all([
      hasStartDate ? window.board.formatDueDate(startDateValue) : '',
      hasDueDate ? window.board.formatDueDate(dueDateValue) : '',
    ]);

    if (hasStartDate && hasDueDate) {
      formattedDates.textContent = getCardDateRangeDisplayLabel(
        startDateValue,
        dueDateValue,
        startLabel,
        dueLabel,
      );
      dateButton.title = `Dates: ${formattedDates.textContent}`;
      dateButton.setAttribute('aria-label', `Dates ${startLabel} through ${dueLabel}. Change dates.`);
    } else if (hasStartDate) {
      formattedDates.textContent = `Starts ${startLabel}`;
      dateButton.title = `Starts ${startLabel}`;
      dateButton.setAttribute('aria-label', `Starts ${startLabel}. Change dates.`);
    } else if (hasDueDate) {
      formattedDates.textContent = `Due ${dueLabel}`;
      dateButton.title = `Due ${dueLabel}`;
      dateButton.setAttribute('aria-label', `Due ${dueLabel}. Change dates.`);
    } else {
      formattedDates.textContent = '';
      dateButton.title = 'Set dates';
      dateButton.setAttribute('aria-label', 'Set dates');
    }

    setDueDateVisualClass(dateButton, dueDateValue || startDateValue || '');
    setMetadataActionVisibility();
  }

  async function openCardDatesChooser() {
    await toggleCardDateSelector({
      anchorElement: dateButton,
      cardPath,
      getStartDateValue: () => startDateValue,
      getDueDateValue: () => dueDateValue,
      formatDateValue: (value) => window.board.formatDueDate(value),
      onSelectStart: async (value) => {
        await updateCardStartDate(value);
      },
      onSelectDue: async (value) => {
        await updateCardDueDate(value);
      },
    });
  }

  function updateLabelMetadataVisibility() {
    const hasLabels = selectedLabelIds.length > 0;
    if (hasLabels) {
      labelButton.title = 'Edit labels';
      labelButton.setAttribute('aria-label', 'Edit labels');
      cardLabelsWrap.setAttribute('data-sb-tooltip', 'Edit labels');
    } else {
      labelButton.title = 'Set labels';
      labelButton.setAttribute('aria-label', 'Set labels');
      cardLabelsWrap.removeAttribute('data-sb-tooltip');
    }
  }

  function renderCardLabels() {
    cardLabelsWrap.innerHTML = '';

    const firstKnownLabel = selectedLabelIds
      .map((labelId) => getBoardLabelById(labelId))
      .find((label) => Boolean(label));

    labelButton.style.color = firstKnownLabel ? getBoardLabelColor(firstKnownLabel) : '';

    for (const labelId of selectedLabelIds) {
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

      cardLabelsWrap.appendChild(labelChip);
    }

    setMetadataActionVisibility();
    updateLabelMetadataVisibility();
  }

  async function updateCardStartDate(nextStartDateValue) {
    startDateValue = String(nextStartDateValue || '').trim();
    const nextStartDate = startDateValue.length > 0 ? startDateValue : null;

    card.frontmatter.start = nextStartDate;
    await window.board.updateFrontmatter(cardPath, { start: nextStartDate });
    await renderCardDateDisplay();

    const cardDates = getAllCardFilterDates();
    const activeFilterDates = getActiveCardFilterDates();
    if (isBoardLabelFilterActive() && !cardMatchesBoardLabelFilter(selectedLabelIds, cardDates, activeFilterDates, { isCompletedList })) {
      await renderBoard();
    }
  }

  async function updateCardDueDate(nextDueDateValue) {
    dueDateValue = String(nextDueDateValue || '').trim();
    const nextDueDate = dueDateValue.length > 0 ? dueDateValue : null;

    card.frontmatter.due = nextDueDate;
    await window.board.updateFrontmatter(cardPath, { due: nextDueDate });
    await renderCardDateDisplay();

    const cardDates = getAllCardFilterDates();
    const activeFilterDates = getActiveCardFilterDates();
    if (isBoardLabelFilterActive() && !cardMatchesBoardLabelFilter(selectedLabelIds, cardDates, activeFilterDates, { isCompletedList })) {
      await renderBoard();
    }
  }

  async function updateCardLabels(nextLabelIds) {
    selectedLabelIds = Array.isArray(nextLabelIds)
      ? nextLabelIds.map((labelId) => String(labelId))
      : [];

    card.frontmatter.labels = selectedLabelIds;
    await window.board.updateFrontmatter(cardPath, { labels: selectedLabelIds });
    renderCardLabels();

    const cardDates = getAllCardFilterDates();
    const activeFilterDates = getActiveCardFilterDates();
    if (isBoardLabelFilterActive() && !cardMatchesBoardLabelFilter(selectedLabelIds, cardDates, activeFilterDates, { isCompletedList })) {
      await renderBoard();
    }
  }

  function openCardLabelChooser(anchorElement) {
    toggleCardLabelSelector(
      anchorElement,
      cardPath,
      selectedLabelIds,
      async (nextLabelIds) => {
        await updateCardLabels(nextLabelIds);
      },
    );
  }

  await renderCardDateDisplay();
  renderCardLabels();

  dateButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openCardDatesChooser();
  });

  labelButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCardLabelChooser(labelButton);
  });

  cardLabelsWrap.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('.card-label-chip') : null;
    if (!target || !cardLabelsWrap.contains(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openCardLabelChooser(cardLabelsWrap);
  });

  body.appendChild(metadata);

  cardFrame.appendChild(body);

  const matchesLabelFilter = cardMatchesBoardLabelFilter(
    selectedLabelIds,
    getAllCardFilterDates(),
    getActiveCardFilterDates(),
    { isCompletedList },
  );
  const matchesSearchFilter = cardMatchesBoardSearch(card.frontmatter.title, card.body);

  if (!matchesLabelFilter || !matchesSearchFilter) {
    cardEl.classList.add('card-filtered-out');
  }

  const openCardEditor = async () => {
    let modalEditCard = document.getElementById('modalEditCard');
    if (
      modalEditCard &&
      !modalEditCard.classList.contains('hidden') &&
      modalEditCard.getAttribute('aria-hidden') !== 'true' &&
      modalEditCard.style.display !== 'none'
    ) {
      return;
    }

    toggleEditCardModal( cardPath );
  };

  titleButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openCardEditor();
  });

  cardEl.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (isBoardCardInteractiveActivationTarget(target)) {
      return;
    }

    await openCardEditor();
  });

  // Not used yet! Drop zone for attachments
  cardEl.addEventListener('dragover', e => e.preventDefault());
  cardEl.addEventListener('drop', async e => {
    e.preventDefault();
    // const filePath = e.dataTransfer.files[0].path;
    // const dst = await window.board.copyExternal(filePath, path.dirname(cardPath));
    // const newMd = `${md}\n![${path.basename(filePath)}](${path.basename(dst)})`;
    // await window.board.writeCard(cardPath, newMd);
    // const updatedCard = await createCardElement(cardPath);
    // cardEl.parentNode.replaceChild(updatedCard, cardEl);
  });

  return cardEl;
}
