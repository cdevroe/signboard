function getListActionsPopoverState() {
  if (!window.__listActionsPopoverState) {
    window.__listActionsPopoverState = {
      anchorElement: null,
      listPath: '',
      listDisplayName: '',
      cardCount: 0,
    };
  }

  return window.__listActionsPopoverState;
}

function normalizeListPathForCardCreation(listPath) {
  const normalized = String(listPath || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function getAddCardModalCoordinates(anchorElement) {
  const viewportPadding = 8;
  const modalWidth = Math.min(360, Math.max(240, window.innerWidth - (viewportPadding * 2)));

  if (!(anchorElement instanceof Element)) {
    return {
      left: Math.round(viewportPadding + window.scrollX),
      top: Math.round(viewportPadding + window.scrollY),
    };
  }

  const bounds = anchorElement.getBoundingClientRect();
  const preferredLeft = bounds.left + (bounds.width / 2) - 90;
  const clampedLeft = Math.min(
    window.innerWidth - modalWidth - viewportPadding,
    Math.max(viewportPadding, preferredLeft),
  );

  return {
    left: Math.round(clampedLeft + window.scrollX),
    top: Math.round(bounds.bottom + 15 + window.scrollY),
  };
}

function configureAddCardModal(listPath) {
  const hiddenListPath = document.getElementById('hiddenListPath');
  const btnAddCard = document.getElementById('btnAddCard');

  if (!hiddenListPath || !btnAddCard) {
    return;
  }

  hiddenListPath.value = normalizeListPathForCardCreation(listPath);
  btnAddCard.onclick = async (event) => {
    event.stopPropagation();

    const userInput = document.getElementById('userInput');
    const activeListPath = document.getElementById('hiddenListPath');
    if (!userInput || !activeListPath) {
      return;
    }

    await processAddNewCard(userInput.value, activeListPath.value, {
      openAfterCreate: Boolean(event && event.shiftKey),
    });
    userInput.value = '';
    activeListPath.value = '';
  };
}

function openAddCardModalForList(listPath, anchorElement) {
  const { left, top } = getAddCardModalCoordinates(anchorElement);

  closeListActionsPopover();
  configureAddCardModal(listPath);
  toggleAddCardModal(left, top);

  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.focus();
  }
}

function closeListActionsPopover() {
  const popover = document.getElementById('listActionsPopover');
  const state = getListActionsPopoverState();
  if (!popover) {
    return;
  }

  popover.classList.add('hidden');
  popover.setAttribute('aria-hidden', 'true');
  popover.innerHTML = '';
  popover.setAttribute('role', 'group');
  popover.setAttribute('aria-label', `Actions for ${state.listDisplayName || 'list'}`);

  state.anchorElement = null;
  state.listPath = '';
  state.listDisplayName = '';
  state.cardCount = 0;
}

function positionListActionsPopover(anchorElement, popover) {
  if (!(anchorElement instanceof Element) || !(popover instanceof Element)) {
    return;
  }

  const viewportPadding = 8;
  const anchorBounds = anchorElement.getBoundingClientRect();

  popover.style.position = 'fixed';
  popover.style.left = '0px';
  popover.style.top = '0px';

  const popoverRect = popover.getBoundingClientRect();
  const preferredLeft = anchorBounds.right - popoverRect.width;
  const clampedLeft = Math.min(
    window.innerWidth - popoverRect.width - viewportPadding,
    Math.max(viewportPadding, preferredLeft),
  );

  let nextTop = anchorBounds.bottom + 8;
  if (nextTop + popoverRect.height > window.innerHeight - viewportPadding) {
    const aboveAnchor = anchorBounds.top - popoverRect.height - 8;
    if (aboveAnchor >= viewportPadding) {
      nextTop = aboveAnchor;
    } else {
      nextTop = Math.max(viewportPadding, window.innerHeight - popoverRect.height - viewportPadding);
    }
  }

  popover.style.left = `${Math.round(clampedLeft)}px`;
  popover.style.top = `${Math.round(nextTop)}px`;
}

function closeListActionsPopoverIfClickOutside(target) {
  const popover = document.getElementById('listActionsPopover');
  if (!popover || popover.classList.contains('hidden')) {
    return;
  }

  const state = getListActionsPopoverState();
  if (popover.contains(target) || (state.anchorElement && state.anchorElement.contains(target))) {
    return;
  }

  closeListActionsPopover();
}

function getListActionsPopoverOptions(popover = document.getElementById('listActionsPopover')) {
  if (!popover) {
    return [];
  }

  return Array.from(popover.querySelectorAll('.list-actions-option:not(:disabled)'))
    .filter((option) => option instanceof HTMLButtonElement)
    .filter((option) => {
      const style = window.getComputedStyle(option);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

function focusListActionsPopoverOption(index) {
  const options = getListActionsPopoverOptions();
  if (options.length === 0) {
    return false;
  }

  const safeIndex = ((index % options.length) + options.length) % options.length;
  options[safeIndex].focus();
  return true;
}

function moveListActionsPopoverFocus(offset) {
  const options = getListActionsPopoverOptions();
  if (options.length === 0) {
    return false;
  }

  const currentIndex = options.indexOf(document.activeElement);
  const fallbackIndex = Number(offset) < 0 ? options.length - 1 : 0;
  const nextIndex = currentIndex >= 0 ? currentIndex + Number(offset || 0) : fallbackIndex;
  return focusListActionsPopoverOption(nextIndex);
}

function handleListActionsPopoverKeydown(event) {
  const popover = document.getElementById('listActionsPopover');
  if (!event || !popover || popover.classList.contains('hidden')) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    const state = getListActionsPopoverState();
    const anchorElement = state.anchorElement;
    closeListActionsPopover();
    if (anchorElement && typeof anchorElement.focus === 'function') {
      anchorElement.focus();
    }
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    moveListActionsPopoverFocus(1);
    return;
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault();
    event.stopPropagation();
    moveListActionsPopoverFocus(-1);
    return;
  }

  if (event.key === 'Home') {
    event.preventDefault();
    event.stopPropagation();
    focusListActionsPopoverOption(0);
    return;
  }

  if (event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    focusListActionsPopoverOption(getListActionsPopoverOptions().length - 1);
  }
}

async function handleArchiveCardsInList(listPath, listDisplayName) {
  const cardFiles = await window.board.listCards(listPath);
  if (!Array.isArray(cardFiles) || cardFiles.length === 0) {
    return;
  }

  const displayName = String(listDisplayName || '').trim() || 'this list';
  const warningMessage = `Archive all cards in "${displayName}"?\n\nThis will move ${cardFiles.length} card${cardFiles.length === 1 ? '' : 's'} into XXX-Archive.`;
  if (!window.confirm(warningMessage)) {
    return;
  }

  closeListActionsPopover();

  for (const cardFile of cardFiles) {
    await window.board.archiveCard(`${normalizeListPathForCardCreation(listPath)}${cardFile}`);
  }

  await renderBoard();
  if (typeof announceSignboardStatus === 'function') {
    announceSignboardStatus(`Archived ${cardFiles.length} card${cardFiles.length === 1 ? '' : 's'}.`);
  }
}

async function handleArchiveList(listPath) {
  closeListActionsPopover();
  await window.board.archiveList(listPath);
  await renderBoard();
  if (typeof announceSignboardStatus === 'function') {
    announceSignboardStatus('Archived list.');
  }
}

async function handleMoveListByOffset(listPath, offset) {
  const normalizedBoardRoot = typeof normalizeBoardRootPath === 'function'
    ? normalizeBoardRootPath(window.boardRoot)
    : String(window.boardRoot || '').trim();
  const directoryName = typeof getListDirectoryNameFromPath === 'function'
    ? getListDirectoryNameFromPath(listPath)
    : String(listPath || '').replace(/\/+$/, '').split('/').pop();
  const direction = Number(offset) < 0 ? 'left' : 'right';

  if (!normalizedBoardRoot || !directoryName) {
    return;
  }

  const listNames = (await window.board.listLists(normalizedBoardRoot))
    .filter(Boolean)
    .sort((left, right) => {
      if (typeof compareListDirectoryNames === 'function') {
        return compareListDirectoryNames(left, right);
      }
      return String(left || '').localeCompare(String(right || ''), undefined, { numeric: true });
    });
  const currentIndex = listNames.indexOf(directoryName);
  const targetIndex = currentIndex + (direction === 'left' ? -1 : 1);

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= listNames.length) {
    if (typeof announceSignboardStatus === 'function') {
      announceSignboardStatus(`Cannot move list ${direction}.`);
    }
    return;
  }

  const nextOrder = listNames.slice();
  const [movedList] = nextOrder.splice(currentIndex, 1);
  nextOrder.splice(targetIndex, 0, movedList);

  closeListActionsPopover();
  await reorderBoardLists(normalizedBoardRoot, nextOrder);
  await renderBoard();
  if (typeof announceSignboardStatus === 'function') {
    announceSignboardStatus(`Moved list ${direction}.`);
  }
}

function createListActionsOption(label, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'list-actions-option';
  button.disabled = Boolean(options.disabled);

  const labelElement = document.createElement('span');
  labelElement.className = 'list-actions-option-label';
  labelElement.textContent = label;
  button.appendChild(labelElement);

  if (typeof options.shortcutActionId === 'string' && options.shortcutActionId.trim()) {
    const shortcutActionId = options.shortcutActionId.trim();
    const shortcutElement = document.createElement('span');
    shortcutElement.className = 'menu-shortcut-hint list-actions-option-shortcut';
    shortcutElement.setAttribute('aria-hidden', 'true');
    shortcutElement.textContent = getShortcutHintText(shortcutActionId);
    button.appendChild(shortcutElement);
    button.setAttribute('aria-keyshortcuts', getShortcutAriaKeyshortcuts(shortcutActionId));
  }

  if (options.destructive) {
    button.classList.add('list-actions-option-destructive');
  }

  if (typeof options.title === 'string' && options.title.trim()) {
    button.title = options.title.trim();
  }

  if (typeof options.onClick === 'function') {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) {
        return;
      }
      await options.onClick();
    });
  }

  return button;
}

function renderListActionsPopover() {
  const popover = document.getElementById('listActionsPopover');
  if (!popover) {
    return null;
  }

  const state = getListActionsPopoverState();
  popover.innerHTML = '';
  popover.setAttribute('role', 'group');
  popover.setAttribute('aria-label', `Actions for ${state.listDisplayName || 'list'}`);

  const addCardButton = createListActionsOption('Add new card', {
    shortcutActionId: 'addCard',
    onClick: async () => {
      openAddCardModalForList(state.listPath, state.anchorElement);
    },
  });

  const addListButton = createListActionsOption('Add new list', {
    shortcutActionId: 'addList',
    onClick: async () => {
      openAddListModal({
        anchorElement: state.anchorElement,
        afterListPath: state.listPath,
      });
    },
  });

  const moveListLeftButton = createListActionsOption('Move list left', {
    onClick: async () => {
      await handleMoveListByOffset(state.listPath, -1);
    },
  });

  const moveListRightButton = createListActionsOption('Move list right', {
    onClick: async () => {
      await handleMoveListByOffset(state.listPath, 1);
    },
  });

  const archiveCardsButton = createListActionsOption('Archive cards in this list', {
    destructive: true,
    disabled: state.cardCount === 0,
    title: state.cardCount === 0 ? 'This list has no cards to archive' : '',
    onClick: async () => {
      await handleArchiveCardsInList(state.listPath, state.listDisplayName);
    },
  });

  const archiveListButton = createListActionsOption('Archive this list', {
    destructive: true,
    onClick: async () => {
      await handleArchiveList(state.listPath);
    },
  });

  popover.appendChild(addCardButton);
  popover.appendChild(addListButton);
  popover.appendChild(moveListLeftButton);
  popover.appendChild(moveListRightButton);
  popover.appendChild(archiveCardsButton);
  popover.appendChild(archiveListButton);
  popover.setAttribute('aria-hidden', 'false');
  popover.onclick = (event) => {
    event.stopPropagation();
  };
  popover.onkeydown = handleListActionsPopoverKeydown;

  return popover;
}

function toggleListActionsPopover({
  anchorElement,
  listPath,
  listDisplayName,
  cardCount,
} = {}) {
  const popover = document.getElementById('listActionsPopover');
  if (!popover || !(anchorElement instanceof Element)) {
    return;
  }

  const state = getListActionsPopoverState();
  const isOpenForAnchor = (
    !popover.classList.contains('hidden') &&
    state.anchorElement === anchorElement
  );

  if (isOpenForAnchor) {
    closeListActionsPopover();
    return;
  }

  if (typeof closeBoardLabelFilterPopover === 'function') {
    closeBoardLabelFilterPopover();
  }
  if (typeof closeCardLabelPopover === 'function') {
    closeCardLabelPopover();
  }
  if (typeof closeBoardViewPopover === 'function') {
    closeBoardViewPopover();
  }

  state.anchorElement = anchorElement;
  state.listPath = String(listPath || '').trim();
  state.listDisplayName = String(listDisplayName || '').trim();
  state.cardCount = Math.max(0, Number(cardCount) || 0);

  renderListActionsPopover();
  popover.classList.remove('hidden');
  positionListActionsPopover(anchorElement, popover);
  const firstOption = popover.querySelector('.list-actions-option:not(:disabled)');
  if (firstOption && typeof firstOption.focus === 'function') {
    firstOption.focus();
  }
}
