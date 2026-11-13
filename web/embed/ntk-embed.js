/*! NTK web embed. Turns NTK stamp tags such as [NTK e65ee28db5] in a page's
 * text into buttons. A click opens the NTK verify page for that stamp with the
 * text that stands before the tag in the same block element.
 *
 *   <script src="https://ntk.tools/embed/ntk-embed.js" defer></script>
 *
 * Options, as attributes on that script tag:
 *   data-verify-base="https://ntk.tools/"  where verify pages live (default: the site the script came from)
 *   data-target="_self"                    open the verify page in this tab (default: a new tab)
 *
 * The text goes into the address fragment (#t=...), which browsers never send to
 * a server. The embed fetches nothing and sends nothing until a button is clicked.
 * New content is picked up as it appears (MutationObserver). Text inside links,
 * buttons, form fields, editable areas, scripts and styles is left alone.
 * No dependencies; a classic script for any page. MIT licence, part of NTK.
 */
(function (root) {
  'use strict';

  if (root.NTKEmbed && root.NTKEmbed.started) return;

  var DEFAULT_BASE = 'https://ntk.tools/';
  // The same pattern as TAG_SOURCE in lib/ntk-verify.js; web/test/embed.test.mjs checks that they agree.
  var TAG_SOURCE = '\\[NTK(?: @[^\\s\\]]+)? ([0-9a-f]{10})\\]';
  var BUTTON_CLASS = 'ntk-embed-btn';
  var MARK_ATTR = 'data-ntk-embed';
  var MAX_PREFIX = 40000; // code points; a stamp covers at most 20,000 typed characters

  // Never turn text into a button inside these.
  var NO_WRAP = { A: 1, BUTTON: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, MATH: 1 };
  // Not part of the text a reader sees.
  var NO_TEXT = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  // Block elements, for when the page's computed style is not available.
  var BLOCK = {};
  ('ADDRESS ARTICLE ASIDE BLOCKQUOTE BODY CAPTION DD DETAILS DIALOG DIV DL DT FIELDSET FIGCAPTION FIGURE ' +
    'FOOTER FORM H1 H2 H3 H4 H5 H6 HEADER HR HTML LI MAIN NAV OL P PRE SECTION SUMMARY TABLE TBODY TD TH THEAD TR UL')
    .split(' ').forEach(function (n) { BLOCK[n] = 1; });

  var tagName = function (el) { return String(el.nodeName || '').toUpperCase(); };
  var isElement = function (n) { return !!n && n.nodeType === 1; };

  /** Tags in a string: [{ id, index, length, text }]. */
  function findTags(text) {
    var re = new RegExp(TAG_SOURCE, 'g');
    var out = [];
    var m;
    while ((m = re.exec(text))) out.push({ id: m[1], index: m.index, length: m[0].length, text: m[0] });
    return out;
  }

  /** UTF-8, then base64url without padding: the same as encodeText in lib/ntk-verify.js. */
  function encodeText(s) {
    var bytes = new TextEncoder().encode(String(s));
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function verifyUrl(base, id, prefix) {
    return base + id + (prefix ? '#t=' + encodeText(prefix) : '');
  }

  function lastCodePoints(s, n) {
    if (s.length <= n) return s;
    var cps = Array.from(s);
    return cps.length <= n ? s : cps.slice(cps.length - n).join('');
  }

  function isBlock(el, view) {
    if (view && typeof view.getComputedStyle === 'function') {
      try {
        var d = view.getComputedStyle(el).display;
        if (d) return !(d === 'contents' || d.lastIndexOf('inline', 0) === 0);
      } catch (e) { /* not an element of this window: fall back to the tag name */ }
    }
    return !!BLOCK[tagName(el)];
  }

  /** The nearest block element around a node. */
  function blockOf(node, view) {
    for (var el = node.parentNode; isElement(el); el = el.parentNode) if (isBlock(el, view)) return el;
    return null;
  }

  /**
   * The text of `block` before `stop`, as a reader sees it: text nodes in order,
   * <br> and the edges of nested blocks as line breaks, an image's alt text.
   */
  function textBefore(block, stop, view) {
    var out = [];
    var done = false;
    (function walk(node) {
      for (var c = node.firstChild; c && !done; c = c.nextSibling) {
        if (c === stop) { done = true; return; }
        if (c.nodeType === 3) { out.push(c.nodeValue); continue; }
        if (!isElement(c)) continue;
        var n = tagName(c);
        if (NO_TEXT[n]) continue;
        if (n === 'BR') { out.push('\n'); continue; }
        if (n === 'IMG') { var alt = c.getAttribute('alt'); if (alt) out.push(alt); continue; }
        var blk = isBlock(c, view);
        if (blk) out.push('\n');
        walk(c);
        if (blk && !done) out.push('\n');
      }
    })(block);
    return out.join('');
  }

  function editable(el) {
    if (el.isContentEditable === true) return true;
    var ce = el.getAttribute && el.getAttribute('contenteditable');
    return ce === '' || ce === 'true' || ce === 'plaintext-only';
  }

  /** True when text under `el` must stay as it is. */
  function leaveAlone(el) {
    for (var e = el; isElement(e); e = e.parentNode) {
      if (NO_WRAP[tagName(e)] || e.getAttribute(MARK_ATTR) != null || editable(e)) return true;
    }
    return false;
  }

  function openVerify(button, id, opts) {
    var block = blockOf(button, opts.view) || opts.doc.body;
    var prefix = lastCodePoints(textBefore(block, button, opts.view), MAX_PREFIX);
    var url = verifyUrl(opts.base, id, prefix);
    if (opts.target === '_self') opts.view.location.assign(url);
    else opts.view.open(url, opts.target, 'noopener');
    return url;
  }

  function makeButton(tag, opts) {
    var b = opts.doc.createElement('button');
    b.setAttribute('type', 'button');
    b.setAttribute('class', BUTTON_CLASS);
    b.setAttribute(MARK_ATTR, tag.id);
    b.setAttribute('title', 'Check this NTK stamp');
    b.appendChild(opts.doc.createTextNode(tag.text));
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      openVerify(b, tag.id, opts);
    });
    return b;
  }

  /** Replace each tag in one text node by a button with the same text. Returns how many. */
  function wrapTextNode(node, opts) {
    var text = node.nodeValue;
    var tags = findTags(text);
    var parent = node.parentNode;
    if (!tags.length || !parent) return 0;
    var last = 0;
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i];
      if (t.index > last) parent.insertBefore(opts.doc.createTextNode(text.slice(last, t.index)), node);
      parent.insertBefore(makeButton(t, opts), node);
      last = t.index + t.length;
    }
    if (last < text.length) parent.insertBefore(opts.doc.createTextNode(text.slice(last)), node);
    parent.removeChild(node);
    return tags.length;
  }

  function collect(node, out) {
    if (node.nodeType === 3) {
      if (node.nodeValue && node.nodeValue.indexOf('[NTK') !== -1) out.push(node);
      return;
    }
    if (isElement(node) && (NO_WRAP[tagName(node)] || node.getAttribute(MARK_ATTR) != null)) return;
    for (var c = node.firstChild; c; c = c.nextSibling) collect(c, out);
  }

  /** Turn every tag under `node` into a button. Returns how many were made. */
  function scan(node, opts) {
    var found = [];
    collect(node, found);
    var n = 0;
    for (var i = 0; i < found.length; i++) {
      var t = found[i];
      if (t.parentNode && !leaveAlone(t.parentNode)) n += wrapTextNode(t, opts);
    }
    return n;
  }

  /** Settings from the script tag that loaded the embed. */
  function options(doc, view, script) {
    var src = (script && script.src) || '';
    var base = (script && script.getAttribute('data-verify-base')) || '';
    if (!base) base = src ? new URL('../', src).href : DEFAULT_BASE;
    if (base.charAt(base.length - 1) !== '/') base += '/';
    return {
      doc: doc,
      view: view,
      base: base,
      css: src ? new URL('ntk-embed.css', src).href : DEFAULT_BASE + 'embed/ntk-embed.css',
      target: (script && script.getAttribute('data-target')) || '_blank',
    };
  }

  function start(doc, view, script) {
    if (api.started) return api.options;
    var opts = options(doc, view, script);
    api.started = true;
    api.options = opts;
    if (!doc.querySelector('link[' + MARK_ATTR + ']')) {
      var link = doc.createElement('link');
      link.setAttribute('rel', 'stylesheet');
      link.setAttribute('href', opts.css);
      link.setAttribute(MARK_ATTR, 'css');
      (doc.head || doc.documentElement).appendChild(link);
    }
    scan(doc.body, opts);
    if (typeof view.MutationObserver === 'function') {
      new view.MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          if (r.type === 'characterData') {
            if (r.target.parentNode) scan(r.target, opts);
            continue;
          }
          for (var j = 0; j < r.addedNodes.length; j++) if (r.addedNodes[j].parentNode) scan(r.addedNodes[j], opts);
        }
      }).observe(doc.body, { childList: true, subtree: true, characterData: true });
    }
    return opts;
  }

  var api = {
    version: '1',
    started: false,
    options: null,
    TAG_SOURCE: TAG_SOURCE,
    findTags: findTags,
    encodeText: encodeText,
    verifyUrl: verifyUrl,
    lastCodePoints: lastCodePoints,
    isBlock: isBlock,
    blockOf: blockOf,
    textBefore: textBefore,
    scan: scan,
    readOptions: options,
    openVerify: openVerify,
    start: start,
  };
  root.NTKEmbed = api;

  var doc = root.document;
  if (doc && !root.NTK_EMBED_MANUAL) {
    var script = doc.currentScript;
    var go = function () { start(doc, root, script); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', go);
    else go();
  }
})(typeof window !== 'undefined' ? window : this);
