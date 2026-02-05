async function createListElement(name, listPath, cardNames) {
  const listEl = document.createElement('div');
  listEl.className = 'list';
  listEl.dataset.path = listPath;

  const header = document.createElement('div');
  header.className = 'list-header';
  const listName = document.createElement('span');
  listName.setAttribute('contenteditable',true);
  listName.setAttribute('data-listpath',listPath);
  listName.textContent = name.substring(4,name.length-6);

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

  const addBtn = document.createElement('button');
  addBtn.textContent = '+';
  addBtn.title = 'Add new card';
  addBtn.setAttribute('data-listpath', listPath + '/');
  addBtn.setAttribute('class','btnOpenAddCardModal');
  addBtn.addEventListener('click', async function (e) {
    
    toggleAddCardModal( e.x-90, e.y+15 );
    const userInput = document.getElementById('userInput');
    userInput.focus();

    const hiddenListPath = document.getElementById('hiddenListPath');
    hiddenListPath.value = this.dataset.listpath;
    
    const btnAddCard = document.getElementById('btnAddCard');
    btnAddCard.onclick = async function (e) {
      e.stopPropagation();
        const userInput = document.getElementById('userInput');
        const hiddenListPath = document.getElementById('hiddenListPath');

        await processAddNewCard( userInput.value, hiddenListPath.value );
        userInput.value = '';
        hiddenListPath.value = '';
    };
  });
  header.appendChild(listName);
  header.appendChild(addBtn);
  listEl.appendChild(header);

  const cardsEl = document.createElement('div');
  cardsEl.className = 'cards';
  cardsEl.dataset.path = listPath;
  listEl.appendChild(cardsEl);

  const cardElements = await Promise.all(
    cardNames.map((cardName) => createCardElement(listPath + '/' + cardName))
  );

  for (const cardEl of cardElements) {
    cardsEl.appendChild(cardEl);
  }

  // Enable SortableJS on this column
  new Sortable(cardsEl, {
    group: 'cards',
    animation: 150,
    disabled: isBoardLabelFilterActive(),
    onEnd: async (evt) => {

        const finalOrder = [...evt.to.querySelectorAll('.card')].map(card =>
            card.getAttribute('data-path')  // array of CURRENT filenames in final order
        );

        const allCardsInList = await window.board.listCards(evt.to.dataset.path);

        let tempFileCounter = 0;
        for (const fileName of allCardsInList) {
            await window.board.moveCard(evt.to.dataset.path + '/' + fileName, evt.to.dataset.path + '/' + fileName.replace('.md','.tmp'));
        }

        let fileCounter = 0;
        for (const filePath of finalOrder) {

            let fileNumber = (fileCounter).toLocaleString('en-US', {
                minimumIntegerDigits: 3,
                useGrouping: false
            });

            let adjustedFrom;

            if ( !filePath.includes( evt.to.dataset.path ) ) {
                adjustedFrom = filePath;
            } else {
                adjustedFrom = filePath.replace('.md','.tmp');
            }

            let adjustedTo = evt.to.dataset.path + '/' + fileNumber + await window.board.getCardFileName(filePath).slice(3).replace('.tmp','.md');

            await window.board.moveCard(adjustedFrom, adjustedTo);

            fileCounter++;

        }

        await renderBoard();
        
    }
  });

  return listEl;
}

async function renameList( e ) {
  const currentListName = await window.board.getListDirectoryName( e.target.dataset.listpath );
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
