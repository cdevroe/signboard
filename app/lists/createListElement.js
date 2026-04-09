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
          let targetListPath = evt && evt.to ? evt.to.dataset.path : '';
          const targetIsUnified = evt.to.dataset.isUnified === 'true';
          const targetDisplayName = evt.to.dataset.displayName;

          // Check if dropped on a board tab
          const originalEvent = evt.originalEvent;
          const clientX = originalEvent.clientX || (originalEvent.touches && originalEvent.touches[0] ? originalEvent.touches[0].clientX : 0);
          const clientY = originalEvent.clientY || (originalEvent.touches && originalEvent.touches[0] ? originalEvent.touches[0].clientY : 0);
          const dropTarget = document.elementFromPoint(clientX, clientY);
          const boardTab = dropTarget ? dropTarget.closest('.board-tab[data-board-path]') : null;

          if (boardTab) {
              const targetBoardPath = boardTab.getAttribute('data-board-path');
              const UNIFIED_BOARD_PATH = '__unified__';
              
              if (targetBoardPath && targetBoardPath !== UNIFIED_BOARD_PATH && !movedCardOriginalPath.startsWith(targetBoardPath)) {
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
                      
                      await window.board.moveCard(movedCardOriginalPath, destinationPath);
                      if (typeof window.board.recordCardListMove === 'function') {
                          await window.board.recordCardListMove(destinationPath, sourceListPath, finalTargetListPath);
                      }
                      await renderBoard();
                      return;
                  }
              }
          }

          // Resolve physical target list if in unified view
          if (targetIsUnified && movedCardOriginalPath) {
              const openBoards = typeof getStoredOpenBoards === 'function' ? getStoredOpenBoards() : [];
              let cardBoardRoot = '';
              for (const root of openBoards) {
                  if (movedCardOriginalPath.startsWith(root)) {
                      cardBoardRoot = root;
                      break;
                  }
              }

              if (cardBoardRoot) {
                  const boardLists = await window.board.listLists(cardBoardRoot);
                  for (const boardListName of boardLists) {
                      const boardListDisplayName = typeof getBoardListDisplayName === 'function' ? getBoardListDisplayName(boardListName) : boardListName;
                      if (boardListDisplayName === targetDisplayName) {
                          targetListPath = cardBoardRoot + boardListName;
                          break;
                      }
                  }
              }
          }

          if (!targetListPath) {
              await renderBoard();
              return;
          }

          const finalOrder = [...evt.to.querySelectorAll('.card')].map(card =>
              card.getAttribute('data-path')  // array of CURRENT filenames in final order
          );

          // In unified view, we only want to reorder cards that belong to THIS physical list
          const cardsBelongingToThisList = finalOrder.filter(path => path.includes(targetListPath));
          
          const allCardsInPhysicalList = await window.board.listCards(targetListPath);

          let tempFileCounter = 0;
          for (const fileName of allCardsInPhysicalList) {
              await window.board.moveCard(targetListPath + '/' + fileName, targetListPath + '/' + fileName.replace('.md','.tmp'));
          }

          let fileCounter = 0;
          let movedCardNextPath = '';
          for (const filePath of finalOrder) {
              // If we are in unified view, we skip reordering for cards NOT in this list's board
              if (targetIsUnified && !filePath.includes(targetListPath)) {
                  continue;
              }

              let fileNumber = (fileCounter).toLocaleString('en-US', {
                  minimumIntegerDigits: 3,
                  useGrouping: false
              });

              let adjustedFrom;

              if ( !filePath.includes( targetListPath ) ) {
                  adjustedFrom = filePath;
              } else {
                  adjustedFrom = filePath.replace('.md','.tmp');
              }

              let adjustedTo = targetListPath + '/' + fileNumber + window.board.getCardFileName(filePath).slice(3).replace('.tmp','.md');

              await window.board.moveCard(adjustedFrom, adjustedTo);
              if (movedCardOriginalPath && filePath === movedCardOriginalPath) {
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
