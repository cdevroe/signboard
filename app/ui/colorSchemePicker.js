// Editable combobox: searching and keyboard browsing never change board colors.
const boardColorSchemePicker = (() => {
  let isOpen = false;
  let query = '';
  let activeId = '';
  const input = () => document.getElementById('boardColorSchemeSearch');
  const matches = () => COLOR_SCHEMES.filter((scheme) =>
    scheme.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  function render() {
    const field = input();
    const popup = document.getElementById('boardColorSchemePopup');
    const list = document.getElementById('boardColorSchemeOptions');
    if (!field || !popup || !list) return;

    field.setAttribute('aria-expanded', String(isOpen));
    popup.hidden = !isOpen;
    field.removeAttribute('aria-activedescendant');
    if (!isOpen) {
      field.value = getColorSchemeById(getBoardColorScheme())?.name || 'Current colors';
      return;
    }

    const schemes = matches();
    if (!schemes.some((scheme) => scheme.id === activeId)) activeId = schemes[0]?.id || '';
    list.replaceChildren();
    for (const scheme of schemes) {
      const option = document.createElement('div');
      option.id = `color-scheme-option-${scheme.id}`;
      option.dataset.schemeId = scheme.id;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(scheme.id === getBoardColorScheme()));
      option.className = 'board-color-scheme-option';
      option.classList.toggle('is-active', scheme.id === activeId);
      option.textContent = scheme.name;
      list.appendChild(option);
      if (scheme.id === activeId) field.setAttribute('aria-activedescendant', option.id);
    }
    document.getElementById('boardColorSchemeStatus').textContent = schemes.length
      ? `${schemes.length} ${schemes.length === 1 ? 'scheme' : 'schemes'}`
      : 'No color schemes found.';
    document.getElementById(field.getAttribute('aria-activedescendant'))?.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    query = '';
    activeId = getBoardColorScheme();
    render();
    input().select();
  }

  function close() {
    isOpen = false;
    query = '';
    render();
  }

  function choose(id) {
    if (!getColorSchemeById(id)) return;
    close();
    applyColorSchemeById(id);
    scheduleBoardSettingsSave();
    input().select();
    announceSignboardStatus(`Color scheme: ${getColorSchemeById(id).name}.`);
  }

  function focus() {
    input()?.focus();
    open();
    input()?.select();
  }

  function initialize() {
    const field = input();
    const picker = document.getElementById('boardColorSchemePicker');
    if (!field || !picker || field.dataset.initialized) return;
    field.dataset.initialized = 'true';
    field.addEventListener('focus', open);
    field.addEventListener('click', open);
    field.addEventListener('input', () => {
      isOpen = true;
      query = field.value;
      activeId = '';
      render();
    });
    field.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        event.stopPropagation();
        close();
        field.select();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        if (!isOpen) { open(); return; }
        const schemes = matches();
        const index = schemes.findIndex((scheme) => scheme.id === activeId);
        const nextIndex = Math.max(0, Math.min(schemes.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        activeId = schemes[nextIndex]?.id || '';
        render();
      } else if (event.key === 'Enter' && isOpen) {
        event.preventDefault();
        event.stopPropagation();
        choose(activeId);
      } else if (event.key === 'Tab') {
        close();
      }
    });
    const list = document.getElementById('boardColorSchemeOptions');
    // Keep DOM focus on the combobox while clicking an option.
    list.addEventListener('mousedown', (event) => event.preventDefault());
    list.addEventListener('click', (event) => {
      event.stopPropagation();
      const option = event.target.closest('[data-scheme-id]');
      if (option) choose(option.dataset.schemeId);
    });
    document.addEventListener('pointerdown', (event) => {
      if (isOpen && !picker.contains(event.target)) close();
    });
    document.addEventListener('focusin', (event) => {
      if (isOpen && !picker.contains(event.target)) close();
    });
    window.addEventListener('blur', close);
    render();
  }

  return { initialize, render, close, focus };
})();
