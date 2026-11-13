// A minimal DOM for testing the web embed in Node: just the parts it uses
// (tree walking, text nodes, attributes, insertBefore/removeChild, click
// listeners, one querySelector form). Not a test file itself.

class FakeNode {
  constructor(doc, nodeType, nodeName) {
    this.ownerDocument = doc;
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.parentNode = null;
    this.childNodes = [];
  }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const sib = this.parentNode.childNodes;
    return sib[sib.indexOf(this) + 1] || null;
  }
  get textContent() {
    if (this.nodeType === 3) return this.nodeValue;
    return this.childNodes.map((c) => c.textContent).join('');
  }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, ref) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    if (i < 0) throw new Error('insertBefore: reference is not a child');
    this.childNodes.splice(i, 0, child);
    child.parentNode = this;
    this.ownerDocument?.record({ type: 'childList', target: this, addedNodes: [child] });
    return child;
  }
  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i < 0) throw new Error('removeChild: not a child');
    this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }
}

class FakeText extends FakeNode {
  constructor(doc, value) {
    super(doc, 3, '#text');
    this.nodeValue = value;
  }
}

class FakeElement extends FakeNode {
  constructor(doc, tag) {
    super(doc, 1, tag.toUpperCase());
    this.attrs = new Map();
    this.listeners = {};
  }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() {
    const ev = { defaultPrevented: false, propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } };
    for (const fn of this.listeners.click || []) fn(ev);
    return ev;
  }
  get src() { return this.getAttribute('src') || ''; }
  /** Elements below this one, in document order. */
  *descendants() {
    for (const c of this.childNodes) {
      if (c.nodeType !== 1) continue;
      yield c;
      yield* c.descendants();
    }
  }
}

export class FakeDocument extends FakeNode {
  constructor() {
    super(null, 9, '#document');
    this.ownerDocument = null;
    this.mutations = [];
    this.documentElement = this.createElement('html');
    this.head = this.createElement('head');
    this.body = this.createElement('body');
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.readyState = 'complete';
    this.mutations = [];
  }
  record(m) { if (this.mutations) this.mutations.push(m); }
  createElement(tag) { return new FakeElement(this, tag); }
  createTextNode(v) { return new FakeText(this, v); }
  /** Supports `tag[attr]` only, which is what the embed asks for. */
  querySelector(sel) {
    const m = /^(\w+)\[([\w-]+)\]$/.exec(sel);
    if (!m) throw new Error(`fake querySelector: unsupported selector ${sel}`);
    for (const el of this.documentElement.descendants()) {
      if (el.nodeName === m[1].toUpperCase() && el.getAttribute(m[2]) != null) return el;
    }
    return null;
  }
  /** h('p', {class: 'x'}, 'text', h('span', {}, '[NTK …]')) */
  h(tag, attrs = {}, ...children) {
    const el = this.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    for (const c of children) el.appendChild(typeof c === 'string' ? this.createTextNode(c) : c);
    return el;
  }
}

/** A window-like object: records opened URLs and navigations. */
export function fakeView({ display } = {}) {
  const view = {
    opened: [],
    assigned: [],
    open(url, target, features) { view.opened.push({ url, target, features }); return null; },
    location: { assign(url) { view.assigned.push(url); } },
    observers: [],
    MutationObserver: class {
      constructor(cb) { this.cb = cb; view.observers.push(this); }
      observe(target, opts) { this.target = target; this.opts = opts; }
    },
  };
  if (display) view.getComputedStyle = (el) => ({ display: display(el) });
  return view;
}
