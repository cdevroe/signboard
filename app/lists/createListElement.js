async function createListElement(name, listPath, cardPaths, options = {}) {
  if (!window._cardMoveLock) window._cardMoveLock = false;

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
      onEnd: (evt) => {
          if (window._cardMoveLock) return;
          window._cardMoveLock = true;

          // 1. Capture all necessary DOM data synchronously
          const movedCardOriginalPath = evt && evt.item ? evt.item.getAttribute('data-path') : '';
          const sourceListPath = evt && evt.from ? evt.from.dataset.path : '';
          const targetIsUnified = evt && evt.to && evt.to.dataset ? evt.to.dataset.isUnified === 'true' : false;
          const oldIndex = evt.oldIndex;
          const newIndex = evt.newIndex;
          const fromEl = evt.from;
          const toEl = evt.to;

          // 0. Early Exit if no actual movement occurred
          if (fromEl === toEl && oldIndex === newIndex) {
            window._cardMoveLock = false;
            return;
          }

          // Watchdog timer to prevent permanent locks if IPC hangs
          let watchdogTimer = setTimeout(() => {
              if (window._cardMoveLock) {
                  console.error('WATCHDOG: Card move operation timed out. Forcing UI refresh.');
                  try {
                      document.querySelectorAll('.sortable-drag, .sortable-ghost, .sortable-chosen').forEach(el => el.remove());
                      if (typeof renderBoard === 'function') renderBoard().finally(() => { window._cardMoveLock = false; });
                  } catch (e) { window._cardMoveLock = false; }
              }
          }, 3000);

          // Decouple logic from Sortable's event loop
          setTimeout(async () => {
            try {
              let targetDisplayName = toEl && toEl.dataset ? toEl.dataset.displayName : '';

              const parseDisplayName = (raw) => {
                  if (typeof getBoardListDisplayName === 'function') return getBoardListDisplayName(raw);
                  const m = String(raw || '').match(/^\d{3}-(.*?)(-[^-]{5}|-stock)$/);
                  if (m) return m[1].trim();
                  if (String(raw).length > 10) {
                      // Fallback for 001-Doing-stock or 001-Doing-abcde
                      const parts = String(raw).split('-');
                      if (parts.length >= 3 && parts[0].length === 3) return parts.slice(1, -1).join('-');
                      return String(raw).substring(4, String(raw).length - 6);
                  }
                  return String(raw);
              };

              if (!targetDisplayName && toEl && toEl.dataset && toEl.dataset.path) {
                  const dirName = toEl.dataset.path.split('/').filter(Boolean).pop();
                  targetDisplayName = dirName;
              }
              targetDisplayName = parseDisplayName(targetDisplayName);

              // 1. Manual Hit-Test for Board Tabs (Drag-to-Tab)
              // originalEvent might be a MouseEvent or TouchEvent
              const originalEvent = evt.originalEvent;
              let clientX, clientY;
              
              if (originalEvent) {
                  clientX = originalEvent.clientX !== undefined ? originalEvent.clientX : (originalEvent.touches && originalEvent.touches[0] ? originalEvent.touches[0].clientX : 0);
                  clientY = originalEvent.clientY !== undefined ? originalEvent.clientY : (originalEvent.touches && originalEvent.touches[0] ? originalEvent.touches[0].clientY : 0);
              }

              let targetBoardPath = null;
              if (clientX !== undefined && clientY !== undefined) {
                  const tabs = document.querySelectorAll('.board-tab[data-board-path]');
                  for (const tab of tabs) {
                      const rect = tab.getBoundingClientRect();
                      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
                          targetBoardPath = tab.getAttribute('data-board-path');
                          break;
                      }
                  }
              }

              if (targetBoardPath) {
                  const UNIFIED_BOARD_PATH = '__unified__';
                  
                  if (targetBoardPath !== UNIFIED_BOARD_PATH) {
                      // If dropped on own board tab, just switch to it and return
                      if (movedCardOriginalPath && movedCardOriginalPath.startsWith(targetBoardPath)) {
                          window.boardRoot = targetBoardPath;
                          if (typeof setStoredActiveBoard === 'function') setStoredActiveBoard(targetBoardPath);
                          await renderBoard();
                          return;
                      }

                      // Move card to different board
                      try {
                          const targetLists = await window.board.listLists(targetBoardPath);
                          let targetListName = '';
                          const sourceListDisplayName = fromEl && fromEl.dataset ? fromEl.dataset.displayName : '';

                          for (const listName of targetLists) {
                              const displayName = typeof getBoardListDisplayName === 'function' 
                                ? getBoardListDisplayName(listName) 
                                : (listName.length > 10 ? listName.substring(4, listName.length - 6) : listName);
                              if (displayName === sourceListDisplayName) {
                                  targetListName = listName;
                                  break;
                              }
                          }

                          if (!targetListName) {
                              const nonArchive = targetLists.filter(l => typeof l === 'string' && !l.includes('-Archive'));
                              if (nonArchive.length > 0) targetListName = nonArchive[0];
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
                              
                              // Switch to the target board state first
                              window.boardRoot = targetBoardPath;
                              if (typeof setStoredActiveBoard === 'function') {
                                  setStoredActiveBoard(targetBoardPath);
                              }

                              await window.board.moveCard(movedCardOriginalPath, destinationPath);
                              await renderBoard();
                              return;
                          }
                      } catch (e) {
                          console.error('Failed to move card to another board', e);
                          await renderBoard();
                          return;
                      }
                  }
              }

              // 2. Resolve target list path (preserving board if in Unified view)
              if (!toEl) {
                  await renderBoard();
                  return;
              }

              let targetListPath = toEl.dataset.path;
              
              if (targetIsUnified && movedCardOriginalPath) {
                  const openBoards = typeof getStoredOpenBoards === 'function' ? getStoredOpenBoards() : [];
                  const actualBoards = openBoards.filter(b => b !== '__unified__').sort((a,b) => b.length - a.length);
                  let cardBoardRoot = actualBoards.find(root => movedCardOriginalPath.startsWith(root));

                  if (cardBoardRoot) {
                      try {
                          const boardLists = await window.board.listLists(cardBoardRoot);
                          let foundList = null;
                           for (const boardListName of boardLists) {
                               const boardListDisplayName = parseDisplayName(boardListName);
                               if (String(boardListDisplayName).trim().toLowerCase() === String(targetDisplayName).trim().toLowerCase()) {
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
                      } catch (e) {
                          console.error('Failed to resolve target list in Unified view', e);
                          await renderBoard();
                          return;
                      }
                  }
              }

              if (!targetListPath) {
                  await renderBoard();
                  return;
              }

              try {
                  const finalOrder = [...toEl.querySelectorAll('.card')].map(card =>
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
                      const fileNameSuffix = cardFileName.slice(3); // Fix: don't add extra hyphen, preserve existing suffix
                      const adjustedTo = (targetListPath.endsWith('/') ? targetListPath : targetListPath + '/') + fileNumber + fileNameSuffix.replace('.tmp', '.md');

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
                    typeof window.board.recordCardListMove === 'function' &&
                    movedCardNextPath.startsWith(targetListPath.replace(/\/$/, '')) // Only record if same board
                  ) {
                    try {
                        await window.board.recordCardListMove(movedCardNextPath, sourceListPath, targetListPath);
                    } catch (recErr) {
                        console.warn('Failed to record card move activity', recErr);
                    }
                  }
              } catch (e) {
                  console.error('Critical error during card movement/reordering', e);
              } finally {
                  clearTimeout(watchdogTimer);
                  // Aggressive Cleanup: Forcefully remove any lingering Sortable.js artifacts
                  // that might be stuck in the DOM (even outside the main board container).
                  try {
                    document.querySelectorAll('.sortable-drag, .sortable-ghost, .sortable-chosen').forEach(el => el.remove());
                  } catch (cleanupErr) {}

                  // Tiny delay to let Sortable finish its internal UI cleanup/animations 
                  // before we completely replace the board DOM.
                  setTimeout(async () => {
                      try {
                        await renderBoard();
                      } catch (renderErr) {}
                      window._cardMoveLock = false;
                  }, 100);
              }
            } catch (outerErr) {
              console.error('Outer error in decoupled onEnd', outerErr);
              clearTimeout(watchdogTimer);
              window._cardMoveLock = false;
              await renderBoard();
            }
          }, 0);
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
