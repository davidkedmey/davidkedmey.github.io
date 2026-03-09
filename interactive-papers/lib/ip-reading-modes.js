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

  // ── Pattern save/load (Clean mode worksheets) ──

  var paperId = (window.InteractivePaper && window.InteractivePaper._config &&
                 window.InteractivePaper._config.id) || 'default';
  var PATTERNS_KEY = 'ip_patterns_' + paperId;

  function loadPatterns() {
    try { return JSON.parse(localStorage.getItem(PATTERNS_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function savePatterns(patterns) {
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(patterns));
  }

  // Extract blank positions from a paragraph (relative to its textContent)
  function extractBlanks(paraEl) {
    var blanks = [];
    var spans = paraEl.querySelectorAll('.cloze-blank');
    if (!spans.length) return blanks;
    // Temporarily reveal all to get clean textContent positions
    // Instead, walk the DOM and track character position
    var pos = 0;
    function walk(node) {
      if (node.nodeType === 3) {
        pos += node.textContent.length;
      } else if (node.classList && node.classList.contains('cloze-blank')) {
        blanks.push({ word: node.dataset.word, charIndex: pos });
        pos += node.dataset.word.length;
      } else {
        for (var i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
        }
      }
    }
    walk(paraEl);
    return blanks;
  }

  // Apply a saved pattern to a paragraph
  function applyPattern(paraEl, blanks) {
    // First clear any existing blanks in this paragraph
    paraEl.querySelectorAll('.cloze-blank').forEach(revealBlank);
    // Get the full text and find each blank by charIndex
    var text = paraEl.textContent;
    // Apply blanks in reverse order so char positions stay valid
    var sorted = blanks.slice().sort(function (a, b) { return b.charIndex - a.charIndex; });
    sorted.forEach(function (b) {
      // Find the text node and offset for this charIndex
      var pos = 0;
      var walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
      var node;
      while (node = walker.nextNode()) {
        var nodeEnd = pos + node.textContent.length;
        if (b.charIndex >= pos && b.charIndex < nodeEnd) {
          var localStart = b.charIndex - pos;
          var localEnd = localStart + b.word.length;
          // Verify the text matches
          if (node.textContent.slice(localStart, localEnd) === b.word) {
            var range = document.createRange();
            range.setStart(node, localStart);
            range.setEnd(node, localEnd);
            blankRange(range);
          }
          break;
        }
        pos = nodeEnd;
      }
    });
  }

  // ── Save / Clear buttons (appear when blanks exist) ──
  var btnWrap = document.createElement('div');
  btnWrap.className = 'cloze-btn-wrap';
  btnWrap.style.display = 'none';

  var saveBtn = document.createElement('button');
  saveBtn.className = 'cloze-save-btn';
  saveBtn.textContent = 'Save pattern';

  var clearBtn = document.createElement('button');
  clearBtn.className = 'cloze-save-btn';
  clearBtn.textContent = 'Clear';

  btnWrap.appendChild(saveBtn);
  btnWrap.appendChild(clearBtn);
  document.body.appendChild(btnWrap);

  var saveBtnPara = null; // which paragraph the buttons are anchored to

  function updateSaveBtn() {
    if (current !== 'clean') { btnWrap.style.display = 'none'; return; }
    // Find a paragraph with active blanks
    var paras = document.querySelectorAll('article p[id^="p"]');
    var found = null;
    for (var i = 0; i < paras.length; i++) {
      if (paras[i].querySelector('.cloze-blank')) { found = paras[i]; break; }
    }
    if (!found) { btnWrap.style.display = 'none'; saveBtnPara = null; return; }
    saveBtnPara = found;
    var rect = found.getBoundingClientRect();
    btnWrap.style.display = '';
    btnWrap.style.position = 'fixed';
    btnWrap.style.left = (rect.right + 12) + 'px';
    btnWrap.style.top = (rect.top) + 'px';
  }

  saveBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!saveBtnPara) return;
    var pid = saveBtnPara.id;
    var blanks = extractBlanks(saveBtnPara);
    if (!blanks.length) return;

    var patterns = loadPatterns();
    if (!patterns[pid]) patterns[pid] = [];
    patterns[pid].push({ blanks: blanks, created: Date.now() });
    savePatterns(patterns);

    // Flash confirmation
    saveBtn.textContent = 'Saved!';
    setTimeout(function () { saveBtn.textContent = 'Save pattern'; }, 1200);

    renderPatternDots();
  });

  clearBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    clearAllBlanks();
    updateSaveBtn();
  });

  // ── Pattern dots in margin ──
  var dotContainer = document.createElement('div');
  dotContainer.className = 'cloze-pattern-dots';
  document.body.appendChild(dotContainer);

  function renderPatternDots() {
    dotContainer.innerHTML = '';
    if (current !== 'clean') return;
    var patterns = loadPatterns();
    Object.keys(patterns).forEach(function (pid) {
      var paraEl = document.getElementById(pid);
      if (!paraEl || !patterns[pid].length) return;
      var group = document.createElement('div');
      group.className = 'cloze-dot-group';
      group.dataset.para = pid;
      patterns[pid].forEach(function (pat, idx) {
        var dot = document.createElement('button');
        dot.className = 'cloze-dot';
        dot.textContent = idx + 1;
        dot.title = 'Pattern ' + (idx + 1);
        dot.addEventListener('click', function (e) {
          e.stopPropagation();
          applyPattern(paraEl, pat.blanks);
          updateSaveBtn();
        });
        // Long-press / right-click to delete
        dot.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();
          patterns[pid].splice(idx, 1);
          if (!patterns[pid].length) delete patterns[pid];
          savePatterns(patterns);
          renderPatternDots();
        });
        group.appendChild(dot);
      });
      dotContainer.appendChild(group);
    });
    positionDotGroups();
  }

  function positionDotGroups() {
    var groups = dotContainer.querySelectorAll('.cloze-dot-group');
    groups.forEach(function (g) {
      var paraEl = document.getElementById(g.dataset.para);
      if (!paraEl) return;
      var rect = paraEl.getBoundingClientRect();
      g.style.position = 'fixed';
      g.style.left = (rect.left - 28) + 'px';
      g.style.top = rect.top + 'px';
    });
  }

  // Update positions on scroll
  window.addEventListener('scroll', function () {
    if (current === 'clean') {
      positionDotGroups();
      updateSaveBtn();
    }
  }, { passive: true });

  // Update on blank/reveal actions
  var origBlankRange = blankRange;
  blankRange = function (r) {
    origBlankRange(r);
    setTimeout(updateSaveBtn, 10);
  };

  document.addEventListener('click', function () {
    if (current === 'clean') setTimeout(updateSaveBtn, 50);
  });

  // Render dots when entering clean mode
  document.addEventListener('ip:modechange', function (e) {
    if (e.detail.mode === 'clean') {
      renderPatternDots();
      updateSaveBtn();
    } else {
      dotContainer.innerHTML = '';
      btnWrap.style.display = 'none';
    }
  });

  // Initial render if starting in clean mode
  if (current === 'clean') {
    document.addEventListener('DOMContentLoaded', function () {
      renderPatternDots();
    });
  }

  // Expose API
  window.InteractivePaper = window.InteractivePaper || {};
  window.InteractivePaper.readingModes = {
    get: function () { return current; },
    set: setMode
  };
})();
