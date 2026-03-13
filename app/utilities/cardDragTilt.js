const BOARD_CARD_DRAG_TILT_MAX_DEGREES = 1.5;
const BOARD_CARD_DRAG_TILT_DEAD_ZONE_PX = 12;
const BOARD_CARD_DRAG_TILT_DISTANCE_PX = 56;

let activeBoardCardDragTiltState = null;

function clearBoardCardTextSelection() {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') {
    return;
  }

  const selection = window.getSelection();
  if (!selection || typeof selection.removeAllRanges !== 'function') {
    return;
  }

  selection.removeAllRanges();
}

function lockBoardCardTextSelection() {
  if (typeof document === 'undefined' || !document.body || !document.body.classList) {
    return;
  }

  document.body.classList.add('board-card-drag-active');
  clearBoardCardTextSelection();
}

function unlockBoardCardTextSelection() {
  if (typeof document === 'undefined' || !document.body || !document.body.classList) {
    return;
  }

  document.body.classList.remove('board-card-drag-active');
}

function isBoardCardDragTiltElement(element) {
  return typeof HTMLElement !== 'undefined' && element instanceof HTMLElement;
}

function getBoardCardDragTiltPointer(event) {
  if (!event) {
    return null;
  }

  const pointer = event.touches && event.touches[0]
    ? event.touches[0]
    : event.changedTouches && event.changedTouches[0]
      ? event.changedTouches[0]
      : event;

  if (typeof pointer.clientX !== 'number' || typeof pointer.clientY !== 'number') {
    return null;
  }

  return {
    clientX: pointer.clientX,
    clientY: pointer.clientY,
  };
}

function applyBoardCardDragTilt(target, degrees) {
  if (!isBoardCardDragTiltElement(target) || !target.style || typeof target.style.setProperty !== 'function') {
    return;
  }

  target.style.setProperty('--card-drag-tilt', `${degrees.toFixed(2)}deg`);
}

function clearBoardCardDragTilt(target) {
  if (!isBoardCardDragTiltElement(target) || !target.style || typeof target.style.removeProperty !== 'function') {
    return;
  }

  target.style.removeProperty('--card-drag-tilt');
}

function getBoardCardDragTiltTargets(item) {
  const targets = [];
  const dragGhost = typeof Sortable !== 'undefined' && Sortable && isBoardCardDragTiltElement(Sortable.ghost)
    ? Sortable.ghost
    : null;

  if (isBoardCardDragTiltElement(item)) {
    targets.push(item);
  }

  if (dragGhost && dragGhost !== item) {
    targets.push(dragGhost);
  }

  return targets;
}

function syncBoardCardDragTiltTargets(targets, degrees) {
  const previousTargets = activeBoardCardDragTiltState
    ? activeBoardCardDragTiltState.targets
    : [];

  for (const previousTarget of previousTargets) {
    if (!targets.includes(previousTarget)) {
      clearBoardCardDragTilt(previousTarget);
    }
  }

  for (const target of targets) {
    applyBoardCardDragTilt(target, degrees);
  }

  if (activeBoardCardDragTiltState) {
    activeBoardCardDragTiltState.targets = targets;
  }
}

function updateBoardCardDragTilt(event) {
  if (!activeBoardCardDragTiltState) {
    return;
  }

  const pointer = getBoardCardDragTiltPointer(event);
  if (!pointer) {
    return;
  }

  if (activeBoardCardDragTiltState.startX === null) {
    activeBoardCardDragTiltState.startX = pointer.clientX;
  }

  const horizontalDelta = pointer.clientX - activeBoardCardDragTiltState.startX;
  const horizontalDistance = Math.abs(horizontalDelta);

  let degrees = 0;
  if (horizontalDistance > BOARD_CARD_DRAG_TILT_DEAD_ZONE_PX) {
    const usableDistance = horizontalDistance - BOARD_CARD_DRAG_TILT_DEAD_ZONE_PX;
    const normalizedDistance = Math.min(usableDistance / BOARD_CARD_DRAG_TILT_DISTANCE_PX, 1);
    degrees = normalizedDistance * BOARD_CARD_DRAG_TILT_MAX_DEGREES * (horizontalDelta < 0 ? -1 : 1);
  }

  const targets = getBoardCardDragTiltTargets(activeBoardCardDragTiltState.item);
  syncBoardCardDragTiltTargets(targets, degrees);
}

function handleBoardCardDragTiltPointerMove(event) {
  updateBoardCardDragTilt(event);
}

function removeBoardCardDragTiltListeners() {
  if (typeof document === 'undefined') {
    return;
  }

  document.removeEventListener('mousemove', handleBoardCardDragTiltPointerMove);
  document.removeEventListener('touchmove', handleBoardCardDragTiltPointerMove);
  document.removeEventListener('pointermove', handleBoardCardDragTiltPointerMove);
}

function addBoardCardDragTiltListeners() {
  if (typeof document === 'undefined') {
    return;
  }

  removeBoardCardDragTiltListeners();
  document.addEventListener('mousemove', handleBoardCardDragTiltPointerMove, { passive: true });
  document.addEventListener('touchmove', handleBoardCardDragTiltPointerMove, { passive: true });
  document.addEventListener('pointermove', handleBoardCardDragTiltPointerMove, { passive: true });
}

function beginBoardCardDragTilt(evt) {
  endBoardCardDragTilt();

  const item = evt && evt.item;
  if (!isBoardCardDragTiltElement(item)) {
    return;
  }

  const pointer = getBoardCardDragTiltPointer(evt && evt.originalEvent);
  activeBoardCardDragTiltState = {
    item,
    startX: pointer ? pointer.clientX : null,
    targets: [],
  };

  addBoardCardDragTiltListeners();
  updateBoardCardDragTilt(evt && evt.originalEvent);
}

function endBoardCardDragTilt(evt) {
  removeBoardCardDragTiltListeners();

  if (!activeBoardCardDragTiltState) {
    return;
  }

  const targets = [
    ...activeBoardCardDragTiltState.targets,
    ...(evt && isBoardCardDragTiltElement(evt.item) ? [evt.item] : []),
  ];

  for (const target of targets) {
    clearBoardCardDragTilt(target);
  }

  activeBoardCardDragTiltState = null;
}

function createBoardCardSortableOptions(options = {}) {
  const mergedOptions = {
    forceFallback: true,
    fallbackOnBody: true,
    fallbackClass: 'card-sortable--fallback',
    chosenClass: 'card-sortable--chosen',
    ghostClass: 'card-sortable--ghost',
    dragClass: 'card-sortable--dragging',
    ...options,
  };
  const baseOnChoose = mergedOptions.onChoose;
  const baseOnUnchoose = mergedOptions.onUnchoose;
  const baseOnStart = mergedOptions.onStart;
  const baseOnEnd = mergedOptions.onEnd;

  return {
    ...mergedOptions,
    onChoose(evt) {
      if (typeof baseOnChoose === 'function') {
        baseOnChoose.call(this, evt);
      }
      lockBoardCardTextSelection();
    },
    onUnchoose(evt) {
      try {
        if (typeof baseOnUnchoose === 'function') {
          return baseOnUnchoose.call(this, evt);
        }
      } finally {
        unlockBoardCardTextSelection();
      }
    },
    onStart(evt) {
      if (typeof baseOnStart === 'function') {
        baseOnStart.call(this, evt);
      }
      beginBoardCardDragTilt(evt);
    },
    onEnd(evt) {
      try {
        if (typeof baseOnEnd === 'function') {
          return baseOnEnd.call(this, evt);
        }
      } finally {
        endBoardCardDragTilt(evt);
        unlockBoardCardTextSelection();
      }
    },
  };
}
