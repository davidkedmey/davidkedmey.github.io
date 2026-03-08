/* ip-core.js — InteractivePaper orchestrator
   Must be loaded BEFORE other ip-*.js modules.

   Usage:
     InteractivePaper.init({
       id: 'constructor-theory-2012',
       title: 'Philosophy of Constructor Theory',
       readingModes: { default: 'enhanced' },
       paragraphIndex: { data: PARA_INDEX, summaryTiers: false, picker: true }
     });

   Then load ip-reading-modes.js, ip-paragraph-index.js, etc.
   Each module reads its config from InteractivePaper._config.
*/

window.InteractivePaper = window.InteractivePaper || {};

window.InteractivePaper.init = function (config) {
  window.InteractivePaper._config = config || {};
};

// ── Theme toggle (dark/light) ──
(function () {
  var STORAGE_KEY = 'ip_theme';
  var saved = localStorage.getItem(STORAGE_KEY);
  var current = saved === 'light' ? 'light' : 'dark';

  function applyTheme(theme) {
    current = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    // Update button label
    var btn = document.querySelector('.ip-theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '\u263C' : '\u263E';
  }

  // Apply immediately (before DOM ready) to avoid flash
  applyTheme(current);

  // Create toggle button once DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    var topBar = document.getElementById('top-bar');
    if (!topBar) return;
    var btn = document.createElement('button');
    btn.className = 'ip-theme-toggle';
    btn.setAttribute('aria-label', 'Toggle light/dark theme');
    btn.setAttribute('title', 'Toggle theme');
    topBar.appendChild(btn);
    applyTheme(current); // set button text
    btn.addEventListener('click', function () {
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  });
})();
