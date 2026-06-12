/**
 * Vanilla HTML for AIRadarLoadingScreen (see AIRadarLoadingScreen.tsx).
 * Use getAiradarLoadingHTML({ compact, tagline, status, sub, statusHtml, hideTagline }).
 */
(function () {
  'use strict';

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.compact=true] modal-friendly size
   * @param {string} [opts.tagline='Loading your intelligence']
   * @param {boolean} [opts.hideTagline=false]
   * @param {string} [opts.status] plain-text status (escaped)
   * @param {string} [opts.sub] plain-text subline (escaped)
   * @param {string} [opts.statusHtml] raw HTML for status line (trusted callers only)
   * @param {string} [opts.statusClassExtra] e.g. "brief-status" or "tr-status" for i18n / overlay
   * @param {string} [opts.subClassExtra] e.g. "brief-sub"
   */
  window.getAiradarLoadingHTML = function getAiradarLoadingHTML(opts) {
    opts = opts || {};
    const compact = opts.compact !== false;
    const hideTagline = !!opts.hideTagline;
    const tagline = opts.tagline != null ? opts.tagline : 'Loading your intelligence';

    const statusClasses = ['airadar-loading-status', opts.statusClassExtra].filter(Boolean).join(' ');
    const subClasses = ['airadar-loading-sub', opts.subClassExtra].filter(Boolean).join(' ');

    let statusBlock = '';
    if (opts.statusHtml) {
      statusBlock = `<div class="${statusClasses}">${opts.statusHtml}</div>`;
    } else if (opts.status) {
      statusBlock = `<div class="${statusClasses}">${esc(opts.status)}</div>`;
    }

    const subBlock = opts.sub
      ? `<div class="${subClasses}">${esc(opts.sub)}</div>`
      : '';

    const taglineBlock = hideTagline
      ? ''
      : `<div class="airadar-loading-tagline">${esc(tagline)}</div>`;

    const cls = 'airadar-loading-root' + (compact ? ' airadar-loading-root--compact' : '')
      + (opts.overlay ? ' airadar-loading-root--overlay' : '');

    return (
      `<div class="${cls}">` +
        '<div class="airadar-loading-bg" aria-hidden="true"></div>' +
        '<div class="airadar-loading-grid" aria-hidden="true"></div>' +
        '<div class="airadar-loading-orb airadar-loading-orb--pulse" aria-hidden="true"></div>' +
        '<div class="airadar-loading-orb airadar-loading-orb--ring1" aria-hidden="true"></div>' +
        '<div class="airadar-loading-orb airadar-loading-orb--ring2" aria-hidden="true"></div>' +
        '<div class="airadar-loading-inner">' +
          '<div class="airadar-loading-logo-card">' +
            '<img class="airadar-loading-logo-img" src="icons/logo-dark.svg" alt="AI Radar" />' +
          '</div>' +
          taglineBlock +
          statusBlock +
          subBlock +
          '<div class="airadar-loading-dots" aria-hidden="true">' +
            '<span class="airadar-loading-dot"></span>' +
            '<span class="airadar-loading-dot"></span>' +
            '<span class="airadar-loading-dot"></span>' +
          '</div>' +
          '<div class="airadar-loading-bar-track" aria-hidden="true">' +
            '<div class="airadar-loading-bar-fill"></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  };

  /**
   * Compact “card” loaders (Power Prompts, Intelligence Brief, Page Brief, Newsletter) — vanilla port of AIRadarCompactLoaders.tsx.
   * @param {'powerPrompts'|'intelligenceBrief'|'pageBrief'|'newsletter'} variant
   * @param {{ title?: string, sub?: string }} [opts] optional overrides for card header / subtitle
   */
  window.getAiradarCompactCardHTML = function getAiradarCompactCardHTML(variant, opts) {
    opts = opts || {};
    var map = {
      powerPrompts: {
        mod: 'airadar-compact-card--power',
        title: 'Power Prompts',
        sub: 'Generating prompts...',
      },
      intelligenceBrief: {
        mod: 'airadar-compact-card--intelligence',
        title: 'Intelligence Brief',
        sub: 'Synthesizing insights...',
      },
      pageBrief: {
        mod: 'airadar-compact-card--page',
        title: 'Page Brief',
        sub: 'Analyzing full article text...',
      },
      newsletter: {
        mod: 'airadar-compact-card--newsletter',
        title: 'Newsletter',
        sub: 'Building your newsletter…',
      },
    };
    var m = map[variant] || map.intelligenceBrief;
    var title = opts.title != null ? opts.title : m.title;
    var sub = opts.sub != null ? opts.sub : m.sub;
    return (
      '<div class="airadar-compact-card ' + m.mod + '" data-no-translate="true">' +
        '<div class="airadar-compact-card-bg" aria-hidden="true"></div>' +
        '<div class="airadar-compact-card-grid" aria-hidden="true"></div>' +
        '<div class="airadar-compact-card-glow" aria-hidden="true"></div>' +
        '<div class="airadar-compact-card-stack">' +
          '<div class="airadar-compact-card-hd">' +
            '<div class="airadar-compact-card-title">' + esc(title) + '</div>' +
          '</div>' +
          '<div class="airadar-compact-card-body">' +
            '<div class="airadar-compact-card-logo-wrap">' +
              '<img class="airadar-compact-card-logo" src="icons/logo-dark.svg" alt="AI Radar" />' +
            '</div>' +
            '<div class="airadar-compact-card-eyebrow">Loading your intelligence</div>' +
            '<div class="airadar-compact-card-sub">' + esc(sub) + '</div>' +
            '<div class="airadar-compact-card-dots" aria-hidden="true">' +
              '<span class="airadar-compact-card-dot"></span>' +
              '<span class="airadar-compact-card-dot"></span>' +
              '<span class="airadar-compact-card-dot"></span>' +
            '</div>' +
            '<div class="airadar-compact-card-bar-track" aria-hidden="true">' +
              '<div class="airadar-compact-card-bar-fill"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  };
})();
