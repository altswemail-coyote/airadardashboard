/**
 * Initial loading shells for dashboard + tracker (must be external script — MV3 CSP blocks inline scripts).
 * Depends on airadar-loading-screen.js (getAiradarLoadingHTML, getAiradarCompactCardHTML).
 */
(function () {
  'use strict';

  function installWebStorageShim() {
    var hasChromeStorage = typeof window.chrome !== 'undefined' && window.chrome && window.chrome.storage && window.chrome.storage.local;
    var isHttpRuntime = /^https?:$/i.test(window.location.protocol);
    var isWebRuntime = !hasChromeStorage;

    window.COGNESION_RUNTIME = {
      mode: isWebRuntime ? 'web' : 'extension',
      isHttpRuntime: isHttpRuntime,
      apiBaseUrl: isHttpRuntime ? window.location.origin : ''
    };

    if (!isWebRuntime) return;

    function storageKey(key) {
      return 'cognesion.web.' + key;
    }

    function deepClone(value) {
      if (value === undefined) return undefined;
      return JSON.parse(JSON.stringify(value));
    }

    function readStoredValue(key) {
      try {
        var raw = window.localStorage.getItem(storageKey(key));
        if (raw == null) return undefined;
        return JSON.parse(raw);
      } catch (error) {
        console.warn('[Cognesion Runtime] Failed to read local key:', key, error && error.message ? error.message : error);
        return undefined;
      }
    }

    function normalizeGetResult(keys) {
      if (keys == null) {
        var out = {};
        for (var i = 0; i < window.localStorage.length; i++) {
          var rawKey = window.localStorage.key(i);
          if (!rawKey || !rawKey.startsWith('cognesion.web.')) continue;
          var normalizedKey = rawKey.replace(/^cognesion\.web\./, '');
          out[normalizedKey] = readStoredValue(normalizedKey);
        }
        return out;
      }

      if (typeof keys === 'string') {
        return { [keys]: readStoredValue(keys) };
      }

      if (Array.isArray(keys)) {
        return keys.reduce(function (acc, key) {
          acc[key] = readStoredValue(key);
          return acc;
        }, {});
      }

      if (typeof keys === 'object') {
        return Object.keys(keys).reduce(function (acc, key) {
          var value = readStoredValue(key);
          acc[key] = value === undefined ? keys[key] : value;
          return acc;
        }, {});
      }

      return {};
    }

    var storageArea = {
      get: function (keys, callback) {
        var result = normalizeGetResult(keys);
        if (typeof callback === 'function') {
          setTimeout(function () { callback(result); }, 0);
          return;
        }
        return Promise.resolve(result);
      },
      set: function (items, callback) {
        Object.keys(items || {}).forEach(function (key) {
          try {
            window.localStorage.setItem(storageKey(key), JSON.stringify(deepClone(items[key])));
          } catch (error) {
            console.warn('[Cognesion Runtime] Failed to persist local key:', key, error && error.message ? error.message : error);
          }
        });
        if (typeof callback === 'function') {
          setTimeout(callback, 0);
          return;
        }
        return Promise.resolve();
      },
      remove: function (keys, callback) {
        var list = Array.isArray(keys) ? keys : [keys];
        list.forEach(function (key) {
          window.localStorage.removeItem(storageKey(key));
        });
        if (typeof callback === 'function') {
          setTimeout(callback, 0);
          return;
        }
        return Promise.resolve();
      },
      clear: function (callback) {
        var toDelete = [];
        for (var i = 0; i < window.localStorage.length; i++) {
          var rawKey = window.localStorage.key(i);
          if (rawKey && rawKey.startsWith('cognesion.web.')) toDelete.push(rawKey);
        }
        toDelete.forEach(function (rawKey) {
          window.localStorage.removeItem(rawKey);
        });
        if (typeof callback === 'function') {
          setTimeout(callback, 0);
          return;
        }
        return Promise.resolve();
      }
    };

    window.chrome = window.chrome || {};
    window.chrome.storage = window.chrome.storage || {};
    window.chrome.storage.local = storageArea;
    window.chrome.runtime = window.chrome.runtime || { id: 'cognesion-web-runtime' };
  }

  installWebStorageShim();

  if (typeof window.getAiradarLoadingHTML !== 'function') return;
  var g = window.getAiradarLoadingHTML;

  var analyst = document.getElementById('analyst-content');
  if (analyst) {
    if (typeof window.getAiradarCompactCardHTML === 'function') {
      analyst.innerHTML =
        '<div class="brief-loading brief-loading--airadar-compact">' +
        window.getAiradarCompactCardHTML('pageBrief', { sub: 'Reading items from feed' }) +
        '</div>';
    } else {
      analyst.innerHTML =
        '<div class="brief-loading">' +
        g({
          hideTagline: true,
          status: 'Generating Interactive Brief...',
          sub: 'Reading items from feed',
          statusClassExtra: 'brief-status',
          subClassExtra: 'brief-sub',
        }) +
        '</div>';
    }
  }

  var disruptor = document.getElementById('disruptor-loading');
  if (disruptor) {
    disruptor.innerHTML = g({
      hideTagline: true,
      status: 'Analyzing signal mechanics…',
      sub: 'Building cross-industry map',
      statusClassExtra: 'brief-status',
      subClassExtra: 'brief-sub',
    });
  }

  var modalBody = document.getElementById('t-modal-body');
  if (modalBody) {
    modalBody.innerHTML =
      '<div class="t-brief-loading">' +
      g({
        hideTagline: true,
        status: 'Generating brief...',
        statusClassExtra: 't-brief-status',
      }) +
      '</div>';
  }

  var tro = document.getElementById('tr-overlay');
  if (tro) {
    tro.innerHTML = g({
      overlay: true,
      compact: false,
      hideTagline: true,
      status: 'Translating…',
      sub: 'Applying your language preference',
      statusClassExtra: 'tr-status',
      subClassExtra: 'tr-sub',
    });
  }
})();
