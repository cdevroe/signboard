async function createCardElement(cardPath) {
  const fullMarkdown = await window.board.readCard(cardPath);
  const titleContent = fullMarkdown.split(/\r?\n/)[0];
  let frontMatter     = fullMarkdown.split('**********');
  let isFrontMatter   = frontMatter.length > 1 ? true : false; // True means there is frontmatter
  let metadataArray = [];

  if ( isFrontMatter ) { // Handle metadata
      let metalines = frontMatter[0].split(/\r?\n/);
      
      metalines = metalines.filter((line, index) =>{
          if ( index === 0 ) { // Removes card title
              return false;
          }
          if ( line.trim() === "") { // Removes empty lines
              return false;
          }
          metadataArray[line.split(': ')[0]] = line.split(': ')[1].trim();
      });
  }

  let lines = isFrontMatter ? frontMatter[1].split(/\r?\n/) : fullMarkdown.split(/\r?\n/);
  lines = lines.filter((line, index) => {
        if ( !isFrontMatter && index === 0) { // Removes card title
            return false;
        }
        if (line.trim() === "") { // Removes leading empty lines
            return false;
        }
        return true;
    });
  let previewText = lines[0];

  if ( !previewText ) {
    previewText = '';
  }

  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.dataset.path = cardPath;

  const title = document.createElement('h3');
  title.textContent = titleContent.replace('# ', '');
  cardEl.appendChild(title);

  const body = document.createElement('div');
  body.className = 'card-body';
  let cardPreview = ( previewText && previewText.length > 50 ) ? previewText.slice(0,35) + '...' : previewText;

  let cardIcons = '';

  if ( metadataArray && metadataArray['Due-date'] ) {
    const [year, month, day] = metadataArray['Due-date'].split("-").map(Number);
    const dateToDisplay = new Date(year, month -1, day);

    const dateOptions = { month: "short", day: "numeric" };
    const formattedDate = new Intl.DateTimeFormat("en-US", dateOptions).format(dateToDisplay);
    cardIcons += '<span class="due-date" title="' + metadataArray['Due-date'] + '"><i data-feather="clock"></i> <span class="formatted-date">'+formattedDate+'</span></span>'
  }

  if ( metadataArray && metadataArray['Labels'] ) {
    metadataArray['Labels'].split(',').forEach((label) => {
      cardIcons += '<span class="label label-'+label+'" title="' + label + '"><i data-feather="tag"></i></span>'
    });
  }
  
  body.innerHTML = '<p>' + cardPreview + '</p>' + '<div class="metadata">' + cardIcons + '</div>';
    
  cardEl.appendChild(body);

  cardEl.addEventListener('click', async () => {

    let modalEditCard = document.getElementById('modalEditCard');
    if ( modalEditCard.style.display == 'block' ) {
      return;
    }

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