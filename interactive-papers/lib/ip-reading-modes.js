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

  // Clear blanks and highlights when leaving clean mode
  document.addEventListener('ip:modechange', function (e) {
    if (e.detail.mode !== 'clean') {
      clearAllBlanks();
      document.querySelectorAll('.q-highlight').forEach(function (span) {
        var parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        parent.normalize();
      });
    }
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

  // ── Question save/load ──

  var QUESTIONS_KEY = 'ip_questions_' + paperId;

  function loadQuestions() {
    try { return JSON.parse(localStorage.getItem(QUESTIONS_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveAllQuestions(qs) {
    localStorage.setItem(QUESTIONS_KEY, JSON.stringify(qs));
  }

  function getQuestionsForPara(pid) {
    var qs = loadQuestions();
    return (qs[pid] || []).map(function (q, i) {
      return { text: q.text, charIndex: q.charIndex, question: q.question, created: q.created };
    });
  }

  // Which paragraphs have patterns or questions?
  function parasWithPatterns() {
    var pids = {};
    Object.keys(seedPatterns).forEach(function (k) { if (seedPatterns[k].length) pids[k] = true; });
    var user = loadUserPatterns();
    Object.keys(user).forEach(function (k) { if (user[k].length) pids[k] = true; });
    var qs = loadQuestions();
    Object.keys(qs).forEach(function (k) { if (qs[k].length) pids[k] = true; });
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

  // ── Highlight helpers (for questions) ──

  function clearHighlights(paraEl) {
    paraEl.querySelectorAll('.q-highlight').forEach(function (span) {
      var parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
  }

  function applyHighlight(paraEl, hl) {
    clearHighlights(paraEl);
    var startChar = hl.charIndex;
    var endChar = startChar + hl.text.length;
    var pos = 0;
    var walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
    var node;
    var toWrap = [];
    while (node = walker.nextNode()) {
      var nodeStart = pos;
      var nodeEnd = pos + node.textContent.length;
      if (nodeEnd > startChar && nodeStart < endChar) {
        toWrap.push({
          node: node,
          start: Math.max(0, startChar - nodeStart),
          end: Math.min(node.textContent.length, endChar - nodeStart)
        });
      }
      pos = nodeEnd;
    }
    for (var i = toWrap.length - 1; i >= 0; i--) {
      var w = toWrap[i];
      var range = document.createRange();
      range.setStart(w.node, w.start);
      range.setEnd(w.node, w.end);
      var span = document.createElement('span');
      span.className = 'q-highlight';
      range.surroundContents(span);
    }
  }

  function getCharIndex(paraEl, textNode, offset) {
    var pos = 0;
    var walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
    var node;
    while (node = walker.nextNode()) {
      if (node === textNode) return pos + offset;
      pos += node.textContent.length;
    }
    return -1;
  }

  // ── Pattern bar (horizontal dots above paragraph) ──
  var activeBars = {}; // pid → { bar, activeIdx }

  function buildPatternBar(pid) {
    var paraEl = document.getElementById(pid);
    if (!paraEl) return;
    var patterns = getAllPatterns(pid);
    var questions = getQuestionsForPara(pid);
    if (!patterns.length && !questions.length) return;

    // Build unified items array: patterns then questions
    var items = [];
    patterns.forEach(function (p, i) { items.push({ type: 'pattern', typeIdx: i, data: p }); });
    questions.forEach(function (q, i) { items.push({ type: 'question', typeIdx: i, data: q }); });
    var patternCount = patterns.length;

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
    leftArr.setAttribute('aria-label', 'Previous');
    bar.appendChild(leftArr);

    // Dots
    var dotWrap = document.createElement('div');
    dotWrap.className = 'cloze-bar-dots';
    var dots = [];
    items.forEach(function (item, idx) {
      var dot = document.createElement('button');
      if (item.type === 'pattern') {
        dot.className = 'cloze-bar-dot' + (item.data.seed ? '' : ' cloze-bar-dot-user');
        dot.title = item.data.label;
      } else {
        dot.className = 'cloze-bar-dot cloze-bar-dot-question';
        dot.title = item.data.question || 'Question';
      }
      dot.dataset.idx = idx;
      dotWrap.appendChild(dot);
      dots.push(dot);
    });

    // "+" for new pattern
    var addDot = document.createElement('button');
    addDot.className = 'cloze-bar-dot cloze-bar-add';
    addDot.textContent = '+';
    addDot.title = 'New cloze pattern';
    dotWrap.appendChild(addDot);

    // "Q+" for new question
    var addQ = document.createElement('button');
    addQ.className = 'cloze-bar-dot cloze-bar-add';
    addQ.textContent = 'Q+';
    addQ.title = 'New question';
    dotWrap.appendChild(addQ);

    bar.appendChild(dotWrap);

    // Right arrow
    var rightArr = document.createElement('button');
    rightArr.className = 'cloze-bar-arrow';
    rightArr.textContent = '\u25B6';
    rightArr.setAttribute('aria-label', 'Next');
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

    // Question input (hidden until asking mode)
    var qInput = document.createElement('input');
    qInput.type = 'text';
    qInput.className = 'cloze-bar-input';
    qInput.placeholder = 'Type your question\u2026';
    qInput.style.display = 'none';
    bar.appendChild(qInput);

    // Insert bar above the paragraph
    paraEl.parentNode.insertBefore(bar, paraEl);

    // ── State machine ──
    // Modes: 'idle' | 'viewing' | 'drafting' | 'editing' | 'asking'
    var mode = 'idle';
    var draftDot = null;
    var pendingHighlight = null; // stored selection for asking mode

    var state = {
      bar: bar, activeIdx: -1, items: items, dots: dots,
      label: label, paraEl: paraEl, clearBtn: clearBtn,
      isEditing: function () { return mode === 'editing'; },
      isDrafting: function () { return mode === 'drafting'; },
      isAsking: function () { return mode === 'asking'; },
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

    function clearPara() {
      paraEl.querySelectorAll('.cloze-blank').forEach(revealBlank);
      clearHighlights(paraEl);
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
      if (mode === 'asking') {
        pendingHighlight = null;
        qInput.value = '';
      }
    }

    // Set button visibility + label for a mode (one place, no scattering)
    function applyModeUI() {
      var item = (state.activeIdx >= 0 && state.activeIdx < items.length)
        ? items[state.activeIdx] : null;
      var canDelete = item && ((item.type === 'pattern' && !item.data.seed) || item.type === 'question');

      qInput.style.display = 'none';

      if (mode === 'idle') {
        editBtn.style.display = 'none';
        saveBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        clearBtn.style.display = 'none';
        label.textContent = '';
      } else if (mode === 'viewing') {
        editBtn.style.display = item && item.type === 'pattern' ? '' : 'none';
        saveBtn.style.display = 'none';
        deleteBtn.style.display = canDelete ? '' : 'none';
        clearBtn.style.display = '';
        if (item && item.type === 'pattern') {
          label.textContent = item.data.label || '';
        } else if (item && item.type === 'question') {
          label.textContent = item.data.question || '';
        }
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
        var pat = item ? item.data : null;
        label.textContent = (pat && pat.seed ? 'Editing (will save as new)' : 'Editing') + '\u2026';
      } else if (mode === 'asking') {
        editBtn.style.display = 'none';
        saveBtn.style.display = '';
        deleteBtn.style.display = 'none';
        clearBtn.style.display = '';
        qInput.style.display = '';
        label.textContent = 'Select text\u2026';
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
          clearPara();
        });

      } else if (newMode === 'viewing') {
        state.activeIdx = idx;
        var item = items[idx];
        lockScroll(function () {
          dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
          clearPara();
          if (item.type === 'pattern') {
            applyPattern(paraEl, item.data.blanks);
          } else if (item.type === 'question') {
            applyHighlight(paraEl, item.data);
          }
        });

      } else if (newMode === 'drafting') {
        state.activeIdx = -1;
        lockScroll(function () {
          dots.forEach(function (d) { d.classList.remove('active'); });
          clearPara();
        });
        draftDot = document.createElement('button');
        draftDot.className = 'cloze-bar-dot cloze-bar-draft active';
        dotWrap.insertBefore(draftDot, addDot);

      } else if (newMode === 'editing') {
        state.activeIdx = idx;
        var editItem = items[idx];
        lockScroll(function () {
          dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
          clearPara();
          applyPattern(paraEl, editItem.data.blanks);
        });
        dots[idx].classList.add('cloze-bar-draft');

      } else if (newMode === 'asking') {
        state.activeIdx = -1;
        pendingHighlight = null;
        lockScroll(function () {
          dots.forEach(function (d) { d.classList.remove('active'); });
          clearPara();
        });
        qInput.focus();
      }

      applyModeUI();
    }

    // Capture text selection during asking mode
    paraEl.addEventListener('mouseup', function () {
      if (mode !== 'asking') return;
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      // Verify selection is in this paragraph
      var container = range.commonAncestorContainer;
      while (container && container !== paraEl) container = container.parentNode;
      if (!container) return;

      var text = sel.toString().trim();
      if (!text) return;
      var charIdx = getCharIndex(paraEl, range.startContainer, range.startOffset);
      if (charIdx < 0) return;

      pendingHighlight = { text: text, charIndex: charIdx };
      clearHighlights(paraEl);
      applyHighlight(paraEl, pendingHighlight);
      sel.removeAllRanges();
      label.textContent = 'Selected \u2014 type your question\u2026';
    });

    // Persist current work to localStorage
    function saveCurrentWork() {
      if (mode === 'asking') {
        if (!pendingHighlight || !qInput.value.trim()) return false;
        var qs = loadQuestions();
        if (!qs[pid]) qs[pid] = [];
        qs[pid].push({
          text: pendingHighlight.text,
          charIndex: pendingHighlight.charIndex,
          question: qInput.value.trim(),
          created: Date.now()
        });
        saveAllQuestions(qs);
        return true;
      }

      var blanks = extractBlanks(paraEl);
      if (!blanks.length) return false;

      if (mode === 'editing') {
        var item = items[state.activeIdx];
        if (item.data.seed) {
          var user = loadUserPatterns();
          if (!user[pid]) user[pid] = [];
          user[pid].push({ blanks: blanks, created: Date.now() });
          saveUserPatterns(user);
        } else {
          var seedCount = (seedPatterns[pid] || []).length;
          var userIdx = item.typeIdx - seedCount;
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
      var next = base <= 0 ? items.length - 1 : base - 1;
      enterMode('viewing', next);
    });

    rightArr.addEventListener('click', function (e) {
      e.stopPropagation();
      var base = (mode === 'viewing' || mode === 'editing') ? state.activeIdx : -1;
      var next = base >= items.length - 1 ? 0 : base + 1;
      enterMode('viewing', next);
    });

    addDot.addEventListener('click', function (e) {
      e.stopPropagation();
      enterMode('drafting');
    });

    addQ.addEventListener('click', function (e) {
      e.stopPropagation();
      enterMode('asking');
    });

    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (mode !== 'viewing' || state.activeIdx < 0) return;
      if (items[state.activeIdx].type !== 'pattern') return;
      enterMode('editing', state.activeIdx);
    });

    saveBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (saveCurrentWork()) renderAllBars();
    });

    deleteBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (mode !== 'viewing' || state.activeIdx < 0) return;
      var item = items[state.activeIdx];
      var prevIdx = state.activeIdx > 0 ? state.activeIdx - 1 : 0;

      if (item.type === 'pattern') {
        if (item.data.seed) return;
        var seedCount = (seedPatterns[pid] || []).length;
        var userIdx = item.typeIdx - seedCount;
        var user = loadUserPatterns();
        if (user[pid]) {
          user[pid].splice(userIdx, 1);
          if (!user[pid].length) delete user[pid];
          saveUserPatterns(user);
        }
      } else if (item.type === 'question') {
        var qs = loadQuestions();
        if (qs[pid]) {
          qs[pid].splice(item.typeIdx, 1);
          if (!qs[pid].length) delete qs[pid];
          saveAllQuestions(qs);
        }
      }

      clearPara();
      renderAllBars();
      setTimeout(function () {
        var newBar = activeBars[pid];
        if (newBar && newBar.items.length) {
          var selectIdx = Math.min(prevIdx, newBar.items.length - 1);
          newBar.dots[selectIdx].click();
        }
      }, 0);
    });

    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      enterMode('idle');
    });

    // Prevent qInput clicks from bubbling to document click handler
    qInput.addEventListener('click', function (e) { e.stopPropagation(); });
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
    var n = state.items.length;
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
