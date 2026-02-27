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

function isMissingBoardPathError(error) {
  if (!error) {
    return false;
  }

  const errorCode = typeof error.code === 'string'
    ? error.code.toUpperCase()
    : '';
  if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
    return true;
  }

  const errorMessage = typeof error.message === 'string'
    ? error.message.toUpperCase()
    : String(error).toUpperCase();
  if (errorMessage.includes('ENOENT') || errorMessage.includes('ENOTDIR')) {
    return true;
  }

  if (error.cause) {
    return isMissingBoardPathError(error.cause);
  }

  return false;
}

function isLikelyBoardDirectoryName(directoryName) {
  if (typeof directoryName !== 'string') {
    return false;
  }

  if (directoryName === 'XXX-Archive') {
    return true;
  }

  return /^\d{3}-.+/.test(directoryName);
}

async function shouldUseLocatedBoardDirectory(nextPath) {
  if (!nextPath) {
    return false;
  }

  try {
    const directoryNames = await window.board.listDirectories(normalizeBoardPath(nextPath));
    const looksLikeBoard = Array.isArray(directoryNames) && directoryNames.some(isLikelyBoardDirectoryName);

    if (looksLikeBoard) {
      return true;
    }
  } catch (error) {
    console.warn(`Unable to inspect selected directory: ${nextPath}`, error);
  }

  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm("This doesn't look like a board directory.\n\nUse anyway?");
  }

  return false;
}

function getDirectoryPickerDefaultPath(boardPath) {
  const normalizedPath = normalizeBoardPath(boardPath).replace(/\/+$/, '');
  if (!normalizedPath) {
    return '';
  }

  const isWindowsDrivePath = /^[a-z]:\//i.test(normalizedPath);
  const isWindowsUncPath = normalizedPath.startsWith('//');
  if (isWindowsDrivePath || isWindowsUncPath) {
    return normalizedPath.replace(/\//g, '\\');
  }

  return normalizedPath;
}

function renderMissingBoardAlert(boardPath) {
  const boardEl = document.getElementById('board');
  if (!boardEl) {
    return;
  }

  setBoardChromeState(false);
  renderBoardTabs();

  const boardNameEl = document.getElementById('boardName');
  if (boardNameEl) {
    boardNameEl.textContent = getBoardLabelFromPath(boardPath);
  }

  boardEl.innerHTML = '';

  const alertEl = document.createElement('section');
  alertEl.className = 'board-missing-alert';
  alertEl.setAttribute('role', 'alert');

  const iconEl = document.createElement('span');
  iconEl.className = 'board-missing-alert-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  `;

  const titleEl = document.createElement('h2');
  titleEl.className = 'board-missing-alert-title';
  titleEl.textContent = 'Board folder was moved or renamed';

  const messageEl = document.createElement('p');
  messageEl.className = 'board-missing-alert-message';
  messageEl.textContent = 'Signboard could not find this board folder anymore:';

  const pathEl = document.createElement('code');
  pathEl.className = 'board-missing-alert-path';
  pathEl.textContent = normalizeBoardPath(boardPath).replace(/\/+$/, '');

  const actionsEl = document.createElement('div');
  actionsEl.className = 'board-missing-alert-actions';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'board-missing-alert-remove';
  removeButton.textContent = 'Remove Board';

  const locateButton = document.createElement('button');
  locateButton.type = 'button';
  locateButton.className = 'board-missing-alert-locate';
  locateButton.textContent = 'Locate Board';

  const setButtonsDisabled = (disabled) => {
    removeButton.disabled = disabled;
    locateButton.disabled = disabled;
  };

  removeButton.addEventListener('click', async () => {
    if (removeButton.disabled) {
      return;
    }
    setButtonsDisabled(true);
    try {
      await closeBoardTab(boardPath);
    } finally {
      setButtonsDisabled(false);
    }
  });

  locateButton.addEventListener('click', async () => {
    if (locateButton.disabled) {
      return;
    }

    if (!window.chooser || typeof window.chooser.pickDirectory !== 'function') {
      return;
    }

    setButtonsDisabled(true);
    try {
      const nextPath = await window.chooser.pickDirectory({
        defaultPath: getDirectoryPickerDefaultPath(boardPath),
      });
      if (!nextPath) {
        return;
      }

      const useSelectedDirectory = await shouldUseLocatedBoardDirectory(nextPath);
      if (!useSelectedDirectory) {
        return;
      }

      if (typeof replaceStoredBoardPath === 'function') {
        replaceStoredBoardPath(boardPath, nextPath);
      }

      renderBoardTabs();
      await openBoard(nextPath);
    } finally {
      setButtonsDisabled(false);
    }
  });

  actionsEl.appendChild(removeButton);
  actionsEl.appendChild(locateButton);

  alertEl.appendChild(iconEl);
  alertEl.appendChild(titleEl);
  alertEl.appendChild(messageEl);
  alertEl.appendChild(pathEl);
  alertEl.appendChild(actionsEl);
  boardEl.appendChild(alertEl);
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

  const boardEl = document.getElementById('board');
  if (!boardEl) {
    return;
  }

  try {
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
  } catch (error) {
    if (isMissingBoardPathError(error)) {
      console.warn(`Board path is missing: ${boardRoot}`, error);
      renderMissingBoardAlert(boardRoot);
      return;
    }
    throw error;
  }
}
