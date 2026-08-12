/* ============================================================
   consent.js - cookie / storage consent. Handles two states:

   1. Notice mode (default): no non-essential services configured.
      Shows a one-line privacy notice on first visit.
   2. Consent mode: when a service is enabled via configure()
      (e.g. analytics, ads) the banner upgrades to Accept all /
      Essential only, and gated loaders via when() only run
      after acceptance.

   Non-essential services are OFF by default; flip the flag when
   you enable GA4 / AdSense (see index.html commented blocks).
   ============================================================ */
(function (global) {
  'use strict';

  const I18N = global.I18N;
  const STORAGE_KEY = 'pp.consent';
  const SERVICES = { analytics: false, ads: false };

  let state = { v: 1, analytics: 'undecided', ads: 'undecided' };
  let root = null;
  const pending = {};

  /* ---------- state ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = Object.assign(state, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /* ---------- api ---------- */
  function configure(opts) {
    Object.assign(SERVICES, opts);
    /* if the banner was already shown (e.g. notice mode), re-render it
       so the upgraded Accept / Essential-only choices appear */
    if (root) {
      root.innerHTML = '';
      root.dataset.rendered = '';
      showBanner();
    }
    return { SERVICES, status, when, showBanner };
  }

  function status(name) {
    return state[name] || 'undecided';
  }

  function accepted(name) {
    return status(name) === 'accepted';
  }

  function decided() {
    return Object.keys(SERVICES)
      .filter((s) => SERVICES[s])
      .every((s) => status(s) !== 'undecided');
  }

  function hasNonEssential() {
    return Object.keys(SERVICES).some((s) => SERVICES[s]);
  }

  /* Run fn once the consent status for a service is known.
     Accepted -> run now; undecided -> queue; rejected -> never. */
  function when(name, fn) {
    if (accepted(name)) {
      fn();
      return;
    }
    if (status(name) === 'rejected') return;
    (pending[name] = pending[name] || []).push(fn);
  }

  function decide(name, val) {
    state[name] = val;
    state.decidedAt = new Date().toISOString();
    save();
    if (val === 'accepted' && pending[name]) {
      pending[name].forEach((fn) => fn());
      pending[name] = [];
    }
  }

  /* ---------- banner ---------- */
  function render() {
    if (!root || root.dataset.rendered) return;
    root.dataset.rendered = '1';
    root.hidden = false;

    const notice = !hasNonEssential();
    const bar = document.createElement('div');
    bar.className = 'consent-bar';

    const text = document.createElement('p');
    text.className = 'consent-text';
    text.textContent = I18N.t(notice ? 'consentNotice' : 'consentPrompt');

    const actions = document.createElement('div');
    actions.className = 'consent-actions';

    if (notice) {
      const learn = document.createElement('button');
      learn.type = 'button';
      learn.className = 'btn btn-ghost';
      learn.textContent = I18N.t('consentLearnMore');
      learn.addEventListener('click', () => {
        const infoBtn = document.getElementById('btn-info');
        if (infoBtn) infoBtn.click();
      });
      actions.appendChild(learn);

      const got = document.createElement('button');
      got.type = 'button';
      got.className = 'btn btn-primary';
      got.textContent = I18N.t('consentGotIt');
      got.addEventListener('click', () => {
        state.noticeSeen = true;
        save();
        dismiss();
      });
      actions.appendChild(got);
    } else {
      const essential = document.createElement('button');
      essential.type = 'button';
      essential.className = 'btn btn-ghost';
      essential.textContent = I18N.t('consentEssentialOnly');
      essential.addEventListener('click', () => {
        Object.keys(SERVICES).filter((s) => SERVICES[s]).forEach((s) => decide(s, 'rejected'));
        dismiss();
      });
      actions.appendChild(essential);

      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'btn btn-primary';
      accept.textContent = I18N.t('consentAcceptAll');
      accept.addEventListener('click', () => {
        Object.keys(SERVICES).filter((s) => SERVICES[s]).forEach((s) => decide(s, 'accepted'));
        dismiss();
      });
      actions.appendChild(accept);
    }

    bar.appendChild(text);
    bar.appendChild(actions);
    root.appendChild(bar);
  }

  function dismiss() {
    if (root) {
      root.hidden = true;
      root.dataset.rendered = '';
    }
  }

  function showBanner() {
    if (!root) return;
    if (!hasNonEssential() && decided()) return;
    root.innerHTML = '';
    render();
  }

  function init() {
    root = document.getElementById('consent-root');
    /* services can be enabled at load time via a global config object,
       e.g. window.__ppConsentCfg = { analytics: true }, placed before
       the app scripts */
    if (global.__ppConsentCfg) Object.assign(SERVICES, global.__ppConsentCfg);
    load();
    if (!hasNonEssential()) {
      /* notice mode: show once, never again */
      if (state.noticeSeen) return;
      render();
    } else if (!decided()) {
      render();
    }
  }

  global.CP = global.CP || {};
  global.CP.Consent = { configure, status, accepted, when, decide, showBanner, init };
})(window);
