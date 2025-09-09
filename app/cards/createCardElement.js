async function createCardElement(cardPath) {
    const fullMarkdown = await window.board.readCard(cardPath);
    const lines = fullMarkdown.split(/\r?\n/);
    const titleContent = lines[0];
    const md = lines.slice(1).join("\n");

  const cardEl = document.createElement('div');
  cardEl.className = 'card';
    cardEl.dataset.path = cardPath;
  

  const title = document.createElement('h3');
  title.textContent = titleContent.replace('# ', '');
  cardEl.appendChild(title);

  const body = document.createElement('div');
  body.className = 'card-body';
  let cardPreview = ( md.length > 50 ) ? md.slice(1,35) + '...' : md;
  
  body.innerHTML = renderMarkdown(cardPreview);
    
  cardEl.appendChild(body);

  cardEl.addEventListener('click', async () => {

    toggleEditCardModal( cardPath );
        
        // if (newMd !== null) {
        //   await window.board.writeCard(cardPath, newMd);
        //   const updatedCard = await createCardElement(cardPath);
        //   cardEl.parentNode.replaceChild(updatedCard, cardEl);
        // }
      });

  // Drop zone for attachments
  cardEl.addEventListener('dragover', e => e.preventDefault());
  cardEl.addEventListener('drop', async e => {
    e.preventDefault();
    // const filePath = e.dataTransfer.files[0].path;
    // const dst = await window.board.copyExternal(filePath, path.dirname(cardPath));
    // const newMd = `${md}\n![${path.basename(filePath)}](${path.basename(dst)})`;
    // await window.board.writeCard(cardPath, newMd);
    // const updatedCard = await createCardElement(cardPath);
    // cardEl.parentNode.replaceChild(updatedCard, cardEl);
  });

  return cardEl;
}