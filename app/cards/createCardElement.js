async function createCardElement(cardPath) {
  const card = await window.board.readCard(cardPath);
  const titleContent = card.frontmatter.title || '';
  let dueDateValue = String(card.frontmatter.due || '').trim();
  let selectedLabelIds = Array.isArray(card.frontmatter.labels)
    ? card.frontmatter.labels.map((labelId) => String(labelId))
    : [];

  const previewText = card.body
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) || '';

  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.dataset.path = cardPath;

  const title = document.createElement('h3');
  title.textContent = titleContent.replace('# ', '');
  cardEl.appendChild(title);

  const body = document.createElement('div');
  body.className = 'card-body';
  const cardPreview = (previewText && previewText.length > 50) ? `${previewText.slice(0, 35)}...` : previewText;
  const preview = document.createElement('p');
  preview.textContent = cardPreview;
  body.appendChild(preview);

  const metadata = document.createElement('div');
  metadata.className = 'metadata';

  const dueButton = document.createElement('button');
  dueButton.type = 'button';
  dueButton.className = 'metadata-action due-date-action';

  const dueIcon = document.createElement('i');
  dueIcon.setAttribute('data-feather', 'clock');
  dueButton.appendChild(dueIcon);

  const formattedDue = document.createElement('span');
  formattedDue.className = 'formatted-date';
  dueButton.appendChild(formattedDue);
  metadata.appendChild(dueButton);

  const labelButton = document.createElement('button');
  labelButton.type = 'button';
  labelButton.className = 'metadata-action card-label-button';
  labelButton.title = 'Set labels';
  const labelIcon = document.createElement('i');
  labelIcon.setAttribute('data-feather', 'tag');
  labelButton.appendChild(labelIcon);
  metadata.appendChild(labelButton);

  const cardLabelsWrap = document.createElement('div');
  cardLabelsWrap.className = 'card-labels';
  metadata.appendChild(cardLabelsWrap);

  async function renderDueDateDisplay() {
    if (!dueDateValue) {
      formattedDue.textContent = '';
      return;
    }

    formattedDue.textContent = await window.board.formatDueDate(dueDateValue);
  }

  function setMetadataActionVisibility() {
    const hasDueDate = dueDateValue.length > 0;
    const hasLabels = selectedLabelIds.length > 0;
    const hasAnyMetadata = hasDueDate || hasLabels;

    metadata.classList.toggle('metadata-discovery', !hasAnyMetadata);
    dueButton.classList.toggle('metadata-action-empty', !hasDueDate);
    labelButton.classList.toggle('metadata-action-empty', !hasLabels);

    if (hasDueDate) {
      dueButton.title = 'Change due date';
      dueButton.setAttribute('aria-label', 'Change due date');
    } else {
      dueButton.title = 'Set due date';
      dueButton.setAttribute('aria-label', 'Set due date');
    }

    if (hasLabels) {
      labelButton.title = 'Edit labels';
      labelButton.setAttribute('aria-label', 'Edit labels');
    } else {
      labelButton.title = 'Set labels';
      labelButton.setAttribute('aria-label', 'Set labels');
    }
  }

  function renderCardLabels() {
    cardLabelsWrap.innerHTML = '';

    const firstKnownLabel = selectedLabelIds
      .map((labelId) => getBoardLabelById(labelId))
      .find((label) => Boolean(label));

    labelButton.style.color = firstKnownLabel ? getBoardLabelColor(firstKnownLabel) : '';

    for (const labelId of selectedLabelIds) {
      const label = getBoardLabelById(labelId);
      const labelChip = document.createElement('span');
      labelChip.className = 'card-label-chip';

      if (label) {
        const chipColor = getBoardLabelColor(label);
        labelChip.textContent = label.name;
        labelChip.style.backgroundColor = `${chipColor}22`;
        labelChip.style.borderColor = chipColor;
      } else {
        labelChip.classList.add('card-label-chip-unknown');
        labelChip.textContent = 'Unknown label';
        labelChip.title = labelId;
      }

      cardLabelsWrap.appendChild(labelChip);
    }

    setMetadataActionVisibility();
  }

  async function updateCardDueDate(nextDueDateValue) {
    dueDateValue = String(nextDueDateValue || '').trim();
    const nextDueDate = dueDateValue.length > 0 ? dueDateValue : null;

    card.frontmatter.due = nextDueDate;
    await window.board.updateFrontmatter(cardPath, { due: nextDueDate });
    await renderDueDateDisplay();
    setMetadataActionVisibility();
  }

  async function updateCardLabels(nextLabelIds) {
    selectedLabelIds = Array.isArray(nextLabelIds)
      ? nextLabelIds.map((labelId) => String(labelId))
      : [];

    card.frontmatter.labels = selectedLabelIds;
    await window.board.updateFrontmatter(cardPath, { labels: selectedLabelIds });
    renderCardLabels();

    if (isBoardLabelFilterActive() && !cardMatchesBoardLabelFilter(selectedLabelIds)) {
      await renderBoard();
    }
  }

  await renderDueDateDisplay();
  renderCardLabels();

  dueButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDueDatePickerAtTrigger({
      triggerElement: dueButton,
      dueDateValue,
      onSelect: async (value) => {
        await updateCardDueDate(value);
      },
    });
  });

  labelButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    toggleCardLabelSelector(
      labelButton,
      cardPath,
      selectedLabelIds,
      async (nextLabelIds) => {
        await updateCardLabels(nextLabelIds);
      },
    );
  });

  body.appendChild(metadata);
    
  cardEl.appendChild(body);

  const matchesLabelFilter = cardMatchesBoardLabelFilter(selectedLabelIds);
  const matchesSearchFilter = cardMatchesBoardSearch(card.frontmatter.title, card.body);

  if (!matchesLabelFilter || !matchesSearchFilter) {
    cardEl.classList.add('card-filtered-out');
  }

  cardEl.addEventListener('click', async () => {

    let modalEditCard = document.getElementById('modalEditCard');
    if ( modalEditCard.style.display == 'block' ) {
      return;
    }

    toggleEditCardModal( cardPath );
  });

  // Not used yet! Drop zone for attachments
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
