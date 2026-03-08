/* ip-auth.js — Supabase authentication gate for Interactive Papers
   Must be loaded AFTER ip-core.js and the Supabase CDN script.

   Checks for an active session. If none, renders a login screen.
   On successful auth, adds .ip-authed to body and exposes:
     InteractivePaper._supabase  — Supabase client
     InteractivePaper._user      — { id, email, displayName, avatarUrl }
*/

(function () {
  'use strict';

  var cfg = (InteractivePaper._config || {}).supabase;
  if (!cfg || !cfg.url || !cfg.anonKey) {
    console.warn('[ip-auth] No supabase config found — running without auth');
    document.body.classList.add('ip-authed');
    return;
  }

  // Create Supabase client
  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  InteractivePaper._supabase = sb;

  // ── Login screen ──
  function renderLogin() {
    var screen = document.createElement('div');
    screen.className = 'ip-login-screen';
    screen.innerHTML =
      '<div class="ip-login-card">' +
        '<h1 class="ip-login-title">Interactive Papers</h1>' +
        '<p class="ip-login-subtitle">Sign in to access study tools, flashcards, and community annotations.</p>' +
        '<div class="ip-login-buttons">' +
          '<button class="ip-login-btn ip-login-github">' +
            '<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>' +
            ' Continue with GitHub' +
          '</button>' +
        '</div>' +
        '<p class="ip-login-footer">Powered by <a href="https://supabase.com" target="_blank" rel="noopener">Supabase</a></p>' +
      '</div>';

    document.body.appendChild(screen);

    screen.querySelector('.ip-login-github').addEventListener('click', function () {
      sb.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.href }
      });
    });

    return screen;
  }

  function setUser(session) {
    var u = session.user;
    var meta = u.user_metadata || {};
    InteractivePaper._user = {
      id: u.id,
      email: u.email,
      displayName: meta.full_name || meta.name || u.email.split('@')[0],
      avatarUrl: meta.avatar_url || ''
    };
  }

  function activate() {
    document.body.classList.add('ip-authed');
    // Remove login screen if present
    var ls = document.querySelector('.ip-login-screen');
    if (ls) ls.remove();
    // Fire ready event for other modules
    window.dispatchEvent(new CustomEvent('ip:auth:ready'));
  }

  // ── Check session ──
  sb.auth.getSession().then(function (result) {
    var session = result.data.session;
    if (session) {
      setUser(session);
      activate();
    } else {
      renderLogin();
    }
  });

  // Listen for auth state changes (handles OAuth redirect callback)
  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_IN' && session) {
      setUser(session);
      activate();
    } else if (event === 'SIGNED_OUT') {
      InteractivePaper._user = null;
      document.body.classList.remove('ip-authed');
      renderLogin();
    }
  });

  // ── Logout helper ──
  InteractivePaper.logout = function () {
    sb.auth.signOut();
  };
})();
