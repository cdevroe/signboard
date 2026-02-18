function getBoardSearchState() {
  if (!window.__boardSearchState) {
    window.__boardSearchState = {
      query: '',
      tokens: [],
      pendingTimer: null,
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

function initializeBoardSearchControls() {
  const searchInput = document.getElementById('boardSearchInput');
  if (!searchInput) {
    return;
  }

  searchInput.value = getBoardSearchQuery();

  searchInput.addEventListener('input', (event) => {
    setBoardSearchQuery(event.target.value);
    scheduleBoardSearchRender();
  });
}
