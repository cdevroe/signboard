const TOOLTIP_TARGET_SELECTOR = 'button, a[href], [role="button"], select, input[type="button"], input[type="submit"], [data-sb-tooltip]';
const TOOLTIP_EXCLUDED_CONTAINER_SELECTOR = '#boardTabs';
const TOOLTIP_TEXT_ATTR = 'data-sb-tooltip';
const TOOLTIP_ID = 'sbTooltip';

function getTooltipState() {
  if (!window.__sbTooltipState) {
    window.__sbTooltipState = {
      initialized: false,
      tooltipEl: null,
      observer: null,
      activeTarget: null,
    };
  }

  return window.__sbTooltipState;
}

function ensureTooltipElement() {
  const state = getTooltipState();
  if (state.tooltipEl && state.tooltipEl.isConnected) {
    return state.tooltipEl;
  }

  let tooltipEl = document.getElementById(TOOLTIP_ID);
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = TOOLTIP_ID;
    tooltipEl.className = 'sb-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipEl.dataset.placement = 'top';
    document.body.appendChild(tooltipEl);
  }

  state.tooltipEl = tooltipEl;
  return tooltipEl;
}

function collapseTooltipText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isTooltipTarget(element) {
  if (!(element instanceof Element) || !element.matches(TOOLTIP_TARGET_SELECTOR)) {
    return false;
  }

  if (element.getAttribute('data-sb-tooltip-disabled') === 'true') {
    return false;
  }

  if (element.closest(TOOLTIP_EXCLUDED_CONTAINER_SELECTOR)) {
    return false;
  }

  return true;
}

function getTooltipTextFromElement(element) {
  const explicit = collapseTooltipText(element.getAttribute(TOOLTIP_TEXT_ATTR));
  if (explicit) {
    return explicit;
  }

  const title = collapseTooltipText(element.getAttribute('title'));
  if (title) {
    return title;
  }

  const alt = collapseTooltipText(element.getAttribute('alt'));
  if (alt) {
    return alt;
  }

  const ariaLabel = collapseTooltipText(element.getAttribute('aria-label'));
  if (ariaLabel) {
    return ariaLabel;
  }

  const imageWithAlt = element.querySelector('img[alt]');
  if (imageWithAlt) {
    const imageAlt = collapseTooltipText(imageWithAlt.getAttribute('alt'));
    if (imageAlt) {
      return imageAlt;
    }
  }

  return collapseTooltipText(element.textContent);
}

function syncTooltipTarget(element) {
  if (!isTooltipTarget(element)) {
    return;
  }

  const setTooltipText = (text) => {
    const normalizedText = collapseTooltipText(text);
    const currentText = collapseTooltipText(element.getAttribute(TOOLTIP_TEXT_ATTR));
    if (!normalizedText) {
      if (element.hasAttribute(TOOLTIP_TEXT_ATTR)) {
        element.removeAttribute(TOOLTIP_TEXT_ATTR);
      }
      return;
    }

    if (currentText !== normalizedText) {
      element.setAttribute(TOOLTIP_TEXT_ATTR, normalizedText);
    }
  };

  const title = collapseTooltipText(element.getAttribute('title'));
  if (title) {
    setTooltipText(title);
    if (!element.hasAttribute('aria-label')) {
      element.setAttribute('aria-label', title);
    }
    element.removeAttribute('title');
    return;
  }

  const tooltipText = getTooltipTextFromElement(element);
  if (tooltipText) {
    setTooltipText(tooltipText);
  } else {
    setTooltipText('');
  }
}

function syncTooltipTargets(root = document) {
  if (!root) {
    return;
  }

  if (isTooltipTarget(root)) {
    syncTooltipTarget(root);
  }

  if (typeof root.querySelectorAll !== 'function') {
    return;
  }

  const targets = root.querySelectorAll(TOOLTIP_TARGET_SELECTOR);
  for (const target of targets) {
    syncTooltipTarget(target);
  }
}

function findTooltipTarget(startNode) {
  if (!(startNode instanceof Element)) {
    return null;
  }

  const candidate = startNode.closest(TOOLTIP_TARGET_SELECTOR);
  if (!candidate || !isTooltipTarget(candidate)) {
    return null;
  }

  const tooltipText = collapseTooltipText(candidate.getAttribute(TOOLTIP_TEXT_ATTR));
  return tooltipText ? candidate : null;
}

function hideTooltip() {
  const state = getTooltipState();
  const tooltipEl = state.tooltipEl;
  if (!tooltipEl) {
    return;
  }

  state.activeTarget = null;
  tooltipEl.classList.remove('is-visible');
  tooltipEl.setAttribute('aria-hidden', 'true');
}

function updateTooltipPosition(target) {
  const state = getTooltipState();
  const tooltipEl = state.tooltipEl;
  if (!tooltipEl || !target) {
    return;
  }

  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltipEl.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const edgePadding = 10;
  const gap = 10;

  const minCenter = (tooltipRect.width / 2) + edgePadding;
  const maxCenter = viewportWidth - (tooltipRect.width / 2) - edgePadding;
  const centeredLeft = targetRect.left + (targetRect.width / 2);
  const left = Math.min(Math.max(centeredLeft, minCenter), Math.max(minCenter, maxCenter));

  let placement = 'top';
  let top = targetRect.top - tooltipRect.height - gap;
  if (top < edgePadding) {
    placement = 'bottom';
    top = targetRect.bottom + gap;
  }

  if (top + tooltipRect.height > viewportHeight - edgePadding) {
    top = viewportHeight - tooltipRect.height - edgePadding;
  }

  tooltipEl.dataset.placement = placement;
  tooltipEl.style.left = `${Math.round(left)}px`;
  tooltipEl.style.top = `${Math.round(Math.max(edgePadding, top))}px`;
}

function showTooltipForTarget(target) {
  const state = getTooltipState();
  const tooltipEl = ensureTooltipElement();
  const tooltipText = collapseTooltipText(target.getAttribute(TOOLTIP_TEXT_ATTR));
  if (!tooltipText) {
    hideTooltip();
    return;
  }

  state.activeTarget = target;
  tooltipEl.textContent = tooltipText;
  tooltipEl.setAttribute('aria-hidden', 'false');
  tooltipEl.classList.add('is-visible');
  updateTooltipPosition(target);
}

function handleTooltipPointerOver(event) {
  const target = findTooltipTarget(event.target);
  if (!target) {
    return;
  }

  showTooltipForTarget(target);
}

function handleTooltipPointerOut(event) {
  const state = getTooltipState();
  if (!state.activeTarget) {
    return;
  }

  const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
  if (relatedTarget && state.activeTarget.contains(relatedTarget)) {
    return;
  }

  hideTooltip();
}

function handleTooltipFocusIn(event) {
  const target = findTooltipTarget(event.target);
  if (!target) {
    return;
  }

  showTooltipForTarget(target);
}

function handleTooltipFocusOut(event) {
  const state = getTooltipState();
  if (!state.activeTarget) {
    return;
  }

  const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
  if (relatedTarget && state.activeTarget.contains(relatedTarget)) {
    return;
  }

  hideTooltip();
}

function handleTooltipViewportChange() {
  const state = getTooltipState();
  if (!state.activeTarget || !state.activeTarget.isConnected) {
    hideTooltip();
    return;
  }

  updateTooltipPosition(state.activeTarget);
}

function observeTooltipTargets() {
  const state = getTooltipState();
  if (state.observer || !document.body) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        syncTooltipTarget(mutation.target);
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }
        syncTooltipTargets(node);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label', 'alt', 'data-tooltip', 'data-sb-tooltip', 'data-sb-tooltip-disabled'],
  });

  state.observer = observer;
}

function initializeTooltips() {
  const state = getTooltipState();
  if (state.initialized || !document.body) {
    return;
  }

  ensureTooltipElement();
  syncTooltipTargets(document);

  document.addEventListener('mouseover', handleTooltipPointerOver);
  document.addEventListener('mouseout', handleTooltipPointerOut);
  document.addEventListener('focusin', handleTooltipFocusIn);
  document.addEventListener('focusout', handleTooltipFocusOut);
  document.addEventListener('pointerdown', hideTooltip);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideTooltip();
    }
  });

  window.addEventListener('resize', handleTooltipViewportChange);
  window.addEventListener('scroll', handleTooltipViewportChange, true);

  observeTooltipTargets();
  state.initialized = true;
}

function refreshTooltips(root) {
  syncTooltipTargets(root || document);
  handleTooltipViewportChange();
}
