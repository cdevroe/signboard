function getBoardSearchState() {
  if (!window.__boardSearchState) {
    window.__boardSearchState = {
      query: '',
      tokens: [],
      pendingTimer: null,
      keyboardNavigationInitialized: false,
    };
  }

  return window.__boardSearchState;
}

function normalizeSearchQuery(value) {
  return String(value || '').trim().toLowerCase();
}

function setBoardSearchQuery(value) {
  const state = getBoardSearchState();
  const normalized = normalizeSearchQuery(value);

  state.query = normalized;
  state.tokens = normalized.length > 0 ? normalized.split(/\s+/).filter(Boolean) : [];
}

function resetBoardSearch() {
  setBoardSearchQuery('');
  const searchInput = document.getElementById('boardSearchInput');
  if (searchInput) {
    searchInput.value = '';
  }
}

function getBoardSearchQuery() {
  return getBoardSearchState().query;
}

function isBoardSearchActive() {
  return getBoardSearchState().tokens.length > 0;
}

function cardMatchesBoardSearch(title, body) {
  const tokens = getBoardSearchState().tokens;
  if (tokens.length === 0) {
    return true;
  }

  const haystack = `${String(title || '')}\n${String(body || '')}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function scheduleBoardSearchRender() {
  const state = getBoardSearchState();

  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
  }

  state.pendingTimer = setTimeout(() => {
    state.pendingTimer = null;
    renderBoard().catch((error) => {
      console.error('Failed to render board after search.', error);
    });
  }, 150);
}

async function flushBoardSearchRender() {
  const state = getBoardSearchState();
  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
    state.pendingTimer = null;
  }

  await renderBoard();
}

function isBoardSearchResultElementVisible(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function getBoardSearchResultButtons() {
  const selectors = [
    '.card:not(.card-filtered-out) .card-title-button',
    '.board-table-card-title-button',
  ];

  return Array.from(document.querySelectorAll(selectors.join(',')))
    .filter((button) => button instanceof HTMLButtonElement)
    .filter((button) => !button.disabled)
    .filter(isBoardSearchResultElementVisible);
}

function focusBoardSearchResultButton(button) {
  if (!(button instanceof HTMLButtonElement)) {
    return false;
  }

  try {
    button.focus({ preventScroll: true });
  } catch {
    button.focus();
  }

  if (typeof button.scrollIntoView === 'function') {
    button.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }

  return true;
}

function focusBoardSearchResultByIndex(index) {
  const resultButtons = getBoardSearchResultButtons();
  if (resultButtons.length === 0) {
    if (typeof announceSignboardStatus === 'function') {
      announceSignboardStatus('No matching cards.');
    }
    return false;
  }

  const safeIndex = ((index % resultButtons.length) + resultButtons.length) % resultButtons.length;
  return focusBoardSearchResultButton(resultButtons[safeIndex]);
}

function focusFirstBoardSearchResult() {
  return focusBoardSearchResultByIndex(0);
}

function focusLastBoardSearchResult() {
  return focusBoardSearchResultByIndex(getBoardSearchResultButtons().length - 1);
}

function moveBoardSearchResultFocus(offset) {
  const resultButtons = getBoardSearchResultButtons();
  if (resultButtons.length === 0) {
    if (typeof announceSignboardStatus === 'function') {
      announceSignboardStatus('No matching cards.');
    }
    return false;
  }

  const activeElement = document.activeElement;
  const currentIndex = resultButtons.indexOf(activeElement);
  const fallbackIndex = Number(offset) < 0 ? resultButtons.length - 1 : 0;
  const nextIndex = currentIndex >= 0 ? currentIndex + Number(offset || 0) : fallbackIndex;
  return focusBoardSearchResultByIndex(nextIndex);
}

function focusBoardSearchInputForKeyboardNavigation(options = {}) {
  const searchInput = document.getElementById('boardSearchInput');
  if (!searchInput) {
    return false;
  }

  searchInput.focus();
  if (options.select !== false && typeof searchInput.select === 'function') {
    searchInput.select();
  }

  return true;
}

async function clearBoardSearchFromKeyboard(searchInput) {
  if (!searchInput || (!searchInput.value && !isBoardSearchActive())) {
    return false;
  }

  searchInput.value = '';
  resetBoardSearch();
  await flushBoardSearchRender();
  if (typeof announceSignboardStatus === 'function') {
    announceSignboardStatus('Search cleared.');
  }
  return true;
}

async function handleBoardSearchInputKeydown(event) {
  if (!event) {
    return;
  }

  if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    await flushBoardSearchRender();

    if (event.key === 'ArrowUp') {
      focusLastBoardSearchResult();
      return;
    }

    focusFirstBoardSearchResult();
    return;
  }

  if (event.key === 'Escape') {
    const shouldClear = Boolean(event.target && (event.target.value || isBoardSearchActive()));
    if (shouldClear) {
      event.preventDefault();
      event.stopPropagation();
      await clearBoardSearchFromKeyboard(event.target);
    }
  }
}

function isBoardSearchResultNavigationTarget(target) {
  return Boolean(
    target instanceof HTMLButtonElement &&
    (
      target.classList.contains('card-title-button') ||
      target.classList.contains('board-table-card-title-button')
    )
  );
}

function handleBoardSearchResultKeydown(event) {
  if (!event || !isBoardSearchResultNavigationTarget(event.target)) {
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    moveBoardSearchResultFocus(1);
    return;
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault();
    event.stopPropagation();
    moveBoardSearchResultFocus(-1);
    return;
  }

  if (event.key === 'Home') {
    event.preventDefault();
    event.stopPropagation();
    focusFirstBoardSearchResult();
    return;
  }

  if (event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    focusLastBoardSearchResult();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    focusBoardSearchInputForKeyboardNavigation();
  }
}

function initializeBoardSearchKeyboardNavigation() {
  const state = getBoardSearchState();
  if (state.keyboardNavigationInitialized) {
    return;
  }

  document.addEventListener('keydown', handleBoardSearchResultKeydown);
  state.keyboardNavigationInitialized = true;
}

function initializeBoardSearchControls() {
  const searchInput = document.getElementById('boardSearchInput');
  if (!searchInput) {
    return;
  }

  searchInput.value = getBoardSearchQuery();
  initializeBoardSearchKeyboardNavigation();

  if (searchInput.dataset.sbBoardSearchInitialized === 'true') {
    return;
  }

  searchInput.addEventListener('input', (event) => {
    setBoardSearchQuery(event.target.value);
    scheduleBoardSearchRender();
  });
  searchInput.addEventListener('keydown', handleBoardSearchInputKeydown);
  searchInput.dataset.sbBoardSearchInitialized = 'true';
}
