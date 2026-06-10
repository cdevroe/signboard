const BOARD_SWITCHER_MODAL_ID = 'modalBoardSwitcher';
const BOARD_SWITCHER_INPUT_ID = 'boardSwitcherInput';
const BOARD_SWITCHER_RESULTS_ID = 'boardSwitcherResults';

const boardSwitcherState = {
  initialized: false,
  query: '',
  activeIndex: -1,
  isSwitching: false,
};

function getBoardSwitcherElements() {
  return {
    modal: document.getElementById(BOARD_SWITCHER_MODAL_ID),
    input: document.getElementById(BOARD_SWITCHER_INPUT_ID),
    results: document.getElementById(BOARD_SWITCHER_RESULTS_ID),
  };
}

function isBoardSwitcherOpen() {
  const { modal } = getBoardSwitcherElements();
  return Boolean(modal && modal.style.display === 'block' && !modal.classList.contains('hidden'));
}

function getBoardSwitcherOptions() {
  const openBoards = typeof getStoredOpenBoards === 'function' ? getStoredOpenBoards() : [];
  const activeBoard = typeof normalizeBoardPath === 'function'
    ? normalizeBoardPath(window.boardRoot || (typeof getStoredActiveBoard === 'function' ? getStoredActiveBoard() : ''))
    : String(window.boardRoot || '');

  return openBoards.map((boardPath) => {
    const normalizedPath = normalizeBoardPath(boardPath);
    const label = typeof getBoardLabelFromPath === 'function'
      ? getBoardLabelFromPath(normalizedPath)
      : normalizedPath.replace(/\/+$/, '').split('/').filter(Boolean).pop() || 'Board';

    return {
      path: normalizedPath,
      label,
      isCurrent: normalizedPath === activeBoard,
      searchText: label.toLowerCase(),
    };
  });
}

function getBoardSwitcherFilteredOptions() {
  const queryTokens = String(boardSwitcherState.query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const options = getBoardSwitcherOptions();

  if (queryTokens.length === 0) {
    return options;
  }

  return options.filter((option) => queryTokens.every((token) => option.searchText.includes(token)));
}

function getBoardSwitcherDefaultActiveIndex(options) {
  const nonCurrentIndex = options.findIndex((option) => !option.isCurrent);
  if (nonCurrentIndex >= 0) {
    return nonCurrentIndex;
  }

  return options.length > 0 ? 0 : -1;
}

function normalizeBoardSwitcherActiveIndex(options) {
  if (options.length === 0) {
    boardSwitcherState.activeIndex = -1;
    return;
  }

  if (boardSwitcherState.activeIndex < 0 || boardSwitcherState.activeIndex >= options.length) {
    boardSwitcherState.activeIndex = getBoardSwitcherDefaultActiveIndex(options);
  }
}

function renderBoardSwitcherResults() {
  const { input, results } = getBoardSwitcherElements();
  if (!input || !results) {
    return [];
  }

  const allOptions = getBoardSwitcherOptions();
  const filteredOptions = getBoardSwitcherFilteredOptions();
  normalizeBoardSwitcherActiveIndex(filteredOptions);

  results.innerHTML = '';
  input.removeAttribute('aria-activedescendant');

  if (allOptions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'board-switcher-empty';
    empty.textContent = 'No open boards';
    results.appendChild(empty);
    return filteredOptions;
  }

  if (filteredOptions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'board-switcher-empty';
    empty.textContent = 'No matching boards';
    results.appendChild(empty);
    return filteredOptions;
  }

  filteredOptions.forEach((option, index) => {
    const optionRow = document.createElement('div');
    const optionId = `boardSwitcherOption-${index}`;
    optionRow.id = optionId;
    optionRow.className = 'board-switcher-option';
    optionRow.setAttribute('role', 'option');
    optionRow.setAttribute('aria-selected', index === boardSwitcherState.activeIndex ? 'true' : 'false');
    optionRow.dataset.boardPath = option.path;

    if (index === boardSwitcherState.activeIndex) {
      optionRow.classList.add('is-active');
      input.setAttribute('aria-activedescendant', optionId);
    }

    if (option.isCurrent) {
      optionRow.classList.add('is-current');
    }

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'board-switcher-select';
    selectButton.setAttribute('aria-label', `Switch to ${option.label}`);

    const labelWrap = document.createElement('span');
    labelWrap.className = 'board-switcher-option-copy';

    const title = document.createElement('span');
    title.className = 'board-switcher-option-title';
    title.textContent = option.label;

    const pathText = document.createElement('span');
    pathText.className = 'board-switcher-option-path';
    pathText.textContent = option.path;

    labelWrap.appendChild(title);
    labelWrap.appendChild(pathText);
    selectButton.appendChild(labelWrap);

    if (option.isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'board-switcher-current';
      badge.textContent = 'Current';
      selectButton.appendChild(badge);
    }

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'board-switcher-close';
    closeButton.setAttribute('aria-label', `Close ${option.label} board`);
    closeButton.title = `Close ${option.label}`;
    closeButton.textContent = '×';

    selectButton.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    optionRow.addEventListener('mouseenter', () => {
      if (boardSwitcherState.activeIndex === index) {
        return;
      }

      boardSwitcherState.activeIndex = index;
      renderBoardSwitcherResults();
    });

    selectButton.addEventListener('click', async () => {
      await selectBoardSwitcherOption(option);
    });

    closeButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof closeBoardTab === 'function') {
        await closeBoardTab(option.path);
      }
      boardSwitcherState.activeIndex = getBoardSwitcherDefaultActiveIndex(getBoardSwitcherFilteredOptions());
      renderBoardSwitcherResults();
      input.focus();
    });

    optionRow.appendChild(selectButton);
    optionRow.appendChild(closeButton);
    results.appendChild(optionRow);
  });

  const activeOption = results.querySelector('.board-switcher-option.is-active');
  if (activeOption && typeof activeOption.scrollIntoView === 'function') {
    activeOption.scrollIntoView({ block: 'nearest' });
  }

  return filteredOptions;
}

function openBoardSwitcher() {
  const { modal, input } = getBoardSwitcherElements();
  if (!modal || !input) {
    return false;
  }

  if (typeof closeBoardMenuPopover === 'function') {
    closeBoardMenuPopover();
  }
  if (typeof hideShortcutHelpModal === 'function') {
    hideShortcutHelpModal();
  }

  boardSwitcherState.query = '';
  boardSwitcherState.activeIndex = getBoardSwitcherDefaultActiveIndex(getBoardSwitcherOptions());
  input.value = '';

  modal.style.display = 'block';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  input.setAttribute('aria-expanded', 'true');
  renderBoardSwitcherResults();

  input.focus();
  if (typeof input.select === 'function') {
    input.select();
  }

  window.requestAnimationFrame(() => {
    input.focus();
    if (typeof input.select === 'function') {
      input.select();
    }
  });

  return true;
}

function closeBoardSwitcher() {
  const { modal, input } = getBoardSwitcherElements();
  if (!modal) {
    return;
  }

  modal.style.display = 'none';
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  boardSwitcherState.query = '';
  boardSwitcherState.activeIndex = -1;
  if (input) {
    input.value = '';
    input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-expanded', 'false');
  }
}

function toggleBoardSwitcherFromShortcut() {
  if (isBoardSwitcherOpen()) {
    closeBoardSwitcher();
    return true;
  }

  return openBoardSwitcher();
}

function moveBoardSwitcherSelection(delta) {
  const options = getBoardSwitcherFilteredOptions();
  if (options.length === 0) {
    boardSwitcherState.activeIndex = -1;
    renderBoardSwitcherResults();
    return;
  }

  const currentIndex = boardSwitcherState.activeIndex >= 0 ? boardSwitcherState.activeIndex : 0;
  boardSwitcherState.activeIndex = (currentIndex + delta + options.length) % options.length;
  renderBoardSwitcherResults();
}

async function selectBoardSwitcherOption(option) {
  if (!option || !option.path || boardSwitcherState.isSwitching) {
    return false;
  }

  if (option.isCurrent) {
    closeBoardSwitcher();
    return true;
  }

  boardSwitcherState.isSwitching = true;
  try {
    if (typeof switchToBoardPath === 'function') {
      return await switchToBoardPath(option.path);
    }
    return false;
  } finally {
    boardSwitcherState.isSwitching = false;
  }
}

async function selectActiveBoardSwitcherOption() {
  const options = getBoardSwitcherFilteredOptions();
  const option = options[boardSwitcherState.activeIndex];
  return selectBoardSwitcherOption(option);
}

function initializeBoardSwitcherControls() {
  if (boardSwitcherState.initialized) {
    return;
  }

  const { modal, input } = getBoardSwitcherElements();
  if (!modal || !input) {
    return;
  }

  boardSwitcherState.initialized = true;

  input.addEventListener('input', (event) => {
    boardSwitcherState.query = String(event.currentTarget.value || '');
    boardSwitcherState.activeIndex = getBoardSwitcherDefaultActiveIndex(getBoardSwitcherFilteredOptions());
    renderBoardSwitcherResults();
  });

  input.addEventListener('keydown', async (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      moveBoardSwitcherSelection(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      moveBoardSwitcherSelection(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      await selectActiveBoardSwitcherOption();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeBoardSwitcher();
    }
  });

  document.addEventListener('click', (event) => {
    if (!isBoardSwitcherOpen()) {
      return;
    }

    if (modal.contains(event.target)) {
      return;
    }

    closeBoardSwitcher();
    event.preventDefault();
    event.stopPropagation();
  }, true);

  window.addEventListener('blur', () => {
    closeBoardSwitcher();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      closeBoardSwitcher();
    }
  });
}
