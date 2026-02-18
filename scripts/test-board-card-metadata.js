const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class MockClassList {
  constructor(element) {
    this.element = element;
  }

  _read() {
    return this.element.className
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  _write(values) {
    this.element.className = values.join(' ');
  }

  add(...tokens) {
    const next = new Set(this._read());
    for (const token of tokens) {
      if (token) {
        next.add(token);
      }
    }
    this._write([...next]);
  }

  remove(...tokens) {
    const toRemove = new Set(tokens.filter(Boolean));
    const next = this._read().filter((token) => !toRemove.has(token));
    this._write(next);
  }

  contains(token) {
    return this._read().includes(token);
  }

  toggle(token, force) {
    if (!token) {
      return false;
    }
    const shouldAdd = typeof force === 'boolean'
      ? force
      : !this.contains(token);

    if (shouldAdd) {
      this.add(token);
      return true;
    }

    this.remove(token);
    return false;
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.classList = new MockClassList(this);
    this._textContent = '';
    this.type = '';
    this.title = '';
    this.value = '';
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  get textContent() {
    const childText = this.children
      .map((child) => (typeof child === 'string' ? child : child.textContent))
      .join('');
    return `${this._textContent}${childText}`;
  }

  set innerHTML(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  get innerHTML() {
    return this._textContent;
  }

  appendChild(child) {
    if (typeof child === 'string') {
      this.children.push(child);
      return child;
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.children.push(node);
      } else {
        this.appendChild(node);
      }
    }
  }

  setAttribute(name, value) {
    const textValue = String(value);
    this.attributes[name] = textValue;
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .split('-')
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('');
      this.dataset[key] = textValue;
    }
    if (name === 'class') {
      this.className = textValue;
    }
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  }

  async dispatch(type, event) {
    const handlers = this.listeners[type] || [];
    for (const handler of handlers) {
      await handler(event);
    }
  }
}

function findFirstByClass(root, className) {
  if (!root || !root.children) {
    return null;
  }
  for (const child of root.children) {
    if (typeof child === 'string') {
      continue;
    }
    if (child.classList.contains(className)) {
      return child;
    }
    const nested = findFirstByClass(child, className);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function clickEvent() {
  return {
    preventDefaultCalled: false,
    stopPropagationCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    },
    stopPropagation() {
      this.stopPropagationCalled = true;
    },
  };
}

function createContext(cardFactory, callbacks) {
  const context = {
    window: {
      board: {
        readCard: async () => cardFactory(),
        formatDueDate: async (dueDate) => `Formatted ${dueDate}`,
        updateFrontmatter: async () => {},
      },
    },
    document: {
      createElement: (tagName) => new MockElement(tagName),
      getElementById: (id) => {
        if (id === 'modalEditCard') {
          return { style: { display: 'none' } };
        }
        return null;
      },
    },
    getBoardLabelById: (labelId) => {
      if (labelId === 'label-1') {
        return {
          id: 'label-1',
          name: 'Urgent',
          colorLight: '#ef4444',
          colorDark: '#dc2626',
        };
      }
      return null;
    },
    getBoardLabelColor: () => '#ef4444',
    isBoardLabelFilterActive: () => false,
    cardMatchesBoardLabelFilter: () => true,
    cardMatchesBoardSearch: () => true,
    renderBoard: async () => {},
    toggleCardLabelSelector: callbacks.toggleCardLabelSelector,
    toggleEditCardModal: callbacks.toggleEditCardModal,
    openDueDatePickerAtTrigger: callbacks.openDueDatePickerAtTrigger,
    console,
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../app/cards/createCardElement.js'), 'utf8');
  vm.runInContext(source, context);
  return context;
}

async function run() {
  const dueDateCalls = [];
  let labelSelectorOnChange = null;

  const contextNoMetadata = createContext(
    () => ({
      frontmatter: {
        title: 'Card A',
        labels: [],
        due: null,
      },
      body: 'Body',
    }),
    {
      toggleCardLabelSelector: (_button, _path, _selected, onChange) => {
        labelSelectorOnChange = onChange;
      },
      toggleEditCardModal: async () => {},
      openDueDatePickerAtTrigger: (...args) => {
        dueDateCalls.push(args);
      },
    },
  );

  const cardNoMetadata = await contextNoMetadata.createCardElement('/tmp/card-a.md');
  const metadataNoMetadata = findFirstByClass(cardNoMetadata, 'metadata');
  const dueButtonNoMetadata = findFirstByClass(cardNoMetadata, 'due-date-action');
  const labelButtonNoMetadata = findFirstByClass(cardNoMetadata, 'card-label-button');

  assert(metadataNoMetadata, 'expected card metadata container');
  assert(dueButtonNoMetadata, 'expected due date button');
  assert(labelButtonNoMetadata, 'expected label button');
  assert(metadataNoMetadata.classList.contains('metadata-discovery'));
  assert(dueButtonNoMetadata.classList.contains('metadata-action-empty'));
  assert(labelButtonNoMetadata.classList.contains('metadata-action-empty'));
  assert.strictEqual(dueButtonNoMetadata.tagName, 'BUTTON');
  assert.strictEqual(dueButtonNoMetadata.getAttribute('aria-label'), 'Set due date');

  const dueClick = clickEvent();
  await dueButtonNoMetadata.dispatch('click', dueClick);
  assert.strictEqual(dueClick.preventDefaultCalled, true);
  assert.strictEqual(dueClick.stopPropagationCalled, true);
  assert.strictEqual(dueDateCalls.length, 1);
  assert.strictEqual(Boolean(dueDateCalls[0][0]), true);
  assert.strictEqual(dueDateCalls[0][0].triggerElement, dueButtonNoMetadata);
  assert.strictEqual(dueDateCalls[0][0].dueDateValue, '');
  assert.strictEqual(typeof dueDateCalls[0][0].onSelect, 'function');

  const labelClick = clickEvent();
  await labelButtonNoMetadata.dispatch('click', labelClick);
  assert(labelSelectorOnChange, 'expected label selector callback');
  await labelSelectorOnChange(['label-1']);
  assert.strictEqual(metadataNoMetadata.classList.contains('metadata-discovery'), false);
  assert.strictEqual(labelButtonNoMetadata.classList.contains('metadata-action-empty'), false);

  const contextDueOnly = createContext(
    () => ({
      frontmatter: {
        title: 'Card B',
        labels: [],
        due: '2026-03-14',
      },
      body: 'Body',
    }),
    {
      toggleCardLabelSelector: () => {},
      toggleEditCardModal: async () => {},
      openDueDatePickerAtTrigger: () => {},
    },
  );

  const cardDueOnly = await contextDueOnly.createCardElement('/tmp/card-b.md');
  const dueButtonDueOnly = findFirstByClass(cardDueOnly, 'due-date-action');
  const labelButtonDueOnly = findFirstByClass(cardDueOnly, 'card-label-button');

  assert(dueButtonDueOnly, 'expected due button on due-date card');
  assert(labelButtonDueOnly, 'expected label button on due-date card');
  assert.strictEqual(dueButtonDueOnly.classList.contains('metadata-action-empty'), false);
  assert.strictEqual(labelButtonDueOnly.classList.contains('metadata-action-empty'), true);
  assert(dueButtonDueOnly.textContent.includes('Formatted 2026-03-14'));

  const contextLabelOnly = createContext(
    () => ({
      frontmatter: {
        title: 'Card C',
        labels: ['label-1'],
        due: null,
      },
      body: 'Body',
    }),
    {
      toggleCardLabelSelector: () => {},
      toggleEditCardModal: async () => {},
      openDueDatePickerAtTrigger: () => {},
    },
  );

  const cardLabelOnly = await contextLabelOnly.createCardElement('/tmp/card-c.md');
  const metadataLabelOnly = findFirstByClass(cardLabelOnly, 'metadata');
  const dueButtonLabelOnly = findFirstByClass(cardLabelOnly, 'due-date-action');
  const labelButtonLabelOnly = findFirstByClass(cardLabelOnly, 'card-label-button');

  assert(metadataLabelOnly, 'expected label-only metadata');
  assert(dueButtonLabelOnly, 'expected due button on label-only card');
  assert(labelButtonLabelOnly, 'expected label button on label-only card');
  assert.strictEqual(metadataLabelOnly.classList.contains('metadata-discovery'), false);
  assert.strictEqual(dueButtonLabelOnly.classList.contains('metadata-action-empty'), true);
  assert.strictEqual(labelButtonLabelOnly.classList.contains('metadata-action-empty'), false);
  assert.strictEqual(labelButtonLabelOnly.getAttribute('aria-label'), 'Edit labels');

  const styles = fs.readFileSync(path.join(__dirname, '../static/styles.css'), 'utf8');
  assert(
    styles.includes('.card:hover .metadata-action.metadata-action-empty'),
    'expected hover reveal rule for empty metadata actions',
  );
  assert(
    styles.includes('.card:focus-within .metadata-action.metadata-action-empty'),
    'expected focus-within reveal rule for empty metadata actions',
  );
  assert(
    styles.includes('.card .metadata-action.metadata-action-empty {\n  opacity: 0;'),
    'expected opacity-based hiding rule to keep layout stable',
  );

  console.log('Board card metadata tests passed.');
}

run().catch((error) => {
  console.error('Board card metadata tests failed.');
  console.error(error);
  process.exitCode = 1;
});
