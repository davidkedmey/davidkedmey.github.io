/* ip-paragraph-index.js — Sidebar paragraph index with scroll tracking
   Reads config from InteractivePaper._config.paragraphIndex
   Config options:
     data: [...] — array of { id, label, heading?, page?, s1?, s2? }
     summaryTiers: true  — enable word/phrase/thread switching
     picker: true        — enable paragraph picker grid
*/

(function () {
  'use strict';

  var IP = window.InteractivePaper || {};
  var cfg = (IP._config && IP._config.paragraphIndex) || {};
  var PARA_INDEX = cfg.data || [];
  if (!PARA_INDEX.length) return;

  var paperId = (IP._config && IP._config.id) || 'default';
  var hasSummaryTiers = cfg.summaryTiers !== false && PARA_INDEX.some(function (i) { return i.s1 || i.s2; });
  var hasPicker = cfg.picker !== false;

  // ── Build sidebar entries ──
  var inner = document.querySelector('.pi-inner');
  if (!inner) return;

  var entries = [];
  var targets = [];
  var labelNodes = [];

  PARA_INDEX.forEach(function (item) {
    var a = document.createElement('a');
    a.className = 'pi-entry' + (item.heading ? ' pi-heading' : '');
    var textNode = document.createTextNode(item.label);
    a.appendChild(textNode);
    if (item.heading && item.page) {
      var pageSpan = document.createElement('span');
      pageSpan.className = 'pi-page';
      pageSpan.textContent = 'p.\u2009' + item.page;
      a.appendChild(pageSpan);
    }
    a.href = '#' + item.id;
    a.dataset.target = item.id;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var el = document.getElementById(item.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + item.id);
      }
    });
    inner.appendChild(a);
    entries.push(a);
    targets.push(item.id);
    labelNodes.push(item.heading ? null : textNode);
  });

  // Add paragraph numbers to body text margin
  PARA_INDEX.forEach(function (item) {
    if (item.heading) return;
    var el = document.getElementById(item.id);
    if (el) el.dataset.pnum = item.id.replace(/^p/, '');
  });

  // ── Positioning (expanded mode) ──
  var ENTRY_H = 20;
  var TOP_PAD = 48;
  var tracking = localStorage.getItem('ip_pi_tracking_' + paperId) === 'on';

  inner.classList.add('pi-expanded');
  inner.style.paddingTop = '0';

  var rafId = 0;

  function positionEntries() {
    var n = entries.length;
    var offset = inner.getBoundingClientRect().top;

    // Batch DOM reads
    var rects = [];
    for (var i = 0; i < n; i++) {
      var el = document.getElementById(entries[i].dataset.target);
      rects.push(el ? el.getBoundingClientRect() : null);
    }

    // Batch DOM writes — use transform (composited, no layout)
    for (var i = 0; i < n; i++) {
      if (!rects[i]) continue;
      var paraTop = rects[i].top;
      var paraBottom = rects[i].bottom;
      var pos = tracking
        ? Math.min(paraBottom - ENTRY_H, Math.max(TOP_PAD, paraTop))
        : paraTop;
      entries[i].style.transform = 'translateY(' + (pos - offset) + 'px)';
      if (!entries[i].classList.contains('pi-placed')) entries[i].classList.add('pi-placed');
    }
  }

  function schedulePosition() {
    if (!rafId) {
      rafId = requestAnimationFrame(function () {
        rafId = 0;
        positionEntries();
      });
    }
  }

  positionEntries();
  window.addEventListener('scroll', schedulePosition, { passive: true });
  window.addEventListener('resize', schedulePosition);
  window.addEventListener('ip:auth:ready', function () {
    requestAnimationFrame(positionEntries);
  });

  // ── Summary tier switching ──
  if (hasSummaryTiers) {
    var summaryTier = localStorage.getItem('ip_pi_summary_' + paperId) || 'thread';

    function applySummary(tier) {
      summaryTier = tier;
      localStorage.setItem('ip_pi_summary_' + paperId, tier);
      var field = tier === 'word' ? 's1' : tier === 'phrase' ? 's2' : 'label';
      PARA_INDEX.forEach(function (item, i) {
        if (item.heading || !labelNodes[i]) return;
        labelNodes[i].textContent = item[field] || item.label;
      });
      document.querySelectorAll('input[name="pi_summary"]').forEach(function (r) {
        r.checked = r.value === tier;
      });
    }

    applySummary(summaryTier);

    document.querySelectorAll('input[name="pi_summary"]').forEach(function (r) {
      r.addEventListener('change', function () {
        if (this.checked) applySummary(this.value);
      });
    });
  }

  // ── Tracking toggle ──
  function applyTracking(on) {
    tracking = on;
    localStorage.setItem('ip_pi_tracking_' + paperId, on ? 'on' : 'off');
    positionEntries();
    var cb = document.getElementById('pi-tracking-cb');
    if (cb) cb.checked = on;
  }
  applyTracking(tracking);

  var trackCb = document.getElementById('pi-tracking-cb');
  if (trackCb) trackCb.addEventListener('change', function () { applyTracking(this.checked); });

  // ── Debug guides ──
  var guides = localStorage.getItem('ip_pi_guides_' + paperId) === 'on';
  function applyGuides(on) {
    guides = on;
    localStorage.setItem('ip_pi_guides_' + paperId, on ? 'on' : 'off');
    inner.classList.toggle('pi-debug', on);
    var cb = document.getElementById('pi-guides-cb');
    if (cb) cb.checked = on;
  }
  applyGuides(guides);

  var guidesCb = document.getElementById('pi-guides-cb');
  if (guidesCb) guidesCb.addEventListener('change', function () { applyGuides(this.checked); });

  // ── Gear menu ──
  var gearBtn = document.querySelector('.settings-gear');
  var gearMenu = document.querySelector('.settings-menu');
  if (gearBtn && gearMenu) {
    gearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      gearMenu.classList.toggle('open');
      var ppPanel = document.querySelector('.para-picker');
      if (ppPanel) ppPanel.classList.remove('open');
    });
    document.addEventListener('click', function (e) {
      if (!gearMenu.contains(e.target) && e.target !== gearBtn) {
        gearMenu.classList.remove('open');
      }
    });
  }

  // ── Paragraph picker ──
  if (hasPicker) {
    var ppBtn = document.querySelector('.para-picker-btn');
    var ppPanel = document.querySelector('.para-picker');
    if (ppBtn && ppPanel) {
      var grid = document.createElement('div');
      grid.className = 'pp-grid';
      var ppCells = [];

      PARA_INDEX.forEach(function (item) {
        if (item.heading) {
          var sec = document.createElement('div');
          sec.className = 'pp-section';
          sec.textContent = item.label;
          grid.appendChild(sec);
        } else {
          var num = item.id.replace(/^p/, '');
          var cell = document.createElement('button');
          cell.className = 'pp-cell';
          cell.textContent = num;
          cell.dataset.target = item.id;
          cell.addEventListener('click', function () {
            var el = document.getElementById(item.id);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              history.replaceState(null, '', '#' + item.id);
            }
            ppPanel.classList.remove('open');
          });
          grid.appendChild(cell);
          ppCells.push({ cell: cell, id: item.id });
        }
      });
      ppPanel.appendChild(grid);

      ppBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        ppPanel.classList.toggle('open');
        if (gearMenu) gearMenu.classList.remove('open');
      });
      document.addEventListener('click', function (e) {
        if (!ppPanel.contains(e.target) && e.target !== ppBtn) {
          ppPanel.classList.remove('open');
        }
      });

      // Highlight active cell on scroll
      function updatePickerActive() {
        var best = null;
        var bestDist = Infinity;
        for (var i = 0; i < ppCells.length; i++) {
          var el = document.getElementById(ppCells[i].id);
          if (!el) continue;
          var top = el.getBoundingClientRect().top;
          if (top <= 60 && Math.abs(top - 60) < bestDist) {
            bestDist = Math.abs(top - 60);
            best = i;
          }
        }
        if (best === null && ppCells.length) best = 0;
        for (var i = 0; i < ppCells.length; i++) {
          ppCells[i].cell.classList.toggle('pp-active', i === best);
        }
      }
      window.addEventListener('scroll', updatePickerActive, { passive: true });
      updatePickerActive();
    }
  }

  // ── Expose API ──
  IP.paragraphIndex = {
    data: PARA_INDEX,
    reposition: positionEntries
  };
  window.InteractivePaper = IP;
})();
