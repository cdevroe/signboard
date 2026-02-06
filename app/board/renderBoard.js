async function renderBoard() {
  const boardRoot = window.boardRoot; // set in the drop‑zone handler
  if (!boardRoot) {
    renderBoardTabs();
    return;
  }

  closeCardLabelPopover();
  await ensureBoardLabelsLoaded();
  if (window.boardRoot !== boardRoot) return;

  const boardName = document.getElementById('boardName');
<<<<<<< ours
  const boardNameText = await window.board.getBoardName( boardRoot );
  if (window.boardRoot !== boardRoot) return;
=======
  boardName.textContent = await window.board.getBoardName( boardRoot );
  renderBoardTabs();
>>>>>>> theirs

  const lists = await window.board.listLists(boardRoot);
  if (window.boardRoot !== boardRoot) return;
  const boardEl = document.getElementById('board');

  const listsWithCards = await Promise.all(
    lists.map(async (listName) => {
      const listPath = boardRoot + listName;
      const cards = await window.board.listCards(listPath);
      return { listName, listPath, cards };
    })
  );
  if (window.boardRoot !== boardRoot) return;

  boardName.textContent = boardNameText;
  boardEl.innerHTML = '';

  for (const { listName, listPath, cards } of listsWithCards) {
    const listEl = await createListElement(listName, listPath, cards);
    if (window.boardRoot !== boardRoot) return;
    boardEl.appendChild(listEl);
  }

  // Enable SortableJS on this column
  new Sortable(boardEl, {
    group: 'lists',
    animation: 150,
    onEnd: async (evt) => {

      const finalOrder = [...evt.to.querySelectorAll('.list')].map(list =>
          list.getAttribute('data-path')
      );

      let directoryCounter = 0;
      for (const directoryPath of finalOrder) {

          let directoryNumber = (directoryCounter).toLocaleString('en-US', {
              minimumIntegerDigits: 3,
              useGrouping: false
          });

          let newDirectoryName = window.boardRoot + directoryNumber + await window.board.getListDirectoryName(directoryPath).slice(3);

          await window.board.moveCard(directoryPath, newDirectoryName);

          directoryCounter++;

        }

      await renderBoard();
        
    }
  });
  feather.replace();
  return;
}
