const SB_STATUS_REGION_ID = 'signboardStatusRegion';
const SB_NATIVE_MENU_SETTLE_DELAY_MS = 0;
const SB_MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getAccessibilityState() {
  if (!window.__sbAccessibilityState) {
    window.__sbAccessibilityState = {
      initialized: false,
      activeModal: null,
      modalOpeners: new WeakMap(),
      statusClearTimer: null,
      reducedMotionQuery: null,
    };
  }

  return window.__sbAccessibilityState;
}

function createStableDomId(prefix, value) {
  const safePrefix = String(prefix || 'sb-id').replace(/[^a-z0-9_-]/gi, '') || 'sb-id';
  const source = String(value || '');
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }

  return `${safePrefix}-${Math.abs(hash).toString(36)}`;
}

function isElementActuallyVisible(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none') {
    return false;
  }

  return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function getFocusableElements(container) {
  if (!container || typeof container.querySelectorAll !== 'function') {
    return [];
  }

  return Array.from(container.querySelectorAll(SB_MODAL_FOCUSABLE_SELECTOR))
    .filter((element) => element instanceof HTMLElement)
    .filter((element) => !element.disabled)
    .filter((element) => element.tabIndex >= 0 || element.isContentEditable)
    .filter(isElementActuallyVisible);
}

function focusElementSafely(element) {
  if (!element || typeof element.focus !== 'function') {
    return false;
  }

  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }

  return true;
}

function focusFirstModalElement(modal, initialFocus) {
  if (!(modal instanceof HTMLElement)) {
    return false;
  }

  let target = null;
  if (initialFocus instanceof HTMLElement) {
    target = initialFocus;
  } else if (typeof initialFocus === 'string' && initialFocus.trim()) {
    target = modal.querySelector(initialFocus);
  }

  if (!(target instanceof HTMLElement) || !isElementActuallyVisible(target)) {
    target = getFocusableElements(modal)[0] || null;
  }

  if (!target) {
    if (!modal.hasAttribute('tabindex')) {
      modal.setAttribute('tabindex', '-1');
    }
    target = modal;
  }

  return focusElementSafely(target);
}

function getOpenAccessibleModals() {
  return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
    .filter((modal) => modal instanceof HTMLElement)
    .filter((modal) => modal.style.display === 'block' || modal.style.display === 'flex' || modal.style.display === 'grid')
    .filter((modal) => !modal.classList.contains('hidden') && modal.getAttribute('aria-hidden') !== 'true');
}

function refreshBackgroundInertState(activeModal) {
  if (!document.body) {
    return;
  }

  const bodyChildren = Array.from(document.body.children);
  for (const child of bodyChildren) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const isModalLayer = child.hasAttribute('data-sb-modal-layer');
    const shouldRemainInteractive = activeModal && (
      child === activeModal ||
      child.contains(activeModal) ||
      isModalLayer
    );
    if (activeModal && !shouldRemainInteractive) {
      if (!child.hasAttribute('data-sb-modal-inert')) {
        child.setAttribute('data-sb-modal-inert', child.inert ? 'existing' : 'added');
      }
      child.inert = true;
      continue;
    }

    const inertState = child.getAttribute('data-sb-modal-inert');
    if (inertState) {
      if (inertState === 'added') {
        child.inert = false;
      }
      child.removeAttribute('data-sb-modal-inert');
    }
  }
}

function getCurrentModalAfterClose(closedModal) {
  const openModals = getOpenAccessibleModals().filter((modal) => modal !== closedModal);
  return openModals.length > 0 ? openModals[openModals.length - 1] : null;
}

function setAccessibleModalVisible(modal, isVisible, options = {}) {
  if (!(modal instanceof HTMLElement)) {
    return false;
  }

  const state = getAccessibilityState();
  const shouldRestoreFocus = options.restoreFocus !== false;

  if (isVisible) {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (activeElement && !modal.contains(activeElement)) {
      state.modalOpeners.set(modal, activeElement);
    }

    if (!modal.hasAttribute('role')) {
      modal.setAttribute('role', 'dialog');
    }
    modal.setAttribute('aria-modal', options.ariaModal === false ? 'false' : 'true');
    modal.setAttribute('aria-hidden', 'false');
    if (options.label && !modal.hasAttribute('aria-label') && !modal.hasAttribute('aria-labelledby')) {
      modal.setAttribute('aria-label', options.label);
    }
    if (options.labelledBy) {
      modal.setAttribute('aria-labelledby', options.labelledBy);
    }

    modal.classList.remove('hidden');
    modal.style.display = options.display || modal.dataset.sbModalDisplay || 'block';
    state.activeModal = modal;
    refreshBackgroundInertState(modal);

    window.requestAnimationFrame(() => {
      if (state.activeModal === modal && modal.getAttribute('aria-hidden') !== 'true') {
        focusFirstModalElement(modal, options.initialFocus);
      }
    });
    return true;
  }

  modal.style.display = 'none';
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');

  if (state.activeModal === modal) {
    state.activeModal = getCurrentModalAfterClose(modal);
  }

  refreshBackgroundInertState(state.activeModal);

  if (shouldRestoreFocus) {
    const opener = state.modalOpeners.get(modal);
    if (opener && opener.isConnected && isElementActuallyVisible(opener)) {
      window.requestAnimationFrame(() => {
        focusElementSafely(opener);
      });
    }
  }

  state.modalOpeners.delete(modal);
  return true;
}

function ensureSignboardStatusRegion() {
  let statusRegion = document.getElementById(SB_STATUS_REGION_ID);
  if (statusRegion) {
    return statusRegion;
  }

  statusRegion = document.createElement('div');
  statusRegion.id = SB_STATUS_REGION_ID;
  statusRegion.className = 'sr-only';
  statusRegion.setAttribute('role', 'status');
  statusRegion.setAttribute('aria-live', 'polite');
  statusRegion.setAttribute('aria-atomic', 'true');
  document.body.appendChild(statusRegion);
  return statusRegion;
}

function announceSignboardStatus(message) {
  const statusRegion = ensureSignboardStatusRegion();
  const state = getAccessibilityState();
  const normalizedMessage = String(message || '').trim();

  if (state.statusClearTimer) {
    window.clearTimeout(state.statusClearTimer);
    state.statusClearTimer = null;
  }

  statusRegion.textContent = '';
  if (!normalizedMessage) {
    return;
  }

  window.setTimeout(() => {
    statusRegion.textContent = normalizedMessage;
  }, 20);

  state.statusClearTimer = window.setTimeout(() => {
    statusRegion.textContent = '';
    state.statusClearTimer = null;
  }, 5000);
}

function prefersReducedMotion() {
  const state = getAccessibilityState();
  if (!state.reducedMotionQuery && typeof window.matchMedia === 'function') {
    state.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  }

  return Boolean(state.reducedMotionQuery && state.reducedMotionQuery.matches);
}

function waitForNativeMenuTrackingToSettle() {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => resolve());
        return;
      }

      resolve();
    }, SB_NATIVE_MENU_SETTLE_DELAY_MS);
  });
}

function handleModalFocusTrap(event) {
  const state = getAccessibilityState();
  const modal = state.activeModal;

  if (event.key !== 'Tab' || !(modal instanceof HTMLElement) || modal.getAttribute('aria-hidden') === 'true') {
    return;
  }

  const focusableElements = getFocusableElements(modal);
  if (focusableElements.length === 0) {
    event.preventDefault();
    focusElementSafely(modal);
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (!modal.contains(activeElement)) {
    event.preventDefault();
    focusElementSafely(event.shiftKey ? lastElement : firstElement);
    return;
  }

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault();
    focusElementSafely(lastElement);
    return;
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    focusElementSafely(firstElement);
  }
}

function handleKeyboardFocusModality(event) {
  if (!event || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  const key = String(event.key || '');
  const keyboardNavigationKeys = new Set([
    'Tab',
    'ArrowUp',
    'ArrowRight',
    'ArrowDown',
    'ArrowLeft',
    'Enter',
    ' ',
    'Spacebar',
  ]);

  if (keyboardNavigationKeys.has(key) && document.documentElement) {
    document.documentElement.classList.add('sb-keyboard-focus-active');
  }
}

function handlePointerFocusModality() {
  if (document.documentElement) {
    document.documentElement.classList.remove('sb-keyboard-focus-active');
  }
}

function initializeAccessibilityHelpers() {
  const state = getAccessibilityState();
  if (state.initialized || !document.body) {
    return;
  }

  ensureSignboardStatusRegion();
  document.addEventListener('keydown', handleKeyboardFocusModality, true);
  document.addEventListener('pointerdown', handlePointerFocusModality, true);
  document.addEventListener('mousedown', handlePointerFocusModality, true);
  document.addEventListener('keydown', handleModalFocusTrap, true);
  state.initialized = true;
}
