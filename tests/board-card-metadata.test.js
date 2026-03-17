import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { MockClassList, MockElement, findFirstByClass, clickEvent } from './helpers/mock-dom.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createContext(cardFactory, callbacks, options = {}) {
  const getTaskListSummary = typeof options.getTaskListSummary === 'function'
    ? options.getTaskListSummary
    : () => ({ total: 0, completed: 0, remaining: 0 });
  const getTaskListDueDates = typeof options.getTaskListDueDates === 'function'
    ? options.getTaskListDueDates
    : () => [];
  const createTaskProgressBadge = typeof options.createTaskProgressBadge === 'function'
    ? options.createTaskProgressBadge
    : () => null;

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
    setDueDateVisualClass: () => '',
    getTaskListSummary,
    getTaskListDueDates,
    createTaskProgressBadge,
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

describe('board card metadata', () => {
  it('renders metadata container with discovery mode when no labels or due date', async () => {
    const dueDateCalls = [];
    let labelSelectorOnChange = null;

    const context = createContext(
      () => ({
        frontmatter: { title: 'Card A', labels: [], due: null },
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

    const card = await context.createCardElement('/tmp/card-a.md');
    const metadata = findFirstByClass(card, 'metadata');
    const dueButton = findFirstByClass(card, 'due-date-action');
    const labelButton = findFirstByClass(card, 'card-label-button');

    expect(metadata).toBeTruthy();
    expect(dueButton).toBeTruthy();
    expect(labelButton).toBeTruthy();
    expect(metadata.classList.contains('metadata-discovery')).toBeTruthy();
    expect(dueButton.classList.contains('metadata-action-empty')).toBeTruthy();
    expect(labelButton.classList.contains('metadata-action-empty')).toBeTruthy();
    expect(dueButton.tagName).toBe('BUTTON');
    expect(dueButton.getAttribute('aria-label')).toBe('Set due date');
  });

  it('opens due date picker on click with correct arguments', async () => {
    const dueDateCalls = [];

    const context = createContext(
      () => ({
        frontmatter: { title: 'Card A', labels: [], due: null },
        body: 'Body',
      }),
      {
        toggleCardLabelSelector: () => {},
        toggleEditCardModal: async () => {},
        openDueDatePickerAtTrigger: (...args) => {
          dueDateCalls.push(args);
        },
      },
    );

    const card = await context.createCardElement('/tmp/card-a.md');
    const dueButton = findFirstByClass(card, 'due-date-action');

    const dueClick = clickEvent();
    await dueButton.dispatch('click', dueClick);
    expect(dueClick.preventDefaultCalled).toBe(true);
    expect(dueClick.stopPropagationCalled).toBe(true);
    expect(dueDateCalls.length).toBe(1);
    expect(Boolean(dueDateCalls[0][0])).toBe(true);
    expect(dueDateCalls[0][0].triggerElement).toBe(dueButton);
    expect(dueDateCalls[0][0].dueDateValue).toBe('');
    expect(typeof dueDateCalls[0][0].onSelect).toBe('function');
  });

  it('removes discovery mode after adding labels via label selector', async () => {
    let labelSelectorOnChange = null;

    const context = createContext(
      () => ({
        frontmatter: { title: 'Card A', labels: [], due: null },
        body: 'Body',
      }),
      {
        toggleCardLabelSelector: (_button, _path, _selected, onChange) => {
          labelSelectorOnChange = onChange;
        },
        toggleEditCardModal: async () => {},
        openDueDatePickerAtTrigger: () => {},
      },
    );

    const card = await context.createCardElement('/tmp/card-a.md');
    const metadata = findFirstByClass(card, 'metadata');
    const labelButton = findFirstByClass(card, 'card-label-button');

    const labelClick = clickEvent();
    await labelButton.dispatch('click', labelClick);
    expect(labelSelectorOnChange).toBeTruthy();
    await labelSelectorOnChange(['label-1']);
    expect(metadata.classList.contains('metadata-discovery')).toBe(false);
    expect(labelButton.classList.contains('metadata-action-empty')).toBe(false);
  });

  it('shows due date text and hides empty state when due date is set', async () => {
    const context = createContext(
      () => ({
        frontmatter: { title: 'Card B', labels: [], due: '2026-03-14' },
        body: 'Body',
      }),
      {
        toggleCardLabelSelector: () => {},
        toggleEditCardModal: async () => {},
        openDueDatePickerAtTrigger: () => {},
      },
    );

    const card = await context.createCardElement('/tmp/card-b.md');
    const dueButton = findFirstByClass(card, 'due-date-action');
    const labelButton = findFirstByClass(card, 'card-label-button');

    expect(dueButton).toBeTruthy();
    expect(labelButton).toBeTruthy();
    expect(dueButton.classList.contains('metadata-action-empty')).toBe(false);
    expect(labelButton.classList.contains('metadata-action-empty')).toBe(true);
    expect(dueButton.textContent.includes('Formatted 2026-03-14')).toBeTruthy();
  });

  it('shows labels and hides empty state when labels are set without due date', async () => {
    const context = createContext(
      () => ({
        frontmatter: { title: 'Card C', labels: ['label-1'], due: null },
        body: 'Body',
      }),
      {
        toggleCardLabelSelector: () => {},
        toggleEditCardModal: async () => {},
        openDueDatePickerAtTrigger: () => {},
      },
    );

    const card = await context.createCardElement('/tmp/card-c.md');
    const metadata = findFirstByClass(card, 'metadata');
    const dueButton = findFirstByClass(card, 'due-date-action');
    const labelButton = findFirstByClass(card, 'card-label-button');

    expect(metadata).toBeTruthy();
    expect(dueButton).toBeTruthy();
    expect(labelButton).toBeTruthy();
    expect(metadata.classList.contains('metadata-discovery')).toBe(false);
    expect(dueButton.classList.contains('metadata-action-empty')).toBe(true);
    expect(labelButton.classList.contains('metadata-action-empty')).toBe(false);
    expect(labelButton.getAttribute('aria-label')).toBe('Edit labels');
  });

  it('renders task progress badge when card has tasks', async () => {
    const context = createContext(
      () => ({
        frontmatter: { title: 'Card D', labels: [], due: null },
        body: '- [ ] Task one\n- [x ] Task two\n- [ ] Task three',
      }),
      {
        toggleCardLabelSelector: () => {},
        toggleEditCardModal: async () => {},
        openDueDatePickerAtTrigger: () => {},
      },
      {
        getTaskListSummary: () => ({ total: 3, completed: 1, remaining: 2 }),
        getTaskListDueDates: () => [],
        createTaskProgressBadge: (taskSummary, className) => {
          const badge = new MockElement('span');
          badge.className = className;
          badge.setAttribute('data-progress', `${taskSummary.completed}/${taskSummary.total}`);
          return badge;
        },
      },
    );

    const card = await context.createCardElement('/tmp/card-d.md');
    const metadata = findFirstByClass(card, 'metadata');
    const taskBadge = findFirstByClass(card, 'task-progress-badge-inline');

    expect(metadata).toBeTruthy();
    expect(taskBadge).toBeTruthy();
    expect(metadata.classList.contains('metadata-discovery')).toBe(false);
    expect(taskBadge.getAttribute('data-progress')).toBe('1/3');
  });

  it('has CSS rules for hover and focus reveal of empty metadata actions', async () => {
    const styles = fs.readFileSync(path.join(__dirname, '../static/styles.css'), 'utf8');

    expect(
      styles.includes('.card:hover .metadata-action.metadata-action-empty'),
    ).toBeTruthy();
    expect(
      styles.includes('.card:focus-within .metadata-action.metadata-action-empty'),
    ).toBeTruthy();
    expect(
      styles.includes('.card .metadata-action.metadata-action-empty {\n  opacity: 0;'),
    ).toBeTruthy();
  });
});
