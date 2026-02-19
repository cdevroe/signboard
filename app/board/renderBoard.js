function setBoardChromeState(hasOpenBoard) {
  const body = document.body;
  if (body) {
    body.classList.toggle('board-empty', !hasOpenBoard);
  }

  if (hasOpenBoard) {
    return;
  }

  const boardNameEl = document.getElementById('boardName');
  if (boardNameEl) {
    boardNameEl.textContent = 'Signboard';
  }
}

async function handleEmptyBoardCallToActionClick(buttonEl) {
  if (!buttonEl || buttonEl.disabled) {
    return;
  }

  buttonEl.disabled = true;
  try {
    await promptAndOpenBoardFromTabs();
  } finally {
    buttonEl.disabled = false;
  }
}

function createEmptyBoardCallToAction() {
  const buttonEl = document.createElement('button');
  buttonEl.type = 'button';
  buttonEl.id = 'emptyBoardCallToAction';
  buttonEl.className = 'empty-board-cta';
  buttonEl.setAttribute('aria-label', 'Select a directory to create a board');
  buttonEl.innerHTML = `
    <span class="empty-board-cta-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        <line x1="12" y1="11" x2="12" y2="17"></line>
        <line x1="9" y1="14" x2="15" y2="14"></line>
      </svg>
    </span>
    <span class="empty-board-cta-title">Create your first board</span>
    <span class="empty-board-cta-text">Select an empty directory. Signboard will use the directory name as the board name.</span>
  `;
  buttonEl.addEventListener('click', async () => {
    await handleEmptyBoardCallToActionClick(buttonEl);
  });
  return buttonEl;
}

function renderBoardEmptyState() {
  const boardEl = document.getElementById('board');
  if (!boardEl) {
    return;
  }

  boardEl.innerHTML = '';
  boardEl.appendChild(createEmptyBoardCallToAction());
}

async function renderBoard() {
  const boardRoot = window.boardRoot; // set in the drop-zone handler

  if (!boardRoot) {
    setBoardChromeState(false);
    renderBoardTabs();
    renderBoardEmptyState();
    return;
  }

  closeCardLabelPopover();
  setBoardChromeState(true);

  const boardNameEl = document.getElementById('boardName');
  const [boardName, lists] = await Promise.all([
    window.board.getBoardName(boardRoot),
    window.board.listLists(boardRoot),
    ensureBoardLabelsLoaded(),
  ]);

  if (boardNameEl) {
    boardNameEl.textContent = boardName;
  }
  renderBoardTabs();

  const boardEl = document.getElementById('board');
  if (!boardEl) {
    return;
  }
  boardEl.innerHTML = '';

  const listsWithCards = await Promise.all(
    lists.map(async (listName) => {
      const listPath = boardRoot + listName;
      const cards = await window.board.listCards(listPath);
      return { listName, listPath, cards };
    })
  );

  const listElements = await Promise.all(
    listsWithCards.map(({ listName, listPath, cards }) => createListElement(listName, listPath, cards))
  );

  for (const listEl of listElements) {
    boardEl.appendChild(listEl);
  }

  if (typeof Sortable === 'function') {
    // Enable SortableJS on this column
    new Sortable(boardEl, {
      group: 'lists',
      animation: 150,
      onEnd: async (evt) => {
        const finalOrder = [...evt.to.querySelectorAll('.list')].map((list) =>
          list.getAttribute('data-path')
        );

        let directoryCounter = 0;
        for (const directoryPath of finalOrder) {
          const directoryNumber = (directoryCounter).toLocaleString('en-US', {
            minimumIntegerDigits: 3,
            useGrouping: false
          });

          const newDirectoryName = window.boardRoot + directoryNumber + await window.board.getListDirectoryName(directoryPath).slice(3);

          await window.board.moveCard(directoryPath, newDirectoryName);

          directoryCounter++;
        }

        await renderBoard();
      }
    });
  }

  if (typeof feather !== 'undefined' && feather && typeof feather.replace === 'function') {
    feather.replace();
  }
}
