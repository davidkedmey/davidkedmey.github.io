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

    // Click on a blank → peek (if viewing saved pattern) or reveal (if drafting/free)
    if (e.target.classList && e.target.classList.contains('cloze-blank')) {
      var p = e.target.closest && e.target.closest('p[id^="p"]');
      var pid = p && p.id;
      var barState = pid && activeBars[pid];
      var isViewing = barState && barState.activeIdx >= 0 && !barState.isEditing();
      if (isViewing) {
        // Peek: temporarily show the word
        var span = e.target;
        span.classList.add('cloze-peek');
        setTimeout(function () { span.classList.remove('cloze-peek'); }, 1200);
      } else {
        revealBlank(e.target);
      }
      return;
    }

    // Must be inside a paper paragraph
    var p = e.target.closest && e.target.closest('article p[id^="p"]');
    if (!p) return;

    // Only allow blanking when drafting or editing
    var pid = p.id;
    var barState = pid && activeBars[pid];
    if (!barState || (!barState.isDrafting() && !barState.isEditing())) return;

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
    var para = container && container.closest && container.closest('article p[id^="p"]');
    if (!para) return;

    // Only allow blanking when drafting or editing
    var pid = para.id;
    var barState = pid && activeBars[pid];
    if (!barState || (!barState.isDrafting() && !barState.isEditing())) return;

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
  var seedPatterns = (cfg && cfg.seedPatterns) || {};

  function loadUserPatterns() {
    try { return JSON.parse(localStorage.getItem(PATTERNS_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveUserPatterns(patterns) {
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(patterns));
  }

  // Merge seed + user patterns for a paragraph
  function getAllPatterns(pid) {
    var seeds = (seedPatterns[pid] || []).map(function (p) {
      return { label: p.label, blanks: p.blanks, seed: true };
    });
    var user = loadUserPatterns();
    var userPats = (user[pid] || []).map(function (p, i) {
      return { label: p.label || ('My pattern ' + (i + 1)), blanks: p.blanks, seed: false };
    });
    return seeds.concat(userPats);
  }

  // Which paragraphs have patterns?
  function parasWithPatterns() {
    var pids = {};
    Object.keys(seedPatterns).forEach(function (k) { if (seedPatterns[k].length) pids[k] = true; });
    var user = loadUserPatterns();
    Object.keys(user).forEach(function (k) { if (user[k].length) pids[k] = true; });
    return Object.keys(pids);
  }

  // Extract blank positions from a paragraph
  function extractBlanks(paraEl) {
    var blanks = [];
    var pos = 0;
    function walk(node) {
      if (node.nodeType === 3) {
        pos += node.textContent.length;
      } else if (node.classList && node.classList.contains('cloze-blank')) {
        blanks.push({ word: node.dataset.word, charIndex: pos });
        pos += node.dataset.word.length;
      } else {
        for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      }
    }
    walk(paraEl);
    return blanks;
  }

  // Apply a pattern to a paragraph
  function applyPattern(paraEl, blanks) {
    paraEl.querySelectorAll('.cloze-blank').forEach(revealBlank);
    var sorted = blanks.slice().sort(function (a, b) { return b.charIndex - a.charIndex; });
    sorted.forEach(function (b) {
      var pos = 0;
      var walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
      var node;
      while (node = walker.nextNode()) {
        var nodeEnd = pos + node.textContent.length;
        if (b.charIndex >= pos && b.charIndex < nodeEnd) {
          var localStart = b.charIndex - pos;
          var localEnd = localStart + b.word.length;
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

  // ── Pattern bar (horizontal dots above paragraph) ──
  var activeBars = {}; // pid → { bar, activeIdx }

  function buildPatternBar(pid) {
    var paraEl = document.getElementById(pid);
    if (!paraEl) return;
    var patterns = getAllPatterns(pid);
    if (!patterns.length) return;

    // Remove old bar if any
    if (activeBars[pid] && activeBars[pid].bar.parentNode) {
      activeBars[pid].bar.parentNode.removeChild(activeBars[pid].bar);
    }

    var bar = document.createElement('div');
    bar.className = 'cloze-bar';
    bar.dataset.para = pid;

    // Left arrow
    var leftArr = document.createElement('button');
    leftArr.className = 'cloze-bar-arrow';
    leftArr.textContent = '\u25C0';
    leftArr.setAttribute('aria-label', 'Previous pattern');
    bar.appendChild(leftArr);

    // Dots
    var dotWrap = document.createElement('div');
    dotWrap.className = 'cloze-bar-dots';
    var dots = [];
    patterns.forEach(function (pat, idx) {
      var dot = document.createElement('button');
      dot.className = 'cloze-bar-dot' + (pat.seed ? '' : ' cloze-bar-dot-user');
      dot.title = pat.label;
      dot.dataset.idx = idx;
      dotWrap.appendChild(dot);
      dots.push(dot);
    });

    // "+" dot to save a new pattern
    var addDot = document.createElement('button');
    addDot.className = 'cloze-bar-dot cloze-bar-add';
    addDot.textContent = '+';
    addDot.title = 'Save current blanks as a new pattern';
    dotWrap.appendChild(addDot);

    bar.appendChild(dotWrap);

    // Right arrow
    var rightArr = document.createElement('button');
    rightArr.className = 'cloze-bar-arrow';
    rightArr.textContent = '\u25B6';
    rightArr.setAttribute('aria-label', 'Next pattern');
    bar.appendChild(rightArr);

    // Label
    var label = document.createElement('span');
    label.className = 'cloze-bar-label';
    bar.appendChild(label);

    // Edit button
    var editBtn = document.createElement('button');
    editBtn.className = 'cloze-bar-btn';
    editBtn.textContent = 'Edit';
    editBtn.style.display = 'none';
    bar.appendChild(editBtn);

    // Save button
    var saveBtn = document.createElement('button');
    saveBtn.className = 'cloze-bar-btn';
    saveBtn.textContent = 'Save';
    saveBtn.style.display = 'none';
    bar.appendChild(saveBtn);

    // Delete button
    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'cloze-bar-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.display = 'none';
    bar.appendChild(deleteBtn);

    // Clear button
    var clearBtn = document.createElement('button');
    clearBtn.className = 'cloze-bar-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.style.display = 'none';
    bar.appendChild(clearBtn);

    // Insert bar above the paragraph
    paraEl.parentNode.insertBefore(bar, paraEl);

    // ── State machine ──
    // Modes: 'idle' | 'viewing' | 'drafting' | 'editing'
    var mode = 'idle';
    var draftDot = null;

    var state = {
      bar: bar, activeIdx: -1, patterns: patterns, dots: dots,
      label: label, paraEl: paraEl, clearBtn: clearBtn,
      isEditing: function () { return mode === 'editing'; },
      isDrafting: function () { return mode === 'drafting'; },
      getMode: function () { return mode; }
    };
    activeBars[pid] = state;

    function lockScroll(fn) {
      var y = window.scrollY;
      fn();
      window.scrollTo(0, y);
      requestAnimationFrame(function () {
        window.scrollTo(0, y);
        requestAnimationFrame(function () { window.scrollTo(0, y); });
      });
    }

    // Clean up current mode before transitioning
    function exitMode() {
      if (mode === 'drafting' && draftDot) {
        if (draftDot.parentNode) draftDot.parentNode.removeChild(draftDot);
        draftDot = null;
      }
      if (mode === 'editing' && state.activeIdx >= 0 && dots[state.activeIdx]) {
        dots[state.activeIdx].classList.remove('cloze-bar-draft');
      }
    }

    // Set button visibility + label for a mode (one place, no scattering)
    function applyModeUI() {
      var pat = (state.activeIdx >= 0 && state.activeIdx < patterns.length)
        ? patterns[state.activeIdx] : null;
      var isUser = pat && !pat.seed;

      if (mode === 'idle') {
        editBtn.style.display = 'none';
        saveBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        clearBtn.style.display = 'none';
        label.textContent = '';
      } else if (mode === 'viewing') {
        editBtn.style.display = '';
        saveBtn.style.display = 'none';
        deleteBtn.style.display = isUser ? '' : 'none';
        clearBtn.style.display = '';
        label.textContent = pat ? pat.label : '';
      } else if (mode === 'drafting') {
        editBtn.style.display = 'none';
        saveBtn.style.display = '';
        deleteBtn.style.display = 'none';
        clearBtn.style.display = '';
        label.textContent = 'Tap words to blank\u2026';
      } else if (mode === 'editing') {
        editBtn.style.display = 'none';
        saveBtn.style.display = '';
        deleteBtn.style.display = 'none';
        clearBtn.style.display = '';
        label.textContent = (pat && pat.seed ? 'Editing (will save as new)' : 'Editing') + '\u2026';
      }
    }

    // The single transition function
    function enterMode(newMode, idx) {
      exitMode();
      mode = newMode;

      if (newMode === 'idle') {
        state.activeIdx = -1;
        lockScroll(function () {
          dots.forEach(function (d) { d.classList.remove('active'); });
          paraEl.querySelectorAll('.cloze-blank').forEach(revealBlank);
        });

      } else if (newMode === 'viewing') {
        state.activeIdx = idx;
        lockScroll(function () {
          dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
          applyPattern(paraEl, patterns[idx].blanks);
        });

      } else if (newMode === 'drafting') {
        state.activeIdx = -1;
        lockScroll(function () {
          dots.forEach(function (d) { d.classList.remove('active'); });
          paraEl.querySelectorAll('.cloze-blank').forEach(revealBlank);
        });
        draftDot = document.createElement('button');
        draftDot.className = 'cloze-bar-dot cloze-bar-draft active';
        dotWrap.insertBefore(draftDot, addDot);

      } else if (newMode === 'editing') {
        state.activeIdx = idx;
        lockScroll(function () {
          dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
          applyPattern(paraEl, patterns[idx].blanks);
        });
        dots[idx].classList.add('cloze-bar-draft');
      }

      applyModeUI();
    }

    // Persist current work to localStorage
    function saveCurrentWork() {
      var blanks = extractBlanks(paraEl);
      if (!blanks.length) return false;

      if (mode === 'editing') {
        var pat = patterns[state.activeIdx];
        if (pat.seed) {
          // Fork seed as new user pattern
          var user = loadUserPatterns();
          if (!user[pid]) user[pid] = [];
          user[pid].push({ blanks: blanks, created: Date.now() });
          saveUserPatterns(user);
        } else {
          // Update user pattern in place
          var seedCount = (seedPatterns[pid] || []).length;
          var userIdx = state.activeIdx - seedCount;
          var user = loadUserPatterns();
          if (user[pid] && user[pid][userIdx]) {
            user[pid][userIdx].blanks = blanks;
            saveUserPatterns(user);
          }
        }
      } else if (mode === 'drafting') {
        var user = loadUserPatterns();
        if (!user[pid]) user[pid] = [];
        user[pid].push({ blanks: blanks, created: Date.now() });
        saveUserPatterns(user);
      }
      return true;
    }

    // ── Event handlers (each is a simple transition) ──

    dots.forEach(function (dot, idx) {
      dot.addEventListener('click', function (e) {
        e.stopPropagation();
        if (mode === 'viewing' && state.activeIdx === idx) {
          enterMode('idle');
        } else {
          enterMode('viewing', idx);
        }
      });
    });

    leftArr.addEventListener('click', function (e) {
      e.stopPropagation();
      var base = (mode === 'viewing' || mode === 'editing') ? state.activeIdx : 0;
      var next = base <= 0 ? patterns.length - 1 : base - 1;
      enterMode('viewing', next);
    });

    rightArr.addEventListener('click', function (e) {
      e.stopPropagation();
      var base = (mode === 'viewing' || mode === 'editing') ? state.activeIdx : -1;
      var next = base >= patterns.length - 1 ? 0 : base + 1;
      enterMode('viewing', next);
    });

    addDot.addEventListener('click', function (e) {
      e.stopPropagation();
      enterMode('drafting');
    });

    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (mode !== 'viewing' || state.activeIdx < 0) return;
      enterMode('editing', state.activeIdx);
    });

    saveBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (saveCurrentWork()) renderAllBars();
    });

    deleteBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (mode !== 'viewing' || state.activeIdx < 0) return;
      var pat = patterns[state.activeIdx];
      if (pat.seed) return;
      var prevIdx = state.activeIdx > 0 ? state.activeIdx - 1 : 0;
      var seedCount = (seedPatterns[pid] || []).length;
      var userIdx = state.activeIdx - seedCount;
      var user = loadUserPatterns();
      if (user[pid]) {
        user[pid].splice(userIdx, 1);
        if (!user[pid].length) delete user[pid];
        saveUserPatterns(user);
      }
      // Clear blanks before rebuild so old pattern doesn't persist
      paraEl.querySelectorAll('.cloze-blank').forEach(revealBlank);
      renderAllBars();
      // Select the previous dot on the rebuilt bar
      setTimeout(function () {
        var newBar = activeBars[pid];
        if (newBar && newBar.patterns.length) {
          var selectIdx = Math.min(prevIdx, newBar.patterns.length - 1);
          newBar.dots[selectIdx].click();
        }
      }, 0);
    });

    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      enterMode('idle');
    });
  }

  function renderAllBars() {
    // Remove all existing bars
    Object.keys(activeBars).forEach(function (pid) {
      if (activeBars[pid].bar.parentNode) activeBars[pid].bar.parentNode.removeChild(activeBars[pid].bar);
    });
    activeBars = {};
    if (current !== 'clean') return;

    parasWithPatterns().forEach(buildPatternBar);
  }

  // Arrow key navigation
  document.addEventListener('keydown', function (e) {
    if (current !== 'clean') return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    var pids = Object.keys(activeBars);
    if (!pids.length) return;

    // Always prevent default scroll when bars exist in clean mode
    e.preventDefault();

    // Use the first bar that's in view
    var best = null;
    var bestDist = Infinity;
    pids.forEach(function (pid) {
      var rect = activeBars[pid].paraEl.getBoundingClientRect();
      var dist = Math.abs(rect.top - 100);
      if (rect.top < window.innerHeight && rect.bottom > 0 && dist < bestDist) {
        bestDist = dist;
        best = pid;
      }
    });
    if (!best) best = pids[0];

    var state = activeBars[best];
    var n = state.patterns.length;
    if (!n) return;

    var idx;
    if (e.key === 'ArrowRight') {
      idx = state.activeIdx >= n - 1 ? 0 : state.activeIdx + 1;
    } else {
      idx = state.activeIdx <= 0 ? n - 1 : state.activeIdx - 1;
    }

    // Trigger the dot's click handler (goes through state machine)
    state.dots[idx].click();
  });


  // Render bars when entering clean mode
  document.addEventListener('ip:modechange', function (e) {
    if (e.detail.mode === 'clean') {
      renderAllBars();
    } else {
      Object.keys(activeBars).forEach(function (pid) {
        if (activeBars[pid].bar.parentNode) activeBars[pid].bar.parentNode.removeChild(activeBars[pid].bar);
      });
      activeBars = {};
    }
  });

  // Initial render if starting in clean mode
  if (current === 'clean') {
    document.addEventListener('DOMContentLoaded', renderAllBars);
  }

  // Expose API
  window.InteractivePaper = window.InteractivePaper || {};
  window.InteractivePaper.readingModes = {
    get: function () { return current; },
    set: setMode
  };
})();
