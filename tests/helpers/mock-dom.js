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

  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .split('-')
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('');
      delete this.dataset[key];
    }
    if (name === 'class') {
      this.className = '';
    }
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

export { MockClassList, MockElement, findFirstByClass, clickEvent };
