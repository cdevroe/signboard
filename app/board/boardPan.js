const BOARD_PAN_ELEMENT_ID = 'board';
const BOARD_PAN_ACTIVE_CLASS = 'board-panning';

const boardPanState = {
  initialized: false,
  pointerId: null,
  originClientX: 0,
  originScrollLeft: 0,
};

function getBoardPanElement() {
  return document.getElementById(BOARD_PAN_ELEMENT_ID);
}

function canPanBoard(board) {
  return board.scrollWidth > board.clientWidth;
}

function isBoardPanStart(board, event) {
  if (event.pointerType !== 'mouse' || event.button !== 0) {
    return false;
  }

  // Only the bare board surface pans. Lists and cards keep their own drag behavior.
  return event.target === board;
}

function stopBoardPan(board) {
  if (boardPanState.pointerId === null) {
    return;
  }

  // Clear the state first so the resulting lostpointercapture is a no-op.
  const { pointerId } = boardPanState;
  boardPanState.pointerId = null;
  board.classList.remove(BOARD_PAN_ACTIVE_CLASS);

  if (board.hasPointerCapture(pointerId)) {
    board.releasePointerCapture(pointerId);
  }
}

function handleBoardPanPointerDown(event) {
  const board = getBoardPanElement();
  if (!board || boardPanState.pointerId !== null) {
    return;
  }

  if (!isBoardPanStart(board, event) || !canPanBoard(board)) {
    return;
  }

  boardPanState.pointerId = event.pointerId;
  boardPanState.originClientX = event.clientX;
  boardPanState.originScrollLeft = board.scrollLeft;
  board.setPointerCapture(event.pointerId);
  board.classList.add(BOARD_PAN_ACTIVE_CLASS);
}

function handleBoardPanPointerMove(event) {
  if (boardPanState.pointerId !== event.pointerId) {
    return;
  }

  const board = getBoardPanElement();
  if (!board) {
    return;
  }

  if ((event.buttons & 1) === 0) {
    stopBoardPan(board);
    return;
  }

  board.scrollLeft = boardPanState.originScrollLeft - (event.clientX - boardPanState.originClientX);
}

function handleBoardPanPointerEnd(event) {
  if (boardPanState.pointerId !== event.pointerId) {
    return;
  }

  const board = getBoardPanElement();
  if (!board) {
    return;
  }

  stopBoardPan(board);
}

function initializeBoardPanControls() {
  const board = getBoardPanElement();
  if (!board || boardPanState.initialized) {
    return;
  }

  board.addEventListener('pointerdown', handleBoardPanPointerDown);
  board.addEventListener('pointermove', handleBoardPanPointerMove);
  board.addEventListener('pointerup', handleBoardPanPointerEnd);
  board.addEventListener('pointercancel', handleBoardPanPointerEnd);
  // Losing the capture for any other reason must not leave the board stuck in the panning state.
  board.addEventListener('lostpointercapture', handleBoardPanPointerEnd);
  window.addEventListener('blur', () => stopBoardPan(board));
  boardPanState.initialized = true;
}
