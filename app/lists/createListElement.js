async function createListElement(name, listPath, cardPaths, options = {}) {
  const isUnified = options.isUnified === true;
  const listDisplayName = options.displayName || name;
  const listEl = document.createElement('div');
  listEl.className = 'list';
  listEl.dataset.path = listPath;
  listEl.dataset.displayName = listDisplayName;
  if (isUnified) {
    listEl.dataset.isUnified = 'true';
  }

  const header = document.createElement('div');
  header.className = 'list-header';
  const listName = document.createElement('span');
  
  if (!isUnified) {
    listName.setAttribute('contenteditable',true);
    listName.setAttribute('data-listpath',listPath);
    
    listName.addEventListener('keydown', async function (e){
        if ( e.code == 'Enter' ) { 
          e.preventDefault(); 
          return; }
    });

    listName.addEventListener('keyup', async (e) => {
      if ( e.code == 'Enter' ) { 
        e.preventDefault(); 
        await renameList(e);
        return;
      }
    });

    listName.addEventListener('focusout', async (e) => { await renameList(e) });
  } else {
    listEl.classList.add('list--unified');
  }

  // Handle names like "001-Todo-suffix" or just "Todo"
  const displayName = typeof getBoardListDisplayName === 'function' 
    ? getBoardListDisplayName(name) 
    : (name.length > 10 ? name.substring(4, name.length - 6) : name);
  
  listName.textContent = displayName;
  header.appendChild(listName);

  if (!isUnified) {
    const actionsBtn = document.createElement('button');
    actionsBtn.type = 'button';
    actionsBtn.className = 'list-actions-button';
    actionsBtn.title = 'List actions';
    actionsBtn.setAttribute('aria-label', 'List actions');
    actionsBtn.innerHTML = '<i data-feather="more-horizontal"></i>';
    actionsBtn.addEventListener('click', async function (e) {
      e.stopPropagation();
      toggleListActionsPopover({
        anchorElement: actionsBtn,
        listPath,
        listDisplayName: listName.textContent,
        cardCount: cardPaths.length,
      });
    });
    header.appendChild(actionsBtn);
  }

  listEl.appendChild(header);

  const cardsEl = document.createElement('div');
  cardsEl.className = 'cards';
  cardsEl.dataset.path = listPath;
  cardsEl.dataset.displayName = listDisplayName;
  if (isUnified) {
    cardsEl.dataset.isUnified = 'true';
  }
  listEl.appendChild(cardsEl);

  const cardElements = await Promise.all(
    cardPaths.map((cardPath) => createCardElement(cardPath))
  );

  for (const cardEl of cardElements) {
    cardsEl.appendChild(cardEl);
  }

  const initializeSortable = () => {
    if (typeof Sortable !== 'function') {
      return null;
    }

    return new Sortable(cardsEl, createBoardCardSortableOptions({
      group: 'cards',
      animation: 150,
      draggable: '.card',
      disabled: isBoardLabelFilterActive(),
      onEnd: async (evt) => {
          const movedCardOriginalPath = evt && evt.item ? evt.item.getAttribute('data-path') : '';
          const sourceListPath = evt && evt.from ? evt.from.dataset.path : '';
          const targetIsUnified = evt.to.dataset.isUnified === 'true';
          const targetDisplayName = evt.to.dataset.displayName;

          // 1. Detect if dropped on a board tab (Drag-to-Tab)
          const targetBoardPath = window.__activeBoardDropTarget;

          if (targetBoardPath) {
              const UNIFIED_BOARD_PATH = '__unified__';
              
              if (targetBoardPath !== UNIFIED_BOARD_PATH && !movedCardOriginalPath.startsWith(targetBoardPath)) {
                  // Move card to different board
                  const targetLists = await window.board.listLists(targetBoardPath);
                  let targetListName = '';
                  const sourceListDisplayName = evt.from.dataset.displayName;

                  for (const list of targetLists) {
                      if (list.displayName === sourceListDisplayName) {
                          targetListName = list.directoryName;
                          break;
                      }
                  }

                  if (!targetListName) {
                      const nonArchive = targetLists.filter(l => !l.isArchive);
                      if (nonArchive.length > 0) targetListName = nonArchive[0].directoryName;
                  }

                  if (targetListName) {
                      const finalTargetListPath = targetBoardPath + targetListName;
                      const cardFileName = window.board.getCardFileName(movedCardOriginalPath);
                      const nextPrefix = await window.board.listCards(finalTargetListPath).then(cards => {
                          const prefixes = cards.map(c => parseInt(c.slice(0, 3))).filter(n => !isNaN(n));
                          const max = prefixes.length > 0 ? Math.max(...prefixes) : -1;
                          return String(max + 1).padStart(3, '0');
                      });
                      const destinationPath = finalTargetListPath + '/' + nextPrefix + cardFileName.slice(3);
                      
                      // Remove visually immediately
                      if (evt.item && evt.item.parentNode) {
                          evt.item.parentNode.removeChild(evt.item);
                      }

                      await window.board.moveCard(movedCardOriginalPath, destinationPath);
                      if (typeof window.board.recordCardListMove === 'function') {
                          await window.board.recordCardListMove(destinationPath, sourceListPath, finalTargetListPath);
                      }

                      // Switch to the target board
                      window.boardRoot = targetBoardPath;
                      if (typeof setStoredActiveBoard === 'function') {
                          setStoredActiveBoard(targetBoardPath);
                      }
                      
                      await renderBoard();
                      return;
                  }
              }
          }

          // 2. Resolve target list path (preserving board if in Unified view)
          let targetListPath = evt.to.dataset.path;
          
          if (targetIsUnified && movedCardOriginalPath) {
              const openBoards = typeof getStoredOpenBoards === 'function' ? getStoredOpenBoards() : [];
              const actualBoards = openBoards.filter(b => b !== '__unified__');
              let cardBoardRoot = actualBoards.find(root => movedCardOriginalPath.startsWith(root));

              if (cardBoardRoot) {
                  const boardLists = await window.board.listLists(cardBoardRoot);
                  let foundList = null;
                  for (const boardListName of boardLists) {
                      const boardListDisplayName = typeof getBoardListDisplayName === 'function' ? getBoardListDisplayName(boardListName) : boardListName;
                      if (boardListDisplayName === targetDisplayName) {
                          foundList = boardListName;
                          break;
                      }
                  }
                  
                  if (foundList) {
                      targetListPath = cardBoardRoot + foundList;
                  } else {
                      // Create list on this board if missing
                      const currentLists = await window.board.listLists(cardBoardRoot);
                      const prefix = String(currentLists.length).padStart(3, '0');
                      const suffix = typeof rand5 === 'function' ? await rand5() : 'stock';
                      const newListName = `${prefix}-${targetDisplayName}-${suffix}`;
                      const newListPath = cardBoardRoot + newListName;
                      await window.board.createList(newListPath);
                      targetListPath = newListPath;
                  }
              }
          }

          if (!targetListPath) {
              await renderBoard();
              return;
          }

          const finalOrder = [...evt.to.querySelectorAll('.card')].map(card =>
              card.getAttribute('data-path')
          );

          // 3. Robust reordering
          const resolvedPathBase = targetListPath.replace(/\/$/, '');
          const allCardsInTargetPhysicalList = await window.board.listCards(targetListPath);

          // Rename all existing files in target physical list to .tmp to avoid collisions during re-indexing
          for (const fileName of allCardsInTargetPhysicalList) {
              const fullPath = targetListPath.endsWith('/') ? targetListPath + fileName : targetListPath + '/' + fileName;
              await window.board.moveCard(fullPath, fullPath.replace('.md', '.tmp'));
          }

          let fileCounter = 0;
          let movedCardNextPath = '';
          
          for (const filePath of finalOrder) {
              if (!filePath) continue;
              
              const isTheMovedCard = (filePath === movedCardOriginalPath);
              const belongsToThisBoard = filePath.startsWith(resolvedPathBase);
              
              // If in unified view, we only reorder cards that belong to this physical list's board
              // OR the card we just moved into this column from another list on the same board
              if (!belongsToThisBoard && !isTheMovedCard) {
                  continue;
              }

              let fileNumber = String(fileCounter).padStart(3, '0');
              let adjustedFrom = filePath;
              
              // If it was already in this list, it now has a .tmp extension
              const allCardsSet = new Set(allCardsInTargetPhysicalList);
              const fileName = window.board.getCardFileName(filePath);
              if (allCardsSet.has(fileName)) {
                  adjustedFrom = filePath.replace('.md', '.tmp');
              }

              const cardFileName = window.board.getCardFileName(filePath);
              const nameWithoutPrefix = cardFileName.slice(3).replace('.tmp', '').replace('.md', '');
              const adjustedTo = (targetListPath.endsWith('/') ? targetListPath : targetListPath + '/') + fileNumber + '-' + nameWithoutPrefix + '.md';

              await window.board.moveCard(adjustedFrom, adjustedTo);
              
              if (isTheMovedCard) {
                movedCardNextPath = adjustedTo;
              }

              fileCounter++;
          }

          if (
            movedCardNextPath &&
            sourceListPath &&
            targetListPath &&
            sourceListPath !== targetListPath &&
            window.board &&
            typeof window.board.recordCardListMove === 'function'
          ) {
            await window.board.recordCardListMove(movedCardNextPath, sourceListPath, targetListPath);
          }

          await renderBoard();
      }
    }));
  };

  if (options.deferSortableInit) {
    return {
      listEl,
      initializeSortable,
    };
  }

  initializeSortable();
  return listEl;
}

async function renameList( e ) {
  const currentListName = window.board.getListDirectoryName( e.target.dataset.listpath );
  const listNameMatch = currentListName.match(/^(\d{3}-)(.*?)(-[^-]{5}|-stock)$/);

  if (!listNameMatch) {
    return;
  }

  const sanitizedListName = sanitizeListName(e.target.textContent);
  const [, prefix, , suffix] = listNameMatch;
  const newListDirectoryName = `${prefix}${sanitizedListName}${suffix}`;

  if (newListDirectoryName === currentListName) {
    return;
  }

  const oldPath = e.target.dataset.listpath;
  const newPath = oldPath.replace(currentListName, newListDirectoryName);

  await window.board.moveList(oldPath,newPath);
  await renderBoard();

  return;
}

function sanitizeListName(rawName) {
  const cleaned = String(rawName || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'Untitled';
}
