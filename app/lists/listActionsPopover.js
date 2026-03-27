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

    await processAddNewCard(userInput.value, activeListPath.value);
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
  if (!popover) {
    return;
  }

  popover.classList.add('hidden');
  popover.setAttribute('aria-hidden', 'true');
  popover.innerHTML = '';

  const state = getListActionsPopoverState();
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
}

async function handleArchiveList(listPath) {
  closeListActionsPopover();
  await window.board.archiveList(listPath);
  await renderBoard();
}

function createListActionsOption(label, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'list-actions-option';
  button.textContent = label;
  button.disabled = Boolean(options.disabled);

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

  const addCardButton = createListActionsOption('Add new card', {
    onClick: async () => {
      openAddCardModalForList(state.listPath, state.anchorElement);
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
  popover.appendChild(archiveCardsButton);
  popover.appendChild(archiveListButton);
  popover.setAttribute('aria-hidden', 'false');
  popover.onclick = (event) => {
    event.stopPropagation();
  };

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
}
