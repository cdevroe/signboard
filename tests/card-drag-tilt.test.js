import { describe, it, expect, beforeEach } from 'vitest';
import vm from 'vm';
import { loadSource } from './helpers/vm-loader.js';
import { MockElement } from './helpers/mock-dom.js';

class MockHTMLElement {
  constructor() {
    this.style = {
      _props: {},
      setProperty(name, value) { this._props[name] = value; },
      removeProperty(name) { delete this._props[name]; },
    };
  }
}

function loadCardDragTilt() {
  const mockDocument = {
    _listeners: {},
    addEventListener(type, handler, options) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      if (!this._listeners[type]) return;
      this._listeners[type] = this._listeners[type].filter((h) => h !== handler);
    },
    body: {
      classList: {
        _classes: new Set(),
        add(cls) { this._classes.add(cls); },
        remove(cls) { this._classes.delete(cls); },
        contains(cls) { return this._classes.has(cls); },
      },
    },
  };

  const context = {
    console,
    Math,
    HTMLElement: MockHTMLElement,
    document: mockDocument,
    window: {
      getSelection() {
        return {
          removeAllRanges() {},
        };
      },
    },
  };

  vm.createContext(context);
  loadSource(context, 'app/utilities/cardDragTilt.js');
  return context;
}

describe('getBoardCardDragTiltPointer', () => {
  const context = loadCardDragTilt();
  const { getBoardCardDragTiltPointer } = context;

  it('returns null for null event', () => {
    expect(getBoardCardDragTiltPointer(null)).toBeNull();
  });

  it('returns null for undefined event', () => {
    expect(getBoardCardDragTiltPointer(undefined)).toBeNull();
  });

  it('extracts clientX and clientY from a mouse event', () => {
    const result = getBoardCardDragTiltPointer({ clientX: 100, clientY: 200 });
    expect(result).toEqual({ clientX: 100, clientY: 200 });
  });

  it('extracts from touches[0] for touch events', () => {
    const result = getBoardCardDragTiltPointer({
      touches: [{ clientX: 50, clientY: 75 }],
    });
    expect(result).toEqual({ clientX: 50, clientY: 75 });
  });

  it('falls back to changedTouches[0]', () => {
    const result = getBoardCardDragTiltPointer({
      changedTouches: [{ clientX: 30, clientY: 40 }],
    });
    expect(result).toEqual({ clientX: 30, clientY: 40 });
  });

  it('returns null when event has no coordinate properties', () => {
    const result = getBoardCardDragTiltPointer({});
    expect(result).toBeNull();
  });
});

describe('tilt degree calculation constants', () => {
  const context = loadCardDragTilt();

  it('defines expected constants', () => {
    // const variables are not accessible as context properties in VM,
    // so we evaluate them directly in the context
    expect(vm.runInContext('BOARD_CARD_DRAG_TILT_MAX_DEGREES', context)).toBe(1.5);
    expect(vm.runInContext('BOARD_CARD_DRAG_TILT_DEAD_ZONE_PX', context)).toBe(12);
    expect(vm.runInContext('BOARD_CARD_DRAG_TILT_DISTANCE_PX', context)).toBe(56);
  });
});

describe('applyBoardCardDragTilt and clearBoardCardDragTilt', () => {
  const context = loadCardDragTilt();
  const { applyBoardCardDragTilt, clearBoardCardDragTilt } = context;

  it('sets --card-drag-tilt CSS custom property on a valid element', () => {
    const el = new context.HTMLElement();
    applyBoardCardDragTilt(el, 1.25);
    expect(el.style._props['--card-drag-tilt']).toBe('1.25deg');
  });

  it('clears --card-drag-tilt CSS custom property', () => {
    const el = new context.HTMLElement();
    applyBoardCardDragTilt(el, 0.5);
    clearBoardCardDragTilt(el);
    expect(el.style._props['--card-drag-tilt']).toBeUndefined();
  });

  it('does not throw for non-element targets', () => {
    expect(() => applyBoardCardDragTilt(null, 1)).not.toThrow();
    expect(() => applyBoardCardDragTilt({}, 1)).not.toThrow();
    expect(() => clearBoardCardDragTilt(null)).not.toThrow();
  });
});

describe('updateBoardCardDragTilt', () => {
  it('applies zero tilt within the dead zone', () => {
    const context = loadCardDragTilt();
    const { beginBoardCardDragTilt, updateBoardCardDragTilt } = context;

    const el = new context.HTMLElement();
    beginBoardCardDragTilt({
      item: el,
      originalEvent: { clientX: 100, clientY: 200 },
    });

    // Move 5px right (within 12px dead zone)
    updateBoardCardDragTilt({ clientX: 105, clientY: 200 });
    expect(el.style._props['--card-drag-tilt']).toBe('0.00deg');
  });

  it('applies positive tilt when moving right past the dead zone', () => {
    const context = loadCardDragTilt();
    const { beginBoardCardDragTilt, updateBoardCardDragTilt } = context;

    const el = new context.HTMLElement();
    beginBoardCardDragTilt({
      item: el,
      originalEvent: { clientX: 100, clientY: 200 },
    });

    // Move 40px right (past 12px dead zone, 28px usable / 56px distance = 0.5 normalized)
    updateBoardCardDragTilt({ clientX: 140, clientY: 200 });
    const tiltValue = parseFloat(el.style._props['--card-drag-tilt']);
    expect(tiltValue).toBeGreaterThan(0);
    expect(tiltValue).toBeLessThanOrEqual(1.5);
  });

  it('applies negative tilt when moving left past the dead zone', () => {
    const context = loadCardDragTilt();
    const { beginBoardCardDragTilt, updateBoardCardDragTilt } = context;

    const el = new context.HTMLElement();
    beginBoardCardDragTilt({
      item: el,
      originalEvent: { clientX: 100, clientY: 200 },
    });

    updateBoardCardDragTilt({ clientX: 60, clientY: 200 });
    const tiltValue = parseFloat(el.style._props['--card-drag-tilt']);
    expect(tiltValue).toBeLessThan(0);
    expect(tiltValue).toBeGreaterThanOrEqual(-1.5);
  });

  it('clamps tilt at max degrees', () => {
    const context = loadCardDragTilt();
    const { beginBoardCardDragTilt, updateBoardCardDragTilt } = context;

    const el = new context.HTMLElement();
    beginBoardCardDragTilt({
      item: el,
      originalEvent: { clientX: 100, clientY: 200 },
    });

    // Move far right (well past dead zone + distance)
    updateBoardCardDragTilt({ clientX: 500, clientY: 200 });
    const tiltValue = parseFloat(el.style._props['--card-drag-tilt']);
    expect(tiltValue).toBe(1.5);
  });

  it('does nothing when drag tilt is not active', () => {
    const context = loadCardDragTilt();
    // No beginBoardCardDragTilt called
    expect(() => context.updateBoardCardDragTilt({ clientX: 100, clientY: 200 })).not.toThrow();
  });
});

describe('endBoardCardDragTilt', () => {
  it('clears tilt and resets state', () => {
    const context = loadCardDragTilt();
    const { beginBoardCardDragTilt, updateBoardCardDragTilt, endBoardCardDragTilt } = context;

    const el = new context.HTMLElement();
    beginBoardCardDragTilt({
      item: el,
      originalEvent: { clientX: 100, clientY: 200 },
    });

    updateBoardCardDragTilt({ clientX: 180, clientY: 200 });
    expect(el.style._props['--card-drag-tilt']).toBeDefined();

    endBoardCardDragTilt({ item: el });
    expect(el.style._props['--card-drag-tilt']).toBeUndefined();

    // activeBoardCardDragTiltState is a let variable, not accessible on context.
    // Verify indirectly: updateBoardCardDragTilt should be a no-op now.
    updateBoardCardDragTilt({ clientX: 300, clientY: 200 });
    expect(el.style._props['--card-drag-tilt']).toBeUndefined();
  });

  it('does not throw when called without active state', () => {
    const context = loadCardDragTilt();
    expect(() => context.endBoardCardDragTilt({})).not.toThrow();
  });
});

describe('createBoardCardSortableOptions', () => {
  it('returns default sortable class options', () => {
    const context = loadCardDragTilt();
    const opts = context.createBoardCardSortableOptions();
    expect(opts.forceFallback).toBe(true);
    expect(opts.fallbackOnBody).toBe(true);
    expect(opts.fallbackClass).toBe('card-sortable--fallback');
    expect(opts.chosenClass).toBe('card-sortable--chosen');
    expect(opts.ghostClass).toBe('card-sortable--ghost');
    expect(opts.dragClass).toBe('card-sortable--dragging');
  });

  it('merges custom options', () => {
    const context = loadCardDragTilt();
    const opts = context.createBoardCardSortableOptions({ animation: 150 });
    expect(opts.animation).toBe(150);
    expect(opts.forceFallback).toBe(true);
  });

  it('wraps onChoose to lock text selection', () => {
    const context = loadCardDragTilt();
    let called = false;
    const opts = context.createBoardCardSortableOptions({
      onChoose() { called = true; },
    });

    opts.onChoose({});
    expect(called).toBe(true);
    expect(context.document.body.classList._classes.has('board-card-drag-active')).toBe(true);
  });

  it('wraps onEnd to clear tilt and unlock text selection', () => {
    const context = loadCardDragTilt();
    let endCalled = false;
    const opts = context.createBoardCardSortableOptions({
      onEnd() { endCalled = true; },
    });

    opts.onEnd({});
    expect(endCalled).toBe(true);
    expect(context.document.body.classList._classes.has('board-card-drag-active')).toBe(false);
  });
});
