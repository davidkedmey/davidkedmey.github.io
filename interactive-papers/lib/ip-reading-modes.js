/* ip-reading-modes.js — 3-mode toggle (Clean / Enhanced / Multimedia)
   Reads config from InteractivePaper._config.readingModes */

(function () {
  'use strict';

  var cfg = (window.InteractivePaper && window.InteractivePaper._config &&
             window.InteractivePaper._config.readingModes) || {};
  var MODES = ['clean', 'enhanced', 'multimedia'];
  var storageKey = 'ip_reading_mode_' + ((window.InteractivePaper && window.InteractivePaper._config && window.InteractivePaper._config.id) || 'default');
  var saved = localStorage.getItem(storageKey);
  var current = MODES.indexOf(saved) >= 0 ? saved : (cfg.default || 'enhanced');

  function setMode(mode) {
    current = mode;
    MODES.forEach(function (m) { document.body.classList.remove('mode-' + m); });
    document.body.classList.add('mode-' + mode);
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
    localStorage.setItem(storageKey, mode);

    // Fire custom event so paper-specific code can react
    document.dispatchEvent(new CustomEvent('ip:modechange', { detail: { mode: mode } }));
  }

  // Set initial mode
  setMode(current);

  // Disable multimedia button (not yet implemented)
  document.querySelectorAll('.mode-btn[data-mode="multimedia"]').forEach(function (btn) {
    btn.classList.add('disabled');
    btn.setAttribute('title', 'Coming soon');
  });

  // Bind clicks
  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.classList.contains('disabled')) return;
      setMode(btn.getAttribute('data-mode'));
    });
  });

  // ── Tap-to-blank cloze (Clean mode) ──

  function getWordRangeAtPoint(x, y) {
    var range;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (!range || range.startContainer.nodeType !== 3) return null;

    var text = range.startContainer.textContent;
    var offset = range.startOffset;
    var start = offset, end = offset;
    while (start > 0 && /\S/.test(text[start - 1])) start--;
    while (end < text.length && /\S/.test(text[end])) end++;
    if (start === end) return null;

    var wordRange = document.createRange();
    wordRange.setStart(range.startContainer, start);
    wordRange.setEnd(range.startContainer, end);
    return wordRange;
  }

  function blankRange(r) {
    var span = document.createElement('span');
    span.className = 'cloze-blank';
    span.dataset.word = r.toString();
    try { r.surroundContents(span); } catch (e) { return; }
    // Keep original text in DOM but CSS hides it (color: transparent)
  }

  function revealBlank(span) {
    var text = document.createTextNode(span.dataset.word);
    span.parentNode.replaceChild(text, span);
    text.parentNode.normalize();
  }

  function clearAllBlanks() {
    document.querySelectorAll('.cloze-blank').forEach(revealBlank);
  }

  // Click to blank a word / click a blank to reveal
  document.addEventListener('click', function (e) {
    if (current !== 'clean') return;

    // Click on a blank → reveal it
    if (e.target.classList && e.target.classList.contains('cloze-blank')) {
      revealBlank(e.target);
      return;
    }

    // Must be inside a paper paragraph
    var p = e.target.closest && e.target.closest('article p[id^="p"]');
    if (!p) return;

    // Don't blank if user is selecting text (drag-select)
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;

    var wordRange = getWordRangeAtPoint(e.clientX, e.clientY);
    if (wordRange) blankRange(wordRange);
  });

  // Select text + Delete/Backspace → blank the selection
  document.addEventListener('keydown', function (e) {
    if (current !== 'clean') return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;

    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;

    var range = sel.getRangeAt(0);
    var container = range.commonAncestorContainer;
    while (container && container.nodeType !== 1) container = container.parentNode;
    if (!container || !(container.closest && container.closest('article p[id^="p"]'))) return;

    e.preventDefault();
    blankRange(range);
    sel.removeAllRanges();
  });

  // Clear blanks when leaving clean mode
  document.addEventListener('ip:modechange', function (e) {
    if (e.detail.mode !== 'clean') clearAllBlanks();
  });

  // Expose API
  window.InteractivePaper = window.InteractivePaper || {};
  window.InteractivePaper.readingModes = {
    get: function () { return current; },
    set: setMode
  };
})();
