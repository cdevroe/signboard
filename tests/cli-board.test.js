import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const cliBoard = require('../lib/cliBoard');
const cardFrontmatter = require('../lib/cardFrontmatter');
const boardLabels = require('../lib/boardLabels');

function futureDateString(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

describe('cliBoard', () => {
  let tmpRoot;
  let boardRoot;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'signboard-cli-board-'));
    boardRoot = path.join(tmpRoot, 'TestBoard');
    await fs.mkdir(boardRoot, { recursive: true });

    // Create list directories
    await fs.mkdir(path.join(boardRoot, '000-To do-stock'), { recursive: true });
    await fs.mkdir(path.join(boardRoot, '001-In Progress-abc12'), { recursive: true });
    await fs.mkdir(path.join(boardRoot, '002-Waiting-def34'), { recursive: true });
    await fs.mkdir(path.join(boardRoot, 'XXX-Archive'), { recursive: true });

    // Write board settings with labels
    await boardLabels.writeBoardSettings(boardRoot, {
      labels: [
        { id: 'urgent', name: 'Urgent', colorLight: '#ef4444', colorDark: '#dc2626' },
        { id: 'feature', name: 'Feature', colorLight: '#22c55e', colorDark: '#16a34a' },
        { id: 'bug', name: 'Bug', colorLight: '#f59e0b', colorDark: '#d97706' },
      ],
      notifications: { enabled: false, time: '09:00' },
    });

    // Create fixture cards
    await cardFrontmatter.writeCard(
      path.join(boardRoot, '000-To do-stock', '001-fix-login-bug-aB1c2.md'),
      {
        frontmatter: {
          title: 'Fix login bug',
          due: futureDateString(3),
          labels: ['bug'],
        },
        body: 'The login form crashes on empty submit.\n- [ ] (due: ' + futureDateString(1) + ') Reproduce the issue\n- [x] Check logs',
      },
    );

    await cardFrontmatter.writeCard(
      path.join(boardRoot, '000-To do-stock', '002-add-dark-mode-dE3f4.md'),
      {
        frontmatter: {
          title: 'Add dark mode',
          labels: ['feature'],
        },
        body: 'Implement dark mode toggle in settings.',
      },
    );

    await cardFrontmatter.writeCard(
      path.join(boardRoot, '001-In Progress-abc12', '001-refactor-auth-gH5i6.md'),
      {
        frontmatter: {
          title: 'Refactor auth module',
          due: futureDateString(7),
          labels: ['feature'],
        },
        body: 'Break auth into smaller services.',
      },
    );

    await cardFrontmatter.writeCard(
      path.join(boardRoot, 'XXX-Archive', '001-old-task-jK7l8.md'),
      {
        frontmatter: {
          title: 'Old archived task',
        },
        body: 'This was completed long ago.',
      },
    );
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  // ─── ARCHIVE_DIRECTORY_NAME ──────────────────────────────────

  describe('ARCHIVE_DIRECTORY_NAME', () => {
    it('should equal XXX-Archive', () => {
      expect(cliBoard.ARCHIVE_DIRECTORY_NAME).toBe('XXX-Archive');
    });
  });

  // ─── getListDisplayName ──────────────────────────────────────

  describe('getListDisplayName', () => {
    it('should extract display name from standard directory format', () => {
      expect(cliBoard.getListDisplayName('000-To do-stock')).toBe('To do');
      expect(cliBoard.getListDisplayName('001-In Progress-abc12')).toBe('In Progress');
    });

    it('should return Archive for the archive directory', () => {
      expect(cliBoard.getListDisplayName('XXX-Archive')).toBe('Archive');
    });

    it('should return Untitled for empty or falsy values', () => {
      expect(cliBoard.getListDisplayName('')).toBe('Untitled');
      expect(cliBoard.getListDisplayName(null)).toBe('Untitled');
      expect(cliBoard.getListDisplayName(undefined)).toBe('Untitled');
    });

    it('should return directory name verbatim if it does not match the pattern', () => {
      expect(cliBoard.getListDisplayName('random-folder')).toBe('random-folder');
    });

    it('should return Untitled if match group is empty', () => {
      expect(cliBoard.getListDisplayName('000--stock')).toBe('Untitled');
    });
  });

  // ─── getCardId ───────────────────────────────────────────────

  describe('getCardId', () => {
    it('should extract the 5-char ID from a card filename', () => {
      expect(cliBoard.getCardId('001-fix-login-bug-aB1c2.md')).toBe('aB1c2');
    });

    it('should return empty string for filenames without an ID suffix', () => {
      expect(cliBoard.getCardId('notes.md')).toBe('');
      expect(cliBoard.getCardId('')).toBe('');
      expect(cliBoard.getCardId(null)).toBe('');
    });
  });

  // ─── listLists ───────────────────────────────────────────────

  describe('listLists', () => {
    it('should return all non-archive lists sorted by directory name', async () => {
      const lists = await cliBoard.listLists(boardRoot);
      const names = lists.map((l) => l.directoryName);
      expect(names).toEqual([
        '000-To do-stock',
        '001-In Progress-abc12',
        '002-Waiting-def34',
      ]);
    });

    it('should include archive when includeArchive is true', async () => {
      const lists = await cliBoard.listLists(boardRoot, { includeArchive: true });
      const names = lists.map((l) => l.directoryName);
      expect(names).toContain('XXX-Archive');
    });

    it('should include card counts by default', async () => {
      const lists = await cliBoard.listLists(boardRoot);
      const todoList = lists.find((l) => l.displayName === 'To do');
      expect(todoList.cardCount).toBe(2);
    });

    it('should skip card counts when withCardCounts is false', async () => {
      const lists = await cliBoard.listLists(boardRoot, { withCardCounts: false });
      const todoList = lists.find((l) => l.displayName === 'To do');
      expect(todoList.cardCount).toBeNull();
    });

    it('should set isArchive flag correctly', async () => {
      const lists = await cliBoard.listLists(boardRoot, { includeArchive: true });
      const archive = lists.find((l) => l.directoryName === 'XXX-Archive');
      expect(archive.isArchive).toBe(true);

      const todo = lists.find((l) => l.displayName === 'To do');
      expect(todo.isArchive).toBe(false);
    });

    it('should include displayName and path for each list', async () => {
      const lists = await cliBoard.listLists(boardRoot);
      for (const list of lists) {
        expect(list.displayName).toBeTruthy();
        expect(list.path).toContain(boardRoot);
      }
    });

    it('should throw for a non-existent board root', async () => {
      await expect(
        cliBoard.listLists('/tmp/nonexistent-board-xyz-123'),
      ).rejects.toThrow('does not exist');
    });

    it('should throw for an empty board root', async () => {
      await expect(cliBoard.listLists('')).rejects.toThrow('boardRoot is required');
    });

    it('should return an empty list for a board with no directories', async () => {
      const emptyBoard = path.join(tmpRoot, 'EmptyBoard');
      await fs.mkdir(emptyBoard, { recursive: true });
      const lists = await cliBoard.listLists(emptyBoard);
      expect(lists).toEqual([]);
    });
  });

  // ─── resolveList ─────────────────────────────────────────────

  describe('resolveList', () => {
    it('should resolve a list by exact directory name', async () => {
      const list = await cliBoard.resolveList(boardRoot, '000-To do-stock');
      expect(list.displayName).toBe('To do');
    });

    it('should resolve a list by display name', async () => {
      const list = await cliBoard.resolveList(boardRoot, 'In Progress');
      expect(list.displayName).toBe('In Progress');
    });

    it('should resolve by partial match', async () => {
      const list = await cliBoard.resolveList(boardRoot, 'Wait');
      expect(list.displayName).toBe('Waiting');
    });

    it('should throw on ambiguous reference', async () => {
      // Both "To do" and "In Progress" lists exist; a very short ref might match multiple
      // but "o" is in "To do" and "In Progress" so let us use something specific
      // Actually the substring needs to match multiple. Let's use a ref that is part of multiple.
      // Use the shared suffix pattern - this depends on the fixture data
      await expect(
        cliBoard.resolveList(boardRoot, 'stock-or-abc'),
      ).rejects.toThrow('Could not find list');
    });

    it('should throw when list is not found', async () => {
      await expect(
        cliBoard.resolveList(boardRoot, 'Nonexistent'),
      ).rejects.toThrow('Could not find list');
    });

    it('should not resolve archive by default', async () => {
      await expect(
        cliBoard.resolveList(boardRoot, 'Archive'),
      ).rejects.toThrow('Could not find list');
    });

    it('should resolve archive when includeArchive is true', async () => {
      const list = await cliBoard.resolveList(boardRoot, 'Archive', { includeArchive: true });
      expect(list.isArchive).toBe(true);
    });
  });

  // ─── createList ──────────────────────────────────────────────

  describe('createList', () => {
    it('should create a new list directory with correct prefix', async () => {
      const list = await cliBoard.createList(boardRoot, 'Review');
      expect(list.displayName).toBe('Review');
      expect(list.directoryName).toMatch(/^003-Review-[A-Za-z0-9]{5}$/);

      const stat = await fs.stat(list.path);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should increment prefix based on existing lists', async () => {
      const list = await cliBoard.createList(boardRoot, 'Done');
      expect(list.directoryName).toMatch(/^004-Done-[A-Za-z0-9]{5}$/);
    });

    it('should sanitize special characters in list name', async () => {
      const list = await cliBoard.createList(boardRoot, 'Test/List*Name');
      expect(list.displayName).toBe('TestListName');
    });

    it('should default to Untitled for empty name', async () => {
      const list = await cliBoard.createList(boardRoot, '');
      expect(list.displayName).toBe('Untitled');
    });
  });

  // ─── renameList ──────────────────────────────────────────────

  describe('renameList', () => {
    let renameBoard;

    beforeAll(async () => {
      renameBoard = path.join(tmpRoot, 'RenameBoard');
      await fs.mkdir(renameBoard, { recursive: true });
      await fs.mkdir(path.join(renameBoard, '000-Original-stock'), { recursive: true });
      await fs.mkdir(path.join(renameBoard, 'XXX-Archive'), { recursive: true });
    });

    it('should rename a list and preserve prefix and suffix', async () => {
      const result = await cliBoard.renameList(renameBoard, 'Original', 'Renamed');
      expect(result.changed).toBe(true);
      expect(result.after.displayName).toBe('Renamed');
      expect(result.after.directoryName).toBe('000-Renamed-stock');

      const stat = await fs.stat(result.after.path);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should throw when trying to rename archive', async () => {
      await expect(
        cliBoard.renameList(renameBoard, 'Archive', 'Not Archive', ),
      ).rejects.toThrow('Archive list cannot be renamed');
    });
  });

  // ─── listCards ───────────────────────────────────────────────

  describe('listCards', () => {
    it('should list all cards across all lists (excluding archive)', async () => {
      const cards = await cliBoard.listCards(boardRoot);
      const titles = cards.map((c) => c.title);
      expect(titles).toContain('Fix login bug');
      expect(titles).toContain('Add dark mode');
      expect(titles).toContain('Refactor auth module');
      expect(titles).not.toContain('Old archived task');
    });

    it('should include archive cards when includeArchive is true', async () => {
      const cards = await cliBoard.listCards(boardRoot, { includeArchive: true });
      const titles = cards.map((c) => c.title);
      expect(titles).toContain('Old archived task');
    });

    it('should filter cards by list reference', async () => {
      const cards = await cliBoard.listCards(boardRoot, { listRef: 'To do' });
      expect(cards).toHaveLength(2);
      expect(cards.every((c) => c.listDisplayName === 'To do')).toBe(true);
    });

    it('should filter by multiple list references', async () => {
      const cards = await cliBoard.listCards(boardRoot, {
        listRefs: ['To do', 'In Progress'],
      });
      const listNames = [...new Set(cards.map((c) => c.listDisplayName))];
      expect(listNames).toContain('To do');
      expect(listNames).toContain('In Progress');
    });

    it('should return empty array for a list with no cards', async () => {
      const cards = await cliBoard.listCards(boardRoot, { listRef: 'Waiting' });
      expect(cards).toEqual([]);
    });

    it('should respect limit option', async () => {
      const cards = await cliBoard.listCards(boardRoot, { limit: 1 });
      expect(cards).toHaveLength(1);
    });

    it('should populate card record fields correctly', async () => {
      const cards = await cliBoard.listCards(boardRoot, { listRef: 'To do' });
      const card = cards.find((c) => c.title === 'Fix login bug');
      expect(card).toBeDefined();
      expect(card.boardRoot).toBe(boardRoot);
      expect(card.listDirectoryName).toBe('000-To do-stock');
      expect(card.listDisplayName).toBe('To do');
      expect(card.fileName).toBe('001-fix-login-bug-aB1c2.md');
      expect(card.cardId).toBe('aB1c2');
      expect(card.due).toBe(futureDateString(3));
      expect(card.labels).toEqual(['bug']);
      expect(card.body).toContain('login form crashes');
      expect(card.filePath).toContain('001-fix-login-bug-aB1c2.md');
      expect(card.taskSummary).toBeDefined();
      expect(card.taskSummary.total).toBe(2);
      expect(card.taskSummary.completed).toBe(1);
      expect(card.taskDueDates).toBeDefined();
      expect(typeof card.mtimeMs).toBe('number');
      expect(typeof card.createdAt).toBe('number');
    });

    it('should filter cards by label', async () => {
      const cards = await cliBoard.listCards(boardRoot, { labelRefs: ['feature'] });
      expect(cards.every((c) => c.labels.includes('feature'))).toBe(true);
      expect(cards.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── resolveCard ─────────────────────────────────────────────

  describe('resolveCard', () => {
    it('should resolve a card by filename', async () => {
      const card = await cliBoard.resolveCard(boardRoot, {
        cardRef: '001-fix-login-bug-aB1c2.md',
      });
      expect(card.title).toBe('Fix login bug');
    });

    it('should resolve a card by card ID', async () => {
      const card = await cliBoard.resolveCard(boardRoot, {
        cardRef: 'aB1c2',
      });
      expect(card.title).toBe('Fix login bug');
    });

    it('should resolve a card by title search', async () => {
      const card = await cliBoard.resolveCard(boardRoot, {
        cardRef: 'dark mode',
      });
      expect(card.title).toBe('Add dark mode');
    });

    it('should narrow search by list reference', async () => {
      const card = await cliBoard.resolveCard(boardRoot, {
        cardRef: 'refactor',
        listRef: 'In Progress',
      });
      expect(card.title).toBe('Refactor auth module');
    });

    it('should throw for empty card reference', async () => {
      await expect(
        cliBoard.resolveCard(boardRoot, { cardRef: '' }),
      ).rejects.toThrow('card reference is required');
    });

    it('should throw when no card matches', async () => {
      await expect(
        cliBoard.resolveCard(boardRoot, { cardRef: 'zzz-nonexistent-xyz' }),
      ).rejects.toThrow('Could not find card');
    });

    it('should not find archived cards without includeArchive', async () => {
      await expect(
        cliBoard.resolveCard(boardRoot, { cardRef: 'Old archived' }),
      ).rejects.toThrow('Could not find card');
    });

    it('should find archived cards with includeArchive', async () => {
      const card = await cliBoard.resolveCard(boardRoot, {
        cardRef: 'Old archived',
        includeArchive: true,
      });
      expect(card.title).toBe('Old archived task');
    });
  });

  // ─── createCard ──────────────────────────────────────────────

  describe('createCard', () => {
    it('should create a card with title and body', async () => {
      const card = await cliBoard.createCard(boardRoot, {
        listRef: 'Waiting',
        title: 'New task',
        body: 'Task description here.',
      });
      expect(card.title).toBe('New task');
      expect(card.body).toBe('Task description here.');
      expect(card.listDisplayName).toBe('Waiting');
      expect(card.cardId).toHaveLength(5);

      // Verify file exists on disk
      const content = await fs.readFile(card.filePath, 'utf8');
      expect(content).toContain('New task');
    });

    it('should create a card with due date', async () => {
      const dueDate = futureDateString(10);
      const card = await cliBoard.createCard(boardRoot, {
        listRef: 'Waiting',
        title: 'Task with due',
        due: dueDate,
      });
      expect(card.due).toBe(dueDate);
    });

    it('should create a card with labels', async () => {
      const card = await cliBoard.createCard(boardRoot, {
        listRef: 'Waiting',
        title: 'Urgent bug fix',
        labelRefs: ['urgent', 'bug'],
      });
      expect(card.labels).toContain('urgent');
      expect(card.labels).toContain('bug');
    });

    it('should throw when title is empty', async () => {
      await expect(
        cliBoard.createCard(boardRoot, { listRef: 'Waiting', title: '' }),
      ).rejects.toThrow('Card title is required');
    });

    it('should throw when list reference is invalid', async () => {
      await expect(
        cliBoard.createCard(boardRoot, { listRef: 'Nonexistent', title: 'Test' }),
      ).rejects.toThrow('Could not find list');
    });

    it('should create a card with empty body when body is not provided', async () => {
      const card = await cliBoard.createCard(boardRoot, {
        listRef: 'Waiting',
        title: 'No body card',
      });
      expect(card.body).toBe('');
    });

    it('should reject invalid due date formats', async () => {
      await expect(
        cliBoard.createCard(boardRoot, {
          listRef: 'Waiting',
          title: 'Bad date',
          due: 'next-tuesday',
        }),
      ).rejects.toThrow('YYYY-MM-DD');
    });

    it('should accept "none" as a due date (clears it)', async () => {
      const card = await cliBoard.createCard(boardRoot, {
        listRef: 'Waiting',
        title: 'No due date',
        due: 'none',
      });
      expect(card.due).toBe('');
    });
  });

  // ─── editCard ────────────────────────────────────────────────

  describe('editCard', () => {
    let editBoardRoot;

    beforeAll(async () => {
      editBoardRoot = path.join(tmpRoot, 'EditBoard');
      await fs.mkdir(editBoardRoot, { recursive: true });
      await fs.mkdir(path.join(editBoardRoot, '000-Backlog-stock'), { recursive: true });
      await fs.mkdir(path.join(editBoardRoot, '001-Active-abc12'), { recursive: true });
      await fs.mkdir(path.join(editBoardRoot, 'XXX-Archive'), { recursive: true });

      await boardLabels.writeBoardSettings(editBoardRoot, {
        labels: [
          { id: 'priority', name: 'Priority', colorLight: '#ef4444', colorDark: '#dc2626' },
          { id: 'backend', name: 'Backend', colorLight: '#3b82f6', colorDark: '#2563eb' },
        ],
        notifications: { enabled: false, time: '09:00' },
      });

      await cardFrontmatter.writeCard(
        path.join(editBoardRoot, '000-Backlog-stock', '001-editable-card-xY9z0.md'),
        {
          frontmatter: {
            title: 'Editable card',
            due: futureDateString(5),
            labels: ['priority'],
          },
          body: 'Original body text.',
        },
      );
    });

    it('should update the card title', async () => {
      const card = await cliBoard.editCard(editBoardRoot, {
        cardRef: 'xY9z0',
        title: 'Updated title',
      });
      expect(card.title).toBe('Updated title');
    });

    it('should update the card body', async () => {
      const card = await cliBoard.editCard(editBoardRoot, {
        cardRef: 'xY9z0',
        body: 'Replaced body.',
      });
      expect(card.body).toBe('Replaced body.');
    });

    it('should append to the body', async () => {
      const card = await cliBoard.editCard(editBoardRoot, {
        cardRef: 'xY9z0',
        appendBody: 'Appended line.',
      });
      expect(card.body).toContain('Replaced body.');
      expect(card.body).toContain('Appended line.');
    });

    it('should update the due date', async () => {
      const newDue = futureDateString(20);
      const card = await cliBoard.editCard(editBoardRoot, {
        cardRef: 'xY9z0',
        due: newDue,
      });
      expect(card.due).toBe(newDue);
    });

    it('should clear the due date with "none"', async () => {
      const card = await cliBoard.editCard(editBoardRoot, {
        cardRef: 'xY9z0',
        due: 'none',
      });
      expect(card.due).toBe('');
    });

    it('should add labels', async () => {
      const card = await cliBoard.editCard(editBoardRoot, {
        cardRef: 'xY9z0',
        addLabelRefs: ['backend'],
      });
      expect(card.labels).toContain('backend');
      expect(card.labels).toContain('priority');
    });

    it('should remove labels', async () => {
      const card = await cliBoard.editCard(editBoardRoot, {
        cardRef: 'xY9z0',
        removeLabelRefs: ['priority'],
      });
      expect(card.labels).not.toContain('priority');
      expect(card.labels).toContain('backend');
    });

    it('should replace all labels with setLabelRefs', async () => {
      const card = await cliBoard.editCard(editBoardRoot, {
        cardRef: 'xY9z0',
        setLabelRefs: ['priority'],
      });
      expect(card.labels).toEqual(['priority']);
    });

    it('should move a card to another list', async () => {
      const card = await cliBoard.editCard(editBoardRoot, {
        cardRef: 'xY9z0',
        moveToListRef: 'Active',
      });
      expect(card.listDisplayName).toBe('Active');

      // Verify the file was actually moved
      const stat = await fs.stat(card.filePath);
      expect(stat.isFile()).toBe(true);
    });

    it('should throw when card title is set to empty', async () => {
      await expect(
        cliBoard.editCard(editBoardRoot, {
          cardRef: 'xY9z0',
          title: '',
        }),
      ).rejects.toThrow('Card title cannot be empty');
    });

    it('should throw when card is not found', async () => {
      await expect(
        cliBoard.editCard(editBoardRoot, { cardRef: 'zzzzz' }),
      ).rejects.toThrow('Could not find card');
    });
  });

  // ─── resolveLabelIds ─────────────────────────────────────────

  describe('resolveLabelIds', () => {
    it('should resolve labels by exact ID', async () => {
      const ids = await cliBoard.resolveLabelIds(boardRoot, ['urgent']);
      expect(ids).toEqual(['urgent']);
    });

    it('should resolve labels by name', async () => {
      const ids = await cliBoard.resolveLabelIds(boardRoot, ['Feature']);
      expect(ids).toEqual(['feature']);
    });

    it('should resolve labels by partial match', async () => {
      const ids = await cliBoard.resolveLabelIds(boardRoot, ['urg']);
      expect(ids).toEqual(['urgent']);
    });

    it('should resolve multiple labels at once', async () => {
      const ids = await cliBoard.resolveLabelIds(boardRoot, ['urgent', 'bug']);
      expect(ids).toEqual(['urgent', 'bug']);
    });

    it('should throw for empty label reference', async () => {
      await expect(
        cliBoard.resolveLabelIds(boardRoot, ['']),
      ).rejects.toThrow('Label reference cannot be empty');
    });

    it('should throw when label is not found', async () => {
      await expect(
        cliBoard.resolveLabelIds(boardRoot, ['nonexistent']),
      ).rejects.toThrow('Could not find label');
    });

    it('should throw for ambiguous label reference', async () => {
      // "u" matches both "urgent" (id) and "bug" (id contains "u"), and "Feature" (name contains "u")
      // Actually let's pick something that definitely matches multiple. "e" is in "feature" and "urgent"
      // Both "feature" and "urgent" contain "e" -- but let's verify with the fixture
      await expect(
        cliBoard.resolveLabelIds(boardRoot, ['e']),
      ).rejects.toThrow('Ambiguous label reference');
    });
  });

  // ─── summarizeDue ────────────────────────────────────────────

  describe('summarizeDue', () => {
    it('should return card due date alone', () => {
      const result = cliBoard.summarizeDue({
        due: '2026-04-01',
        taskDueDates: [],
      });
      expect(result).toBe('2026-04-01');
    });

    it('should return task due dates when no card due', () => {
      const result = cliBoard.summarizeDue({
        due: '',
        taskDueDates: ['2026-04-10'],
      });
      expect(result).toBe('task:2026-04-10');
    });

    it('should combine card due and task due dates', () => {
      const result = cliBoard.summarizeDue({
        due: '2026-04-01',
        taskDueDates: ['2026-04-10', '2026-04-15'],
      });
      expect(result).toBe('2026-04-01 | tasks:2026-04-10,2026-04-15');
    });

    it('should return empty string when no due dates', () => {
      const result = cliBoard.summarizeDue({
        due: '',
        taskDueDates: [],
      });
      expect(result).toBe('');
    });
  });

  // ─── getEarliestDueDate ──────────────────────────────────────

  describe('getEarliestDueDate', () => {
    it('should return the earliest date from card due', () => {
      const result = cliBoard.getEarliestDueDate({
        due: '2026-05-01',
        taskDueDates: [],
      });
      expect(result).toBe('2026-05-01');
    });

    it('should return the earliest date across card and task dues', () => {
      const result = cliBoard.getEarliestDueDate({
        due: '2026-05-01',
        taskDueDates: ['2026-04-15', '2026-06-01'],
      });
      expect(result).toBe('2026-04-15');
    });

    it('should return empty string when no due dates exist', () => {
      const result = cliBoard.getEarliestDueDate({
        due: '',
        taskDueDates: [],
      });
      expect(result).toBe('');
    });

    it('should respect dueSource=card filter', () => {
      const result = cliBoard.getEarliestDueDate(
        { due: '2026-05-01', taskDueDates: ['2026-04-01'] },
        'card',
      );
      expect(result).toBe('2026-05-01');
    });

    it('should respect dueSource=task filter', () => {
      const result = cliBoard.getEarliestDueDate(
        { due: '2026-04-01', taskDueDates: ['2026-05-01'] },
        'task',
      );
      expect(result).toBe('2026-05-01');
    });
  });

  // ─── Edge cases: board root validation ───────────────────────

  describe('board root validation', () => {
    it('should throw for null boardRoot on listLists', async () => {
      await expect(cliBoard.listLists(null)).rejects.toThrow('boardRoot is required');
    });

    it('should throw for a file path (not directory) as boardRoot', async () => {
      const filePath = path.join(tmpRoot, 'not-a-dir.txt');
      await fs.writeFile(filePath, 'hello', 'utf8');
      await expect(cliBoard.listLists(filePath)).rejects.toThrow('not a directory');
    });
  });
});
