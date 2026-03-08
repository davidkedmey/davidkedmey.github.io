/* ip-flashcards.js — Study cards, margin dots, spaced repetition
   Reads config from InteractivePaper._config.flashcards
   Config options:
     enabled: true          — master switch
     marginDots: true       — show colored dots in margin at source text
     studyMode: true        — enable SM-2 spaced repetition
     exclude: 'selector'    — additional selectors to exclude from selection
*/

(function () {
  'use strict';

  var IP = window.InteractivePaper || {};
  var cfg = (IP._config && IP._config.flashcards) || {};
  if (!cfg.enabled) return;

  var paperId = (IP._config && IP._config.id) || 'default';
  var STORAGE_KEY = 'fc_' + paperId;
  var marginDots = cfg.marginDots !== false;
  var studyEnabled = cfg.studyMode !== false;

  var EXCLUDE = 'figure, .fc-popup, .fc-drawer, .fc-editor, .fc-fab, .fc-overlay, .fc-popover, .fc-margin-thread';
  if (cfg.exclude) EXCLUDE += ', ' + cfg.exclude;

  var cards = [];
  var drawerOpen = false;
  var activeAuthors = {}; // author visibility filter — populated dynamically

  // ── Supabase helpers ──
  var sb = IP._supabase || null;
  var currentUser = IP._user || null;

  function getAuthorName() {
    return currentUser ? currentUser.displayName : 'anonymous';
  }
  function getAuthorId() {
    return currentUser ? currentUser.id : null;
  }

  function visibleCards() {
    return cards.filter(function (c) {
      var a = c.author || 'anonymous';
      return activeAuthors[a] !== false;
    });
  }

  // Rebuild author filter from current cards
  function refreshAuthors() {
    var seen = {};
    cards.forEach(function (c) { seen[c.author || 'anonymous'] = true; });
    Object.keys(seen).forEach(function (a) {
      if (activeAuthors[a] === undefined) activeAuthors[a] = true;
    });
  }

  // ── Load / Save ──
  function loadFromCache() {
    try { cards = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { cards = []; }
  }

  function saveToCache() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    updateFab();
  }

  // Alias for backward compat — most UI code calls save()
  function save() { saveToCache(); }

  // Clone seed cards (author_id IS NULL) into the user's personal deck
  function cloneSeedCards() {
    if (!sb || !currentUser) return Promise.resolve();
    return sb.from('cards').select('*').eq('paper_id', paperId).is('author_id', null)
      .then(function (res) {
        var seeds = res.data || [];
        if (seeds.length === 0) return;
        var copies = seeds.map(function (s) {
          return {
            id: currentUser.id.slice(0, 8) + '_' + s.id,
            paper_id: s.paper_id,
            paragraph_id: s.paragraph_id,
            type: s.type,
            source: s.source,
            anchor: s.anchor,
            front: s.front,
            back: s.back || '',
            author_id: currentUser.id,
            author_name: s.author_name
          };
        });
        return sb.from('cards').upsert(copies, { onConflict: 'id' });
      });
  }

  function loadFromSupabase() {
    if (!sb || !currentUser) return Promise.resolve();
    // Check if user has any cards for this paper; if not, clone seed cards first
    return sb.from('cards').select('id', { count: 'exact', head: true })
      .eq('paper_id', paperId).eq('author_id', currentUser.id)
      .then(function (res) {
        if ((res.count || 0) === 0) return cloneSeedCards();
      })
      .then(function () {
        return Promise.all([
          sb.from('cards').select('*').eq('paper_id', paperId).eq('author_id', currentUser.id),
          sb.from('card_progress').select('*').eq('user_id', currentUser.id),
          sb.from('card_replies').select('*')
        ]);
      })
      .then(function (results) {
      var cardRows = (results[0].data || []);
      var progressRows = (results[1].data || []);
      var replyRows = (results[2].data || []);

      // Build lookup maps
      var progressMap = {};
      progressRows.forEach(function (p) { progressMap[p.card_id] = p; });

      var repliesByCard = {};
      replyRows.forEach(function (r) {
        if (!repliesByCard[r.card_id]) repliesByCard[r.card_id] = [];
        repliesByCard[r.card_id].push({
          text: r.content,
          author: r.author_name,
          authorId: r.author_id,
          time: new Date(r.created_at).getTime(),
          id: r.id
        });
      });

      // Merge into cards array
      cards = cardRows.map(function (row) {
        var prog = progressMap[row.id] || {};
        return {
          id: row.id,
          type: row.type,
          paragraphId: row.paragraph_id,
          source: row.source,
          anchor: row.anchor,
          front: row.front,
          back: row.back || '',
          author: row.author_name,
          authorId: row.author_id,
          created: new Date(row.created_at).getTime(),
          interval: prog.interval_days || 0,
          ease: prog.ease || 2.5,
          reps: prog.reps || 0,
          nextReview: prog.next_review ? new Date(prog.next_review).getTime() : 0,
          lastReview: prog.last_review ? new Date(prog.last_review).getTime() : 0,
          replies: (repliesByCard[row.id] || []).sort(function (a, b) { return a.time - b.time; })
        };
      });

      refreshAuthors();
      saveToCache();
    }).catch(function (err) {
      console.warn('[ip-flashcards] Supabase load failed, using cache', err);
    });
  }

  // ── Supabase write operations ──
  function sbInsertCard(card) {
    if (!sb || !currentUser) return;
    sb.from('cards').insert({
      id: card.id,
      paper_id: paperId,
      paragraph_id: card.paragraphId,
      type: card.type,
      source: card.source,
      anchor: card.anchor,
      front: card.front,
      back: card.back || '',
      author_id: currentUser.id,
      author_name: currentUser.displayName
    }).then(function (res) {
      if (res.error) console.warn('[ip-flashcards] Card insert error:', res.error);
    });
  }

  function sbDeleteCard(cardId) {
    if (!sb) return;
    sb.from('cards').delete().eq('id', cardId).then(function (res) {
      if (res.error) console.warn('[ip-flashcards] Card delete error:', res.error);
    });
  }

  function sbUpsertProgress(card) {
    if (!sb || !currentUser) return;
    sb.from('card_progress').upsert({
      user_id: currentUser.id,
      card_id: card.id,
      interval_days: card.interval || 0,
      ease: card.ease || 2.5,
      reps: card.reps || 0,
      next_review: new Date(card.nextReview || Date.now()).toISOString(),
      last_review: card.lastReview ? new Date(card.lastReview).toISOString() : null
    }).then(function (res) {
      if (res.error) console.warn('[ip-flashcards] Progress upsert error:', res.error);
    });
  }

  function sbInsertReply(cardId, reply) {
    if (!sb || !currentUser) return;
    sb.from('card_replies').insert({
      id: reply.id,
      card_id: cardId,
      content: reply.text,
      author_id: currentUser.id,
      author_name: currentUser.displayName
    }).then(function (res) {
      if (res.error) console.warn('[ip-flashcards] Reply insert error:', res.error);
    });
  }

  function sbDeleteReply(replyId) {
    if (!sb) return;
    sb.from('card_replies').delete().eq('id', replyId).then(function (res) {
      if (res.error) console.warn('[ip-flashcards] Reply delete error:', res.error);
    });
  }

  // ── Realtime subscriptions ──
  function subscribeRealtime() {
    if (!sb) return;
    sb.channel('ip-cards-' + paperId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: 'paper_id=eq.' + paperId }, function () {
        loadFromSupabase().then(function () {
          renderDots();
          if (drawerOpen) renderCards();
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_replies' }, function () {
        loadFromSupabase().then(function () {
          // Replies update — threads will refresh on next open
        });
      })
      .subscribe();
  }

  // Seed from git-tracked JSON (only used as offline fallback)
  function loadSeedIfEmpty() {
    if (cards.length > 0 || !cfg.seedUrl) return;
    fetch(cfg.seedUrl).then(function (r) { return r.json(); }).then(function (seed) {
      if (cards.length > 0) return;
      seed.forEach(function (c) {
        c.created = c.created || Date.now();
        c.interval = c.interval || 0;
        c.ease = c.ease || 2.5;
        c.reps = c.reps || 0;
        c.nextReview = c.nextReview || 0;
        c.lastReview = c.lastReview || 0;
      });
      cards = seed;
      refreshAuthors();
      save();
      renderDots();
      updateStudyToggle();
    }).catch(function () {});
  }

  // ── DOM Creation ──

  // Popup
  var popup = document.createElement('div');
  popup.className = 'fc-popup';
  popup.innerHTML = '<button data-fc="question">Q</button><button data-fc="note">Note</button><button data-fc="qa">QA</button><button data-fc="cloze">Cloze</button>';
  document.body.appendChild(popup);

  // Editor
  var editor = document.createElement('div');
  editor.className = 'fc-editor';
  editor.innerHTML =
    '<div class="fc-editor-label"></div>' +
    '<div class="fc-editor-tabs" style="display:none"><button class="fc-tab fc-tab-active" data-tab="note">Note</button><button class="fc-tab" data-tab="qa">QA</button><button class="fc-tab" data-tab="cloze">Cloze</button></div>' +
    '<div class="fc-words"></div>' +
    '<div class="fc-hint"></div>' +
    '<textarea class="fc-q-input" rows="2" placeholder="Question..."></textarea>' +
    '<textarea class="fc-a-input" rows="4" placeholder="Answer (optional)"></textarea>' +
    '<div class="fc-editor-btns"><button class="fc-cancel">Cancel</button><button class="fc-save">Save</button></div>';
  document.body.appendChild(editor);

  var editorMode = '';

  // Tab click
  editor.querySelector('.fc-editor-tabs').addEventListener('click', function (e) {
    var tab = e.target.closest('.fc-tab');
    if (!tab) return;
    editor.querySelectorAll('.fc-tab').forEach(function (t) { t.classList.remove('fc-tab-active'); });
    tab.classList.add('fc-tab-active');
    showEditor(tab.dataset.tab);
  });

  // FAB
  var fab = document.createElement('button');
  fab.className = 'fc-fab';
  fab.title = 'Flashcards';
  fab.textContent = '0';
  document.body.appendChild(fab);

  // Study toggle in top bar
  var studyToggle = null;
  if (studyEnabled) {
    var topBar = document.getElementById('top-bar');
    if (topBar) {
      studyToggle = document.createElement('button');
      studyToggle.className = 'fc-study-toggle';
      studyToggle.textContent = 'Study';
      topBar.appendChild(studyToggle);
    }
  }

  // Overlay
  var overlay = document.createElement('div');
  overlay.className = 'fc-overlay';
  document.body.appendChild(overlay);

  // Drawer
  var drawer = document.createElement('div');
  drawer.className = 'fc-drawer';
  drawer.innerHTML =
    '<div class="fc-drawer-header"><h3>Flashcards</h3><button class="fc-close">\u00d7</button></div>' +
    '<div class="fc-drawer-export">' +
      '<button data-fmt="md">Markdown</button>' +
      '<button data-fmt="csv">CSV</button>' +
      '<button data-fmt="json">JSON</button>' +
    '</div>' +
    '<div class="fc-drawer-io">' +
      '<button class="fc-import-btn">Import</button>' +
      '<button class="fc-export-full-btn">Export Deck</button>' +
    '</div>' +
    '<input type="file" class="fc-import-input" accept=".json" style="display:none">' +
    '<div class="fc-drawer-cards"></div>';
  document.body.appendChild(drawer);

  var cardContainer = drawer.querySelector('.fc-drawer-cards');

  // ── Selection state ──
  var selText = '';
  var selRange = null;
  var selParagraph = null;

  function hidePopup() { popup.classList.remove('fc-visible'); }
  function hideEditor() { editor.classList.remove('fc-visible'); }

  // ── Selection detection ──
  document.addEventListener('mouseup', function (e) {
    if (e.target.closest && e.target.closest(EXCLUDE)) return;

    setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { hidePopup(); return; }

      var text = sel.toString().trim();
      if (!text || text.length < 2) { hidePopup(); return; }

      // Walk up to find <p id="pN">
      var node = sel.anchorNode;
      var para = null;
      while (node && node !== document.body) {
        if (node.nodeType === 1 && node.tagName === 'P' && node.id && /^p\d+/.test(node.id)) {
          para = node;
          break;
        }
        node = node.parentNode;
      }
      if (!para) { hidePopup(); return; }

      // Check focusNode is in same paragraph
      var fNode = sel.focusNode;
      var fPara = null;
      while (fNode && fNode !== document.body) {
        if (fNode.nodeType === 1 && fNode.tagName === 'P' && fNode.id && /^p\d+/.test(fNode.id)) {
          fPara = fNode;
          break;
        }
        fNode = fNode.parentNode;
      }
      if (fPara !== para) { hidePopup(); return; }

      selText = text;
      selRange = sel.getRangeAt(0);
      selParagraph = para;

      // Position popup
      var rect = selRange.getBoundingClientRect();
      var pw = popup.offsetWidth || 120;
      var left = rect.left + (rect.width / 2) - (pw / 2) + window.scrollX;
      var top = rect.top - 40 + window.scrollY;
      if (rect.top < 50) {
        top = rect.bottom + 8 + window.scrollY;
      }
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));

      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
      popup.classList.add('fc-visible');
    }, 10);
  });

  // Hide on click outside
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest || !e.target.closest('.fc-popup')) hidePopup();
    if (!e.target.closest || (!e.target.closest('.fc-editor') && !e.target.closest('.fc-popup'))) hideEditor();
  });

  // ── Flash FAB ──
  function flashFab() {
    fab.classList.remove('fc-flash');
    void fab.offsetWidth;
    fab.classList.add('fc-flash');
  }

  // ── Editor positioning ──
  function positionEditor() {
    if (!selRange) return;
    var rect = selRange.getBoundingClientRect();
    var ew = 360;
    var left = rect.left + window.scrollX;
    var top = rect.bottom + 8 + window.scrollY;
    left = Math.max(8, Math.min(left, window.innerWidth - ew - 8));
    editor.style.left = left + 'px';
    editor.style.top = top + 'px';
  }

  // ── Word tokenization for cloze ──
  function tokenize(text) {
    return text.match(/\S+|\s+/g) || [];
  }

  function renderClozeWords(text) {
    var wordsEl = editor.querySelector('.fc-words');
    wordsEl.innerHTML = '';
    var tokens = tokenize(text);
    tokens.forEach(function (token) {
      if (/^\s+$/.test(token)) {
        wordsEl.appendChild(document.createTextNode(token));
      } else {
        var span = document.createElement('span');
        span.className = 'fc-word';
        span.textContent = token;
        wordsEl.appendChild(span);
      }
    });
  }

  // ── Show question editor (Q button) ──
  function showQuestionEditor() {
    editorMode = 'question';
    var label = editor.querySelector('.fc-editor-label');
    var tabs = editor.querySelector('.fc-editor-tabs');
    var wordsEl = editor.querySelector('.fc-words');
    var hint = editor.querySelector('.fc-hint');
    var qInput = editor.querySelector('.fc-q-input');
    var aInput = editor.querySelector('.fc-a-input');

    label.textContent = 'Question';
    label.style.display = '';
    tabs.style.display = 'none';
    wordsEl.style.display = 'none';
    hint.style.display = 'none';
    qInput.style.display = '';
    qInput.value = '';
    qInput.rows = 3;
    qInput.placeholder = 'Ask a question about this passage...';
    aInput.style.display = 'none';

    positionEditor();
    editor.classList.add('fc-visible');
    setTimeout(function () { qInput.focus(); }, 50);
  }

  // ── Show card editor (Card button) with tab bar ──
  function showCardEditor(mode) {
    var label = editor.querySelector('.fc-editor-label');
    var tabs = editor.querySelector('.fc-editor-tabs');
    label.style.display = 'none';
    tabs.style.display = '';
    editor.querySelectorAll('.fc-tab').forEach(function (t) {
      t.classList.toggle('fc-tab-active', t.dataset.tab === mode);
    });
    showEditor(mode);
  }

  // ── Show editor in cloze, qa, or note mode ──
  function showEditor(mode) {
    editorMode = mode;
    var wordsEl = editor.querySelector('.fc-words');
    var hint = editor.querySelector('.fc-hint');
    var qInput = editor.querySelector('.fc-q-input');
    var aInput = editor.querySelector('.fc-a-input');
    qInput.rows = 2;

    if (mode === 'cloze') {
      renderClozeWords(selText);
      wordsEl.style.display = '';
      hint.style.display = '';
      hint.textContent = 'Click words to blank them out';
      qInput.style.display = 'none';
      aInput.style.display = 'none';
    } else if (mode === 'note') {
      wordsEl.style.display = 'none';
      hint.style.display = 'none';
      qInput.style.display = 'none';
      aInput.style.display = '';
      aInput.value = '';
      aInput.placeholder = 'Note...';
    } else {
      wordsEl.style.display = 'none';
      hint.style.display = 'none';
      qInput.style.display = '';
      qInput.value = '';
      qInput.placeholder = 'Question...';
      aInput.style.display = '';
      aInput.value = selText;
      aInput.placeholder = 'Answer';
    }

    positionEditor();
    editor.classList.add('fc-visible');

    if (mode === 'qa') {
      setTimeout(function () { qInput.focus(); }, 50);
    } else if (mode === 'note') {
      setTimeout(function () { aInput.focus(); }, 50);
    }
  }

  // ── Cloze word toggle ──
  editor.querySelector('.fc-words').addEventListener('click', function (e) {
    var word = e.target.closest('.fc-word');
    if (word) word.classList.toggle('fc-blanked');
  });

  // ── Popup button handlers ──
  popup.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var action = btn.dataset.fc;
    hidePopup();
    if (action === 'question') showQuestionEditor();
    else if (action === 'note') showCardEditor('note');
    else if (action === 'qa') showCardEditor('qa');
    else if (action === 'cloze') showCardEditor('cloze');
  });

  // ── Editor save/cancel ──
  editor.querySelector('.fc-save').addEventListener('click', function () {
    if (editorMode === 'question') {
      var qText = editor.querySelector('.fc-q-input').value.trim();
      if (!qText) { editor.querySelector('.fc-q-input').focus(); return; }
      var card = {
        id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: 'question',
        paragraphId: selParagraph ? selParagraph.id : '',
        anchor: selText.slice(0, 50),
        source: selText,
        front: qText,
        back: '',
        author: getAuthorName(),
        authorId: getAuthorId(),
        created: Date.now()
      };
      cards.push(card);
      save(); sbInsertCard(card); hideEditor(); flashFab(); renderDots();
      window.getSelection().removeAllRanges();

    } else if (editorMode === 'cloze') {
      var blanked = editor.querySelectorAll('.fc-word.fc-blanked');
      if (blanked.length === 0) return;
      var tokens = editor.querySelectorAll('.fc-words')[0].childNodes;
      var front = '';
      var backs = [];
      tokens.forEach(function (node) {
        if (node.nodeType === 3) {
          front += node.textContent;
        } else if (node.classList && node.classList.contains('fc-word')) {
          if (node.classList.contains('fc-blanked')) {
            front += '___';
            backs.push(node.textContent);
          } else {
            front += node.textContent;
          }
        }
      });
      var card = {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: 'cloze',
        paragraphId: selParagraph ? selParagraph.id : '',
        anchor: selText.slice(0, 50),
        source: selText,
        front: front,
        back: backs.join(', '),
        author: getAuthorName(),
        authorId: getAuthorId(),
        created: Date.now()
      };
      if (studyEnabled) {
        card.interval = 0; card.ease = 2.5; card.reps = 0;
        card.nextReview = Date.now(); card.lastReview = 0;
      }
      cards.push(card);
      save(); sbInsertCard(card); hideEditor(); flashFab(); renderDots();
      if (studyMode) { dueQueue.push(card); updateStudyBanner(); }
      window.getSelection().removeAllRanges();

    } else if (editorMode === 'note') {
      var noteText = editor.querySelector('.fc-a-input').value.trim();
      if (!noteText) { editor.querySelector('.fc-a-input').focus(); return; }
      var card = {
        id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: 'note',
        paragraphId: selParagraph ? selParagraph.id : '',
        anchor: selText.slice(0, 50),
        source: selText,
        front: noteText,
        back: '',
        author: getAuthorName(),
        authorId: getAuthorId(),
        created: Date.now()
      };
      cards.push(card);
      save(); sbInsertCard(card); hideEditor(); flashFab(); renderDots();
      window.getSelection().removeAllRanges();

    } else {
      // Q&A mode
      var q = editor.querySelector('.fc-q-input').value.trim();
      if (!q) { editor.querySelector('.fc-q-input').focus(); return; }
      var a = editor.querySelector('.fc-a-input').value.trim();
      var card = {
        id: 'qa_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: 'qa',
        paragraphId: selParagraph ? selParagraph.id : '',
        anchor: selText.slice(0, 50),
        source: selText,
        front: q,
        back: a || selText,
        author: getAuthorName(),
        authorId: getAuthorId(),
        created: Date.now()
      };
      if (studyEnabled) {
        card.interval = 0; card.ease = 2.5; card.reps = 0;
        card.nextReview = Date.now(); card.lastReview = 0;
      }
      cards.push(card);
      save(); sbInsertCard(card); hideEditor(); flashFab(); renderDots();
      if (studyMode) { dueQueue.push(card); updateStudyBanner(); }
      window.getSelection().removeAllRanges();
    }
  });

  editor.querySelector('.fc-cancel').addEventListener('click', hideEditor);

  // Save on Enter in question field
  editor.querySelector('.fc-q-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      editor.querySelector('.fc-save').click();
    }
  });

  // ── FAB ──
  function updateFab() {
    fab.textContent = cards.length;
    fab.classList.toggle('fc-has-cards', cards.length > 0);
  }

  fab.addEventListener('click', function () { openDrawer(); });

  // ── Drawer ──
  function openDrawer() {
    renderCards();
    drawer.classList.add('fc-open');
    overlay.classList.add('fc-visible');
    drawerOpen = true;
  }

  function closeDrawer() {
    drawer.classList.remove('fc-open');
    overlay.classList.remove('fc-visible');
    drawerOpen = false;
  }

  drawer.querySelector('.fc-close').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  function renderCards() {
    if (cards.length === 0) {
      cardContainer.innerHTML = '<div class="fc-drawer-empty">No flashcards yet.<br>Select text in any paragraph to create one.</div>';
      return;
    }
    cardContainer.innerHTML = '';
    // Study button
    var dueCount = cards.filter(isDue).length;
    var studyBtn = document.createElement('button');
    studyBtn.className = 'fc-study-btn';
    studyBtn.textContent = studyMode
      ? 'Study (' + dueCount + ' remaining)'
      : 'Study' + (dueCount > 0 ? ' (' + dueCount + ' due)' : '');
    studyBtn.disabled = dueCount === 0 && !studyMode;
    studyBtn.addEventListener('click', function () {
      closeDrawer();
      if (studyMode) { scrollToNextDue(); } else { enterStudy(); }
    });
    cardContainer.appendChild(studyBtn);
    // Newest first
    for (var i = cards.length - 1; i >= 0; i--) {
      var c = cards[i];
      var el = document.createElement('div');
      el.className = 'fc-card';
      el.dataset.idx = i;
      var typeLabel = c.type === 'cloze' ? 'Cloze' : c.type === 'qa' ? 'Q&A' : c.type === 'question' ? 'Question' : 'Note';
      el.innerHTML =
        '<div class="fc-card-type">' + typeLabel + '</div>' +
        '<div class="fc-card-front">' + escHtml(c.front) + '</div>' +
        (c.back ? '<div class="fc-card-back">' + escHtml(c.back) + '</div>' : '') +
        '<button class="fc-card-del" title="Delete">\u00d7</button>' +
        '<div class="fc-card-para">\u00b6 ' + c.paragraphId + '</div>';
      cardContainer.appendChild(el);
    }
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  // Card flip and delete
  cardContainer.addEventListener('click', function (e) {
    var del = e.target.closest('.fc-card-del');
    if (del) {
      var card = del.closest('.fc-card');
      var idx = parseInt(card.dataset.idx, 10);
      var removed = cards[idx];
      cards.splice(idx, 1);
      save(); if (removed) sbDeleteCard(removed.id); renderCards(); renderDots();
      return;
    }
    var card = e.target.closest('.fc-card');
    if (card) card.classList.toggle('fc-flipped');
  });

  // ── Export ──
  drawer.querySelector('.fc-drawer-export').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var fmt = btn.dataset.fmt;
    if (fmt === 'md') exportMarkdown();
    if (fmt === 'csv') exportCSV();
    if (fmt === 'json') exportJSON();
  });

  function downloadBlob(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    var md = '';
    cards.forEach(function (c) {
      if (c.type === 'cloze') {
        var answers = c.back.split(', ');
        var i = 0;
        var line = c.front.replace(/___/g, function () { return '==' + (answers[i++] || '???') + '=='; });
        md += line + '\n<!--SR:' + c.paragraphId + '-->\n\n';
      } else if (c.type === 'note') {
        md += '> ' + c.front.replace(/\n/g, '\n> ') + '\n<!--Note:' + c.paragraphId + '-->\n\n';
      } else if (c.type === 'question') {
        md += '**Q:** ' + c.front + '\n<!--Question:' + c.paragraphId + '-->\n\n';
      } else {
        md += c.front + '\n?\n' + c.back + '\n<!--SR:' + c.paragraphId + '-->\n\n';
      }
    });
    downloadBlob(md.trim(), paperId + '-flashcards.md', 'text/markdown');
  }

  function exportCSV() {
    var csv = 'front\tback\ttags\n';
    cards.forEach(function (c) {
      if (c.type === 'note' || c.type === 'question') return;
      var front, back;
      if (c.type === 'cloze') {
        var answers = c.back.split(', ');
        var i = 0;
        front = c.front.replace(/___/g, function () { return '{{c1::' + (answers[i++] || '???') + '}}'; });
        back = '';
      } else {
        front = c.front;
        back = c.back;
      }
      csv += '"' + front.replace(/"/g, '""') + '"\t"' + back.replace(/"/g, '""') + '"\t' + paperId + '::' + c.paragraphId + '\n';
    });
    downloadBlob(csv, paperId + '-flashcards.txt', 'text/tab-separated-values');
  }

  function exportJSON() {
    downloadBlob(JSON.stringify(cards, null, 2), paperId + '-flashcards.json', 'application/json');
  }

  // ── Full deck import/export ──
  function exportFullDeck() {
    downloadBlob(JSON.stringify(cards, null, 2), paperId + '-deck-backup.json', 'application/json');
  }

  function importDeck(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) { alert('Invalid deck file.'); return; }
        var existingIds = {};
        cards.forEach(function (c, i) { existingIds[c.id] = i; });
        var added = 0, updated = 0;
        imported.forEach(function (ic) {
          if (!ic.id || !ic.type) return;
          if (existingIds[ic.id] !== undefined) {
            cards[existingIds[ic.id]] = ic;
            updated++;
          } else {
            cards.push(ic);
            added++;
          }
        });
        save(); renderCards(); renderDots();
        alert('Imported: ' + added + ' added, ' + updated + ' updated.');
      } catch (err) {
        alert('Error reading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  drawer.querySelector('.fc-export-full-btn').addEventListener('click', exportFullDeck);
  drawer.querySelector('.fc-import-btn').addEventListener('click', function () {
    drawer.querySelector('.fc-import-input').click();
  });
  drawer.querySelector('.fc-import-input').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) {
      importDeck(e.target.files[0]);
      e.target.value = '';
    }
  });

  // ── Margin dots + popover ──
  var popover = document.createElement('div');
  popover.className = 'fc-popover';
  popover.innerHTML =
    '<div class="fc-popover-header"><div class="fc-popover-label"></div><button class="fc-popover-edit" title="Edit">\u270E</button></div>' +
    '<div class="fc-popover-view">' +
      '<div class="fc-popover-front"></div>' +
      '<hr class="fc-popover-divider">' +
      '<div class="fc-popover-back"></div>' +
    '</div>' +
    '<div class="fc-popover-editing" style="display:none">' +
      '<textarea class="fc-popover-ef" rows="2" placeholder="Front"></textarea>' +
      '<textarea class="fc-popover-eb" rows="3" placeholder="Back"></textarea>' +
      '<div class="fc-popover-actions"><button class="fc-popover-cancel">Cancel</button><button class="fc-popover-save">Save</button></div>' +
    '</div>';
  document.body.appendChild(popover);

  var activePopoverCard = null;
  var activePopoverCardObj = null;

  function clearHighlights() {
    document.querySelectorAll('mark.fc-hl').forEach(function (m) {
      var parent = m.parentNode;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });
  }

  function highlightSource(card) {
    var para = document.getElementById(card.paragraphId);
    if (!para) return;
    var src = card.source || card.anchor;
    if (!src) return;
    var fullText = para.textContent;
    var startOffset = fullText.indexOf(src);
    if (startOffset === -1) return;
    var endOffset = startOffset + src.length;

    var walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    var node, charCount = 0;
    var startNode = null, startIdx = 0, endNode = null, endIdx = 0;

    while ((node = walker.nextNode())) {
      var len = node.textContent.length;
      if (!startNode && charCount + len > startOffset) {
        startNode = node;
        startIdx = startOffset - charCount;
      }
      if (charCount + len >= endOffset) {
        endNode = node;
        endIdx = endOffset - charCount;
        break;
      }
      charCount += len;
    }
    if (!startNode || !endNode) return;

    if (startNode === endNode) {
      try {
        var range = document.createRange();
        range.setStart(startNode, startIdx);
        range.setEnd(endNode, endIdx);
        var mark = document.createElement('mark');
        mark.className = 'fc-hl' + (card.type === 'qa' ? ' fc-hl-qa' : card.type === 'note' ? ' fc-hl-note' : card.type === 'question' ? ' fc-hl-question' : '');
        range.surroundContents(mark);
      } catch (e) { /* overlapping highlight — skip */ }
      return;
    }

    // Multi-node wrap
    var hlClass = 'fc-hl' + (card.type === 'qa' ? ' fc-hl-qa' : card.type === 'note' ? ' fc-hl-note' : card.type === 'question' ? ' fc-hl-question' : '');
    var nodes = [];
    walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    var inRange = false;
    while ((node = walker.nextNode())) {
      if (node === startNode) { inRange = true; nodes.push(node); continue; }
      if (inRange) nodes.push(node);
      if (node === endNode) break;
    }
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      var range = document.createRange();
      if (n === startNode) {
        range.setStart(n, startIdx);
        range.setEnd(n, n.textContent.length);
      } else if (n === endNode) {
        range.setStart(n, 0);
        range.setEnd(n, endIdx);
      } else {
        range.selectNodeContents(n);
      }
      if (range.toString().length > 0) {
        var mark = document.createElement('mark');
        mark.className = hlClass;
        range.surroundContents(mark);
      }
    }
  }

  function hidePopover() {
    popover.classList.remove('fc-visible');
    clearHighlights();
    document.querySelectorAll('.fc-dot-active').forEach(function (d) {
      d.classList.remove('fc-dot-active');
    });
    activePopoverCard = null;
    activePopoverCardObj = null;
  }

  // Popover edit handlers
  popover.querySelector('.fc-popover-edit').addEventListener('click', function () {
    if (!activePopoverCardObj) return;
    var c = activePopoverCardObj;
    popover.querySelector('.fc-popover-view').style.display = 'none';
    popover.querySelector('.fc-popover-edit').style.display = 'none';
    var editDiv = popover.querySelector('.fc-popover-editing');
    editDiv.style.display = '';
    var ef = popover.querySelector('.fc-popover-ef');
    var eb = popover.querySelector('.fc-popover-eb');
    ef.value = c.front;
    ef.placeholder = c.type === 'note' ? 'Note' : 'Front';
    if (c.type === 'note') {
      eb.style.display = 'none';
    } else {
      eb.style.display = '';
      eb.value = c.back;
    }
    setTimeout(function () { ef.focus(); }, 30);
  });

  popover.querySelector('.fc-popover-cancel').addEventListener('click', function () {
    popover.querySelector('.fc-popover-view').style.display = '';
    popover.querySelector('.fc-popover-edit').style.display = '';
    popover.querySelector('.fc-popover-editing').style.display = 'none';
    popover.querySelector('.fc-popover-eb').style.display = '';
  });

  popover.querySelector('.fc-popover-save').addEventListener('click', function () {
    if (!activePopoverCardObj) return;
    var ef = popover.querySelector('.fc-popover-ef').value.trim();
    if (!ef) return;
    var eb = activePopoverCardObj.type === 'note' ? '' : popover.querySelector('.fc-popover-eb').value.trim();
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].id === activePopoverCardObj.id) {
        cards[i].front = ef;
        cards[i].back = eb;
        break;
      }
    }
    save();
    popover.querySelector('.fc-popover-front').textContent = ef;
    popover.querySelector('.fc-popover-back').textContent = eb;
    popover.querySelector('.fc-popover-view').style.display = '';
    popover.querySelector('.fc-popover-edit').style.display = '';
    popover.querySelector('.fc-popover-editing').style.display = 'none';
    popover.querySelector('.fc-popover-eb').style.display = '';
    activePopoverCardObj.front = ef;
    activePopoverCardObj.back = eb;
  });

  // ── Margin threads (persistent marginalia) ──
  var openThreads = {}; // cardId → DOM element
  var marginCol = null; // single margin column, created on first use

  function getMarginCol() {
    if (marginCol) return marginCol;
    marginCol = document.createElement('div');
    marginCol.className = 'fc-margin-col';
    document.body.appendChild(marginCol);
    return marginCol;
  }

  function useInlineFallback() {
    return window.innerWidth < 1200;
  }

  function toggleThread(dot, card) {
    if (openThreads[card.id]) {
      closeThread(card.id);
      dot.classList.remove('fc-dot-active');
      return;
    }
    openThread(dot, card);
  }

  function openThread(dot, card) {
    if (openThreads[card.id]) return; // already open

    var para = document.getElementById(card.paragraphId);
    if (!para) return;

    dot.classList.add('fc-dot-active');

    var typeLabel = card.type === 'cloze' ? 'Cloze' : card.type === 'qa' ? 'Q & A' : card.type === 'question' ? 'Question' : 'Note';

    var thread = document.createElement('div');
    thread.className = 'fc-margin-thread fc-margin-thread-' + card.type;
    thread.dataset.cardId = card.id;

    // Header with label, edit, close
    var header = document.createElement('div');
    header.className = 'fc-thread-header';
    var labelEl = document.createElement('span');
    labelEl.className = 'fc-thread-label';
    labelEl.textContent = typeLabel;
    var actions = document.createElement('span');
    actions.className = 'fc-thread-actions';
    var editBtn = document.createElement('button');
    editBtn.className = 'fc-thread-btn';
    editBtn.title = 'Edit';
    editBtn.textContent = '\u270E';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'fc-thread-btn fc-thread-close';
    closeBtn.title = 'Close';
    closeBtn.textContent = '\u00d7';
    actions.appendChild(editBtn);
    actions.appendChild(closeBtn);
    header.appendChild(labelEl);
    header.appendChild(actions);
    thread.appendChild(header);

    // View content
    var viewDiv = document.createElement('div');
    viewDiv.className = 'fc-thread-view';
    var frontEl = document.createElement('div');
    frontEl.className = 'fc-thread-front';
    if (card.type === 'cloze') {
      frontEl.innerHTML = escHtml(card.front).replace(/___/g, '<span class="fc-popover-blank">___</span>');
    } else {
      frontEl.textContent = card.front;
    }
    viewDiv.appendChild(frontEl);

    if (card.type !== 'note' && card.type !== 'question' && card.back) {
      var divider = document.createElement('hr');
      divider.className = 'fc-thread-divider';
      var backEl = document.createElement('div');
      backEl.className = 'fc-thread-back';
      backEl.textContent = card.back;
      viewDiv.appendChild(divider);
      viewDiv.appendChild(backEl);
    }
    thread.appendChild(viewDiv);

    // Edit form (hidden)
    var editDiv = document.createElement('div');
    editDiv.className = 'fc-thread-editing';
    editDiv.style.display = 'none';
    var efTA = document.createElement('textarea');
    efTA.rows = 2;
    efTA.placeholder = card.type === 'note' ? 'Note' : 'Front';
    var ebTA = document.createElement('textarea');
    ebTA.rows = 2;
    ebTA.placeholder = 'Back';
    var editBtns = document.createElement('div');
    editBtns.className = 'fc-thread-edit-btns';
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    var saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    editBtns.appendChild(cancelBtn);
    editBtns.appendChild(saveBtn);
    editDiv.appendChild(efTA);
    if (card.type !== 'note') editDiv.appendChild(ebTA);
    editDiv.appendChild(editBtns);
    thread.appendChild(editDiv);

    // Replies section
    if (!card.replies) card.replies = [];
    var repliesDiv = document.createElement('div');
    repliesDiv.className = 'fc-thread-replies';
    if (card.replies.length === 0) repliesDiv.style.display = 'none';

    function renderReplies() {
      repliesDiv.innerHTML = '';
      if (card.replies.length === 0) { repliesDiv.style.display = 'none'; return; }
      repliesDiv.style.display = '';
      card.replies.forEach(function (r, idx) {
        var el = document.createElement('div');
        el.className = 'fc-thread-reply fc-thread-reply-' + (r.author || 'david');
        var meta = document.createElement('div');
        meta.className = 'fc-thread-reply-meta';
        var delBtn = document.createElement('button');
        delBtn.className = 'fc-thread-reply-del';
        delBtn.textContent = '\u00d7';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var removed = card.replies[idx];
          card.replies.splice(idx, 1);
          save();
          if (removed && removed.id) sbDeleteReply(removed.id);
          renderReplies();
          requestAnimationFrame(function () { resolveCollisions(); });
        });
        meta.textContent = (r.author || 'david') + ' \u00b7 ' + timeAgo(r.time);
        meta.appendChild(delBtn);
        var text = document.createElement('div');
        text.className = 'fc-thread-reply-text';
        text.textContent = r.text;
        el.appendChild(meta);
        el.appendChild(text);
        repliesDiv.appendChild(el);
      });
    }
    renderReplies();
    thread.appendChild(repliesDiv);

    // Reply input
    var inputRow = document.createElement('div');
    inputRow.className = 'fc-thread-input-row';
    var input = document.createElement('textarea');
    input.className = 'fc-thread-input';
    input.rows = 1;
    input.placeholder = 'Add a thought...';
    var flagBtn = document.createElement('button');
    flagBtn.className = 'fc-thread-flag';
    flagBtn.title = 'Flag as confusing';
    flagBtn.textContent = '?';
    var sendBtn = document.createElement('button');
    sendBtn.className = 'fc-thread-send';
    sendBtn.textContent = 'Reply';
    inputRow.appendChild(input);
    inputRow.appendChild(flagBtn);
    inputRow.appendChild(sendBtn);
    thread.appendChild(inputRow);

    function addReply(text) {
      if (!text.trim()) return;
      var reply = {
        id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        text: text.trim(),
        author: getAuthorName(),
        authorId: getAuthorId(),
        time: Date.now()
      };
      card.replies.push(reply);
      save();
      sbInsertReply(card.id, reply);
      renderReplies();
      input.value = '';
      input.style.height = 'auto';
      requestAnimationFrame(function () { resolveCollisions(); });
    }

    sendBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      addReply(input.value);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addReply(input.value);
      }
      e.stopPropagation(); // Don't let study mode keys fire
    });

    // Auto-grow textarea
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });

    flagBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      addReply('? (flagged as confusing)');
    });

    // Event handlers
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeThread(card.id);
    });

    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      viewDiv.style.display = 'none';
      editDiv.style.display = '';
      editBtn.style.display = 'none';
      efTA.value = card.front;
      ebTA.value = card.back || '';
      setTimeout(function () { efTA.focus(); }, 30);
    });

    cancelBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      viewDiv.style.display = '';
      editDiv.style.display = 'none';
      editBtn.style.display = '';
    });

    saveBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var newFront = efTA.value.trim();
      if (!newFront) return;
      var newBack = card.type === 'note' ? '' : ebTA.value.trim();
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].id === card.id) {
          cards[i].front = newFront;
          cards[i].back = newBack;
          break;
        }
      }
      card.front = newFront;
      card.back = newBack;
      save();
      // Update view
      if (card.type === 'cloze') {
        frontEl.innerHTML = escHtml(newFront).replace(/___/g, '<span class="fc-popover-blank">___</span>');
      } else {
        frontEl.textContent = newFront;
      }
      var existingBack = viewDiv.querySelector('.fc-thread-back');
      if (existingBack) existingBack.textContent = newBack;
      viewDiv.style.display = '';
      editDiv.style.display = 'none';
      editBtn.style.display = '';
    });

    if (useInlineFallback()) {
      // Narrow screen: insert inline after the paragraph
      thread.classList.add('fc-margin-thread-inline');
      para.parentNode.insertBefore(thread, para.nextSibling);
    } else {
      // Wide screen: place in margin column
      var col = getMarginCol();
      // Compute paragraph top relative to body
      var bodyRect = document.body.getBoundingClientRect();
      var paraRect = para.getBoundingClientRect();
      var paraTop = paraRect.top - bodyRect.top;
      var dotY = parseInt(dot.style.top, 10) || 0;
      thread.style.top = (paraTop + dotY) + 'px';
      col.appendChild(thread);
      // Resolve collisions after the thread is in the DOM, then draw connectors
      requestAnimationFrame(function () {
        resolveCollisions();
        redrawAllConnectors();
      });
    }

    openThreads[card.id] = thread;

    // Highlight the source text, then draw connector
    highlightSource(card);
    if (!useInlineFallback()) {
      requestAnimationFrame(function () { drawConnector(card.id, card); });
    }
  }

  // ── Connector lines ──
  var connectorSvg = null;
  var connectorLines = {}; // cardId → SVG path element

  function getConnectorSvg() {
    if (connectorSvg) return connectorSvg;
    connectorSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connectorSvg.setAttribute('class', 'fc-connectors');
    document.body.appendChild(connectorSvg);
    return connectorSvg;
  }

  function drawConnector(cardId, card) {
    if (useInlineFallback()) return;
    removeConnector(cardId);

    var thread = openThreads[cardId];
    if (!thread) return;

    var para = document.getElementById(card.paragraphId);
    if (!para) return;

    var bodyRect = document.body.getBoundingClientRect();
    var threadRect = thread.getBoundingClientRect();

    // Source point: always use the margin dot for a consistent anchor
    var dot = document.querySelector('.fc-dot[data-card-id="' + cardId + '"]');
    if (!dot) return;
    var dotRect = dot.getBoundingClientRect();
    var x1 = dotRect.right - bodyRect.left;
    var y1 = dotRect.top - bodyRect.top + dotRect.height / 2;

    // Target point: left edge of the thread, vertically near the top
    var x2 = threadRect.left - bodyRect.left;
    var y2 = threadRect.top - bodyRect.top + 14;

    // Bezier curve — gentle S-curve
    var midX = x1 + (x2 - x1) * 0.5;
    var d = 'M ' + x1 + ' ' + y1 + ' C ' + midX + ' ' + y1 + ', ' + midX + ' ' + y2 + ', ' + x2 + ' ' + y2;

    var svg = getConnectorSvg();
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'fc-connector fc-connector-' + card.type);
    path.dataset.cardId = cardId;
    svg.appendChild(path);
    connectorLines[cardId] = path;
  }

  function removeConnector(cardId) {
    var path = connectorLines[cardId];
    if (path) { path.remove(); delete connectorLines[cardId]; }
  }

  function redrawAllConnectors() {
    Object.keys(openThreads).forEach(function (id) {
      var card = cards.find(function (c) { return c.id === id; });
      if (card) drawConnector(id, card);
    });
  }

  function resolveCollisions() {
    if (!marginCol) return;
    var threads = Array.from(marginCol.querySelectorAll('.fc-margin-thread'));
    // Sort by intended top position
    threads.sort(function (a, b) {
      return (parseFloat(a.style.top) || 0) - (parseFloat(b.style.top) || 0);
    });
    var bottomEdge = 0;
    threads.forEach(function (t) {
      var intended = parseFloat(t.style.top) || 0;
      if (intended < bottomEdge) {
        t.style.top = bottomEdge + 'px';
      }
      bottomEdge = parseFloat(t.style.top) + t.offsetHeight + 12; // 12px gap
    });
  }

  function closeThread(cardId) {
    var thread = openThreads[cardId];
    if (!thread) return;
    thread.remove();
    delete openThreads[cardId];
    removeConnector(cardId);

    // Re-resolve positions after removal, then redraw remaining connectors
    requestAnimationFrame(function () {
      resolveCollisions();
      redrawAllConnectors();
    });

    // Deactivate dot
    var dot = document.querySelector('.fc-dot[data-card-id="' + cardId + '"]');
    if (dot) dot.classList.remove('fc-dot-active');

    // Clear highlights if no threads remain
    if (Object.keys(openThreads).length === 0) {
      clearHighlights();
    } else {
      // Re-highlight remaining open threads
      clearHighlights();
      Object.keys(openThreads).forEach(function (id) {
        var c = cards.find(function (card) { return card.id === id; });
        if (c) highlightSource(c);
      });
    }
  }

  function closeAllThreads() {
    Object.keys(openThreads).forEach(function (id) { closeThread(id); });
  }

  // Legacy popover — kept for study mode fallback
  function showPopover(dot, card) {
    if (activePopoverCard === card.id) { hidePopover(); return; }
    clearHighlights();
    document.querySelectorAll('.fc-dot-active').forEach(function (d) {
      d.classList.remove('fc-dot-active');
    });

    activePopoverCard = card.id;
    activePopoverCardObj = card;
    dot.classList.add('fc-dot-active');

    var label = popover.querySelector('.fc-popover-label');
    var front = popover.querySelector('.fc-popover-front');
    var back = popover.querySelector('.fc-popover-back');
    label.textContent = card.type === 'cloze' ? 'Cloze' : card.type === 'qa' ? 'Q & A' : card.type === 'question' ? 'Question' : 'Note';
    if (card.type === 'cloze') {
      // Render ___ as styled blanks
      front.innerHTML = escHtml(card.front).replace(/___/g, '<span class="fc-popover-blank">___</span>');
    } else {
      front.textContent = card.front;
    }
    back.textContent = card.back;

    var divider = popover.querySelector('.fc-popover-divider');
    if (card.type === 'note' || card.type === 'question') {
      back.style.display = 'none';
      divider.style.display = 'none';
    } else {
      back.style.display = '';
      divider.style.display = '';
    }

    popover.querySelector('.fc-popover-view').style.display = '';
    popover.querySelector('.fc-popover-editing').style.display = 'none';
    popover.querySelector('.fc-popover-edit').style.display = '';

    var dotRect = dot.getBoundingClientRect();
    var bodyRect = document.body.getBoundingClientRect();
    var left = dotRect.right + 8 - bodyRect.left;
    var top = dotRect.top - 8 + window.scrollY;
    if (dotRect.right + 8 + 310 > window.innerWidth) {
      left = dotRect.left - 310 - bodyRect.left;
    }
    top = Math.max(8 + window.scrollY, top);
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
    popover.classList.add('fc-visible');
    highlightSource(card);
  }

  function getSourceYOffset(para, card) {
    var src = card.source || card.anchor;
    if (!src) return 4;
    var fullText = para.textContent;
    var startOffset = fullText.indexOf(src);
    if (startOffset === -1) return 4;
    var walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    var node, charCount = 0;
    while ((node = walker.nextNode())) {
      var len = node.textContent.length;
      if (charCount + len > startOffset) {
        var localOffset = startOffset - charCount;
        var range = document.createRange();
        range.setStart(node, localOffset);
        range.setEnd(node, Math.min(localOffset + 1, len));
        var rect = range.getBoundingClientRect();
        var paraRect = para.getBoundingClientRect();
        return rect.top - paraRect.top;
      }
      charCount += len;
    }
    return 4;
  }

  function renderDots() {
    if (!marginDots) return;
    document.querySelectorAll('.fc-dot').forEach(function (d) { d.remove(); });
    closeAllThreads();
    hidePopover();

    var visible = visibleCards();
    var byPara = {};
    visible.forEach(function (c) {
      if (!c.paragraphId) return;
      if (!byPara[c.paragraphId]) byPara[c.paragraphId] = [];
      byPara[c.paragraphId].push(c);
    });

    Object.keys(byPara).forEach(function (pid) {
      var para = document.getElementById(pid);
      if (!para) return;
      if (getComputedStyle(para).position === 'static') {
        para.style.position = 'relative';
      }

      var positions = byPara[pid].map(function (card) {
        return { card: card, y: getSourceYOffset(para, card) };
      });
      positions.sort(function (a, b) { return a.y - b.y; });

      var placed = [];
      positions.forEach(function (pos) {
        var stackCount = 0;
        placed.forEach(function (p) {
          if (Math.abs(p.y - pos.y) < 10) stackCount++;
        });

        var dot = document.createElement('span');
        dot.className = 'fc-dot fc-dot-' + pos.card.type;
        dot.title = pos.card.type === 'cloze' ? 'Cloze card' : pos.card.type === 'qa' ? 'Q&A card' : pos.card.type === 'question' ? 'Question' : 'Note';
        dot.dataset.cardId = pos.card.id;
        dot.style.top = pos.y + 'px';
        if (stackCount > 0) dot.style.right = (-22 - stackCount * 12) + 'px';
        if (studyMode && isDue(pos.card)) dot.classList.add('fc-due');
        var cardRef = pos.card;
        dot.addEventListener('click', function (e) {
          e.stopPropagation();
          if (studyMode && isDue(cardRef)) {
            showStudyPopover(dot, cardRef);
          } else {
            toggleThread(dot, cardRef);
          }
        });
        para.appendChild(dot);
        placed.push(pos);
      });
    });

    // Refresh passive cloze observer when dots re-render
    if (typeof passiveCloze !== 'undefined' && passiveCloze.enabled) passiveCloze.activateAll();
  }

  // Dismiss popover/study popover on click outside (margin threads stay — they have close buttons)
  document.addEventListener('mousedown', function (e) {
    if (studyPopoverVisible && e.target.closest && !e.target.closest('.fc-study-popover') && !e.target.closest('.fc-dot')) {
      hideStudyPopover();
      return;
    }
    if (activePopoverCard && e.target.closest && !e.target.closest('.fc-popover') && !e.target.closest('.fc-dot')) {
      hidePopover();
    }
  });

  // ── Keyboard: Escape closes drawer/editor ──
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (studyPopoverVisible) { hideStudyPopover(); return; }
      if (studyMode) { exitStudy(); return; }
      if (annoNav && annoNav.navActive) { annoNav.exitNav(); return; }
      if (Object.keys(openThreads).length > 0) { closeAllThreads(); return; }
      if (activePopoverCard) { hidePopover(); return; }
      if (drawerOpen) closeDrawer();
      hideEditor();
      hidePopup();
      return;
    }

    // Study mode navigation
    if (studyMode && activeStudyCard) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        advanceStudy();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        retreatStudy();
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (activeStudyCard && activeStudyCard.type === 'cloze') {
          // Cards Only / Interstitial: reveal via the button in the modal/card
          if (activeStudyType === 'cards-only' || activeStudyType === 'interstitial') {
            var revealBtn = document.querySelector('.fc-cards-modal-card .fc-qa-reveal') ||
                            document.querySelector('.fc-interstitial-card .fc-qa-reveal');
            if (revealBtn) revealBtn.click();
          } else {
            var blanks = activeStudyPara && activeStudyPara.querySelectorAll('.fc-cloze-blank:not(.fc-revealed)');
            if (blanks && blanks.length > 0) {
              revealCloze(activeStudyPara);
            }
          }
        } else if (activeStudyCard && activeStudyCard.type === 'qa') {
          var container = document.querySelector('.fc-qa-inline[data-card-id="' + activeStudyCard.id + '"]') ||
                          document.querySelector('.fc-margin-panel[data-card-id="' + activeStudyCard.id + '"]') ||
                          document.querySelector('.fc-cards-modal-card[data-card-id="' + activeStudyCard.id + '"]') ||
                          document.querySelector('.fc-interstitial-card[data-card-id="' + activeStudyCard.id + '"]');
          if (container) {
            var answer = container.querySelector('.fc-qa-answer, .fc-cards-back');
            if (answer && answer.style.display === 'none') {
              var revealBtn = container.querySelector('.fc-qa-reveal');
              if (revealBtn) revealBtn.click();
            }
          } else if (activeStudyType === 'popover' && studyPopoverCardObj) {
            revealStudyCard();
          }
        } else if (activeStudyCard && (activeStudyCard.type === 'note' || activeStudyCard.type === 'question')) {
          continueStudyCard(activeStudyCard);
        } else if (activeStudyType === 'popover' && studyPopoverCardObj) {
          revealStudyCard();
        }
        return;
      }
    }

    // Annotation nav: arrow keys step between dots (only when not in study mode)
    // Skip if focus is in a text input / textarea / contenteditable
    if (!studyMode && annoNav && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      var tag = document.activeElement && document.activeElement.tagName;
      var editable = document.activeElement && document.activeElement.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
      e.preventDefault();
      annoNav.stepNav(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
  });

  // ── Study Mode (SM-2 Spaced Repetition) ──
  var studyMode = false;
  var dueQueue = [];
  var dueIndex = 0;
  var reviewedCount = 0;
  var studyPopoverVisible = false;
  var studyPopoverCardObj = null;

  // Inline study state
  var activeStudyCard = null;
  var activeStudyPara = null;
  var activeStudyType = null; // 'cloze' | 'qa' | 'note' | 'question' | 'margin' | 'popover'
  var studyPosition = 0;
  var STUDY_MODES = ['context', 'cards', 'interstitial', 'margin'];
  var studyDisplay = 'context'; // 'context', 'cards', 'interstitial', or 'margin'

  function isDue(card) {
    if (card.type === 'note' || card.type === 'question') return true;
    return !card.nextReview || card.nextReview <= Date.now();
  }

  // Study banner
  var studyBanner = document.createElement('div');
  studyBanner.className = 'fc-study-banner';
  studyBanner.style.display = 'none';
  var DISPLAY_LABELS = { context: 'In Context', cards: 'Cards Only', interstitial: 'Interstitial', margin: 'Margin' };
  studyBanner.innerHTML =
    '<span class="fc-study-banner-text"></span>' +
    '<div class="fc-banner-controls">' +
      '<select class="fc-banner-select" title="Card display mode">' +
        STUDY_MODES.map(function (m) {
          return '<option value="' + m + '">' + DISPLAY_LABELS[m] + '</option>';
        }).join('') +
      '</select>' +
      '<button class="fc-study-exit">Exit Study</button>' +
    '</div>';
  document.body.appendChild(studyBanner);
  studyBanner.querySelector('.fc-study-exit').addEventListener('click', exitStudy);
  var bannerSelect = studyBanner.querySelector('.fc-banner-select');
  bannerSelect.addEventListener('change', function () {
    studyDisplay = this.value;
    document.body.classList.remove('fc-cards-only', 'fc-interstitial');
    if (studyDisplay === 'cards') {
      document.body.classList.add('fc-cards-only');
    } else if (studyDisplay === 'interstitial') {
      document.body.classList.add('fc-interstitial');
    }
    if (activeStudyCard) {
      var card = activeStudyCard;
      deactivateCurrentInline();
      activateByType(card);
    }
  });

  // Study popover
  var studyPop = document.createElement('div');
  studyPop.className = 'fc-study-popover';
  studyPop.innerHTML =
    '<div class="fc-study-label"></div>' +
    '<div class="fc-study-front"></div>' +
    '<div class="fc-study-back" style="display:none"></div>' +
    '<button class="fc-reveal-btn">Reveal</button>' +
    '<div class="fc-rate-btns" style="display:none">' +
      '<button class="fc-rate-again">Again</button>' +
      '<button class="fc-rate-good">Good</button>' +
      '<button class="fc-rate-easy">Easy</button>' +
      '<button class="fc-rate-skip">Skip</button>' +
    '</div>';
  document.body.appendChild(studyPop);

  studyPop.querySelector('.fc-reveal-btn').addEventListener('click', function () {
    if (studyPopoverCardObj) revealStudyCard();
  });
  studyPop.querySelector('.fc-rate-again').addEventListener('click', function () {
    if (studyPopoverCardObj) rateCard(studyPopoverCardObj, 'again');
  });
  studyPop.querySelector('.fc-rate-good').addEventListener('click', function () {
    if (studyPopoverCardObj) rateCard(studyPopoverCardObj, 'good');
  });
  studyPop.querySelector('.fc-rate-easy').addEventListener('click', function () {
    if (studyPopoverCardObj) rateCard(studyPopoverCardObj, 'easy');
  });
  studyPop.querySelector('.fc-rate-skip').addEventListener('click', function () {
    if (studyPopoverCardObj) skipCard();
  });

  // ── Inline rate bar (shared by cloze + Q&A) ──
  function createInlineRateBar(card) {
    var bar = document.createElement('div');
    bar.className = 'fc-inline-rate';
    var labels = ['Again', 'Good', 'Easy', 'Skip'];
    var keys = ['again', 'good', 'easy', 'skip'];
    labels.forEach(function (label, i) {
      var btn = document.createElement('button');
      btn.className = 'fc-rate-' + keys[i];
      btn.textContent = label;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (keys[i] === 'skip') {
          inlineSkipCard(card);
        } else {
          inlineRateCard(card, keys[i]);
        }
      });
      bar.appendChild(btn);
    });
    return bar;
  }

  function inlineRateCard(card, quality) {
    rateCard(card, quality);
    // rateCard calls hideStudyPopover + scrollToNextDue — we override below
  }

  function inlineSkipCard(card) {
    dueQueue = dueQueue.filter(function (c) { return c.id !== card.id; });
    deactivateCurrentInline();
    updateStudyBanner();
    advanceToNext();
  }

  // ── Cloze-in-paragraph ──
  function buildClozeDOM(para, card) {
    var src = card.source;
    if (!src) return false;
    var fullText = para.textContent;
    var startOffset = fullText.indexOf(src);
    if (startOffset === -1) return false;
    var endOffset = startOffset + src.length;

    // Save original HTML for restore (only on first modification)
    if (!para._fcOriginalHTML) para._fcOriginalHTML = para.innerHTML;

    // Find source text nodes via TreeWalker
    var walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    var node, charCount = 0;
    var startNode = null, startIdx = 0, endNode = null, endIdx = 0;

    while ((node = walker.nextNode())) {
      var len = node.textContent.length;
      if (!startNode && charCount + len > startOffset) {
        startNode = node;
        startIdx = startOffset - charCount;
      }
      if (charCount + len >= endOffset) {
        endNode = node;
        endIdx = endOffset - charCount;
        break;
      }
      charCount += len;
    }
    if (!startNode || !endNode) return false;

    // Wrap the source range in a span
    var range = document.createRange();
    range.setStart(startNode, startIdx);
    range.setEnd(endNode, endIdx);

    var sourceSpan = document.createElement('span');
    sourceSpan.className = 'fc-cloze-source';
    try {
      range.surroundContents(sourceSpan);
    } catch (e) {
      // If surroundContents fails (partial overlap with existing elements),
      // extract and re-insert
      var frag = range.extractContents();
      sourceSpan.appendChild(frag);
      range.insertNode(sourceSpan);
    }

    // Now replace blanked words within the source span
    var sourceTokens = tokenize(card.source);
    var frontTokens = tokenize(card.front);

    // Build a map of blank positions by walking both arrays
    var blanks = [];
    var si = 0, fi = 0;
    while (si < sourceTokens.length && fi < frontTokens.length) {
      if (/^\s+$/.test(sourceTokens[si])) { si++; fi++; continue; }
      if (/___/.test(frontTokens[fi])) {
        blanks.push({ word: sourceTokens[si] });
      }
      si++; fi++;
    }

    if (blanks.length === 0) {
      // Restore DOM since we already modified it
      if (para._fcOriginalHTML) {
        para.innerHTML = para._fcOriginalHTML;
        delete para._fcOriginalHTML;
      }
      return false;
    }

    // Replace text in sourceSpan: walk text nodes, find and wrap blank words
    var html = sourceSpan.innerHTML;
    var blankIdx = 0;
    // Rebuild innerHTML replacing exact words with blank spans
    // Use the source text and front text alignment
    var srcToks = tokenize(card.source);
    var frtToks = tokenize(card.front);
    var result = '';
    var si2 = 0, fi2 = 0;
    // Walk through source tokens, building result HTML
    // We need to operate on the text content, but innerHTML might have tags (em, strong)
    // Simpler approach: operate on textContent, rebuild
    var plainText = sourceSpan.textContent;
    var ptTokens = tokenize(plainText);

    // Rebuild source span content from tokens
    sourceSpan.textContent = '';
    var pi = 0; fi2 = 0;
    while (pi < ptTokens.length && fi2 < frtToks.length) {
      if (/^\s+$/.test(ptTokens[pi])) {
        sourceSpan.appendChild(document.createTextNode(ptTokens[pi]));
        pi++; fi2++;
        continue;
      }
      if (/___/.test(frtToks[fi2])) {
        var blank = document.createElement('span');
        blank.className = 'fc-cloze-blank';
        blank.dataset.answer = ptTokens[pi];
        blank.textContent = ptTokens[pi]; // invisible text sizes the blank to match the answer
        blank.addEventListener('click', function (e) {
          e.stopPropagation();
          revealCloze(para);
        });
        sourceSpan.appendChild(blank);
      } else {
        sourceSpan.appendChild(document.createTextNode(ptTokens[pi]));
      }
      pi++; fi2++;
    }
    // Append remaining tokens (if any mismatch)
    while (pi < ptTokens.length) {
      sourceSpan.appendChild(document.createTextNode(ptTokens[pi]));
      pi++;
    }

    return true;
  }

  function activateClozeInParagraph(card) {
    var para = document.getElementById(card.paragraphId);
    if (!para) return showStudyPopoverFallback(card);

    var success = buildClozeDOM(para, card);
    if (!success) return showStudyPopoverFallback(card);

    para.classList.add('fc-cloze-active');
    activeStudyCard = card;
    activeStudyPara = para;
    activeStudyType = 'cloze';

    slideToElement(para);
  }

  function revealCloze(para) {
    if (!para) para = activeStudyPara;
    if (!para) return;
    var blanks = para.querySelectorAll('.fc-cloze-blank');
    blanks.forEach(function (b) {
      b.textContent = b.dataset.answer;
      b.classList.add('fc-revealed');
    });
    // Insert rating bar after source span
    var sourceSpan = para.querySelector('.fc-cloze-source');
    if (sourceSpan && activeStudyCard) {
      var existing = para.querySelector('.fc-inline-rate');
      if (!existing) {
        var bar = createInlineRateBar(activeStudyCard);
        sourceSpan.after(bar);
      }
    }
  }

  function deactivateCloze(para) {
    if (!para) return;
    if (para._fcOriginalHTML) {
      para.innerHTML = para._fcOriginalHTML;
      delete para._fcOriginalHTML;
    }
    para.classList.remove('fc-cloze-active');
  }

  // ── Inline Q&A ──
  function activateQAInline(card) {
    var para = document.getElementById(card.paragraphId);
    if (!para) return showStudyPopoverFallback(card);

    highlightSource(card);

    var cardEl = document.createElement('div');
    cardEl.className = 'fc-qa-inline';
    cardEl.dataset.cardId = card.id;
    var qaHtml = '<div class="fc-qa-label">Q &amp; A</div>';
    if (card.creator) qaHtml += '<div class="fc-creator-label">' + escHtml(card.creator) + '</div>';
    qaHtml += '<div class="fc-qa-question">' + escHtml(card.front) + '</div>' +
      '<div class="fc-qa-answer" style="display:none">' + escHtml(card.back) + '</div>';
    cardEl.innerHTML = qaHtml;

    var revealBtn = document.createElement('button');
    revealBtn.className = 'fc-qa-reveal';
    revealBtn.textContent = 'Reveal';
    revealBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      revealQAInline(cardEl, card);
    });
    cardEl.appendChild(revealBtn);

    para.after(cardEl);
    activeStudyCard = card;
    activeStudyPara = para;
    activeStudyType = 'qa';

    slideToElement(para);
  }

  function revealQAInline(cardEl, card) {
    cardEl.querySelector('.fc-qa-answer').style.display = '';
    var revealBtn = cardEl.querySelector('.fc-qa-reveal');
    if (revealBtn) revealBtn.remove();
    var bar = createInlineRateBar(card);
    cardEl.appendChild(bar);
  }

  function deactivateQAInline() {
    var el = document.querySelector('.fc-qa-inline');
    if (el) el.remove();
    clearHighlights();
  }

  // ── Margin panel display (Q&A, Note, Question) ──
  function activateCardMargin(card) {
    var para = document.getElementById(card.paragraphId);
    if (!para) return showStudyPopoverFallback(card);

    highlightSource(card);

    var panel = document.createElement('div');
    panel.className = 'fc-margin-panel';
    if (card.type === 'note') panel.classList.add('fc-study-note');
    else if (card.type === 'question') panel.classList.add('fc-study-question');
    panel.dataset.cardId = card.id;

    var typeLabel = card.type === 'qa' ? 'Q & A' : card.type === 'note' ? 'Note' : 'Question';
    var html = '<div class="fc-qa-label">' + typeLabel + '</div>';
    if (card.creator) html += '<div class="fc-creator-label">' + escHtml(card.creator) + '</div>';
    html += '<div class="fc-qa-question">' + escHtml(card.front) + '</div>';

    if (card.type === 'qa') {
      html += '<div class="fc-qa-answer" style="display:none">' + escHtml(card.back) + '</div>';
      panel.innerHTML = html;
      var revealBtn = document.createElement('button');
      revealBtn.className = 'fc-qa-reveal';
      revealBtn.textContent = 'Reveal';
      revealBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        panel.querySelector('.fc-qa-answer').style.display = '';
        revealBtn.remove();
        panel.appendChild(createInlineRateBar(card));
      });
      panel.appendChild(revealBtn);
    } else {
      panel.innerHTML = html;
      var contBtn = document.createElement('button');
      contBtn.className = 'fc-qa-reveal';
      contBtn.textContent = 'Continue';
      contBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        continueStudyCard(card);
      });
      panel.appendChild(contBtn);
    }

    // Append to paragraph if viewport is wide enough, else fall back to body fixed
    var useAbsolute = window.innerWidth >= 1080;
    if (useAbsolute) {
      para.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }

    activeStudyCard = card;
    activeStudyPara = para;
    activeStudyType = 'margin';

    slideToElement(para, function () {
      if (!useAbsolute) {
        var r = para.getBoundingClientRect();
        panel.style.top = Math.max(50, r.top) + 'px';
      }
    });
  }

  // ── Inline Note/Question display ──
  function activateNoteInline(card) {
    var para = document.getElementById(card.paragraphId);
    if (!para) return showStudyPopoverFallback(card);

    highlightSource(card);

    var cardEl = document.createElement('div');
    cardEl.className = 'fc-qa-inline' + (card.type === 'note' ? ' fc-study-note' : ' fc-study-question');
    cardEl.dataset.cardId = card.id;

    var typeLabel = card.type === 'note' ? 'Note' : 'Question';
    var html = '<div class="fc-qa-label">' + typeLabel + '</div>';
    if (card.creator) html += '<div class="fc-creator-label">' + escHtml(card.creator) + '</div>';
    html += '<div class="fc-qa-question">' + escHtml(card.front) + '</div>';
    cardEl.innerHTML = html;

    var contBtn = document.createElement('button');
    contBtn.className = 'fc-qa-reveal';
    contBtn.textContent = 'Continue';
    contBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      continueStudyCard(card);
    });
    cardEl.appendChild(contBtn);

    para.after(cardEl);
    activeStudyCard = card;
    activeStudyPara = para;
    activeStudyType = card.type;

    slideToElement(para);
  }

  // ── Continue past note/question (no SM-2 rating) ──
  function continueStudyCard(card) {
    dueQueue = dueQueue.filter(function (c) { return c.id !== card.id; });
    deactivateCurrentInline();
    updateStudyBanner();
    advanceToNext();
  }

  // ── Fallback to popover for cards without findable source ──
  function showStudyPopoverFallback(card) {
    activeStudyType = 'popover';
    activeStudyCard = card;
    activeStudyPara = null;
    var dot = document.querySelector('.fc-dot[data-card-id="' + card.id + '"]');
    if (dot) {
      slideToElement(dot, function () { showStudyPopover(dot, card); });
    }
  }

  // ── Deactivate whatever inline element is active ──
  function deactivateCurrentInline() {
    if (activeStudyType === 'cloze' && activeStudyPara) {
      deactivateCloze(activeStudyPara);
    } else if (activeStudyType === 'qa' || activeStudyType === 'note' || activeStudyType === 'question') {
      var el = document.querySelector('.fc-qa-inline');
      if (el) el.remove();
      clearHighlights();
    } else if (activeStudyType === 'margin') {
      var panel = document.querySelector('.fc-margin-panel');
      if (panel) panel.remove();
      clearHighlights();
    } else if (activeStudyType === 'cards-only') {
      deactivateCardsOnly();
    } else if (activeStudyType === 'interstitial') {
      deactivateInterstitial();
    } else if (activeStudyType === 'popover') {
      hideStudyPopover();
    }
    // Just clear active paragraph highlight — keep body spotlight on during navigation
    document.querySelectorAll('.fc-spotlight-active').forEach(function (el) {
      el.classList.remove('fc-spotlight-active');
    });
    activeStudyCard = null;
    activeStudyPara = null;
    activeStudyType = null;
  }

  // ── Navigation ──
  function advanceToNext() {
    var remaining = dueQueue.filter(isDue);
    if (remaining.length === 0) {
      studyBanner.querySelector('.fc-study-banner-text').textContent =
        'All done! ' + reviewedCount + ' card' + (reviewedCount !== 1 ? 's' : '') + ' reviewed';
      setTimeout(exitStudy, 3000);
      return;
    }
    studyPosition++;
    if (studyPosition >= remaining.length) studyPosition = 0;
    var next = remaining[studyPosition < remaining.length ? studyPosition : 0];
    activateByType(next);
  }

  function retreatStudy() {
    var remaining = dueQueue.filter(isDue);
    if (remaining.length === 0) return;
    deactivateCurrentInline();
    studyPosition--;
    if (studyPosition < 0) studyPosition = remaining.length - 1;
    var prev = remaining[studyPosition];
    activateByType(prev);
  }

  function advanceStudy() {
    var remaining = dueQueue.filter(isDue);
    if (remaining.length === 0) return;
    deactivateCurrentInline();
    studyPosition++;
    if (studyPosition >= remaining.length) studyPosition = 0;
    var next = remaining[studyPosition];
    activateByType(next);
  }

  // ── Slide transition: fade out, instant jump, fade in ──
  var slideTimer = null;

  function slideToElement(el, callback) {
    if (!el) { if (callback) callback(); return; }
    // If element is already mostly visible, skip the transition
    var rect = el.getBoundingClientRect();
    var inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (inView) { if (callback) callback(); return; }

    clearTimeout(slideTimer);
    document.body.classList.add('fc-slide-out');
    slideTimer = setTimeout(function () {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      document.body.classList.remove('fc-slide-out');
      document.body.classList.add('fc-slide-in');
      slideTimer = setTimeout(function () {
        document.body.classList.remove('fc-slide-in');
        if (callback) callback();
      }, 500);
    }, 500);
  }

  // ── Spotlight: dim everything except the active paragraph ──
  // All spotlight-targetable elements (paragraphs, figures, headings)
  function getSpotlightEls() {
    return Array.from(document.querySelectorAll('p[id^="p"], figure, h1, h2, h3'));
  }

  function spotlightParagraph(paraId) {
    document.querySelectorAll('.fc-spotlight-active').forEach(function (el) {
      el.classList.remove('fc-spotlight-active');
    });
    var para = document.getElementById(paraId);
    if (!para) return;
    document.body.classList.add('fc-spotlight');
    para.classList.add('fc-spotlight-active');

    // Gradient: set opacity/blur based on distance from active element
    var els = getSpotlightEls();
    var activeIdx = els.indexOf(para);
    if (activeIdx === -1) return;

    els.forEach(function (el, i) {
      if (el === para) {
        el.style.opacity = '';
        el.style.filter = '';
        return;
      }
      var dist = Math.abs(i - activeIdx);
      // opacity: 1.0 at 0, 0.75 at 1, 0.45 at 2, 0.25 at 3, floor 0.1
      var opacity = Math.max(0.1, 1 / (1 + dist * 0.5));
      var blur = dist <= 1 ? 0 : Math.min((dist - 1) * 0.5, 1.5);
      el.style.opacity = opacity;
      el.style.filter = blur > 0 ? 'blur(' + blur + 'px)' : 'none';
    });
  }

  function clearSpotlight() {
    document.body.classList.remove('fc-spotlight');
    document.querySelectorAll('.fc-spotlight-active').forEach(function (el) {
      el.classList.remove('fc-spotlight-active');
    });
    // Clear inline gradient styles
    var els = getSpotlightEls();
    els.forEach(function (el) {
      el.style.opacity = '';
      el.style.filter = '';
    });
  }

  // ── Cards Only: Anki-style modal card ──
  var cardsOnlyModal = document.createElement('div');
  cardsOnlyModal.className = 'fc-cards-modal';
  cardsOnlyModal.style.display = 'none';
  document.body.appendChild(cardsOnlyModal);

  function activateCardsOnly(card) {
    var para = document.getElementById(card.paragraphId);
    activeStudyCard = card;
    activeStudyPara = para;
    activeStudyType = 'cards-only';

    document.body.classList.add('fc-cards-only');
    cardsOnlyModal.style.display = '';

    var typeLabel = { cloze: 'Cloze', qa: 'Q & A', note: 'Note', question: 'Question' }[card.type] || card.type;
    var typeClass = card.type === 'note' ? ' fc-study-note' : card.type === 'question' ? ' fc-study-question' : '';
    var borderColor = { cloze: 'var(--accent)', qa: '#f0883e', note: '#8b949e', question: '#f59e0b' }[card.type] || 'var(--accent)';

    var html = '<div class="fc-cards-modal-card' + typeClass + '" data-card-id="' + card.id + '" style="border-left-color:' + borderColor + '">';
    html += '<div class="fc-qa-label">' + typeLabel + '</div>';
    if (card.creator) html += '<div class="fc-creator-label">' + escHtml(card.creator) + '</div>';

    if (card.type === 'cloze') {
      // Show front with ___ as styled blanks
      var clozeHtml = escHtml(card.front).replace(/___/g, '<span class="fc-cards-blank">[...]</span>');
      html += '<div class="fc-cards-front">' + clozeHtml + '</div>';
      html += '<div class="fc-cards-back" style="display:none">' + escHtml(card.back) + '</div>';
    } else if (card.type === 'qa') {
      html += '<div class="fc-cards-front">' + escHtml(card.front) + '</div>';
      html += '<div class="fc-cards-back" style="display:none">' + escHtml(card.back) + '</div>';
    } else {
      html += '<div class="fc-cards-front">' + escHtml(card.front) + '</div>';
    }

    if (card.paragraphId) {
      html += '<div class="fc-cards-source" style="display:none"><div class="fc-cards-source-label">Source paragraph</div>' + escHtml(card.source) + '</div>';
    }

    html += '</div>';
    cardsOnlyModal.innerHTML = html;

    // Add action buttons
    var actionsEl = document.createElement('div');
    actionsEl.className = 'fc-cards-actions';

    if (card.type === 'cloze' || card.type === 'qa') {
      var revealBtn = document.createElement('button');
      revealBtn.className = 'fc-qa-reveal';
      revealBtn.textContent = card.type === 'cloze' ? 'Reveal' : 'Reveal Answer';
      revealBtn.addEventListener('click', function () {
        if (card.type === 'cloze') {
          // Replace [...] blanks with answer words
          var answers = card.back.split(', ');
          var idx = 0;
          cardsOnlyModal.querySelectorAll('.fc-cards-blank').forEach(function (b) {
            b.textContent = answers[idx++] || '';
            b.classList.add('fc-revealed');
          });
        }
        cardsOnlyModal.querySelector('.fc-cards-back').style.display = '';
        revealBtn.remove();
        actionsEl.appendChild(createInlineRateBar(card));
      });
      actionsEl.appendChild(revealBtn);
    } else {
      // Note/Question — just continue
      var contBtn = document.createElement('button');
      contBtn.className = 'fc-qa-reveal';
      contBtn.textContent = 'Continue';
      contBtn.addEventListener('click', function () { continueStudyCard(card); });
      actionsEl.appendChild(contBtn);
    }

    // Source toggle
    var srcBtn = document.createElement('button');
    srcBtn.className = 'fc-cards-src-toggle';
    srcBtn.textContent = 'Show Source';
    srcBtn.addEventListener('click', function () {
      var srcEl = cardsOnlyModal.querySelector('.fc-cards-source');
      if (!srcEl) return;
      var visible = srcEl.style.display !== 'none';
      srcEl.style.display = visible ? 'none' : '';
      srcBtn.textContent = visible ? 'Show Source' : 'Hide Source';
    });
    actionsEl.appendChild(srcBtn);

    cardsOnlyModal.querySelector('.fc-cards-modal-card').appendChild(actionsEl);
  }

  function deactivateCardsOnly() {
    cardsOnlyModal.style.display = 'none';
    cardsOnlyModal.innerHTML = '';
    if (studyDisplay !== 'cards') {
      document.body.classList.remove('fc-cards-only');
    }
  }

  // ── Interstitial: card-styled UI placed at paragraph location, everything else dimmed ──
  function activateInterstitial(card) {
    var para = document.getElementById(card.paragraphId);
    if (!para) return showStudyPopoverFallback(card);

    activeStudyCard = card;
    activeStudyPara = para;
    activeStudyType = 'interstitial';

    document.body.classList.add('fc-interstitial');
    spotlightParagraph(card.paragraphId);

    var typeLabel = { cloze: 'Cloze', qa: 'Q & A', note: 'Note', question: 'Question' }[card.type] || card.type;
    var borderColor = { cloze: 'var(--accent)', qa: '#f0883e', note: '#8b949e', question: '#f59e0b' }[card.type] || 'var(--accent)';
    var typeClass = card.type === 'note' ? ' fc-study-note' : card.type === 'question' ? ' fc-study-question' : '';

    var cardEl = document.createElement('div');
    cardEl.className = 'fc-interstitial-card' + typeClass;
    cardEl.dataset.cardId = card.id;
    cardEl.style.borderLeftColor = borderColor;

    var html = '<div class="fc-qa-label">' + typeLabel + '</div>';
    if (card.creator) html += '<div class="fc-creator-label">' + escHtml(card.creator) + '</div>';

    if (card.type === 'cloze') {
      var clozeHtml = escHtml(card.front).replace(/___/g, '<span class="fc-cards-blank">[...]</span>');
      html += '<div class="fc-cards-front">' + clozeHtml + '</div>';
      html += '<div class="fc-cards-back" style="display:none">' + escHtml(card.back) + '</div>';
    } else if (card.type === 'qa') {
      html += '<div class="fc-cards-front">' + escHtml(card.front) + '</div>';
      html += '<div class="fc-cards-back" style="display:none">' + escHtml(card.back) + '</div>';
    } else {
      html += '<div class="fc-cards-front">' + escHtml(card.front) + '</div>';
    }

    cardEl.innerHTML = html;

    // Action buttons
    var actionsEl = document.createElement('div');
    actionsEl.className = 'fc-cards-actions';

    if (card.type === 'cloze' || card.type === 'qa') {
      var revealBtn = document.createElement('button');
      revealBtn.className = 'fc-qa-reveal';
      revealBtn.textContent = card.type === 'cloze' ? 'Reveal' : 'Reveal Answer';
      revealBtn.addEventListener('click', function () {
        if (card.type === 'cloze') {
          var answers = card.back.split(', ');
          var idx = 0;
          cardEl.querySelectorAll('.fc-cards-blank').forEach(function (b) {
            b.textContent = answers[idx++] || '';
            b.classList.add('fc-revealed');
          });
        }
        cardEl.querySelector('.fc-cards-back').style.display = '';
        revealBtn.remove();
        actionsEl.appendChild(createInlineRateBar(card));
      });
      actionsEl.appendChild(revealBtn);
    } else {
      var contBtn = document.createElement('button');
      contBtn.className = 'fc-qa-reveal';
      contBtn.textContent = 'Continue';
      contBtn.addEventListener('click', function () { continueStudyCard(card); });
      actionsEl.appendChild(contBtn);
    }

    cardEl.appendChild(actionsEl);
    para.after(cardEl);
    slideToElement(cardEl);
  }

  function deactivateInterstitial() {
    var el = document.querySelector('.fc-interstitial-card');
    if (el) el.remove();
    if (studyDisplay !== 'interstitial') {
      document.body.classList.remove('fc-interstitial');
    }
  }

  function activateByType(card) {
    updateStudyBanner();
    if (studyDisplay === 'cards') {
      activateCardsOnly(card);
    } else if (studyDisplay === 'interstitial') {
      activateInterstitial(card);
    } else if (studyDisplay === 'margin') {
      if (card.type === 'cloze') activateClozeInParagraph(card);
      else activateCardMargin(card);
    } else {
      // 'context' mode — inline with spotlight
      if (card.type === 'cloze') activateClozeInParagraph(card);
      else if (card.type === 'qa') activateQAInline(card);
      else activateNoteInline(card);
      spotlightParagraph(card.paragraphId);
    }
  }

  function enterStudy() {
    if (!studyEnabled) return;
    passiveCloze.deactivateAll();
    closeAllThreads();
    studyMode = true;
    reviewedCount = 0;
    hidePopover();

    cards.forEach(function (c) {
      if (c.interval === undefined) c.interval = 0;
      if (c.ease === undefined) c.ease = 2.5;
      if (c.reps === undefined) c.reps = 0;
      if (c.nextReview === undefined || c.nextReview === 0) c.nextReview = 0;
      if (c.lastReview === undefined) c.lastReview = 0;
    });
    save();
    buildDueQueue();

    if (dueQueue.length === 0) {
      studyMode = false;
      updateStudyToggle();
      return;
    }

    refreshDueGlow();
    updateStudyBanner();
    updateStudyToggle();
    studyBanner.style.display = '';
    dueIndex = 0;
    scrollToNextDue();
  }

  function buildDueQueue() {
    var allParas = Array.from(document.querySelectorAll('[id^="p"]'));
    var paraOrder = {};
    allParas.forEach(function (p, i) { paraOrder[p.id] = i; });

    dueQueue = visibleCards().filter(isDue).sort(function (a, b) {
      var oa = paraOrder[a.paragraphId] !== undefined ? paraOrder[a.paragraphId] : 99999;
      var ob = paraOrder[b.paragraphId] !== undefined ? paraOrder[b.paragraphId] : 99999;
      return oa - ob;
    });
  }

  function refreshDueGlow() {
    document.querySelectorAll('.fc-dot.fc-due').forEach(function (d) {
      d.classList.remove('fc-due');
    });
    if (!studyMode) return;
    dueQueue.forEach(function (card) {
      if (isDue(card)) {
        var dot = document.querySelector('.fc-dot[data-card-id="' + card.id + '"]');
        if (dot) dot.classList.add('fc-due');
      }
    });
  }

  function updateStudyBanner() {
    var remaining = dueQueue.filter(isDue);
    var total = remaining.length + reviewedCount;
    var pos = Math.min(studyPosition + 1, remaining.length);
    var text = 'Study mode: ' + pos + ' / ' + remaining.length;
    if (reviewedCount > 0) text += ' — ' + reviewedCount + ' reviewed';
    studyBanner.querySelector('.fc-study-banner-text').textContent = text;
  }

  function exitStudy() {
    deactivateCurrentInline();
    studyMode = false;
    studyBanner.style.display = 'none';
    hideStudyPopover();
    clearHighlights();
    document.querySelectorAll('.fc-dot.fc-due').forEach(function (d) {
      d.classList.remove('fc-due');
    });
    // Restore any paragraphs that might still have saved HTML
    document.querySelectorAll('.fc-cloze-active').forEach(function (p) {
      if (p._fcOriginalHTML) {
        p.innerHTML = p._fcOriginalHTML;
        delete p._fcOriginalHTML;
      }
      p.classList.remove('fc-cloze-active');
    });
    // Remove any lingering inline cards, margin panels, and modal
    document.querySelectorAll('.fc-qa-inline').forEach(function (el) { el.remove(); });
    document.querySelectorAll('.fc-margin-panel').forEach(function (el) { el.remove(); });
    deactivateCardsOnly();
    deactivateInterstitial();
    document.body.classList.remove('fc-cards-only', 'fc-interstitial');
    clearSpotlight();
    dueQueue = [];
    updateStudyToggle();
  }

  function updateStudyToggle() {
    if (!studyToggle) return;
    var dueCount = visibleCards().filter(isDue).length;
    if (studyMode) {
      studyToggle.textContent = 'Exit Study';
      studyToggle.classList.add('fc-study-toggle-active');
    } else {
      studyToggle.textContent = dueCount > 0 ? 'Study (' + dueCount + ')' : 'Study';
      studyToggle.classList.remove('fc-study-toggle-active');
    }
  }

  if (studyToggle) {
    studyToggle.addEventListener('click', function () {
      if (studyMode) { exitStudy(); } else { enterStudy(); }
    });
  }

  function showStudyPopover(dot, card) {
    clearHighlights();
    hidePopover();
    studyPopoverCardObj = card;
    studyPopoverVisible = true;
    highlightSource(card);

    document.querySelectorAll('.fc-dot-active').forEach(function (d) {
      d.classList.remove('fc-dot-active');
    });
    dot.classList.add('fc-dot-active');

    studyPop.querySelector('.fc-study-label').textContent =
      (card.type === 'cloze' ? 'Cloze' : card.type === 'question' ? 'Question' : 'Q & A');
    studyPop.querySelector('.fc-study-front').textContent = card.front;
    studyPop.querySelector('.fc-study-back').style.display = 'none';
    studyPop.querySelector('.fc-study-back').textContent = card.back;
    studyPop.querySelector('.fc-reveal-btn').style.display = '';
    studyPop.querySelector('.fc-rate-btns').style.display = 'none';

    var dotRect = dot.getBoundingClientRect();
    var bodyRect = document.body.getBoundingClientRect();
    var left = dotRect.right + 8 - bodyRect.left;
    var top = dotRect.top - 8 + window.scrollY;
    if (dotRect.right + 8 + 330 > window.innerWidth) {
      left = dotRect.left - 330 - bodyRect.left;
    }
    top = Math.max(8 + window.scrollY, top);
    studyPop.style.left = left + 'px';
    studyPop.style.top = top + 'px';
    studyPop.classList.add('fc-visible');
  }

  function hideStudyPopover() {
    studyPop.classList.remove('fc-visible');
    clearHighlights();
    document.querySelectorAll('.fc-dot-active').forEach(function (d) {
      d.classList.remove('fc-dot-active');
    });
    studyPopoverCardObj = null;
    studyPopoverVisible = false;
  }

  function revealStudyCard() {
    studyPop.querySelector('.fc-study-back').style.display = '';
    studyPop.querySelector('.fc-reveal-btn').style.display = 'none';
    studyPop.querySelector('.fc-rate-btns').style.display = '';
  }

  function rateCard(card, quality) {
    var now = Date.now();
    var DAY = 86400000;

    if (quality === 'again') {
      card.interval = 0;
      card.ease = Math.max(1.3, card.ease - 0.2);
      card.reps = 0;
      card.nextReview = now;
    } else if (quality === 'good') {
      if (card.reps === 0) card.interval = 1;
      else if (card.reps === 1) card.interval = 3;
      else card.interval = Math.round(card.interval * card.ease);
      card.reps++;
      card.nextReview = now + card.interval * DAY;
    } else if (quality === 'easy') {
      if (card.reps === 0) card.interval = 4;
      else card.interval = Math.round(card.interval * card.ease * 1.3);
      card.ease += 0.15;
      card.reps++;
      card.nextReview = now + card.interval * DAY;
    }
    card.lastReview = now;

    for (var i = 0; i < cards.length; i++) {
      if (cards[i].id === card.id) {
        cards[i] = card;
        break;
      }
    }
    save();
    sbUpsertProgress(card);

    var dot = document.querySelector('.fc-dot[data-card-id="' + card.id + '"]');
    if (dot && !isDue(card)) dot.classList.remove('fc-due');

    reviewedCount++;

    // Clean up current inline display, then advance
    if (activeStudyType === 'cloze' || activeStudyType === 'qa') {
      deactivateCurrentInline();
      updateStudyBanner();
      advanceToNext();
    } else {
      hideStudyPopover();
      updateStudyBanner();
      scrollToNextDue();
    }
  }

  function skipCard() {
    if (studyPopoverCardObj) {
      dueQueue = dueQueue.filter(function (c) { return c.id !== studyPopoverCardObj.id; });
    }
    hideStudyPopover();
    updateStudyBanner();
    scrollToNextDue();
  }

  function scrollToNextDue() {
    deactivateCurrentInline();
    var remaining = dueQueue.filter(isDue);
    if (remaining.length === 0) {
      studyBanner.querySelector('.fc-study-banner-text').textContent =
        'All done! ' + reviewedCount + ' card' + (reviewedCount !== 1 ? 's' : '') + ' reviewed';
      setTimeout(exitStudy, 3000);
      return;
    }
    studyPosition = 0;
    var next = remaining[0];
    activateByType(next);
  }

  // ── Init ──
  function initUI() {
    refreshAuthors();
    updateFab();
    updateStudyToggle();
    renderDots();
  }

  // Load from cache first for instant render, then upgrade from Supabase
  loadFromCache();
  initUI();

  if (sb && currentUser) {
    loadFromSupabase().then(function () {
      initUI();
      subscribeRealtime();
    });
  } else {
    if (!sb) loadSeedIfEmpty();
    // Listen for auth:ready in case auth loads later
    window.addEventListener('ip:auth:ready', function () {
      sb = IP._supabase;
      currentUser = IP._user;
      if (sb && currentUser) {
        loadFromSupabase().then(function () {
          initUI();
          subscribeRealtime();
        });
      }
    });
  }

  // ── Quiz Mode: All Due Blanks Visible At Once ──
  // Toggle on: every due inline-able cloze card gets blanked in the text.
  // Click a blank to reveal it, then rate (Again/Good/Easy/Skip).
  // Again/Skip → re-blank. Good/Easy → stays revealed this session, SM-2 schedules future.
  var passiveCloze = (function () {
    var enabled = false;
    var modified = {};        // paraId → originalHTML
    var cardMap = {};          // cardId → card ref
    var sessionRevealed = {};  // cardId → true (Good/Easy this session)

    function getDueInlineCards() {
      var out = [];
      visibleCards().forEach(function (c) {
        if (c.type !== 'cloze' || !isDue(c) || !c.paragraphId || !c.source) return;
        if (sessionRevealed[c.id]) return;
        var para = document.getElementById(c.paragraphId);
        if (para && para.textContent.indexOf(c.source) !== -1) {
          out.push(c);
        }
      });
      return out;
    }

    function activateAll() {
      deactivateAll();
      var dueCards = getDueInlineCards();
      if (dueCards.length === 0) return;

      // Group by paragraph to handle multiple cards per paragraph
      var byPara = {};
      dueCards.forEach(function (c) {
        if (!byPara[c.paragraphId]) byPara[c.paragraphId] = [];
        byPara[c.paragraphId].push(c);
      });

      Object.keys(byPara).forEach(function (pid) {
        var para = document.getElementById(pid);
        if (!para) return;
        var paraCards = byPara[pid];

        paraCards.forEach(function (card) {
          // Save original HTML only on first modification
          if (!modified[pid]) modified[pid] = para.innerHTML;
          var ok = buildClozeDOM(para, card);
          if (!ok) return;

          cardMap[card.id] = card;
          // Tag the source span with the card ID
          var spans = para.querySelectorAll('.fc-cloze-source');
          var lastSpan = spans[spans.length - 1];
          if (lastSpan) lastSpan.dataset.cardId = card.id;
        });

        para.classList.add('fc-passive-cloze');

        // Rebind all blank clicks (buildClozeDOM binds to revealCloze — override)
        para.querySelectorAll('.fc-cloze-blank').forEach(function (b) {
          b.replaceWith(b.cloneNode(true));
        });
        para.querySelectorAll('.fc-cloze-blank').forEach(function (b) {
          b.addEventListener('click', function (e) {
            e.stopPropagation();
            revealOneBlank(b);
          });
        });
      });
    }

    function deactivateAll() {
      Object.keys(modified).forEach(function (pid) {
        var para = document.getElementById(pid);
        if (para) {
          para.innerHTML = modified[pid];
          para.classList.remove('fc-passive-cloze');
          delete para._fcOriginalHTML;
        }
      });
      modified = {};
      cardMap = {};
      // Remove any leftover rate bars
      document.querySelectorAll('.fc-passive-rate').forEach(function (el) { el.remove(); });
    }

    function revealOneBlank(blankEl) {
      var answer = blankEl.dataset.answer;
      var hint = parseInt(blankEl.dataset.hint || '0', 10);

      if (hint === 0) {
        // Step 1: show letter count as dots
        blankEl.textContent = answer.replace(/[^\s]/g, '\u00b7');
        blankEl.classList.add('fc-hint-active');
        blankEl.dataset.hint = '1';
      } else if (hint === 1) {
        // Step 2: show first letter + dots
        blankEl.textContent = answer[0] + answer.slice(1).replace(/[^\s]/g, '\u00b7');
        blankEl.dataset.hint = '2';
      } else if (hint === 2 && answer.length > 3) {
        // Step 3: show first letter, last letter, and ~half the middle
        var chars = answer.split('');
        var revealed = [0, chars.length - 1]; // first and last
        // Reveal roughly half the remaining characters
        var middle = [];
        for (var i = 1; i < chars.length - 1; i++) {
          if (/\S/.test(chars[i])) middle.push(i);
        }
        var toReveal = Math.ceil(middle.length / 2);
        // Spread evenly
        for (var j = 0; j < toReveal; j++) {
          var idx = Math.round(j * (middle.length - 1) / Math.max(toReveal - 1, 1));
          revealed.push(middle[idx]);
        }
        var display = chars.map(function (ch, i) {
          if (/\s/.test(ch)) return ch;
          return revealed.indexOf(i) !== -1 ? ch : '\u00b7';
        }).join('');
        blankEl.textContent = display;
        blankEl.dataset.hint = '3';
      } else {
        // Final: full reveal
        blankEl.textContent = answer;
        blankEl.classList.remove('fc-hint-active');
        blankEl.classList.add('fc-revealed');
        delete blankEl.dataset.hint;
        // Check if all blanks for this card are revealed
        var sourceSpan = blankEl.closest('.fc-cloze-source');
        if (!sourceSpan) return;
        var cardId = sourceSpan.dataset.cardId;
        var unrevealed = sourceSpan.querySelector('.fc-cloze-blank:not(.fc-revealed)');
        if (!unrevealed) {
          showRateBar(cardId, sourceSpan);
        }
      }
    }

    function showRateBar(cardId, sourceSpan) {
      if (sourceSpan.nextElementSibling && sourceSpan.nextElementSibling.classList.contains('fc-passive-rate')) return;
      var card = cardMap[cardId];
      if (!card) return;
      var bar = document.createElement('span');
      bar.className = 'fc-passive-rate';
      bar.dataset.cardId = cardId;
      var opts = [
        { key: 'again', title: 'Again' },
        { key: 'good', title: 'Good' },
        { key: 'easy', title: 'Easy' },
        { key: 'skip', title: 'Skip' }
      ];
      opts.forEach(function (o) {
        var btn = document.createElement('button');
        btn.className = 'fc-passive-rate-btn fc-rate-' + o.key;
        btn.textContent = o.title;
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          rate(card, o.key, sourceSpan, bar);
        });
        bar.appendChild(btn);
      });
      sourceSpan.after(bar);
    }

    function rate(card, quality, sourceSpan, bar) {
      var now = Date.now();
      var DAY = 86400000;

      if (quality === 'again') {
        card.interval = 0;
        card.ease = Math.max(1.3, card.ease - 0.2);
        card.reps = 0;
        card.nextReview = now;
      } else if (quality === 'good') {
        if (card.reps === 0) card.interval = 1;
        else if (card.reps === 1) card.interval = 3;
        else card.interval = Math.round(card.interval * card.ease);
        card.reps++;
        card.nextReview = now + card.interval * DAY;
      } else if (quality === 'easy') {
        if (card.reps === 0) card.interval = 4;
        else card.interval = Math.round(card.interval * card.ease * 1.3);
        card.ease += 0.15;
        card.reps++;
        card.nextReview = now + card.interval * DAY;
      }

      if (quality !== 'skip') {
        card.lastReview = now;
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].id === card.id) { cards[i] = card; break; }
        }
        save();
        sbUpsertProgress(card);
        var dot = document.querySelector('.fc-dot[data-card-id="' + card.id + '"]');
        if (dot && !isDue(card)) dot.classList.remove('fc-due');
        updateStudyToggle();
      }

      bar.remove();

      if (quality === 'good' || quality === 'easy') {
        // Leave revealed for this session
        sessionRevealed[card.id] = true;
      } else {
        // Again or Skip — re-blank and reset hints
        sourceSpan.querySelectorAll('.fc-cloze-blank').forEach(function (b) {
          b.classList.remove('fc-revealed', 'fc-hint-active');
          delete b.dataset.hint;
          b.textContent = b.dataset.answer; // stays invisible (transparent text)
        });
      }
    }

    function toggle(on) {
      enabled = on;
      if (enabled) {
        activateAll();
      } else {
        deactivateAll();
        sessionRevealed = {};
      }
    }

    return {
      toggle: toggle,
      activateAll: activateAll,
      deactivateAll: deactivateAll,
      get enabled() { return enabled; }
    };
  })();

  // ── Author Filter Toggle ──
  (function () {
    var topBar = document.getElementById('top-bar');
    if (!topBar) return;

    var wrap = document.createElement('span');
    wrap.className = 'fc-author-toggle';

    function makeBtn(key, label) {
      var b = document.createElement('button');
      b.className = 'fc-author-btn fc-author-' + key + (activeAuthors[key] ? ' fc-author-active' : '');
      b.textContent = label;
      b.title = label + "'s cards";
      b.addEventListener('click', function () {
        activeAuthors[key] = !activeAuthors[key];
        b.classList.toggle('fc-author-active', activeAuthors[key]);
        renderDots();
        updateStudyToggle();
        if (annoNav && annoNav.panelOpen()) annoNav.renderList();
      });
      return b;
    }
    // Build buttons dynamically from discovered authors
    function buildAuthorButtons() {
      wrap.innerHTML = '';
      Object.keys(activeAuthors).forEach(function (key) {
        var label = key.charAt(0).toUpperCase();
        wrap.appendChild(makeBtn(key, label));
      });
    }
    buildAuthorButtons();

    var studyBtn = topBar.querySelector('.fc-study-toggle');
    if (studyBtn) {
      studyBtn.before(wrap);
    } else {
      topBar.appendChild(wrap);
    }
  })();

  // ── Quiz Mode Toggle (passive inline cloze) ──
  (function () {
    var topBar = document.getElementById('top-bar');
    if (!topBar) return;

    var btn = document.createElement('button');
    btn.className = 'fc-quiz-toggle';
    btn.textContent = 'Quiz';
    btn.title = 'Quiz while reading — blanks appear in the text';
    btn.addEventListener('click', function () {
      var on = !passiveCloze.enabled;
      passiveCloze.toggle(on);
      btn.classList.toggle('fc-quiz-active', on);
    });

    var studyBtn = topBar.querySelector('.fc-study-toggle');
    if (studyBtn) {
      studyBtn.before(btn);
    } else {
      topBar.appendChild(btn);
    }
  })();

  // ── Annotation Navigator ──
  var annoNav = (function () {
    var topBar = document.getElementById('top-bar');
    if (!topBar) return null;

    var btn = document.createElement('button');
    btn.className = 'fc-anno-nav-btn';
    btn.setAttribute('aria-label', 'Annotation navigator');
    btn.title = 'Annotations';
    btn.textContent = '●';

    var panel = document.createElement('div');
    panel.className = 'fc-anno-nav';

    // Insert before the study toggle (right side of top bar)
    var studyBtn = topBar.querySelector('.fc-study-toggle');
    if (studyBtn) {
      studyBtn.before(btn);
      btn.after(panel);
    } else {
      topBar.appendChild(btn);
      topBar.appendChild(panel);
    }

    // Filter bar
    var filterBar = document.createElement('div');
    filterBar.className = 'fc-anno-filters';
    var FILTERS = [
      { key: 'all', label: 'All' },
      { key: 'cloze', label: 'Cloze' },
      { key: 'qa', label: 'Q&A' },
      { key: 'note', label: 'Note' },
      { key: 'question', label: 'Question' }
    ];
    var activeFilter = 'all';
    FILTERS.forEach(function (f) {
      var fb = document.createElement('button');
      fb.className = 'fc-anno-filter' + (f.key === 'all' ? ' fc-anno-filter-active' : '');
      fb.textContent = f.label;
      fb.dataset.filter = f.key;
      fb.addEventListener('click', function () {
        activeFilter = f.key;
        filterBar.querySelectorAll('.fc-anno-filter').forEach(function (b) {
          b.classList.toggle('fc-anno-filter-active', b.dataset.filter === f.key);
        });
        renderList();
      });
      filterBar.appendChild(fb);
    });
    panel.appendChild(filterBar);

    var listEl = document.createElement('div');
    listEl.className = 'fc-anno-list';
    panel.appendChild(listEl);

    // Build section map from paragraph index data
    function getSections() {
      var piData = (IP.paragraphIndex && IP.paragraphIndex.data) || [];
      var sections = [];
      var currentSection = { label: '', paraIds: [] };
      piData.forEach(function (item) {
        if (item.heading) {
          currentSection = { label: item.label, paraIds: [] };
          sections.push(currentSection);
        } else {
          currentSection.paraIds.push(item.id);
        }
      });
      return sections;
    }

    function renderList() {
      listEl.innerHTML = '';
      var sections = getSections();
      var visible = visibleCards();
      var filtered = activeFilter === 'all' ? visible : visible.filter(function (c) { return c.type === activeFilter; });

      if (filtered.length === 0) {
        listEl.innerHTML = '<div class="fc-anno-empty">No annotations</div>';
        updateCount(0);
        return;
      }

      // Group cards by paragraph
      var cardsByPara = {};
      filtered.forEach(function (c) {
        if (!c.paragraphId) return;
        if (!cardsByPara[c.paragraphId]) cardsByPara[c.paragraphId] = [];
        cardsByPara[c.paragraphId].push(c);
      });

      var totalShown = 0;

      if (sections.length > 0) {
        sections.forEach(function (sec) {
          var secCards = [];
          sec.paraIds.forEach(function (pid) {
            if (cardsByPara[pid]) secCards = secCards.concat(cardsByPara[pid]);
          });
          if (secCards.length === 0) return;
          totalShown += secCards.length;

          var secEl = document.createElement('div');
          secEl.className = 'fc-anno-section';
          secEl.textContent = sec.label;
          listEl.appendChild(secEl);

          secCards.forEach(function (card) { listEl.appendChild(createEntry(card)); });
        });
      } else {
        // No sections — flat list
        filtered.forEach(function (card) {
          if (!card.paragraphId) return;
          listEl.appendChild(createEntry(card));
          totalShown++;
        });
      }

      updateCount(totalShown);
    }

    var dotShapes = { cloze: '●', qa: '◆', note: '■', question: '◇' };
    var dotColors = { cloze: 'var(--accent)', qa: '#f0883e', note: '#8b949e', question: '#f59e0b' };

    function createEntry(card) {
      var el = document.createElement('button');
      el.className = 'fc-anno-entry';
      el.dataset.cardId = card.id;

      var dot = document.createElement('span');
      dot.className = 'fc-anno-dot';
      dot.style.color = dotColors[card.type] || 'var(--text-dim)';
      dot.textContent = dotShapes[card.type] || '●';

      var pnum = document.createElement('span');
      pnum.className = 'fc-anno-pnum';
      pnum.textContent = '¶' + (card.paragraphId || '').replace(/^p/, '');

      var preview = document.createElement('span');
      preview.className = 'fc-anno-preview';
      var text = card.front || card.source || '';
      preview.textContent = text.length > 45 ? text.substring(0, 45) + '…' : text;

      el.appendChild(dot);
      el.appendChild(pnum);
      el.appendChild(preview);

      el.addEventListener('click', function () {
        navigateToEntry(card);
        panel.classList.remove('open');
      });

      return el;
    }

    function updateCount(n) {
      btn.title = 'Annotations (' + n + ')';
    }

    // Navigation state
    var navActive = false;
    var navIndex = -1;

    function getVisibleEntries() {
      return Array.from(listEl.querySelectorAll('.fc-anno-entry'));
    }

    function navigateToEntry(card) {
      var para = document.getElementById(card.paragraphId);
      if (!para) return;
      para.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () {
        var dotEl = para.querySelector('.fc-dot[data-card-id="' + card.id + '"]');
        if (dotEl && !openThreads[card.id]) {
          toggleThread(dotEl, card);
        }
      }, 400);
    }

    function stepNav(direction) {
      // Build ordered list of all cards matching current filter, sorted by document position
      var visible = visibleCards();
      var filtered = activeFilter === 'all' ? visible.slice() : visible.filter(function (c) { return c.type === activeFilter; });
      filtered = filtered.filter(function (c) { return c.paragraphId && document.getElementById(c.paragraphId); });

      // Sort by document order
      var allParas = Array.from(document.querySelectorAll('[id^="p"]'));
      var paraOrder = {};
      allParas.forEach(function (p, i) { paraOrder[p.id] = i; });
      filtered.sort(function (a, b) {
        return (paraOrder[a.paragraphId] || 0) - (paraOrder[b.paragraphId] || 0);
      });

      if (filtered.length === 0) return;

      // First press: seed index to nearest annotation to current viewport
      if (navIndex === -1) {
        var bestIdx = 0;
        var bestDist = Infinity;
        filtered.forEach(function (c, i) {
          var el = document.getElementById(c.paragraphId);
          if (!el) return;
          var dist = Math.abs(el.getBoundingClientRect().top - window.innerHeight / 2);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        });
        // Set so the next += direction lands on the nearest (or the one just after/before it)
        navIndex = bestIdx - direction;
      }

      navIndex += direction;
      if (navIndex < 0) navIndex = filtered.length - 1;
      if (navIndex >= filtered.length) navIndex = 0;

      var card = filtered[navIndex];
      navigateToEntry(card);

      // Highlight matching entry in panel if open
      if (panel.classList.contains('open')) {
        var entries = getVisibleEntries();
        entries.forEach(function (entry) {
          entry.classList.toggle('fc-anno-active', entry.dataset.cardId === card.id);
        });
        // Scroll entry into view in panel
        var activeEntry = listEl.querySelector('.fc-anno-active');
        if (activeEntry) activeEntry.scrollIntoView({ block: 'nearest' });
      }

      navActive = true;
    }

    function exitNav() {
      navActive = false;
      navIndex = -1;
      closeAllThreads();
    }

    // Toggle — persistent panel, only closes on clicking ● again
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.classList.contains('open')) {
        panel.classList.remove('open');
      } else {
        renderList();
        panel.classList.add('open');
      }
    });

    // Close panel only when clicking the ● button again (persistent panel)

    // Scroll tracking — highlight nearest entry (only when not arrow-stepping)
    var annoEntries = [];
    function updateAnnoActive() {
      if (!panel.classList.contains('open')) return;
      if (navActive) return; // arrow-stepping controls highlight directly
      annoEntries = Array.from(listEl.querySelectorAll('.fc-anno-entry'));
      var best = null;
      var bestDist = Infinity;
      annoEntries.forEach(function (entry) {
        var cid = entry.dataset.cardId;
        var card = cards.find(function (c) { return c.id === cid; });
        if (!card) return;
        var el = document.getElementById(card.paragraphId);
        if (!el) return;
        var top = el.getBoundingClientRect().top;
        var dist = Math.abs(top - 100);
        if (dist < bestDist) { bestDist = dist; best = entry; }
      });
      annoEntries.forEach(function (entry) {
        entry.classList.toggle('fc-anno-active', entry === best);
      });
    }
    window.addEventListener('scroll', updateAnnoActive, { passive: true });

    return {
      renderList: renderList,
      stepNav: stepNav,
      exitNav: exitNav,
      panelOpen: function () { return panel.classList.contains('open'); },
      get navActive() { return navActive; }
    };
  })();

  // ── Expose API ──
  IP.flashcards = {
    cards: cards,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    passiveCloze: passiveCloze
  };
  window.InteractivePaper = IP;
})();
