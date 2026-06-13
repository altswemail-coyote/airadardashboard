// ═══════════════════════════════════════════════════════════════════════════
// TOPIC TRACKER — Morning Brief Dashboard
// ═══════════════════════════════════════════════════════════════════════════

import { ExaEngine } from './exa-engine.js';
import { resolveEvidenceArticlesAsync, buildBeliefAnalysisPrompt, formatAudienceProfileLines, parseStructuredAnalysis, validateStructuredAnalysis } from './belief-analysis.js';
import { applyUITranslations, UI_TRANSLATIONS, LANG_NAMES as I18N_LANG_NAMES, showTranslationOverlay, hideTranslationOverlay } from './i18n.js';

// Returns the UI translation for `key` in the current radar language, falling back to English.
// radarLanguage is a module-level let; safe to reference here since tl() is only called at runtime.
function tl(key) {
  const t = (radarLanguage && UI_TRANSLATIONS[radarLanguage]) ? UI_TRANSLATIONS[radarLanguage] : UI_TRANSLATIONS.en;
  return t[key] ?? UI_TRANSLATIONS.en[key] ?? key;
}

const engine = new ExaEngine();
const COGNESION_RUNTIME = globalThis.COGNESION_RUNTIME || { mode: 'extension', isHttpRuntime: false, apiBaseUrl: '' };
const WEB_RUNTIME = COGNESION_RUNTIME.mode === 'web';
const WEB_API_BASE_URL = COGNESION_RUNTIME.apiBaseUrl || '';
const AUTH_STATE = {
  client: null,
  config: null,
  session: null,
  pendingEmail: '',
  busy: false,
  error: '',
  note: '',
  initialized: false
};

globalThis.COGNESION_AUTH = globalThis.COGNESION_AUTH || {};

function getAuthShellEl() {
  return document.getElementById('t-auth-shell');
}

function getAuthGateEl() {
  return document.getElementById('t-gate');
}

function buildAuthShellHtml() {
  if (AUTH_STATE.session?.user?.email) {
    return `
      <span class="t-top-bar-status-value">Workspace Synced</span>
      <span class="t-top-bar-status-label">Signed in as ${esc(AUTH_STATE.session.user.email)}. Your boards and tracked topics now follow your account instead of this browser only.</span>
      <div class="t-auth-inline-subactions">
        <span class="t-auth-state-pill">Signed in</span>
        <button type="button" class="t-auth-inline-link" id="t-auth-signout">Sign out</button>
      </div>
    `;
  }

  const noteClass = AUTH_STATE.error ? 't-auth-inline-note is-error' : 't-auth-inline-note';
  const note = AUTH_STATE.error
    || AUTH_STATE.note
    || 'Use the email magic link to unlock Topics on the web. Password setup can come later.';

  return `
    <span class="t-top-bar-status-value">Secure Sign In</span>
    <span class="t-top-bar-status-label">Enter your email and we’ll send a one-tap link that opens this Topics workspace on the correct account.</span>
    <form class="t-auth-inline-form" id="t-auth-form">
      <input
        id="t-auth-email"
        class="t-auth-inline-input"
        type="email"
        inputmode="email"
        autocomplete="email"
        placeholder="you@example.com"
        value="${esc(AUTH_STATE.pendingEmail)}"
        required
      />
      <button type="submit" class="t-auth-inline-button" ${AUTH_STATE.busy ? 'disabled' : ''}>
        ${AUTH_STATE.busy ? 'Sending…' : 'Email Link'}
      </button>
    </form>
    <div class="t-auth-inline-subactions">
      <span class="${noteClass}">${esc(note)}</span>
    </div>
  `;
}

function renderAuthShell() {
  if (!WEB_RUNTIME) return;
  const shell = getAuthShellEl();
  if (!shell) return;
  shell.innerHTML = buildAuthShellHtml();

  if (AUTH_STATE.session?.user?.email) {
    shell.querySelector('#t-auth-signout')?.addEventListener('click', async () => {
      AUTH_STATE.error = '';
      AUTH_STATE.note = '';
      await signOutWebUser();
    });
    return;
  }

  shell.querySelector('#t-auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = shell.querySelector('#t-auth-email')?.value?.trim() || '';
    await sendMagicLink(email);
  });
}

function renderAuthGate(message = 'Sign in from the top-right card to load your saved boards, tracked topics, and Morning Brief workspace.') {
  if (!WEB_RUNTIME) return;
  const gate = getAuthGateEl();
  if (!gate) return;
  const noteClass = AUTH_STATE.error ? 't-auth-inline-note is-error' : 't-auth-inline-note';
  const note = AUTH_STATE.error || AUTH_STATE.note || message;
  gate.classList.add('active');
  gate.innerHTML = `
    <div class="t-gate-box">
      <img src="icons/logo-dark.svg" alt="Cognesion" class="t-gate-logo" aria-hidden="true">
      <div class="t-gate-icon">✉️</div>
      <div class="t-gate-label">Web Access</div>
      <div class="t-gate-title">Sign in to your Topics workspace</div>
      <div class="t-gate-desc">${esc(message)}</div>
      <form class="t-auth-inline-form" id="t-gate-auth-form" style="margin-bottom:12px;">
        <input
          id="t-gate-auth-email"
          class="t-auth-inline-input"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="you@example.com"
          value="${esc(AUTH_STATE.pendingEmail)}"
          required
        />
        <button type="submit" class="t-auth-inline-button" ${AUTH_STATE.busy ? 'disabled' : ''}>
          ${AUTH_STATE.busy ? 'Sending…' : 'Email Link'}
        </button>
      </form>
      <div class="${noteClass}" style="margin-bottom:16px;">${esc(note)}</div>
      <div class="t-gate-actions">
        <a class="t-gate-btn-primary" href="pricing.html">View plans</a>
        <button class="t-gate-btn-outline" type="button" disabled>Magic link access only</button>
      </div>
    </div>`;

  gate.querySelector('#t-gate-auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = gate.querySelector('#t-gate-auth-email')?.value?.trim() || '';
    await sendMagicLink(email);
  });
}

function clearAuthGate() {
  const gate = getAuthGateEl();
  if (!gate) return;
  gate.classList.remove('active');
  gate.innerHTML = '';
}

async function fetchAuthConfig() {
  const response = await fetch(`${WEB_API_BASE_URL}/api/auth/config`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Supabase browser auth is not configured yet.');
  }
  return payload.supabase || null;
}

async function ensureWebAuthClient() {
  if (!WEB_RUNTIME) return null;
  if (AUTH_STATE.client) return AUTH_STATE.client;

  const createClient = globalThis.supabase?.createClient;
  if (typeof createClient !== 'function') {
    throw new Error('Supabase browser client failed to load.');
  }

  if (!AUTH_STATE.config) {
    AUTH_STATE.config = await fetchAuthConfig();
  }

  if (!AUTH_STATE.config?.url || !AUTH_STATE.config?.publishableKey) {
    throw new Error('Supabase browser auth is missing its public configuration.');
  }

  AUTH_STATE.client = createClient(AUTH_STATE.config.url, AUTH_STATE.config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return AUTH_STATE.client;
}

async function getAccessToken() {
  if (!WEB_RUNTIME) return null;
  if (AUTH_STATE.session?.access_token) return AUTH_STATE.session.access_token;
  const client = await ensureWebAuthClient();
  const { data } = await client.auth.getSession();
  AUTH_STATE.session = data?.session || null;
  return AUTH_STATE.session?.access_token || null;
}

globalThis.COGNESION_AUTH.getAccessToken = getAccessToken;

async function getAuthHeaders() {
  if (!WEB_RUNTIME) return {};
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function sendMagicLink(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    AUTH_STATE.error = 'Enter the email you want tied to this workspace.';
    AUTH_STATE.note = '';
    renderAuthShell();
    return;
  }

  AUTH_STATE.pendingEmail = normalizedEmail;
  AUTH_STATE.busy = true;
  AUTH_STATE.error = '';
  AUTH_STATE.note = '';
  renderAuthShell();

  try {
    const client = await ensureWebAuthClient();
    const { error } = await client.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/app`
      }
    });

    if (error) throw error;

    AUTH_STATE.note = `Magic link sent to ${normalizedEmail}. Open it on this device and we’ll unlock Topics automatically.`;
  } catch (error) {
    AUTH_STATE.error = error?.message || 'Unable to send the sign-in email right now.';
  } finally {
    AUTH_STATE.busy = false;
    renderAuthShell();
    renderAuthGate(AUTH_STATE.error || 'Check your inbox for the magic link, then come back here. We will unlock the workspace as soon as Supabase confirms your session.');
  }
}

async function signOutWebUser() {
  try {
    const client = await ensureWebAuthClient();
    await client.auth.signOut();
  } catch (error) {
    console.warn('[Tracker] Failed to sign out cleanly:', error?.message || error);
  }

  window.location.reload();
}

async function hydrateSessionFromBrowser() {
  const client = await ensureWebAuthClient();
  const { data } = await client.auth.getSession();
  AUTH_STATE.session = data?.session || null;
  renderAuthShell();
  return client;
}

async function bootWebAuth() {
  AUTH_STATE.error = '';
  AUTH_STATE.note = 'Use the email magic link to unlock Topics on the web. Password setup can come later.';
  renderAuthShell();
  renderAuthGate();

  try {
    const client = await hydrateSessionFromBrowser();

    client.auth.onAuthStateChange((_event, session) => {
      AUTH_STATE.session = session || null;
      AUTH_STATE.error = '';
      AUTH_STATE.note = session?.user?.email
        ? `Signed in as ${session.user.email}.`
        : AUTH_STATE.note;

      if (session?.user?.email) {
        chrome.storage.local.set({ radarEmail: session.user.email });
      }

      renderAuthShell();

      if (session) {
        clearAuthGate();
        if (!AUTH_STATE.initialized) {
          AUTH_STATE.initialized = true;
          init();
        }
        return;
      }

      renderAuthGate();
      if (AUTH_STATE.initialized) {
        window.location.reload();
      }
    });

    if (AUTH_STATE.session?.user?.email) {
      chrome.storage.local.set({ radarEmail: AUTH_STATE.session.user.email });
      clearAuthGate();
      if (!AUTH_STATE.initialized) {
        AUTH_STATE.initialized = true;
        init();
      }
      return;
    }

    renderAuthGate();
  } catch (error) {
    AUTH_STATE.error = error?.message || 'Unable to start secure web sign-in.';
    AUTH_STATE.note = '';
    renderAuthShell();
    renderAuthGate(AUTH_STATE.error);
  }
}

async function parseAiResponse(response, label) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message
      || payload?.error
      || payload?.message
      || `${label} failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

async function requestOpenAIChat(body) {
  const { openai } = await getKeys();
  const authHeaders = WEB_RUNTIME ? await getAuthHeaders() : {};
  const response = await fetch(
    WEB_RUNTIME
      ? `${WEB_API_BASE_URL}/api/ai/openai/chat`
      : 'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: WEB_RUNTIME
        ? {
            'Content-Type': 'application/json',
            ...authHeaders
          }
        : {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openai}`
          },
      body: JSON.stringify(body)
    }
  );
  return parseAiResponse(response, 'OpenAI request');
}

async function requestAnthropicMessage(body) {
  const { anthropic } = await getKeys();
  const { anthropicVersion, ...payload } = body || {};
  const authHeaders = WEB_RUNTIME ? await getAuthHeaders() : {};
  const response = await fetch(
    WEB_RUNTIME
      ? `${WEB_API_BASE_URL}/api/ai/anthropic/messages`
      : 'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: WEB_RUNTIME
        ? {
            'Content-Type': 'application/json',
            ...authHeaders
          }
        : {
            'Content-Type': 'application/json',
            'x-api-key': anthropic,
            'anthropic-version': anthropicVersion || '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
      body: JSON.stringify(payload)
    }
  );
  return parseAiResponse(response, 'Anthropic request');
}

function normalizeTopicRecord(record) {
  if (!record || !record.id) return null;
  const query = String(record.query || '').trim();
  if (!query) return null;
  return {
    ...record,
    query
  };
}

function syncTopicSetTopicQueries(set) {
  if (!set) return set;
  const topicRecords = Array.isArray(set.topicRecords)
    ? set.topicRecords.map(normalizeTopicRecord).filter(Boolean)
    : [];
  const topics = topicRecords.length
    ? topicRecords.map(record => record.query)
    : [...new Set((set.topics || []).map(topic => String(topic || '').trim()).filter(Boolean))];

  set.topicRecords = topicRecords;
  set.topics = topics;
  return set;
}

function buildTopicSetFromApiBoard(board) {
  return syncTopicSetTopicQueries({
    id: board.id,
    name: board.name || 'Untitled board',
    originType: board.originType || 'manual',
    profile: normalizeTopicSetProfile(board.profileSnapshot),
    topicRecords: board.topics || []
  });
}

function updateLocalSetFromApiBoard(set, board) {
  if (!set || !board) return set;
  const next = buildTopicSetFromApiBoard(board);
  Object.assign(set, next);
  return set;
}

function nextBoardName() {
  return `Board ${topicSets.length + 1}`;
}

function findTopicRecord(topic) {
  for (const set of topicSets) {
    const record = (set.topicRecords || []).find(candidate => candidate.query === topic);
    if (record) return { set, record };
  }
  return null;
}

async function webApiRequest(path, options = {}) {
  const authHeaders = WEB_RUNTIME ? await getAuthHeaders() : {};
  const response = await fetch(`${WEB_API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error || payload?.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = response.status === 401 ? 'auth_required' : 'request_failed';
    throw error;
  }

  return payload;
}

async function loadWebTopicBoardState(initialActiveSetId, initialLastTopicBySetId = {}) {
  if (!WEB_RUNTIME) return null;

  try {
    const payload = await webApiRequest('/api/topic-boards');
    const nextTopicSets = (payload.boards || []).map(buildTopicSetFromApiBoard);
    if (!nextTopicSets.length) return null;

    const nextLastTopicBySetId = { ...(initialLastTopicBySetId || {}) };
    Object.keys(nextLastTopicBySetId).forEach(setId => {
      if (!nextTopicSets.some(set => set.id === setId)) delete nextLastTopicBySetId[setId];
    });

    let nextActiveTopicSetId = initialActiveSetId;
    if (!nextTopicSets.some(set => set.id === nextActiveTopicSetId)) {
      nextActiveTopicSetId = payload.boards.find(board => board.isDefault)?.id || nextTopicSets[0].id;
    }

    return {
      user: payload.user,
      topicSets: nextTopicSets,
      activeTopicSetId: nextActiveTopicSetId,
      lastTopicBySetId: nextLastTopicBySetId
    };
  } catch (error) {
    console.warn('[Tracker] Failed to load web topic boards:', error?.message || error);
    return null;
  }
}

async function createTopicBoardViaApi(payload) {
  const data = await webApiRequest('/api/topic-boards', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.board;
}

async function updateTopicBoardViaApi(boardId, payload) {
  const data = await webApiRequest(`/api/topic-boards/${encodeURIComponent(boardId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return data.board;
}

async function deleteTopicBoardViaApi(boardId) {
  return webApiRequest(`/api/topic-boards/${encodeURIComponent(boardId)}`, {
    method: 'DELETE'
  });
}

async function createTopicViaApi(payload) {
  const data = await webApiRequest('/api/topics', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.topic;
}

async function updateTopicViaApi(topicId, payload) {
  const data = await webApiRequest(`/api/topics/${encodeURIComponent(topicId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return data.topic;
}

async function deleteTopicViaApi(topicId) {
  return webApiRequest(`/api/topics/${encodeURIComponent(topicId)}`, {
    method: 'DELETE'
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Resolved structured analysis for a belief (stored or parsed from pasted text). */
function structuredBeliefAnalysis(b) {
  const la = b.lastAnalysis;
  if (!la) return null;
  if (la.structured) return la.structured;
  if (la.text) return validateStructuredAnalysis(parseStructuredAnalysis(la.text));
  return null;
}

/**
 * Readable “Saved analysis” block for Belief Detail — avoids raw JSON in the modal.
 */
function beliefSavedAnalysisHtml(b) {
  const la = b.lastAnalysis;
  if (!la) return '';
  const structured = structuredBeliefAnalysis(b);
  if (structured && (structured.verdict || (structured.reasoning && structured.reasoning.trim()) || structured.watch_items?.length)) {
    const v = structured.verdict || 'hold';
    const vBg = v === 'increase' ? 'rgba(16,185,129,0.1)' : v === 'decrease' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)';
    const vBorder = v === 'increase' ? 'rgba(34,197,94,0.45)' : v === 'decrease' ? 'rgba(248,113,113,0.45)' : 'rgba(245,158,11,0.4)';
    const vLabel = v === 'increase' ? 'Suggest ↑ confidence' : v === 'decrease' ? 'Suggest ↓ confidence' : 'Hold confidence';
    const delta = structured.confidence_delta;
    const deltaStr = typeof delta === 'number' ? (delta > 0 ? `+${delta}` : String(delta)) : '—';
    const sugg = structured.suggested_confidence != null ? `${structured.suggested_confidence}%` : '—';
    const reasoning = (structured.reasoning || '').trim();
    const reasoningHtml = reasoning
      ? `<div style="font-size:13px;color:#d4d4d8;line-height:1.65;margin-top:2px;">${esc(reasoning).replace(/\n/g, '<br>')}</div>`
      : '';
    const watches = (structured.watch_items || []).map(w => `<li style="margin:5px 0;">${esc(String(w))}</li>`).join('');
    const meta = la.date ? new Date(la.date).toLocaleString() : '';
    const who = la.llm ? esc(String(la.llm)) : 'Manual';
    return `
      <div style="margin-top:14px;padding:16px 18px;border-radius:10px;border:1px solid ${vBorder};background:${vBg};">
        <div style="font-size:10px;font-weight:800;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.75px;margin-bottom:12px;">Saved analysis · ${who}${meta ? ` · ${esc(meta)}` : ''}</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px;">
          <span style="font-size:11px;font-weight:700;padding:5px 12px;border-radius:999px;background:rgba(0,0,0,0.2);border:1px solid ${vBorder};color:#f4f4f5;">${vLabel}</span>
          <span style="font-size:12px;color:#a1a1aa;">Δ confidence: <strong style="color:#f4f4f5;">${deltaStr}%</strong></span>
          <span style="font-size:12px;color:#a1a1aa;">Suggested: <strong style="color:#f4f4f5;">${sugg}</strong></span>
        </div>
        ${reasoningHtml}
        ${watches ? `<div style="font-size:10px;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 8px;">Watch next</div><ul style="margin:0;padding-left:18px;font-size:12px;color:#94a3b8;line-height:1.55;">${watches}</ul>` : ''}
      </div>`;
  }
  const raw = (la.text || '').trim();
  if (!raw) return '';
  return `
    <div style="margin-top:14px;padding:14px 16px;border-radius:10px;border:1px solid #27272a;background:#0a0a0a;">
      <div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Saved analysis${la.llm ? ` · ${esc(String(la.llm))}` : ''}</div>
      <div style="font-size:12px;color:#a1a1aa;line-height:1.6;white-space:pre-wrap;">${esc(raw)}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// API KEYS + LLM
// ─────────────────────────────────────────────────────────────────────────────

async function getKeys() {
  return new Promise(r => chrome.storage.local.get(['openaiKey','openAiApiKey','anthropicKey','llmModel'], d => r({
    openai: d.openaiKey || d.openAiApiKey || (WEB_RUNTIME ? '__server_proxy__' : null),
    anthropic: d.anthropicKey || (WEB_RUNTIME ? '__server_proxy__' : null),
    llm: d.llmModel || 'claude'
  })));
}

const LLM_BASE_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  perplexity: 'https://www.perplexity.ai/',
  gemini: 'https://gemini.google.com/app',
  lechat: 'https://chat.mistral.ai/chat'
};

function getLLMBaseUrl(model) {
  return LLM_BASE_URLS[model] || LLM_BASE_URLS.claude;
}

async function handoffPromptToLLM(model, prompt) {
  const target = model || 'claude';
  const baseUrl = getLLMBaseUrl(target);

  if (['claude', 'gemini', 'lechat'].includes(target)) {
    await chrome.storage.local.set({
      pendingPrompt: prompt,
      pendingPromptTarget: target
    });
    window.open(baseUrl, '_blank');
    return;
  }

  try {
    await navigator.clipboard.writeText(prompt);
    alert('Prompt copied to clipboard. Paste it when the window opens (Cmd+V / Ctrl+V).');
  } catch (error) {
    console.warn('[Tracker] Failed to copy prompt to clipboard:', error?.message || error);
    alert('Unable to copy the prompt automatically. The target model window will still open, but you may need to copy the prompt manually.');
  }

  window.open(baseUrl, '_blank');
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

let modalContent = '';
let currentModalType = 'default';
let currentEmailPreviewMode = 'desktop';
let lastEmailData = null;
const BRAND_NAME = 'Cognesion';
const MORNING_BRIEF_TITLE = `Your ${BRAND_NAME} Morning Brief`;
const DEFAULT_DISPATCH_FREQ = '5';
const DISPATCH_FREQ_OPTIONS = ['1', '3', '5'];
const DISPATCH_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DEFAULT_DISPATCH_SCHEDULE = {
  days: [...DISPATCH_WEEKDAYS],
  hour: '7',
  min: '00',
  ampm: 'AM',
};

function normalizeDispatchFreq(value) {
  const normalized = String(value || '').trim();
  return DISPATCH_FREQ_OPTIONS.includes(normalized) ? normalized : DEFAULT_DISPATCH_FREQ;
}

function getDispatchDayLimit(freq) {
  return Number(normalizeDispatchFreq(freq));
}

function getDispatchCadenceLabel(freq) {
  const normalized = normalizeDispatchFreq(freq);
  if (normalized === '1') return '1 Brief / Week';
  if (normalized === '3') return '3 Briefs / Week';
  return '5 Briefs / Week';
}

function getDispatchDeliveryDescriptor(freq) {
  const normalized = normalizeDispatchFreq(freq);
  if (normalized === '1') return 'Single weekday delivery ready';
  if (normalized === '3') return 'Three weekday deliveries ready';
  return 'Weekday delivery ready';
}

function clampDispatchDays(days, freq) {
  const limit = getDispatchDayLimit(freq);
  const filtered = (Array.isArray(days) ? days : []).filter(day => DISPATCH_WEEKDAYS.includes(day));
  if (filtered.length) return filtered.slice(0, limit);
  return DEFAULT_DISPATCH_SCHEDULE.days.slice(0, limit);
}

function enforceDispatchDayLimit(freq, changedPill = null) {
  const limit = getDispatchDayLimit(freq);
  const activePills = [...document.querySelectorAll('#t-sched-days .t-sched-day.active')];
  if (activePills.length <= limit) return true;
  if (changedPill) {
    changedPill.classList.remove('active');
  } else {
    activePills.slice(limit).forEach(pill => pill.classList.remove('active'));
  }
  return false;
}

function syncDispatchCadenceUI(freq) {
  const normalized = normalizeDispatchFreq(freq);
  const cadenceTgl = document.getElementById('t-cadence-toggle');
  const freqSel = document.getElementById('t-dispatch-freq');
  const helpEl = document.getElementById('t-dispatch-cadence-help');
  const limitEl = document.getElementById('t-sched-limit');

  if (freqSel) freqSel.value = normalized;
  if (cadenceTgl) {
    cadenceTgl.querySelectorAll('.t-ctbtn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cadence === normalized);
    });
  }

  const label = getDispatchCadenceLabel(normalized).toLowerCase();
  const limit = getDispatchDayLimit(normalized);
  if (helpEl) helpEl.textContent = `Preview the ${label} plan. You can choose up to ${limit} weekday${limit === 1 ? '' : 's'} for delivery.`;
  if (limitEl) limitEl.textContent = `Choose up to ${limit} weekday${limit === 1 ? '' : 's'}.`;
}

// Logo + text: align to baseline, font-size ≈ 55% of logo height (x-height)
const COGNESION_WORDMARK_INLINE = '<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:baseline;"><span style="width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,#7dd3fc,#3b82f6);box-shadow:0 0 0 3px rgba(59,130,246,0.18);display:inline-block;"></span><span style="font-family:Arial, Helvetica, sans-serif;font-weight:700;letter-spacing:0.01em;color:#f4f4f5;">Cognesion</span></span>';
const COGNESION_WORDMARK_SMALL = '<span style="display:inline-flex;align-items:center;gap:5px;vertical-align:baseline;"><span style="width:8px;height:8px;border-radius:999px;background:linear-gradient(135deg,#7dd3fc,#3b82f6);display:inline-block;"></span><span style="font-family:Arial, Helvetica, sans-serif;font-weight:700;letter-spacing:0.01em;color:#f4f4f5;">Cognesion</span></span>';
/** Morning-brief modal header — row uses `inline-flex` + `align-items:flex-end` in tracker.html. */
function newsletterModalTitleHTML() {
  return (
    '<span class="t-newsletter-title-row">' +
      '<span class="t-newsletter-title-copy">Your</span>' +
      `<span class="t-newsletter-title-logo" aria-hidden="true">${COGNESION_WORDMARK_INLINE}</span>` +
      '<span class="t-newsletter-title-copy">Morning Brief</span>' +
    '</span>'
  );
}

/** Header model pill (Claude / GPT-4o, etc.) — use with openModal(..., hideBadge) + setModalBadge when content is ready. */
const MODAL_BADGE_STYLE_CLAUDE = 'background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;font-size:9px;font-weight:800;letter-spacing:1px;padding:2px 7px;border-radius:10px;';
const MODAL_BADGE_STYLE_GPT4O = 'background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#10b981;font-size:9px;font-weight:800;letter-spacing:1px;padding:2px 7px;border-radius:10px;';

function openModal(title, badge, badgeStyle, content, type = 'default', hideBadge = false) {
  currentModalType = type;
  const titleEl = document.getElementById('t-modal-title');
  if (type === 'dispatch' && title === MORNING_BRIEF_TITLE) {
    titleEl.innerHTML = newsletterModalTitleHTML();
  } else {
    titleEl.textContent = title;
  }
  const b = document.getElementById('t-modal-badge');
  if (b) {
    b.textContent = badge;
    b.style.cssText = badgeStyle;
    if (type === 'dispatch' || hideBadge) b.style.display = 'none';
    else b.style.display = '';
  }

  const isDispatch = type === 'dispatch';
  const modal        = document.getElementById('t-modal');
  const body         = document.getElementById('t-modal-body');
  const composer     = document.getElementById('t-brief-composer');
  const cadenceTgl   = document.getElementById('t-cadence-toggle');
  const sendTestBtn  = document.getElementById('t-modal-send-test');

  // Always show loading body; composer only shown after content is ready
  if (body)     { body.innerHTML = content; body.style.display = ''; }
  if (composer) composer.style.display = 'none';

  if (isDispatch) {
    if (modal) modal.classList.add('t-modal--dispatch');
    // Sync cadence toggle to the current frequency selector value
    const freq = normalizeDispatchFreq(document.getElementById('t-dispatch-freq')?.value || DEFAULT_DISPATCH_FREQ);
    if (cadenceTgl) {
      cadenceTgl.style.display = '';
      syncDispatchCadenceUI(freq);
    }
    if (sendTestBtn) sendTestBtn.style.display = '';
  } else {
    if (modal)     modal.classList.remove('t-modal--dispatch');
    if (cadenceTgl) cadenceTgl.style.display = 'none';
    if (sendTestBtn) sendTestBtn.style.display = 'none';
  }

  document.getElementById('t-modal-overlay').classList.add('open');
  modalContent = body ? body.innerText : '';

  const hideFooterForLoading = isDispatch || hideBadge;
  ['t-modal-copy', 't-export-wrap', 't-modal-llm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = hideFooterForLoading ? 'none' : '';
  });

  const schedBtn = document.getElementById('t-modal-schedule');
  const schedPanel = document.getElementById('t-schedule-panel');
  if (schedBtn) {
    schedBtn.style.display = isDispatch ? '' : 'none';
    schedBtn.textContent = 'Set Morning Delivery';
  }
  if (schedPanel) schedPanel.classList.remove('open');
  if (isDispatch) loadDispatchScheduleIntoPanel();
}

function closeModal() {
  document.getElementById('t-modal-overlay').classList.remove('open');
  const modal    = document.getElementById('t-modal');
  const body     = document.getElementById('t-modal-body');
  const composer = document.getElementById('t-brief-composer');
  const cadenceTgl = document.getElementById('t-cadence-toggle');
  const badgeEl    = document.getElementById('t-modal-badge');
  if (modal)    modal.classList.remove('t-modal--dispatch');
  if (body)     body.style.display = '';
  if (composer) composer.style.display = 'none';
  if (cadenceTgl) cadenceTgl.style.display = 'none';
  if (badgeEl)   badgeEl.style.display = '';
}

function setModalBody(html) {
  // In dispatch mode, if composer is visible (content loaded), switch back to body view for errors
  if (currentModalType === 'dispatch') {
    const composer = document.getElementById('t-brief-composer');
    const body     = document.getElementById('t-modal-body');
    if (composer) composer.style.display = 'none';
    if (body)     body.style.display = '';
  }
  document.getElementById('t-modal-body').innerHTML = html;
  modalContent = document.getElementById('t-modal-body').innerText;
}

/** Show header model pill after loading finishes (no-op in dispatch mode). Restores footer actions. */
function setModalBadge(text, style) {
  const b = document.getElementById('t-modal-badge');
  if (!b) return;
  if (currentModalType === 'dispatch') {
    b.style.display = 'none';
    return;
  }
  b.textContent = text;
  b.style.cssText = style;
  b.style.display = '';
  ['t-modal-copy', 't-export-wrap', 't-modal-llm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
}

/** Compact card loaders — vanilla HTML in airadar-loading-screen.js (same pipeline as main loader). */
function trackerCompactCardLoading(variant, opts) {
  const g = typeof globalThis !== 'undefined' && globalThis.getAiradarCompactCardHTML;
  if (typeof g === 'function') {
    return `<div class="t-brief-loading t-brief-loading--airadar-compact">${g(variant, opts)}</div>`;
  }
  const sub =
    opts && opts.sub != null
      ? opts.sub
      : variant === 'powerPrompts'
        ? 'Generating prompts...'
        : variant === 'pageBrief'
          ? 'Generating topic brief...'
          : variant === 'newsletter'
            ? 'Building your newsletter…'
            : 'Synthesizing insights...';
  return trackerBriefLoading({
    hideTagline: true,
    status: sub,
    sub: '',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE FETCH (for Intelligence Brief)
// ─────────────────────────────────────────────────────────────────────────────

const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
];

async function fetchArticleText(url) {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) });
      let text = '';
      if (proxy(url).includes('allorigins')) {
        const d = await res.json(); text = d.contents || '';
      } else {
        text = await res.text();
      }
      // Strip HTML tags and collapse whitespace
      text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
                 .replace(/<style[\s\S]*?<\/style>/gi, '')
                 .replace(/<[^>]+>/g, ' ')
                 .replace(/\s+/g, ' ').trim();
      if (text.length > 200) return text.substring(0, 8000);
    } catch {}
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENCE BRIEF (Claude — per article)
// ─────────────────────────────────────────────────────────────────────────────

const INTEL_SYSTEM = `You are a senior intelligence analyst. Your job is to produce deep, original analysis — not summarize. Think critically about what the article says vs. what it implies, fact-check claims, identify what's missing, and surface the strategic dynamics the article doesn't spell out.

Today's date is ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.

YOUR ANALYSIS MUST:
1. FACT-CHECK THE ARTICLE. Flag misleading, incomplete, or wrong claims.
2. GO DEEPER. Add context, competitive dynamics, strategic subtext the article omits.
3. IDENTIFY THE GAP BETWEEN NARRATIVE AND REALITY. Name the frame, then show where reality diverges.
4. BE FORWARD-LOOKING. End with specific, falsifiable things to watch.

Never use: "could potentially", "remains to be seen", "stakeholders should", "opportunities include".

OUTPUT FORMAT (HTML):
<div style="font-family:system-ui;line-height:1.7;color:#e4e4e7;">
<h2 style="font-size:18px;font-weight:700;color:#f4f4f5;margin-bottom:16px;">Intelligence Brief: [Topic]</h2>
<div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:16px;margin-bottom:12px;">
<h3 style="font-size:11px;color:#f59e0b;text-transform:uppercase;margin-bottom:8px;font-weight:700;letter-spacing:0.5px;">Corrections & Context</h3>
<p style="margin:0;font-size:13px;color:#d4d4d8;">[corrections and omitted context]</p>
</div>
<div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:16px;margin-bottom:12px;">
<h3 style="font-size:11px;color:#71717a;text-transform:uppercase;margin-bottom:8px;font-weight:700;letter-spacing:0.5px;">What's Actually Happening</h3>
<p style="margin:0;font-size:13px;color:#d4d4d8;">[real story with actors, numbers, mechanisms]</p>
</div>
<div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:16px;margin-bottom:12px;">
<h3 style="font-size:11px;color:#71717a;text-transform:uppercase;margin-bottom:8px;font-weight:700;letter-spacing:0.5px;">Strategic Subtext</h3>
<p style="margin:0;font-size:13px;color:#d4d4d8;">[why published now, who benefits, competitive dynamics]</p>
</div>
<div style="background:#18181b;border:1px solid #3b82f6;border-radius:8px;padding:16px;">
<h3 style="font-size:11px;color:#60a5fa;text-transform:uppercase;margin-bottom:8px;font-weight:700;letter-spacing:0.5px;">What to Watch</h3>
<ul style="margin:0;padding-left:18px;font-size:12px;color:#d4d4d8;">
<li>[specific falsifiable prediction with entity + action + timeframe]</li>
<li>[second indicator]</li>
<li>[third indicator]</li>
</ul>
</div>
</div>`;

/** AIRadar loading UI (see AIRadarLoadingScreen.tsx → airadar-loading-screen.js). */
function trackerBriefLoading(opts = {}) {
  const g = typeof globalThis !== 'undefined' && globalThis.getAiradarLoadingHTML;
  if (typeof g === 'function') {
    return `<div class="t-brief-loading">${g(Object.assign({ compact: true }, opts))}</div>`;
  }
  const hud = '<div class="hud-bar"></div>';
  const st = opts.statusHtml
    ? `<div class="t-brief-status">${opts.statusHtml}</div>`
    : opts.status
      ? `<div class="t-brief-status">${esc(opts.status)}</div>`
      : '';
  const sb = opts.sub ? `<div class="t-brief-sub">${esc(opts.sub)}</div>` : '';
  return `<div class="t-brief-loading">${hud}${st}${sb}</div>`;
}

async function runIntelligenceBrief(article) {
  const { anthropic, llm } = await getKeys();

  openModal(
    'Intelligence Brief',
    'Claude Sonnet',
    MODAL_BADGE_STYLE_CLAUDE,
    trackerCompactCardLoading('intelligenceBrief'),
    'default',
    true
  );

  // Fetch full article text
  let context = await fetchArticleText(article.link);
  if (!context) context = article.summary || '(Full text unavailable — using headline and summary only)';

  setModalBody(trackerCompactCardLoading('intelligenceBrief'));

  if (!anthropic) {
    setModalBody(`<p style="color:#ef4444;padding:24px;">Anthropic key not found. Open the main dashboard once to initialise keys.</p>`);
    return;
  }

  try {
    const data = await requestAnthropicMessage({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: INTEL_SYSTEM,
      messages: [{ role: 'user', content: `Article: "${article.title}"\nSource: ${article.source}\nFull text:\n${context}${radarLanguage ? `\n\nIMPORTANT: Write your entire analysis in ${I18N_LANG_NAMES[radarLanguage] || radarLanguage}.` : ''}` }]
    });
    const html = data.content?.[0]?.text || '<p style="color:#ef4444">Analysis failed.</p>';
    setModalBody(html);
    setModalBadge('Claude Sonnet', MODAL_BADGE_STYLE_CLAUDE);

    // Wire Send to Model button
    document.getElementById('t-modal-llm').onclick = async () => {
      const { llm: model } = await getKeys();
      await handoffPromptToLLM(model, `Intelligence Brief context:\n${article.title}\n${article.link}\n\nAnalyse this article deeply.`);
    };
  } catch (e) {
    setModalBody(`<p style="color:#ef4444;padding:24px;">Error: ${e.message}</p>`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC BRIEF (GPT-4o — all articles for a topic)
// ─────────────────────────────────────────────────────────────────────────────

async function runTopicBrief(topic, articles) {
  const { openai, llm } = await getKeys();

  openModal(
    `Topic Brief: ${topic}`,
    'GPT-4o',
    MODAL_BADGE_STYLE_GPT4O,
    trackerCompactCardLoading('pageBrief'),
    'default',
    true
  );

  if (!openai) {
    setModalBody(`<p style="color:#ef4444;padding:24px;">OpenAI key not found. Open the main dashboard once to initialise keys.</p>`);
    return;
  }

  const articleList = articles.slice(0, 30).map((a, i) => `ID_${i}: ${a.title} (${a.source})`).join('\n');
  const langName = radarLanguage ? (I18N_LANG_NAMES[radarLanguage] || radarLanguage) : null;
  const langDirective = langName ? `\nIMPORTANT: Write ALL text values in ${langName}.\n` : '';
  const prompt = `You are a senior strategic analyst briefing an executive on the topic: "${topic}".${langDirective}
Analyse these ${articles.length} articles and return structured JSON:
{
  "executive_summary": "3-4 sentence synthesis of what's actually happening — not what articles say but what the pattern means",
  "recommended_actions": ["action 1", "action 2", "action 3"],
  "article_analysis": [{"id":"ID_0","urgency":1-10,"impact":1-10,"analysis":"1-2 sentence insight beyond the headline"}]
}

RULES:
- executive_summary must contain specific actors, numbers, mechanisms — no vague language
- recommended_actions must be concrete and immediately actionable
- article_analysis must cover EVERY article with genuine insight, not paraphrase
- urgency = how time-sensitive; impact = strategic importance

Articles:
${articleList}`;

  try {
    const data = await requestOpenAIChat({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(data.choices[0].message.content);

    // Render
    const actionsHtml = (parsed.recommended_actions || []).map((a, i) => `
      <div class="t-action-item">
        <div class="t-action-num">${i + 1}</div>
        <div>${esc(a)}</div>
      </div>`).join('');

    const aaHtml = (parsed.article_analysis || []).map(aa => {
      const idx = parseInt(aa.id?.replace('ID_', '') || '0');
      const article = articles[idx];
      const uClass = aa.urgency >= 7 ? 'urgency-high' : aa.urgency >= 4 ? 'urgency-med' : 'urgency-low';
      const iClass = aa.impact  >= 7 ? 'impact-high'  : aa.impact  >= 4 ? 'impact-med'  : 'impact-low';
      return `
        <div class="t-aa-item">
          <div class="t-aa-title">${esc(article?.title || aa.id)}</div>
          <div class="t-aa-badges">
            <span class="t-aa-badge ${uClass}">Urgency ${aa.urgency}/10</span>
            <span class="t-aa-badge ${iClass}">Impact ${aa.impact}/10</span>
          </div>
          <div class="t-aa-analysis">${esc(aa.analysis || '')}</div>
        </div>`;
    }).join('');

    setModalBody(`
      <div class="t-exec-summary">
        <div class="t-exec-summary-label">Executive Summary</div>
        <div class="t-exec-summary-text">${esc(parsed.executive_summary || '')}</div>
      </div>
      <div class="t-actions-block">
        <div class="t-actions-label">Recommended Actions</div>
        ${actionsHtml}
      </div>
      <div class="t-articles-analysis">
        <div class="t-actions-label" style="color:var(--dim);margin-bottom:8px;">Article Analysis · ${articles.length} signals</div>
        ${aaHtml}
      </div>
    `);
    setModalBadge('GPT-4o', MODAL_BADGE_STYLE_GPT4O);

    // Wire Send to Model button
    document.getElementById('t-modal-llm').onclick = async () => {
      const { llm: model } = await getKeys();
      const ctx = articles.slice(0, 10).map(a => `- ${a.title} (${a.source}): ${a.link}`).join('\n');
      await handoffPromptToLLM(model, `Topic: "${topic}"\n\nArticles:\n${ctx}\n\nGenerate a strategic intelligence brief.`);
    };

  } catch (e) {
    setModalBody(`<p style="color:#ef4444;padding:24px;">Error: ${e.message}</p>`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POWER PROMPT TOOLTIP — on-click custom generation, cached per session
// ─────────────────────────────────────────────────────────────────────────────

const promptCache = new Map(); // keyed by article.link, value: { p1, p2, p3 }

async function generateCustomPrompts(article) {
  const { openai } = await getKeys();

  const ctxParts = [];
  if (radarRole)     ctxParts.push(`Role: ${radarRole}`);
  if (radarCareer)   ctxParts.push(`Industry: ${radarCareer}`);
  if (radarAccount)  ctxParts.push(`Brand / Account: ${radarAccount}`);
  if (radarKeywords) ctxParts.push(`Priority topics: ${radarKeywords}`);
  const userCtx = ctxParts.length ? ctxParts.join('\n') : '';

  const brand = radarAccount || 'my organisation';
  const bridgeLine = radarAccount
    ? `Even if this article does not mention ${radarAccount} directly, draw explicit connections to how this signal applies to ${radarAccount} — its strategy, competitive position, customers, or priorities.`
    : '';

  const articleBlock = `Title: ${article.title || 'Untitled'}
Source: ${article.source || ''}${article.link ? `\nURL: ${article.link}` : ''}${article.summary ? `\nSummary: ${article.summary.substring(0, 300)}` : ''}`;

  if (!openai) {
    // Fallback to contextual templates when no API key
    const link = article.link || '';
    const linkLine = link ? `\nSource: ${link}` : '';
    const summaryLine = article.summary ? `\nSummary: ${article.summary.substring(0, 200)}` : '';
    const ctx = userCtx ? `\n\nUser context:\n${userCtx}` : '';
    const bridge = bridgeLine ? `\n\n${bridgeLine}` : '';
    return {
      p1: `You are a strategic analyst. Analyse the article below for strategic implications.${ctx}${bridge}\n\nArticle: ${article.title}${linkLine}${summaryLine}`,
      p2: `You are a competitive strategist. What are the competitive implications of this article for ${brand}?${ctx}${bridge}\n\nArticle: ${article.title}${linkLine}`,
      p3: `You are an intelligence analyst advising ${brand}. Based on this signal, what should ${brand} monitor or act on?${ctx}${bridge}\n\nArticle: ${article.title}${linkLine}`
    };
  }

  const langName = radarLanguage ? (I18N_LANG_NAMES[radarLanguage] || radarLanguage) : null;
  const langDirective = langName ? ` Write ALL prompt values in ${langName}.` : '';
  const systemPrompt = `You are an intelligence analyst. Given an article and a user's professional profile, generate 3 highly specific, ready-to-use prompts the user can send to an AI model. Each prompt must be tailored to both the article content AND the user's specific brand/role — not generic analysis instructions.${langDirective}${bridgeLine ? `\n\n${bridgeLine}` : ''}`;

  const userMessage = `User profile:
${userCtx || 'No profile provided'}

Article:
${articleBlock}

Return a JSON object with exactly these keys:
{
  "p1": "Strategic Analysis prompt — focused on what this article means strategically for ${brand}",
  "p2": "Competitive Implications prompt — focused on competitive threats or opportunities for ${brand}",
  "p3": "What to Monitor prompt — focused on follow-on signals ${brand} should watch and concrete next actions"
}

Each prompt value should be a complete, self-contained prompt ready to paste into an AI model. 2-4 sentences each. Specific to this article and this user — not generic.`;

  try {
    const data = await requestOpenAIChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: 0.6,
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(data.choices[0].message.content);
    return { p1: parsed.p1 || '', p2: parsed.p2 || '', p3: parsed.p3 || '' };
  } catch (e) {
    console.error('[PowerPrompts] generateCustomPrompts failed:', e);
    // Fallback to contextual templates on error
    const ctx = userCtx ? `\n\nUser context:\n${userCtx}` : '';
    const bridge = bridgeLine ? `\n\n${bridgeLine}` : '';
    return {
      p1: `You are a strategic analyst. Analyse this article for ${brand}.${ctx}${bridge}\n\nArticle: ${article.title}`,
      p2: `What are the competitive implications of this article for ${brand}?${ctx}${bridge}\n\nArticle: ${article.title}`,
      p3: `What should ${brand} monitor or act on based on this signal?${ctx}${bridge}\n\nArticle: ${article.title}`
    };
  }
}

function buildPowerTooltipShell(article) {
  const ttId = `tt-${esc(article.link?.replace(/\W/g,'') || Math.random())}`;
  const compactLoad = (typeof globalThis !== 'undefined' && typeof globalThis.getAiradarCompactCardHTML === 'function')
    ? globalThis.getAiradarCompactCardHTML('powerPrompts')
    : `<div class="hud-bar-mini"></div><div class="t-pt-loading-text">${tl('pp_generating')}</div>`;
  return `
    <div class="t-power-tooltip" id="${ttId}">
      <div class="t-pt-label">${tl('pp_label')}</div>
      <div class="t-pt-loading">
        ${compactLoad}
      </div>
      <div class="t-pt-rows" style="display:none;">
        <div class="t-pt-row" data-action="llm">
          <div class="t-pt-text">${tl('pp_strategic')}</div>
          <div class="t-pt-cta" aria-hidden="true"><span class="t-pt-cta-label"><span class="t-pt-cta-icon" aria-hidden="true">↗</span><span class="t-pt-cta-text">${tl('pp_open_model')}</span></span></div>
        </div>
        <div class="t-pt-row" data-action="llm">
          <div class="t-pt-text">${tl('pp_competitive')}</div>
          <div class="t-pt-cta" aria-hidden="true"><span class="t-pt-cta-label"><span class="t-pt-cta-icon" aria-hidden="true">↗</span><span class="t-pt-cta-text">${tl('pp_open_model')}</span></span></div>
        </div>
        <div class="t-pt-row" data-action="llm">
          <div class="t-pt-text">${tl('pp_monitor')}</div>
          <div class="t-pt-cta" aria-hidden="true"><span class="t-pt-cta-label"><span class="t-pt-cta-icon" aria-hidden="true">↗</span><span class="t-pt-cta-text">${tl('pp_open_model')}</span></span></div>
        </div>
      </div>
      <div class="t-pt-divider"></div>
      <div class="t-pt-intel" data-action="intel">
        <div class="t-pt-intel-text">${tl('pp_intel_brief')}</div>
      </div>
    </div>`;
}

function populateTooltipPrompts(tt, prompts) {
  const rows = tt.querySelectorAll('.t-pt-row[data-action="llm"]');
  const values = [prompts.p1, prompts.p2, prompts.p3];
  rows.forEach((row, i) => {
    if (values[i]) {
      row.dataset.prompt = values[i];
      const label = row.querySelector('.t-pt-text');
      if (label) label.textContent = values[i];
    }
  });
  tt.querySelector('.t-pt-loading').style.display = 'none';
  tt.querySelector('.t-pt-rows').style.display = '';
}

function closeAllTooltips() {
  document.querySelectorAll('.t-power-tooltip.open').forEach(t => {
    t.classList.remove('open');
    t.style.top = ''; t.style.bottom = '';
    t.style.right = ''; t.style.left = '';
    t.scrollTop = 0;
  });
}

function positionTooltip(tooltip, triggerBtn) {
  const MARGIN = 8;
  const btnRect = triggerBtn.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  // Horizontal: align right edge of tooltip with right edge of button, then clamp so it stays on-screen
  const approxW = Math.min(560, viewportW - 2 * MARGIN);
  let right = Math.max(MARGIN, viewportW - btnRect.right);
  const leftEdge = viewportW - right - approxW;
  if (leftEdge < MARGIN) {
    right = Math.max(MARGIN, viewportW - MARGIN - approxW);
  }
  tooltip.style.right = right + 'px';
  tooltip.style.left = 'auto';

  // Must run while tooltip is visible — .open gives real layout + max-height for scroll
  const h = Math.max(tooltip.getBoundingClientRect().height, 1);

  const spaceBelow = viewportH - btnRect.bottom - MARGIN;
  const spaceAbove = btnRect.top - MARGIN;
  let top = btnRect.bottom + MARGIN;

  if (h <= spaceBelow) {
    top = btnRect.bottom + MARGIN;
  } else if (h <= spaceAbove) {
    top = btnRect.top - MARGIN - h;
  } else {
    // Taller than available space on one side — pin to top of viewport; inner area scrolls (CSS max-height)
    top = MARGIN;
  }

  const maxTop = viewportH - MARGIN - h;
  if (maxTop < MARGIN) {
    top = MARGIN;
  } else {
    top = Math.max(MARGIN, Math.min(top, maxTop));
  }

  tooltip.style.top = top + 'px';
  tooltip.style.bottom = 'auto';
}

// Global delegation for tooltip interactions
document.addEventListener('click', async e => {
  // Topic edit button
  const editBtn = e.target.closest('[data-action="edit-topic"]');
  if (editBtn) {
    e.stopPropagation();
    const row = editBtn.closest('.t-topic-row');
    if (row) enterEditMode(row, row.dataset.topic);
    return;
  }

  // Topic delete button
  const deleteBtn = e.target.closest('[data-action="delete-topic"]');
  if (deleteBtn) {
    e.stopPropagation();
    const row = deleteBtn.closest('.t-topic-row');
    if (row) deleteTopic(row.dataset.topic);
    return;
  }

  // Belief card click — show revision history modal
  const beliefCard = e.target.closest('.t-belief');
  if (beliefCard) {
    closeAllTooltips();
    const b = beliefCard._beliefData;
    if (!b) return;
    const hist = (b.revisionHistory || []).slice().reverse();
    const effectiveConfidence = hist.length > 0 ? hist[0].newConfidence : b.confidence;
    const confColor = effectiveConfidence >= 75 ? '#10b981' : effectiveConfidence >= 60 ? '#f59e0b' : '#ef4444';
    const histRows = hist.length
      ? hist.map(r => `
          <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #27272a;">
            <div style="font-size:10px;color:#71717a;white-space:nowrap;padding-top:2px;">${new Date(r.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
            <div style="flex:1;font-size:12px;color:#d4d4d8;">${esc(r.reason || '—')}</div>
            <div style="font-size:12px;font-weight:700;color:${r.newConfidence >= r.oldConfidence ? '#10b981' : '#ef4444'};white-space:nowrap;">
              ${r.oldConfidence}% → ${r.newConfidence}%
            </div>
          </div>`).join('')
      : `<div style="color:#71717a;font-size:12px;padding:12px 0;">No revision history yet.</div>`;

    const evidenceLinks = (b.evidence || []).slice(0, 5).map(ev =>
      `<div style="font-size:11px;padding:4px 0;border-bottom:1px solid #27272a;">
        <a href="${esc(ev.link)}" target="_blank" style="color:#60a5fa;text-decoration:none;">${esc(ev.source || ev.link)}</a>
        <span style="color:#71717a;margin-left:6px;">${timeAgo(ev.ingestedAt || ev.date)}</span>
      </div>`).join('');

    const stWatch = structuredBeliefAnalysis(b);
    const watchItemsHtml = (b.watchItems?.length && !stWatch?.watch_items?.length)
      ? `<div style="font-size:10px;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 8px;">Watch next</div>
         <ul style="margin:0;padding-left:16px;font-size:12px;color:#94a3b8;line-height:1.5;">${b.watchItems.map(w => `<li>${esc(String(w))}</li>`).join('')}</ul>`
      : '';
    const savedAnalysisHtml = beliefSavedAnalysisHtml(b);

    const pasteSection = `
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #27272a;">
        <div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Paste analysis from LLM</div>
        <textarea id="t-paste-analysis" placeholder="Paste the LLM response here (supports JSON or free text)..." style="width:100%;min-height:80px;padding:10px;font-size:12px;background:#0a0a0a;border:1px solid #27272a;border-radius:6px;color:#d4d4d8;resize:vertical;font-family:inherit;"></textarea>
        <button id="t-paste-save" style="margin-top:8px;padding:6px 14px;font-size:11px;font-weight:600;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;">Save analysis</button>
        <span id="t-paste-status" style="font-size:11px;color:#71717a;margin-left:10px;"></span>
      </div>`;

    openModal(
      'Belief Detail',
      `${effectiveConfidence}%`,
      `background:${confColor}22;border:1px solid ${confColor}44;color:${confColor};`,
      `<div style="font-size:14px;font-weight:600;color:#f4f4f5;margin-bottom:10px;line-height:1.5;">${esc(b.claim)}</div>
       ${(b.lens && String(b.lens).trim()) ? `<div style="font-size:12px;color:#a1a1aa;line-height:1.5;margin-bottom:14px;padding:10px 12px;background:#18181b;border-radius:8px;border-left:3px solid #60a5fa;"><span style="font-size:10px;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">${esc(tl('belief_lens_for_you'))}</span>${esc(String(b.lens).trim())}</div>` : ''}
       ${savedAnalysisHtml}
       <div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;margin-top:16px;">Revision History</div>
       ${histRows}
       ${evidenceLinks ? `<div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 8px;">Supporting Evidence</div>${evidenceLinks}` : ''}
       ${watchItemsHtml}
       ${pasteSection}`
    );

    // Wire Send to Model for belief analysis
    const topic = b.topic || selectedTopic;
    const articlesFromState = state[topic]?.articles || [];

    const llmBtn = document.getElementById('t-modal-llm');
    if (llmBtn) {
      llmBtn.onclick = async () => {
        // Always resolve evidence from storage first — ensures full article context for analysis
        const { evidenceWithArticles, resolvedCount, totalCount, excludedCount } = await resolveEvidenceArticlesAsync(b, {
          topic,
          articlesFromState,
          storageKey: 'trackerArticles',
          storageTopic: topic
        });

        const audienceContext = formatAudienceProfileLines({
          career: radarCareer,
          account: radarAccount,
          role: radarRole,
          keywords: radarKeywords,
        });
        const promptToUse = buildBeliefAnalysisPrompt(b, evidenceWithArticles, {
          includeStructuredOutput: true,
          audienceContext,
        });

        // Append evidence completeness note when partial (helps user/LLM interpret quality)
        const noteParts = [];
        if (totalCount > 0 && resolvedCount < totalCount) {
          noteParts.push(`${resolvedCount}/${totalCount} supporting articles had full details`);
        }
        if (excludedCount > 0) {
          noteParts.push(`${excludedCount} supporting article(s) were excluded for low-trust or promotional sourcing`);
        }
        const completenessNote = noteParts.length > 0
          ? `\n\nNOTE: ${noteParts.join(' · ')}. Analysis based on ${resolvedCount === 0 ? 'URLs only' : resolvedCount < totalCount ? 'partial evidence' : 'the filtered evidence set'}.`
          : '';
        const fullPrompt = promptToUse + completenessNote;

        const { llm } = await getKeys();
        await handoffPromptToLLM(llm, fullPrompt);
      };
    }

    // Paste analysis — parse and store lastAnalysis + watchItems in tracker_hypotheses
    const pasteSaveBtn = document.getElementById('t-paste-save');
    const pasteStatus = document.getElementById('t-paste-status');
    if (pasteSaveBtn) {
      pasteSaveBtn.onclick = async () => {
        const textarea = document.getElementById('t-paste-analysis');
        const text = (textarea?.value || '').trim();
        if (!text) {
          if (pasteStatus) pasteStatus.textContent = 'Enter analysis first';
          return;
        }
        const structured = validateStructuredAnalysis(parseStructuredAnalysis(text));
        const now = new Date().toISOString();
        const hyps = await new Promise(r => chrome.storage.local.get(['tracker_hypotheses'], d => r(d.tracker_hypotheses || [])));
        const idx = hyps.findIndex(h => h.id === b.id);
        if (idx === -1) {
          if (pasteStatus) pasteStatus.textContent = 'Belief not found';
          return;
        }
        hyps[idx].lastAnalysis = { date: now, llm: 'Manual', text, structured: structured || null };
        if (structured?.watch_items?.length) hyps[idx].watchItems = structured.watch_items;
        await new Promise(r => chrome.storage.local.set({ tracker_hypotheses: hyps }, r));
        state[topic] = state[topic] || {};
        state[topic].beliefs = hyps.filter(h => h.topic === topic && h.status !== 'archived');
        if (pasteStatus) pasteStatus.textContent = structured?.watch_items?.length ? 'Saved (watch items extracted)' : 'Saved';
        if (textarea) textarea.value = '';
        // Re-dispatch click to refresh modal with updated belief
        const updated = hyps[idx];
        beliefCard._beliefData = updated;
        beliefCard.click();
      };
    }
    return;
  }

  // Scan All
  if (e.target.closest('[data-action="scan-all"]')) {
    scanAll();
    return;
  }

  // Sidebar Scan (current topic)
  if (e.target.closest('#sidebar-scan-btn')) {
    const btn = document.getElementById('sidebar-scan-btn');
    const topic = btn?.dataset.topic;
    if (topic) scanTopic(topic);
    return;
  }

  // Delivery controls panel
  if (e.target.closest('[data-action="manage-panel"]')) {
    const isOpen = document.querySelector('.t-right-col')?.classList.contains('drawer-open');
    if (isOpen) closeProPanel(); else openProPanel();
    return;
  }

  // Open dispatch modal (Morning Brief preview)
  if (e.target.closest('[data-action="open-dispatch"]')) {
    openDispatchModalWithControls();
    return;
  }

  // Close tooltips on outside click
  if (!e.target.closest('.t-power-btn') && !e.target.closest('.t-power-tooltip')) {
    closeAllTooltips();
    return;
  }

  // Power button toggle — generate custom prompts on first open
  const btn = e.target.closest('.t-power-btn');
  if (btn) {
    const wrap = btn.closest('.t-article-wrap');
    const tt = wrap?.querySelector('.t-power-tooltip');
    const wasOpen = tt?.classList.contains('open');
    closeAllTooltips();
    if (tt && !wasOpen) {
      tt.classList.add('open');
      requestAnimationFrame(() => positionTooltip(tt, btn));
      // Use pre-attached _articleData rather than re-indexing into state — the
      // state array can be shortened by deduplication after render, making
      // index-based lookups return undefined for the last articles in the list.
      const article = wrap._articleData;
      if (article) {
        const cacheKey = article.link || String(wrap?.dataset.idx);
        if (promptCache.has(cacheKey)) {
          populateTooltipPrompts(tt, promptCache.get(cacheKey));
          requestAnimationFrame(() => positionTooltip(tt, btn));
        } else {
          generateCustomPrompts(article).then(prompts => {
            promptCache.set(cacheKey, prompts);
            if (tt.classList.contains('open')) {
              populateTooltipPrompts(tt, prompts);
              requestAnimationFrame(() => positionTooltip(tt, btn));
            }
          });
        }
      }
    }
    return;
  }

  // LLM redirect row
  const row = e.target.closest('.t-pt-row[data-action="llm"]');
  if (row) {
    closeAllTooltips();
    const { llm } = await getKeys();
    let prompt = row.dataset.prompt || '';
    const articleLink = row.closest('.t-article-wrap')?._articleData?.link || '';
    if (articleLink && !prompt.includes(articleLink)) {
      prompt += `\n\nSource URL: ${articleLink}`;
    }
    await handoffPromptToLLM(llm, prompt);
    return;
  }

  // Intelligence Brief
  const intel = e.target.closest('.t-pt-intel[data-action="intel"]');
  if (intel) {
    closeAllTooltips();
    const articleEl = intel.closest('.t-article-wrap');
    if (articleEl?._articleData) runIntelligenceBrief(articleEl._articleData);
    return;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT BELIEF ENGINE
// ─────────────────────────────────────────────────────────────────────────────

// Exponential recency weight with a 45-day half-life.
// 1 day old → ~0.98  |  30 days → ~0.51  |  90 days → ~0.13  |  unknown → 0.5
function evidenceRecencyWeight(publishedAt) {
  if (!publishedAt) return 0.5;
  const daysSince = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0.05, Math.exp(-daysSince / 45));
}

const EVIDENCE_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const BeliefEngine = {
  async load() {
    const hyps = await new Promise(r => chrome.storage.local.get(['tracker_hypotheses'], d => r(d.tracker_hypotheses || [])));
    // Reconcile confidence with last revision — fixes drift from migration or corruption
    let repaired = false;
    for (const h of hyps) {
      const rh = h.revisionHistory || [];
      if (rh.length > 0) {
        const last = rh[rh.length - 1];
        const expected = last.newConfidence;
        if (h.confidence !== expected) {
          h.confidence = expected;
          repaired = true;
        }
      }
    }
    if (repaired) await this.save(hyps);
    return hyps;
  },
  async save(hyps) {
    return new Promise(r => chrome.storage.local.set({ tracker_hypotheses: hyps }, r));
  },

  async updateTopic(topic, articles) {
    const { openai: apiKey } = await getKeys();
    if (!apiKey) { console.warn('[Tracker] No OpenAI key'); return []; }

    let all = await this.load();
    const active = all.filter(h => h.topic === topic && h.status !== 'archived');

    if (active.length === 0) {
      const generated = await this.generate(articles, topic, apiKey);
      all.push(...generated);
      await this.save(all);
      return generated;
    }

    for (const hyp of active) {
      if (!Array.isArray(hyp.evidence)) hyp.evidence = [];

      // Only exclude non-expired evidence from the seen set.
      // Evidence older than 90 days re-enters the pool to be re-scored
      // against the hypothesis as it has evolved through later scans.
      const now = Date.now();
      const seen = new Set(
        hyp.evidence
          .filter(e => !e.expiresAt || new Date(e.expiresAt).getTime() > now)
          .map(e => e.link)
          .filter(Boolean)
      );
      const fresh = articles.filter(a => !seen.has(a.link));

      if (fresh.length === 0) {
        // Confirmation maintenance check: if any stored evidence was published
        // within the last 45 days, Exa is consistently returning the same
        // high-quality articles — that IS a signal, not staleness. Skip decay.
        const hasRecentEvidence = hyp.evidence.some(e => {
          const pubDate = e.publishedAt || e.ingestedAt;
          if (!pubDate) return false;
          return (now - new Date(pubDate).getTime()) / (1000 * 60 * 60 * 24) < 45;
        });

        if (hasRecentEvidence) {
          hyp.scansSinceChange = 0;
          continue;
        }

        // True staleness: no fresh articles AND no recent evidence in portfolio.
        hyp.scansSinceChange = (hyp.scansSinceChange || 0) + 1;

        const scoredRevisions = (hyp.revisionHistory || [])
          .filter(r => r.reason && r.reason.includes('article'))
          .slice(-3);
        const recentNetDelta = scoredRevisions.reduce((sum, r) => sum + (r.newConfidence - r.oldConfidence), 0);
        const hasPositiveMomentum = scoredRevisions.length > 0 && recentNetDelta > 0;

        if (hasPositiveMomentum) {
          if (hyp.scansSinceChange >= 5 && hyp.confidence > 35) {
            const old = hyp.confidence;
            hyp.confidence = Math.max(35, hyp.confidence - 1);
            hyp.revisionHistory.push({ date: new Date().toISOString(), oldConfidence: old, newConfidence: hyp.confidence, reason: `Slow decay (${hyp.scansSinceChange} scans, confirmed belief)` });
          }
        } else if (hyp.scansSinceChange >= 2 && hyp.confidence > 25) {
          const old = hyp.confidence;
          hyp.confidence = Math.max(10, hyp.confidence - 3);
          hyp.revisionHistory.push({ date: new Date().toISOString(), oldConfidence: old, newConfidence: hyp.confidence, reason: `Decay (${hyp.scansSinceChange} scans, stale evidence)` });
        }
        continue;
      }

      const { delta, relevance } = await this.score(hyp, fresh.slice(0, 3), apiKey);

      // Relevance gate: articles scoring < 3/10 relevance don't move confidence.
      if (delta !== 0 && relevance >= 3) {
        const candidateArticles = fresh.slice(0, 3);
        const avgRecency = candidateArticles.reduce((sum, a) => sum + evidenceRecencyWeight(a.date), 0) / candidateArticles.length;
        const weightedDelta = Math.round(delta * avgRecency * (relevance / 10));

        if (weightedDelta !== 0) {
          const old = hyp.confidence;
          hyp.confidence = Math.max(10, Math.min(99, hyp.confidence + weightedDelta));
          hyp.revisionHistory.push({
            date: new Date().toISOString(),
            oldConfidence: old,
            newConfidence: hyp.confidence,
            reason: `${fresh.length} new article(s) · raw ${delta > 0 ? '+' : ''}${delta} · relevance ${relevance}/10 · recency ${avgRecency.toFixed(2)} → weighted ${weightedDelta > 0 ? '+' : ''}${weightedDelta}`
          });
          hyp.scansSinceChange = 0;
          hyp.lastUpdated = new Date().toISOString();
          const expiresAt = new Date(now + EVIDENCE_EXPIRY_MS).toISOString();
          candidateArticles.forEach(a => hyp.evidence.push({
            link: a.link,
            source: a.source,
            publishedAt: a.date || new Date().toISOString(),
            ingestedAt: new Date().toISOString(),
            expiresAt
          }));
        }
      }
    }

    await this.save(all);
    return all.filter(h => h.topic === topic && h.status !== 'archived');
  },

  async generate(articles, topic, apiKey) {
    const now = new Date();
    const yr = now.getFullYear();
    const mo = now.toLocaleString('default', { month: 'long' });
    const list = articles.slice(0, 10).map((a, i) => {
      const s = (a.summary || '').substring(0, 300).trim();
      return `[${i+1}] "${a.title}" (${a.source})${s ? `\n${s}` : ''}`;
    }).join('\n\n');

    const audienceLines = formatAudienceProfileLines({
      career: radarCareer,
      account: radarAccount,
      role: radarRole,
      keywords: radarKeywords,
    });
    const userCtxBlock = audienceLines
      ? `USER CONTEXT (for prioritisation and the "lens" field only — NOT a source of facts; do not invent details about the brand or role):\n${audienceLines}\n\n`
      : '';

    const lensRules = audienceLines
      ? `LENS FIELD (1–2 sentences):
- Explain why this hypothesis matters for the user context above — competitive position, regulatory exposure, priorities, or role decisions.
- Use conditional wording if articles do not name the brand: e.g. "For a [Role] in [Industry], this affects…" or "If [Brand] operates in this space…"
- Do NOT assert that the brand will take a specific action unless an article explicitly names the brand and that action.
- Do NOT restate the core claim; add interpretive "so what" only.\n\n`
      : `LENS FIELD: Set to empty string "" (no user profile is configured).\n\n`;

    const beliefLangName = radarLanguage ? (I18N_LANG_NAMES[radarLanguage] || radarLanguage) : null;
    const beliefLangDirective = beliefLangName
      ? `\nIMPORTANT: Write "claim", "lens", and "reasoning" in ${beliefLangName}.\n`
      : '';

    const prompt = `You are an intelligence analyst. Generate 3-5 testable hypotheses for long-term tracking from ONLY the articles below.

TRACKING TOPIC: "${topic}"
TODAY: ${mo} ${yr}
${beliefLangDirective}
${userCtxBlock}ARTICLES (sole source of factual claims — every "claim" must be grounded here):
${list}

TWO-LAYER OUTPUT (strict separation):
1) "claim" — A single falsifiable prediction grounded ONLY in the articles. Name specific actors only as the articles support. Future-dated (${yr} or ${yr + 1}). This is what gets scored against new articles on later scans — keep it article-pure.
2) "lens" — ${audienceLines ? 'Stakeholder relevance for the USER CONTEXT above.' : 'Use empty string "".'}
3) "confidence" — Reflects strength of ARTICLE evidence for the claim only (not how much the user might care).
4) "reasoning" — 1–2 sentences citing which article(s) support the claim.

${lensRules}RULES FOR "claim":
- Name specific actors from the articles
- Assign confidence honestly: strong article evidence = 60-75%, moderate = 45-59%, weak/speculative = 25-44%
- Do NOT cluster all at 50% — differentiate by evidence quality

AVOID PRECISE CLAIMS UNLESS ARTICLES DIRECTLY SUPPORT THEM:
- Do NOT use specific percentages unless an article reports that number
- Do NOT make comparative claims unless articles compare them
- Prefer directional claims over numeric ones unless the number is in the articles
- If articles show correlation, do NOT infer causation beyond what the evidence measures

Return JSON only:
{"hypotheses":[{"claim":"...","lens":"...","confidence":58,"reasoning":"..."}]}`;

    try {
      const data = await requestOpenAIChat({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      });
      const parsed = JSON.parse(data.choices[0].message.content);
      return (parsed.hypotheses || []).map(h => ({
        id: crypto.randomUUID(),
        claim: h.claim,
        lens: typeof h.lens === 'string' ? h.lens.trim() : '',
        confidence: Math.min(75, Math.max(25, h.confidence)),
        topic,
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        status: 'active',
        evidence: [],
        revisionHistory: [{ date: new Date().toISOString(), oldConfidence: h.confidence, newConfidence: h.confidence, reason: 'Created' }],
        scansSinceChange: 0
      }));
    } catch (e) { console.error('[Tracker] generate failed:', e); return []; }
  },

  async score(hyp, articles, apiKey) {
    const list = articles.map(a => `${a.title}: ${(a.summary||'').substring(0,200)}`).join('\n');
    const prompt = `Hypothesis (evaluate relevance and support for THIS claim only — ignore any separate stakeholder "lens" text if you see it elsewhere): "${hyp.claim}" (current confidence: ${hyp.confidence}%)

Articles to evaluate:
${list}

Return JSON with two fields:
- "relevance": integer 0-10. How directly do these articles bear on THIS specific hypothesis claim? (0=unrelated topic, 5=loosely related, 10=directly confirms or refutes the claim)
- "delta": integer -8 to +8. Net support (+) or contradiction (-). Must be 0 if relevance < 3.

{"relevance": <int>, "delta": <int>}`;
    try {
      const data = await requestOpenAIChat({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 40,
        response_format: { type: 'json_object' }
      });
      const parsed = JSON.parse(data.choices[0].message.content);
      const delta = isNaN(parsed.delta) ? 0 : Math.max(-8, Math.min(8, Math.round(parsed.delta)));
      const relevance = isNaN(parsed.relevance) ? 5 : Math.max(0, Math.min(10, Math.round(parsed.relevance)));
      return { delta, relevance };
    } catch { return { delta: 0, relevance: 0 }; }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

const state = {};
let selectedTopic = null;
let allTopics = [];
/** Boards: each tab has its own topic list; hotList in storage stays the union for dashboard/background. */
let topicSets = [];
let activeTopicSetId = null;
let lastTopicBySetId = {};
let radarAccount = '';
let radarCareer = '';
let radarRole = '';
let radarKeywords = '';
let radarEmail = '';
let radarLanguage = '';
let sidebarSortMode = 'conf-desc';

// Keyed by topic name → { recommend, reasoning, suggestions, cachedAt }
const evolveReadyCache = new Map();
const EVOLVE_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── TRANSLATION ENGINE ──
const translationCache = new Map();

let _cacheLoadPromise = Promise.resolve();

function _trCacheKey(lang) { return `trCache_${lang}`; }

function loadTranslationCache(lang) {
  if (!lang) { _cacheLoadPromise = Promise.resolve(); return; }
  _cacheLoadPromise = new Promise(resolve => {
    chrome.storage.local.get([_trCacheKey(lang)], d => {
      const stored = d[_trCacheKey(lang)];
      if (stored) Object.entries(stored).forEach(([k, v]) => translationCache.set(k, v));
      resolve();
    });
  });
}

function saveTranslationCache(lang) {
  if (!lang || !translationCache.size) return;
  chrome.storage.local.set({ [_trCacheKey(lang)]: Object.fromEntries(translationCache) });
}

async function translateTitles(titles, lang, apiKey) {
  if (!titles.length || !lang || !apiKey) return {};
  const langName = I18N_LANG_NAMES[lang] || lang;
  try {
    const data = await requestOpenAIChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Translate these text strings to ${langName}. Preserve proper nouns, brand names, numbers, and technical terms. Return ONLY a valid JSON object where each key is the original string exactly as given and the value is the ${langName} translation.\n\n${JSON.stringify(titles)}` }],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  } catch { return {}; }
}

// Tags and classes whose text should never be translated
const _TR_SKIP_TAGS = new Set(['SCRIPT','STYLE','INPUT','SELECT','TEXTAREA','CODE','PRE','SVG','CANVAS','IMG','PATH','OPTION','NOSCRIPT']);
const _TR_SKIP_CLASSES = new Set([
  'feed-rank','feed-date','feed-type','feed-score-num','feed-score-lbl',
  't-belief-rank','t-belief-scans','t-belief-delta','t-topic-conf','t-topic-conf-wrap',
  'pro-pill','t-badge','t-sched-tz','t-stat','hud-bar','hud-bar-mini','airadar-loading-root',
  't-bento-count-num','t-bento-count-label'
]);
// Strings that are purely numeric/symbolic — skip
const _TR_SKIP_RE = /^[\d\s%.:,+\-→←↑↓#·@$!*|/\\<>[\](){}^&"'`≥≤×÷=~]+$/;

function _collectTranslatables(root) {
  const els = [];
  const walk = (node) => {
    if (_TR_SKIP_TAGS.has(node.tagName)) return;
    if ([...node.classList].some(c => _TR_SKIP_CLASSES.has(c))) return;
    if (node.hasAttribute('data-no-translate')) return;
    // Skip already translated to the current language
    if (node.dataset.translated === radarLanguage) return;
    if (node.children.length === 0) {
      const text = (node.dataset.originalText || node.textContent || '').trim();
      if (text.length >= 4 && !_TR_SKIP_RE.test(text)) els.push(node);
    } else {
      [...node.children].forEach(walk);
    }
  };
  // Walk root itself so leaf elements passed directly (e.g. after textContent update) are collected
  walk(root);
  return els;
}

async function translatePage(root = document.body) {
  if (!radarLanguage) return;
  const { openai } = await getKeys();
  if (!openai) return;

  // Wait for any in-flight cache load from storage before checking what's uncached
  await _cacheLoadPromise;

  const elements = _collectTranslatables(root);
  if (!elements.length) return;

  const texts    = elements.map(el => el.dataset.originalText || el.textContent.trim());
  const uncached = [...new Set(texts.filter(t => t && !translationCache.has(t)))];

  const needsOverlay = uncached.length > 3 && root === document.body;
  if (needsOverlay) showTranslationOverlay(I18N_LANG_NAMES[radarLanguage] || radarLanguage);

  if (uncached.length) {
    const chunks = [];
    for (let i = 0; i < uncached.length; i += 60) chunks.push(uncached.slice(i, i + 60));
    const allResults = await Promise.all(chunks.map(c => translateTitles(c, radarLanguage, openai)));
    allResults.forEach(r => Object.entries(r).forEach(([k, v]) => translationCache.set(k, v)));
    // Persist new translations so the next page load (or dashboard page) gets them for free
    saveTranslationCache(radarLanguage);
  }

  elements.forEach(el => {
    const orig  = el.dataset.originalText || el.textContent.trim();
    const trans = translationCache.get(orig);
    if (trans && trans !== orig) {
      if (!el.dataset.originalText) el.dataset.originalText = orig;
      el.textContent = trans;
      el.dataset.translated = radarLanguage;
    }
  });

  if (needsOverlay) hideTranslationOverlay();
}

let _trObserver = null;
let _trTimer    = null;
let _trPending  = new Set();
function watchAndTranslate() {
  if (_trObserver) _trObserver.disconnect();
  if (!radarLanguage) return;
  _trObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach(n => {
        if (n.nodeType === Node.ELEMENT_NODE) _trPending.add(n);
        // textContent changes create a Text node — translate the parent element instead
        else if (n.nodeType === Node.TEXT_NODE && n.parentElement) _trPending.add(n.parentElement);
      });
    }
    if (!_trPending.size) return;
    clearTimeout(_trTimer);
    _trTimer = setTimeout(() => {
      const roots = [..._trPending];
      _trPending.clear();
      roots.forEach(r => translatePage(r));
    }, 200);
  });
  _trObserver.observe(document.body, { childList: true, subtree: true });
}

const SORT_MODES = [
  { key: 'conf-desc', label: 'Conf ↓' },
  { key: 'conf-asc',  label: 'Conf ↑' },
  { key: 'name-asc',  label: 'A–Z'    },
  { key: 'recent',    label: 'Recent'  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC HEALTH SCORE
// Composite 0–100 score across four signals:
//   Article volume (25pts) · Confidence momentum (25pts)
//   Belief openness (25pts) · Source diversity (25pts)
//
// Goal-type topics (OKRs, objectives, targets) are excluded — they don't
// live in a news cycle so the news-based scoring signals don't apply.
// ─────────────────────────────────────────────────────────────────────────────

const GOAL_TOPIC_PATTERNS = [
  /^(achieve|grow|increase|decrease|reduce|improve|launch|build|reach|deliver|complete|drive|expand|develop|deploy|implement|hit|attain|raise|cut|boost|scale)\b/i,
  /\b\d+\s*%/,
  /\b(goal|objective|okr|target|kpi|milestone|initiative|strategy|roadmap|plan|quota)\b/i,
  /\b(by (end of|q[1-4]|the|fiscal|calendar)|fiscal year|this year|next year|q[1-4] \d{4}|h[12] \d{4})\b/i,
  /\b(sign.?ups?|revenue|sales|conversion|retention|churn|nps|csat|mrr|arr)\b/i,
];

function isGoalTopic(topicName) {
  if (!topicName) return false;
  const t = topicName.trim();
  // Long topics phrased as sentences are almost always goals/objectives
  if (t.length > 60 && t.split(' ').length > 8) return true;
  return GOAL_TOPIC_PATTERNS.some(re => re.test(t));
}

function topicHealthScore(s, topicName) {
  if (!s) return null;
  if (isGoalTopic(topicName)) return null;
  const hasData = (s.articles?.length || 0) + (s.beliefs?.length || 0);
  if (!hasData) return null;

  let score = 0;

  // 1. Article volume — proxy for whether topic is still in active news cycle
  const artCount = (s.articles || []).length;
  score += artCount >= 10 ? 25 : artCount >= 6 ? 20 : artCount >= 3 ? 12 : artCount >= 1 ? 6 : 0;

  // 2. Confidence momentum — still evolving = healthy, plateau = cooling
  const delta = topicTrendDelta(s.beliefs || []);
  score += delta?.cls === 'up' ? 25 : delta?.cls === 'flat' ? 15 : delta?.cls === 'down' ? 8 : 12;

  // 3. Belief openness — unresolved beliefs mean open questions still worth tracking
  const active = (s.beliefs || []).filter(b => b.status !== 'archived');
  const open   = active.filter(b => b.status !== 'confirmed' && b.status !== 'falsified');
  const openRatio = active.length > 0 ? open.length / active.length : 0;
  score += Math.round(openRatio * 25);

  // 4. Source diversity — narrow sourcing signals echo chamber / topic exhaustion
  const sources = new Set((s.articles || []).map(a => a.source).filter(Boolean));
  score += sources.size >= 6 ? 25 : sources.size >= 4 ? 18 : sources.size >= 2 ? 10 : sources.size === 1 ? 5 : 0;

  return Math.min(100, score);
}

function healthMeta(score) {
  if (score === null) return null;
  if (score >= 70) return { label: 'Active',  color: '#10b981', tier: 'active'  };
  if (score >= 40) return { label: 'Cooling', color: '#f59e0b', tier: 'cooling' };
  return                  { label: 'Stale',   color: '#ef4444', tier: 'stale'   };
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH BANNER DIAGNOSIS
// Surfaces the specific signals dragging the health score down so the user
// understands *why* a topic is cooling/stale, not just that it is.
// ─────────────────────────────────────────────────────────────────────────────

function buildHealthBannerDesc(s, tier) {
  const artCount = (s.articles || []).length;
  const sources  = new Set((s.articles || []).map(a => a.source).filter(Boolean)).size;
  const beliefs  = (s.beliefs  || []).filter(b => b.status !== 'archived');
  const avgConf  = avgConfidence(beliefs);
  const delta    = topicTrendDelta(beliefs);

  const causes = [];

  // Article volume
  if (artCount === 0) {
    causes.push('no articles in the feed — the topic isn\'t surfacing news');
  } else if (artCount <= 2) {
    causes.push(`only ${artCount} article${artCount !== 1 ? 's' : ''} in the feed (10+ needed for a healthy signal)`);
  } else if (artCount < 6) {
    causes.push(`low article volume (${artCount} articles — aim for 6+)`);
  }

  // Source diversity
  if (sources <= 1 && artCount > 0) {
    causes.push('all articles from a single source — signal diversity is very narrow');
  } else if (sources <= 2 && artCount > 1) {
    causes.push(`only ${sources} unique sources — limited signal diversity`);
  } else if (sources < 4) {
    causes.push(`narrow sourcing (${sources} sources — 4+ recommended)`);
  }

  // Settled beliefs: high confidence + flat/down trend = topic is learned, not growing
  if (avgConf !== null && avgConf >= 65 && delta?.cls !== 'up') {
    causes.push(`beliefs have stabilised at ${avgConf}% confidence — your understanding of this topic is solid but no longer expanding`);
  }

  if (causes.length === 0) {
    return tier === 'stale'
      ? 'Confidence has plateaued and article volume is low. This topic may have peaked.'
      : 'New signals are slowing. Consider evolving before it goes stale.';
  }

  const intro = tier === 'stale' ? 'Flagged because' : 'Slowing because';
  if (causes.length === 1) return `${intro}: ${causes[0]}.`;
  const last = causes.pop();
  return `${intro}: ${causes.join('; ')} — and ${last}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC SETS (tabbed boards)
// ─────────────────────────────────────────────────────────────────────────────

function generateTopicSetId() {
  return 'set_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function rebuildHotListFromSets(sets) {
  const u = new Set();
  (sets || []).forEach(s => (s.topics || []).forEach(t => u.add(t)));
  return [...u];
}

function normalizeTopicSetProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const competitors = Array.isArray(profile.competitors)
    ? profile.competitors.filter(Boolean).slice(0, 3)
    : [];
  return {
    source: profile.source === 'profile' ? 'profile' : 'manual',
    career: profile.career || '',
    account: profile.account || '',
    role: profile.role || '',
    keywords: profile.keywords || '',
    includeCompetitors: !!profile.includeCompetitors,
    competitors,
    generatedAt: profile.generatedAt || null
  };
}

function formatTopicSetProfileDate(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildManualTopicSetName(topic) {
  const clean = String(topic || '').replace(/\s+/g, ' ').trim();
  if (!clean) return `Board ${topicSets.length + 1}`;
  return clean.length > 42 ? `${clean.slice(0, 39).trimEnd()}…` : clean;
}

function isEmptyPlaceholderSet(set) {
  return !!set && (!set.profile) && (!set.topics || set.topics.length === 0);
}

function deriveStoredTopics(data = {}) {
  const articleTopics = Object.keys(data.trackerArticles || {});
  const scannedTopics = Object.keys(data.trackerLastScanned || {});
  const beliefTopics = (data.tracker_hypotheses || []).map(h => h?.topic).filter(Boolean);
  const hotListTopics = (data.hotList || []).filter(Boolean);
  return [...new Set([...hotListTopics, ...articleTopics, ...scannedTopics, ...beliefTopics])];
}

function sanitizeTopicSets(rawSets) {
  return (rawSets || [])
    .filter(set => set && set.id)
    .map(set => syncTopicSetTopicQueries({
      ...set,
      name: set.name || 'Untitled board',
      profile: normalizeTopicSetProfile(set.profile)
    }));
}

function getActiveSet() {
  return topicSets.find(s => s.id === activeTopicSetId) || topicSets[0] || null;
}

function renderActiveSetContext() {
  const el = document.getElementById('t-set-context');
  if (!el) return;
  const set = getActiveSet();
  if (!set) {
    el.innerHTML = '';
    return;
  }

  const profile = normalizeTopicSetProfile(set.profile);
  const chips = [];
  if (profile?.career) chips.push(`<span class="t-set-context-chip"><span class="t-set-context-chip-label">Industry</span>${esc(profile.career)}</span>`);
  if (profile?.account) chips.push(`<span class="t-set-context-chip"><span class="t-set-context-chip-label">Brand</span>${esc(profile.account)}</span>`);
  if (profile?.role) chips.push(`<span class="t-set-context-chip"><span class="t-set-context-chip-label">Role</span>${esc(profile.role)}</span>`);
  if (profile?.keywords) chips.push(`<span class="t-set-context-chip"><span class="t-set-context-chip-label">Priority</span>${esc(profile.keywords)}</span>`);
  if (profile?.includeCompetitors) {
    const competitorsLabel = profile.competitors.length
      ? profile.competitors.join(', ')
      : 'Included in topic generation';
    chips.push(`<span class="t-set-context-chip"><span class="t-set-context-chip-label">Competitors</span>${esc(competitorsLabel)}</span>`);
  }
  if (!chips.length) {
    chips.push(`<span class="t-set-context-chip"><span class="t-set-context-chip-label">Board</span>Manual setup</span>`);
  }

  const generatedDate = formatTopicSetProfileDate(profile?.generatedAt);
  const metaLine = profile?.source === 'profile'
    ? `Generated from saved profile inputs${generatedDate ? ` · ${generatedDate}` : ''}`
    : `Manual board${generatedDate ? ` · ${generatedDate}` : ''}`;

  el.innerHTML = `
    <div class="t-set-context-copy">
      <div class="t-set-context-chips">${chips.join('')}</div>
    </div>
    <div class="t-set-context-meta">
      <span class="t-set-context-meta-line">${metaLine}</span>
      <span class="t-set-context-meta-line">${(set.topics || []).length} tracked topic${(set.topics || []).length === 1 ? '' : 's'}</span>
    </div>
  `;
}

function applyActiveSetTopics() {
  const set = getActiveSet();
  allTopics = set ? [...(set.topics || [])] : [];
}

function migrateTopicSetsIfNeeded(data) {
  const fallbackTopics = deriveStoredTopics(data);
  const normalizedSets = sanitizeTopicSets(data.topicSets);
  const normalizedUnion = rebuildHotListFromSets(normalizedSets);

  if (normalizedSets.length > 0 && normalizedUnion.length > 0) {
    let aid = data.activeTopicSetId;
    if (!normalizedSets.some(s => s.id === aid)) aid = normalizedSets[0].id;
    return {
      topicSets: normalizedSets,
      activeTopicSetId: aid,
      lastTopicBySetId: data.lastTopicBySetId || {},
      migrated: false
    };
  }

  if (normalizedSets.length > 0 && fallbackTopics.length > 0) {
    const repairedSets = normalizedSets.map((set, idx) => {
      if ((set.topics || []).length > 0 || idx !== 0) return set;
      return { ...set, topics: [...fallbackTopics] };
    });
    if (rebuildHotListFromSets(repairedSets).length === 0) {
      repairedSets[0].topics = [...fallbackTopics];
    }
    let aid = data.activeTopicSetId;
    if (!repairedSets.some(s => s.id === aid)) aid = repairedSets[0].id;
    return {
      topicSets: repairedSets,
      activeTopicSetId: aid,
      lastTopicBySetId: data.lastTopicBySetId || {},
      migrated: true,
      hotList: rebuildHotListFromSets(repairedSets)
    };
  }

  const topicSets = [{
    id: generateTopicSetId(),
    name: 'Board 1',
    profile: null,
    topicRecords: [],
    topics: [...fallbackTopics]
  }];
  return {
    topicSets,
    activeTopicSetId: topicSets[0].id,
    lastTopicBySetId: {},
    migrated: true,
    hotList: rebuildHotListFromSets(topicSets)
  };
}

async function saveTopicSetsState() {
  topicSets.forEach(syncTopicSetTopicQueries);
  const hotList = rebuildHotListFromSets(topicSets);
  await new Promise(r => chrome.storage.local.set({
    topicSets,
    activeTopicSetId,
    lastTopicBySetId,
    hotList
  }, r));
}

async function purgeTopicFromStorageIfOrphan(topic) {
  if (rebuildHotListFromSets(topicSets).includes(topic)) return;
  evolveReadyCache.delete(topic);
  delete state[topic];
  const tsData = await new Promise(r => chrome.storage.local.get(['trackerLastScanned', 'trackerArticles', 'tracker_hypotheses'], r));
  const ts = tsData.trackerLastScanned || {};
  delete ts[topic];
  const arts = tsData.trackerArticles || {};
  delete arts[topic];
  const hyps = (tsData.tracker_hypotheses || []).filter(h => h.topic !== topic);
  await new Promise(r => chrome.storage.local.set({
    trackerLastScanned: ts,
    trackerArticles: arts,
    tracker_hypotheses: hyps
  }, r));
}

function findSetIdContainingTopic(topic) {
  const s = topicSets.find(x => (x.topics || []).includes(topic));
  return s ? s.id : null;
}

function renderTopicSetTabs() {
  const wrap = document.getElementById('t-set-tabs');
  if (!wrap) return;
  wrap.innerHTML = topicSets.map(set => `
    <button type="button" role="tab" aria-selected="${set.id === activeTopicSetId}" class="t-set-tab${set.id === activeTopicSetId ? ' active' : ''}" data-set-id="${esc(set.id)}">
      <span class="t-set-tab-label">${esc(set.name)}</span>
      <span class="t-set-tab-close" data-close-set="${esc(set.id)}" title="Delete board" role="presentation" aria-hidden="true">×</span>
    </button>
  `).join('');

  wrap.querySelectorAll('.t-set-tab[data-set-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.t-set-tab-close')) return;
      switchTopicSet(btn.dataset.setId);
    });
  });
  wrap.querySelectorAll('.t-set-tab-close').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTopicSet(el.dataset.closeSet);
    });
  });
  renderActiveSetContext();
}

async function switchTopicSet(setId, preferredTopic = null) {
  if (!setId || setId === activeTopicSetId) return;
  if (!topicSets.some(s => s.id === setId)) return;
  lastTopicBySetId[activeTopicSetId] = selectedTopic || null;
  activeTopicSetId = setId;
  applyActiveSetTopics();
  await new Promise(r => chrome.storage.local.set({ activeTopicSetId, lastTopicBySetId }, r));
  let pick = null;
  if (preferredTopic && allTopics.includes(preferredTopic)) pick = preferredTopic;
  else {
    const remembered = lastTopicBySetId[setId];
    pick = remembered && allTopics.includes(remembered) ? remembered : (allTopics[0] || null);
  }
  selectedTopic = pick;
  renderTopicSetTabs();
  renderSidebar();
  renderDetail(selectedTopic);
}

async function addTopicSet() {
  const n = topicSets.length + 1;
  let nextSet = { id: generateTopicSetId(), name: `Board ${n}`, profile: null, topicRecords: [], topics: [] };

  if (WEB_RUNTIME) {
    const board = await createTopicBoardViaApi({
      name: `Board ${n}`,
      originType: 'manual',
      profileSnapshot: null
    });
    nextSet = buildTopicSetFromApiBoard(board);
  }

  topicSets.push(nextSet);
  activeTopicSetId = topicSets[topicSets.length - 1].id;
  lastTopicBySetId[activeTopicSetId] = null;
  applyActiveSetTopics();
  selectedTopic = null;
  await saveTopicSetsState();
  renderTopicSetTabs();
  renderSidebar();
  renderDetail(null);
}

async function addTrackedTopicToNewBoard(topic) {
  topic = topic.trim();
  if (!topic) return;

  const existingSetId = findSetIdContainingTopic(topic);
  if (existingSetId) {
    await switchTopicSet(existingSetId, topic);
    return;
  }

  const manualProfile = normalizeTopicSetProfile({
    source: 'manual',
    generatedAt: new Date().toISOString()
  });

  if (!state[topic]) state[topic] = { articles: [], beliefs: [], scanning: false, lastScanned: null };

  const activeSet = getActiveSet();
  if (isEmptyPlaceholderSet(activeSet)) {
    if (WEB_RUNTIME && activeSet?.id) {
      const updatedBoard = await updateTopicBoardViaApi(activeSet.id, {
        name: buildManualTopicSetName(topic),
        profileSnapshot: manualProfile
      });
      updateLocalSetFromApiBoard(activeSet, updatedBoard);
      const createdTopic = await createTopicViaApi({ boardId: activeSet.id, query: topic });
      activeSet.topicRecords = [...(activeSet.topicRecords || []), normalizeTopicRecord(createdTopic)];
      syncTopicSetTopicQueries(activeSet);
    }

    activeSet.name = buildManualTopicSetName(topic);
    activeSet.profile = manualProfile;
    if (!WEB_RUNTIME) activeSet.topics = [topic];
    lastTopicBySetId[activeSet.id] = topic;
    applyActiveSetTopics();
    selectedTopic = topic;
    await saveTopicSetsState();
    renderTopicSetTabs();
    renderSidebar();
    renderDetail(topic);
  } else {
    const newSet = WEB_RUNTIME
      ? buildTopicSetFromApiBoard(await createTopicBoardViaApi({
          name: buildManualTopicSetName(topic),
          originType: 'manual',
          profileSnapshot: manualProfile
        }))
      : {
          id: generateTopicSetId(),
          name: buildManualTopicSetName(topic),
          profile: manualProfile,
          topicRecords: [],
          topics: [topic]
        };

    if (WEB_RUNTIME) {
      const createdTopic = await createTopicViaApi({ boardId: newSet.id, query: topic });
      newSet.topicRecords = [normalizeTopicRecord(createdTopic)];
      syncTopicSetTopicQueries(newSet);
    }

    if (activeTopicSetId) lastTopicBySetId[activeTopicSetId] = selectedTopic || null;
    topicSets.push(newSet);
    activeTopicSetId = newSet.id;
    lastTopicBySetId[activeTopicSetId] = topic;
    applyActiveSetTopics();
    selectedTopic = topic;
    await saveTopicSetsState();
    renderTopicSetTabs();
    renderSidebar();
    renderDetail(topic);
  }

  await scanTopic(topic);
  chrome.storage.local.get(['hotList'], dd => renderProChips(dd.hotList || []));
}

async function deleteTopicSet(setId) {
  if (!setId) return;
  const removed = topicSets.find(s => s.id === setId);
  if (!removed) return;
  if (!window.confirm(`Delete ${removed.name}? This will remove the board and its orphaned topic state.`)) return;
  const before = rebuildHotListFromSets(topicSets);

  if (WEB_RUNTIME) {
    const response = await deleteTopicBoardViaApi(setId);
    topicSets = (response.boards || []).map(buildTopicSetFromApiBoard);
    const nextLastTopicBySetId = {};
    Object.entries(lastTopicBySetId).forEach(([boardId, topic]) => {
      if (boardId !== setId && topicSets.some(set => set.id === boardId)) nextLastTopicBySetId[boardId] = topic;
    });
    lastTopicBySetId = nextLastTopicBySetId;
  } else {
    topicSets = topicSets.filter(s => s.id !== setId);
  }

  const after = rebuildHotListFromSets(topicSets);
  const dropped = before.filter(t => !after.includes(t));
  for (const t of dropped) {
    await purgeTopicFromStorageIfOrphan(t);
  }
  delete lastTopicBySetId[setId];
  if (topicSets.length === 0) {
    const freshSet = { id: generateTopicSetId(), name: 'Board 1', profile: null, topicRecords: [], topics: [] };
    topicSets = [freshSet];
    activeTopicSetId = freshSet.id;
    selectedTopic = null;
    lastTopicBySetId = {};
  }
  if (activeTopicSetId === setId) {
    activeTopicSetId = topicSets[0].id;
  }
  applyActiveSetTopics();
  const remembered = lastTopicBySetId[activeTopicSetId];
  selectedTopic = remembered && allTopics.includes(remembered) ? remembered : (allTopics[0] || null);
  await saveTopicSetsState();
  renderTopicSetTabs();
  renderSidebar();
  renderDetail(selectedTopic);
  chrome.storage.local.get(['hotList'], dd => renderProChips(dd.hotList || []));
}

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-TOPIC DEDUPLICATION
// After each scan, strip articles that already appear in another topic's feed.
// The most-recently-scanned topic keeps the article (freshest claim wins).
// ─────────────────────────────────────────────────────────────────────────────

function deduplicateArticlesAcrossTopics() {
  const seen = new Map(); // normalised link → topic that claimed it
  const globalTopics = rebuildHotListFromSets(topicSets);

  // Process in scan-recency order so the freshest scan keeps each article
  const sorted = [...globalTopics].sort((a, b) => {
    const tA = state[a]?.lastScanned ? new Date(state[a].lastScanned).getTime() : 0;
    const tB = state[b]?.lastScanned ? new Date(state[b].lastScanned).getTime() : 0;
    return tB - tA;
  });

  for (const topic of sorted) {
    if (!state[topic]?.articles) continue;
    const deduped = [];
    for (const article of state[topic].articles) {
      const key = (article.link || article.url || article.title || '').toLowerCase().trim();
      if (!key) { deduped.push(article); continue; }
      if (!seen.has(key)) {
        seen.set(key, topic);
        deduped.push(article);
      }
    }
    state[topic].articles = deduped;
  }

  // Persist cleaned articles
  chrome.storage.local.get('trackerArticles', d => {
    const arts = d.trackerArticles || {};
    for (const topic of globalTopics) {
      if (state[topic]?.articles) arts[topic] = state[topic].articles;
    }
    chrome.storage.local.set({ trackerArticles: arts });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC SIMILARITY CHECK  (Jaccard word-overlap, threshold 0.45)
// Returns the name of an existing similar topic, or null if distinct enough.
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(['the','a','an','in','on','at','by','for','of','to','and','or','is','are','with','through','into','from','that','this','will','can','be','its','it','as','how']);

function topicSimilarityCheck(newTopic, existing) {
  const tokenise = str => new Set(
    str.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w))
  );
  const newWords = tokenise(newTopic);
  if (!newWords.size) return null;
  for (const t of existing) {
    const existWords = tokenise(t);
    const intersection = [...newWords].filter(w => existWords.has(w)).length;
    const union = new Set([...newWords, ...existWords]).size;
    if (union > 0 && intersection / union > 0.45) return t;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVOLVE TOPIC — LLM-powered replacement suggestions
// ─────────────────────────────────────────────────────────────────────────────

async function suggestTopicEvolution(topic, s) {
  const { openai } = await getKeys();
  if (!openai) return null;

  const artCount    = (s.articles || []).length;
  const beliefs     = (s.beliefs || []).filter(b => b.status !== 'archived');
  const resolved    = beliefs.filter(b => b.status === 'confirmed' || b.status === 'falsified').length;
  const avgConf     = avgConfidence(beliefs) ?? null;
  const delta       = topicTrendDelta(beliefs);
  const sources     = new Set((s.articles || []).map(a => a.source).filter(Boolean)).size;
  const healthScore = topicHealthScore(s, topic) ?? null;
  const isGoal      = isGoalTopic(topic);

  // ── LOCAL PRE-CHECK: override recommend when the data makes it unambiguous ──
  // We compute this before the LLM call and pass it in so the LLM cannot
  // contradict clear signal evidence.
  const TIME_BOUND = /\b(next quarter|this quarter|by mid.?year|end of (the |fiscal |calendar )?year|q[1-4] \d{4}|h[12] \d{4}|within \d+ (weeks?|months?))\b/i;
  const forceEvolve =
    (isGoal && (healthScore === null || healthScore < 50)) ||
    (isGoal && TIME_BOUND.test(topic) && artCount < 6)    ||
    (healthScore !== null && healthScore < 30)             ||
    (avgConf !== null && avgConf < 30 && delta?.cls !== 'up' && artCount < 5);

  // Strong “keep on radar” when signals are healthy — pairs with LLM recommendTrack
  const forceTrack =
    !forceEvolve &&
    (healthScore === null || healthScore >= 38) &&
    (
      (healthScore !== null && healthScore >= 55 && artCount >= 4 && delta?.cls !== 'down') ||
      (avgConf !== null && avgConf >= 65 && artCount >= 5 && (delta?.cls === 'up' || delta?.cls === 'flat')) ||
      (healthScore !== null && healthScore >= 62 && delta?.cls !== 'down') ||
      (isGoal && !TIME_BOUND.test(topic) && artCount >= 6 && avgConf !== null && avgConf >= 55)
    );

  const beliefSummary = beliefs.slice(0, 3)
    .map(b => `- ${b.claim} (${b.confidence}% confidence, status: ${b.status || 'active'})`)
    .join('\n') || 'None yet';

  const signals = [
    `Articles in feed: ${artCount}`,
    `Unique sources: ${sources}`,
    `Average belief confidence: ${avgConf !== null ? avgConf + '%' : 'unknown'}`,
    `Confidence trend: ${delta?.cls || 'unknown'} (${delta?.val || 'no data'})`,
    `Resolved beliefs: ${resolved} of ${beliefs.length}`,
    `Signal health score: ${healthScore !== null ? healthScore + '/100' : 'N/A'}`,
    `Topic type: ${isGoal ? 'Goal/OKR' : 'Intelligence topic'}`,
  ].join('\n');

  const profileLines = [
    radarCareer   ? `Industry: ${radarCareer}`          : '',
    radarAccount  ? `Brand/Company: ${radarAccount}`    : '',
    radarRole     ? `Role: ${radarRole}`                : '',
    radarKeywords ? `Priority themes: ${radarKeywords}` : '',
  ].filter(Boolean).join('\n');

  const verdictInstruction = forceEvolve
    ? `IMPORTANT: The signal data above clearly indicates this topic should be evolved. Set "recommend" to true and "recommendTrack" to false. Write honest reasoning that explains the specific weak signals driving this conclusion.`
    : `Evaluate the signals honestly.
- Set "recommend" to true only if the topic should be replaced (stale, peaked, or no longer generating useful intelligence).
- Set "recommendTrack" to true when the topic is still worth keeping on the radar: timely articles, useful beliefs, momentum, or clear relevance — even if you also see minor gaps.
- If "recommend" is true, "recommendTrack" must be false (you are replacing the topic, not endorsing the current string).
- If signals are genuinely weak on both dimensions, set both to false.
Do NOT hedge — make a clear call.`;

  const prompt = `You are an intelligence strategist advising on a tracked topic: whether to evolve it into a better query, and whether it is still worth actively tracking.

Topic: "${topic}"
${profileLines ? `\nUser profile:\n${profileLines}\n` : ''}
Current signals:
${signals}

Current beliefs:
${beliefSummary}

${verdictInstruction}

Respond with a JSON object in this exact format:
{
  "recommend": true or false,
  "recommendTrack": true or false,
  "reasoning": "2-3 sentences citing the specific signals above — do not contradict the data",
  "suggestions": ["topic 1", "topic 2", "topic 3"]
}

Rules for suggestions:
- Tailored to the user's industry, brand, and role context if provided
- News-searchable topics that return real current articles
- Semantically distinct from each other
- If goal/OKR: upstream intelligence topics that feed the goal, NOT phrased as goals
- If intelligence topic: more current, specific, or adjacent angles
- Always provide 3 suggestions regardless of recommend value`;

  try {
    const data = await requestOpenAIChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 420,
      temperature: 0.6,
    });
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.suggestions?.length) return null;
    let recommend = !!parsed.recommend;
    let recommendTrack = !!parsed.recommendTrack;
    // Local rules + LLM: evolve wins over keep-tracking; forceEvolve wins over model
    if (forceEvolve) {
      recommend = true;
      recommendTrack = false;
    } else if (recommend) {
      recommendTrack = false;
    } else if (forceTrack) {
      recommendTrack = true;
    }
    return {
      ...parsed,
      recommend,
      recommendTrack,
      ruleForced: !!forceEvolve,
      trackForced: !!forceTrack && recommendTrack
    };
  } catch { return null; }
}

/** Primary CTA — evolve vs keep-tracking vs neutral assessment (cached). */
function getEvolvePrimaryLabel(topic) {
  const c = evolveReadyCache.get(topic);
  const stale = !c || (Date.now() - c.cachedAt) >= EVOLVE_CACHE_TTL_MS;
  if (stale) return 'View signal assessment →';
  if (c.recommend) {
    return c.ruleForced
      ? 'Evolve recommended (strong signals) →'
      : 'Evolve recommended →';
  }
  if (c.recommendTrack) {
    return c.trackForced
      ? 'Keep tracking recommended (strong signals) →'
      : 'Keep tracking recommended →';
  }
  return 'Explore optional topic angles →';
}

// Renders the evolve chip panel for a given topic + result — shared by both
// the manual button click and the instant-open path from the sidebar badge.
function renderEvolveChips(evolveTopic, recommend, recommendTrack, reasoning, suggestions, ruleForced = false, trackForced = false) {
  document.querySelectorAll('.t-evolve-open').forEach(el => el.style.setProperty('display', 'none'));

  let container = document.getElementById('t-evolve-chips');
  if (!container) {
    container = document.createElement('div');
    container.id = 't-evolve-chips';
    container.className = 't-evolve-chips';
    const banner = document.getElementById('t-health-banner');
    const detailHd = document.querySelector('.t-detail-hd');
    (banner || detailHd)?.after(container);
  }

  let verdictClass = 't-evolve-verdict--no';
  let verdictLabel = '○ No strong recommendation';
  if (recommend) {
    verdictClass = 't-evolve-verdict--yes';
    verdictLabel = ruleForced ? '✦ Evolve — rule signals' : '✦ Evolve recommended';
  } else if (recommendTrack) {
    verdictClass = 't-evolve-verdict--track';
    verdictLabel = trackForced ? '✓ Keep tracking — rule signals' : '✓ Keep tracking recommended';
  } else {
    verdictLabel = '○ Assessment: optional change only';
  }

  let chipsLead = '';
  let footNote = '';
  if (recommend) {
    chipsLead = `Replace <strong>"${esc(evolveTopic)}"</strong> with:`;
    footNote = 'Selecting a suggestion replaces this topic and triggers a fresh scan.';
  } else if (recommendTrack) {
    chipsLead = `Signals support keeping <strong>"${esc(evolveTopic)}"</strong> on your radar. Optional sharper angles if you want to experiment:`;
    footNote = 'Keeping the topic as-is is the recommended move. Suggestions are optional alternatives.';
  } else {
    chipsLead = `Optional — try a sharper or adjacent angle for <strong>"${esc(evolveTopic)}"</strong>:`;
    footNote = 'No change is required — use a suggestion only if you want a different focus.';
  }

  container.innerHTML = `
    <div class="t-evolve-verdict ${verdictClass}">
      <span class="t-evolve-verdict-badge">${verdictLabel}</span>
      <p class="t-evolve-reasoning">${esc(reasoning)}</p>
    </div>
    <div class="t-evolve-chips-label">
      ${chipsLead}
    </div>
    <div class="t-evolve-chips-row">
      ${suggestions.map(s => `<button class="t-evolve-chip" data-suggestion="${esc(s)}">${esc(s)}</button>`).join('')}
    </div>
    <div class="t-evolve-note">${footNote}</div>`;

  container.querySelectorAll('.t-evolve-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const newName = chip.dataset.suggestion;
      if (!newName) return;
      await renameTopic(evolveTopic, newName);
    });
  });
}

// Runs after each scan, silently — calls suggestTopicEvolution in the background
// and caches the result so the evolve panel opens instantly when the user acts.
async function backgroundEvolveCheck(topic) {
  const s = state[topic];
  if (!s?.articles?.length || !s?.beliefs?.length) return;
  const cached = evolveReadyCache.get(topic);
  if (cached && (Date.now() - cached.cachedAt) < EVOLVE_CACHE_TTL_MS) return;
  const result = await suggestTopicEvolution(topic, s);
  if (!result) return;
  evolveReadyCache.set(topic, { ...result, cachedAt: Date.now() });
  renderSidebar(); // badge + labels when recommendation changes
  if (selectedTopic === topic) renderDetail(topic); // refresh evolve CTA copy for open topic
}

function avgConfidence(beliefs) {
  if (!beliefs.length) return null;
  return Math.round(beliefs.reduce((s, b) => s + b.confidence, 0) / beliefs.length);
}

function topicTrendDelta(beliefs) {
  if (!beliefs || beliefs.length === 0) return null;

  // Mirror the same revisionHistory delta calculation used by individual belief cards
  let totalDelta = 0;
  let counted = 0;
  for (const b of beliefs) {
    const hist = b.revisionHistory || [];
    if (hist.length < 2) continue;
    const lastConf = hist[hist.length - 1].newConfidence;
    const compareIdx = Math.max(0, hist.length - 4);
    const compareConf = hist[compareIdx].newConfidence;
    totalDelta += lastConf - compareConf;
    counted++;
  }

  if (counted === 0) return null;
  const avg = Math.round(totalDelta / counted);
  if (avg > 2)  return { val: `+${avg}%`, cls: 'up' };
  if (avg < -2) return { val: `${avg}%`,  cls: 'down' };
  return { val: '→', cls: 'flat' };
}


function renderSidebar() {
  const list = document.getElementById('topic-list');
  const sortedTopics = [...allTopics].sort((a, b) => {
    if (sidebarSortMode === 'conf-desc') {
      return (avgConfidence((state[b]||{}).beliefs||[]) ?? -1) - (avgConfidence((state[a]||{}).beliefs||[]) ?? -1);
    }
    if (sidebarSortMode === 'conf-asc') {
      return (avgConfidence((state[a]||{}).beliefs||[]) ?? -1) - (avgConfidence((state[b]||{}).beliefs||[]) ?? -1);
    }
    if (sidebarSortMode === 'name-asc') {
      return a.localeCompare(b);
    }
    if (sidebarSortMode === 'recent') {
      const tA = state[a]?.lastScanned ? new Date(state[a].lastScanned).getTime() : 0;
      const tB = state[b]?.lastScanned ? new Date(state[b].lastScanned).getTime() : 0;
      return tB - tA;
    }
    return 0;
  });
  const ORDINALS = ['1ST','2ND','3RD','4TH','5TH','6TH','7TH','8TH','9TH','10TH'];
  list.innerHTML = sortedTopics.map((topic, idx) => {
    const s = state[topic] || {};
    const avg = avgConfidence(s.beliefs || []);
    const confColor = avg >= 75 ? '#10b981' : avg >= 60 ? '#f59e0b' : avg ? '#ef4444' : 'var(--dim)';
    const delta = topicTrendDelta(s.beliefs || []);
    const trendClass = delta?.cls === 'up' ? 'trend-up' : delta?.cls === 'down' ? 'trend-down' : 'trend-flat';
    const rank = ORDINALS[idx] || `${idx + 1}TH`;
    const metaText = s.scanning ? '' : s.lastScanned
      ? `${(s.articles||[]).length} ${tl('stat_articles')} · ${timeAgo(s.lastScanned)}`
      : tl('topic_not_scanned');
    const arrowIcon = delta?.cls === 'up' ? '↑' : delta?.cls === 'down' ? '↓' : '→';
    const hs = topicHealthScore(s, topic);
    const hm = healthMeta(hs);
    const ev = evolveReadyCache.get(topic);
    let evolveBadge = '';
    if (ev?.recommend) {
      evolveBadge = `<div class="t-evolve-ready-badge" data-topic="${esc(topic)}">${ev.ruleForced ? '↗ Strong signals — evolve' : '↗ Evolve recommended'}</div>`;
    } else if (ev?.recommendTrack) {
      evolveBadge = `<div class="t-track-ready-badge" data-topic="${esc(topic)}">${ev.trackForced ? '◎ Strong signals — keep tracking' : '◎ Keep tracking recommended'}</div>`;
    }
    return `
      <div class="t-topic-row${selectedTopic === topic ? ' active' : ''}" data-topic="${esc(topic)}">
        <div class="t-topic-view">
          <div class="t-topic-top">
            <div class="t-topic-rank-meta">
              <div class="t-belief-rank">${rank}</div>
              <div class="t-topic-meta-inline">${s.scanning ? '<span class="t-topic-scanning-badge">Scanning…</span>' : metaText}</div>
            </div>
            ${avg !== null ? `
              <div class="t-topic-conf-stack">
                ${delta ? `<div class="t-belief-delta ${trendClass}">${arrowIcon} ${delta.val}</div>` : ''}
                <div class="t-topic-conf" style="color:${confColor}">${avg}%</div>
                ${hm ? `<div class="t-topic-health-score" style="color:${hm.color}">SH ${hs}</div>` : ''}
              </div>` : ''}
          </div>
          <div class="t-topic-info">
            <div class="t-topic-name-row">
              <div class="t-topic-name">${esc(topic)}</div>
            </div>
            ${evolveBadge}
          </div>
          <div class="t-topic-footer-row">
            <button class="t-topic-action-btn" data-action="edit-topic">${tl('btn_edit')}</button>
            <button class="t-topic-action-btn t-delete" data-action="delete-topic">${tl('btn_remove')}</button>
          </div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.t-topic-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      if (e.target.closest('.t-evolve-ready-badge') || e.target.closest('.t-track-ready-badge')) return; // handled separately
      selectTopic(row.dataset.topic);
    });
  });

  // Badge click: select topic AND instantly open the pre-loaded suggestions panel
  list.querySelectorAll('.t-evolve-ready-badge, .t-track-ready-badge').forEach(badge => {
    badge.addEventListener('click', e => {
      e.stopPropagation();
      const t = badge.dataset.topic;
      selectTopic(t); // renderDetail runs synchronously — DOM is ready
      const cached = evolveReadyCache.get(t);
      if (cached) {
        renderEvolveChips(t, cached.recommend, !!cached.recommendTrack, cached.reasoning, cached.suggestions, !!cached.ruleForced, !!cached.trackForced);
      }
    });
  });

  const countEl = document.getElementById('t-sidebar-count');
  if (countEl) countEl.textContent = allTopics.length;

  const sidebarScanBtn = document.getElementById('sidebar-scan-btn');
  if (sidebarScanBtn) {
    const scanning = selectedTopic ? (state[selectedTopic]?.scanning || false) : false;
    sidebarScanBtn.dataset.topic = selectedTopic || '';
    sidebarScanBtn.disabled = !selectedTopic || scanning;
    sidebarScanBtn.textContent = scanning ? tl('btn_scanning') : tl('btn_scan');
  }
}


function renderDetail(topic) {
  const main = document.getElementById('t-main');
  if (!topic) {
    main.innerHTML = `<div class="t-empty"><div class="t-empty-icon">👈</div><div class="t-empty-title">${tl('empty_topic_title')}</div><div class="t-empty-desc">${tl('empty_topic_desc')}</div></div>`;
    return;
  }

  const s = state[topic] || { articles: [], beliefs: [], scanning: false };
  const beliefCount = (s.beliefs||[]).filter(b => b.status !== 'archived').length;
  const beliefWord = tl('stat_beliefs');
  const healthScore = topicHealthScore(s, topic);
  const hm = healthMeta(healthScore);

  main.innerHTML = `
    <div class="t-detail-hd">
      <div class="t-hd-box t-hd-topic">
        <div class="t-hd-eyebrow">${tl('eyebrow_analyze')}</div>
        <div class="t-detail-title">${esc(topic)}</div>
        <button type="button" class="t-evolve-link t-evolve-open" data-topic="${esc(topic)}" data-no-translate>${getEvolvePrimaryLabel(topic)}</button>
      </div>
      <div class="t-hd-box t-hd-stats">
        <div class="t-detail-stats">
          <div class="t-stat">
            <span class="t-stat-value">${(s.articles||[]).length}</span>
            <span class="t-stat-label">${tl('stat_articles')}</span>
          </div>
          <div class="t-stat">
            <span class="t-stat-value">${beliefCount}</span>
            <span class="t-stat-label">${beliefWord}</span>
          </div>
          ${s.lastScanned ? `
          <div class="t-stat">
            <span class="t-stat-value">${timeAgo(s.lastScanned)}</span>
            <span class="t-stat-label">${tl('stat_scanned')}</span>
          </div>` : ''}
          ${hm ? `
          <div class="t-stat">
            <span class="t-stat-value t-health-value" style="color:${hm.color}">${healthScore}</span>
            <span class="t-stat-label">Signal Health</span>
          </div>` : ''}
        </div>
      </div>
      <div class="t-hd-box t-hd-actions-box">
        <div class="t-detail-actions">
          <div class="t-detail-actions-top">
            <button class="t-action-btn t-bst-btn" id="detail-brief-btn" data-topic="${esc(topic)}" ${s.articles?.length ? '' : 'disabled'}>
              ${tl('btn_brief')}
            </button>
            <a class="t-action-btn t-detail-nav-btn" href="dashboard.html">${tl('btn_home')}</a>
          </div>
          <div class="t-detail-actions-bottom">
            <button class="t-action-btn primary" data-action="open-dispatch">Preview Morning Brief</button>
          </div>
        </div>
      </div>
    </div>
    ${hm?.tier === 'stale' ? `
    <div class="t-health-banner t-health-banner--stale" id="t-health-banner">
      <div class="t-health-banner-icon">⚠</div>
      <div class="t-health-banner-body">
        <div class="t-health-banner-title">Signal Stale (Score: ${healthScore}/100)</div>
        <div class="t-health-banner-desc">${buildHealthBannerDesc(s, 'stale')}</div>
        <button type="button" class="t-evolve-btn t-evolve-open" data-topic="${esc(topic)}" data-no-translate>${getEvolvePrimaryLabel(topic)}</button>
      </div>
      <button class="t-health-banner-dismiss" id="t-health-banner-dismiss">✕</button>
    </div>` : hm?.tier === 'cooling' ? `
    <div class="t-health-banner t-health-banner--cooling" id="t-health-banner">
      <div class="t-health-banner-icon">↓</div>
      <div class="t-health-banner-body">
        <div class="t-health-banner-title">Momentum Slowing (Score: ${healthScore}/100)</div>
        <div class="t-health-banner-desc">${buildHealthBannerDesc(s, 'cooling')}</div>
        <button type="button" class="t-evolve-btn t-evolve-open" data-topic="${esc(topic)}" data-no-translate>${getEvolvePrimaryLabel(topic)}</button>
      </div>
      <button class="t-health-banner-dismiss" id="t-health-banner-dismiss">✕</button>
    </div>` : ''}
    <div class="t-content">
      <div class="t-articles-col">
        <div class="t-col-hd">${tl('col_signals')} · ${(s.articles||[]).length} ${tl('col_results')}</div>
        <div class="t-articles-list" id="detail-articles">${renderArticles(s.articles, s.scanning)}</div>
      </div>
      <div class="t-beliefs-col">
        <div class="t-col-hd">${beliefCount} ${beliefWord} · ${tl('col_beliefs_ranked')}</div>
        <div class="t-beliefs-list" id="detail-beliefs">${renderBeliefs(s.beliefs, s.scanning)}</div>
      </div>
    </div>`;

  translatePage();

  document.getElementById('t-health-banner-dismiss')?.addEventListener('click', () => {
    document.getElementById('t-health-banner')?.remove();
  });

  // Evolve topic — use pre-loaded cache if available, otherwise call API (header + health banners)
  const runEvolveFromBtn = async (btn) => {
    const evolveTopic = btn.dataset.topic;
    if (!evolveTopic) return;

    const cached = evolveReadyCache.get(evolveTopic);
    const isFresh = cached && (Date.now() - cached.cachedAt) < EVOLVE_CACHE_TTL_MS;

    if (isFresh) {
      renderEvolveChips(evolveTopic, cached.recommend, !!cached.recommendTrack, cached.reasoning, cached.suggestions, !!cached.ruleForced, !!cached.trackForced);
      return;
    }

    const prevHtml = btn.innerHTML;
    const evBtns = main.querySelectorAll('.t-evolve-open');
    evBtns.forEach(b => { b.disabled = true; });
    btn.textContent = 'Analysing topic…';

    const result = await suggestTopicEvolution(evolveTopic, state[evolveTopic] || {});
    if (!result) {
      evBtns.forEach(b => { b.disabled = false; });
      btn.innerHTML = prevHtml;
      btn.title = 'Could not analyse — try again';
      setTimeout(() => btn.removeAttribute('title'), 5000);
      return;
    }

    evolveReadyCache.set(evolveTopic, { ...result, cachedAt: Date.now() });
    renderEvolveChips(evolveTopic, result.recommend, !!result.recommendTrack, result.reasoning, result.suggestions, !!result.ruleForced, !!result.trackForced);
    renderSidebar();
  };

  main.querySelectorAll('.t-evolve-open').forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); runEvolveFromBtn(e.currentTarget); });
  });

  document.getElementById('detail-brief-btn')?.addEventListener('click', e => {
    const t = e.currentTarget.dataset.topic;
    runTopicBrief(t, state[t]?.articles || []);
  });

  // Attach article data to DOM nodes for Intelligence Brief access
  document.querySelectorAll('.t-article-wrap').forEach(wrap => {
    const idx = parseInt(wrap.dataset.idx);
    if (!isNaN(idx) && s.articles?.[idx]) wrap._articleData = s.articles[idx];
  });

  // Attach belief data by ID so sorting doesn't break click-to-detail
  document.querySelectorAll('.t-belief').forEach(card => {
    const id = card.dataset.beliefId;
    const belief = (s.beliefs || []).find(b => b.id === id);
    if (belief) card._beliefData = belief;
    card.style.cursor = 'pointer';
  });
}

function renderArticles(articles, scanning) {
  if (scanning && (!articles || articles.length === 0)) {
    return `<div class="t-placeholder"><p>${tl('ph_fetching')}</p></div>`;
  }
  if (!articles || articles.length === 0) {
    return `<div class="t-placeholder"><p>${tl('ph_no_articles')}</p></div>`;
  }
  return articles.map((a, i) => `
    <div class="t-article-wrap t-article" data-idx="${i}" style="position:relative;">
      <a class="t-article-title" href="${a.link || '#'}" target="_blank">${esc(a.title || 'Untitled')}</a>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <div class="t-article-meta">${esc(a.source || '')} · ${timeAgo(a.date)}</div>
        <button class="t-power-btn">${tl('pp_btn')}</button>
      </div>
      ${buildPowerTooltipShell(a)}
    </div>`).join('');
}

function renderBeliefs(beliefs, scanning) {
  if (scanning && (!beliefs || beliefs.length === 0)) {
    return `<div class="t-placeholder"><p>${tl('ph_gen_beliefs')}</p></div>`;
  }
  if (!beliefs || beliefs.length === 0) {
    return `<div class="t-placeholder"><p>${tl('ph_beliefs_first')}</p></div>`;
  }

  // Rank by confidence descending so highest-conviction signals surface first
  const sorted = [...beliefs].sort((a, b) => b.confidence - a.confidence);
  const rankLabels = ['1ST', '2ND', '3RD', '4TH', '5TH'];

  return sorted.map((b, rank) => {
    const confColor = b.confidence >= 75 ? '#10b981' : b.confidence >= 60 ? '#f59e0b' : '#ef4444';
    const hist = b.revisionHistory || [];

    // Rolling trend over last 3 scored scans for a noise-resistant signal
    const lastConf = hist.length ? hist[hist.length - 1].newConfidence : b.confidence;
    const compareIdx = Math.max(0, hist.length - 4);
    const compareConf = hist.length > 1 ? hist[compareIdx].newConfidence : lastConf;
    const delta = Math.round(lastConf - compareConf);

    const trendClass = delta > 2 ? 'trend-up' : delta < -2 ? 'trend-down' : 'trend-flat';
    const deltaText = delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : 'stable';
    const arrowIcon = delta > 2 ? '↑' : delta < -2 ? '↓' : '→';
    const rankLabel = rankLabels[rank] || `#${rank + 1}`;

    return `
      <div class="t-belief" data-belief-id="${esc(b.id || '')}">
        <div class="t-belief-top">
          <span class="t-belief-rank">${rankLabel}</span>
          <div class="t-belief-score">
            <span class="t-belief-delta ${trendClass}">${arrowIcon} ${deltaText}</span>
            <span class="t-belief-num" style="color:${confColor}">${b.confidence}%</span>
          </div>
        </div>
        <div class="t-belief-claim">${esc(b.claim)}</div>
        ${(b.lens && String(b.lens).trim()) ? `<div class="t-belief-lens"><span class="t-belief-lens-label">${esc(tl('belief_lens_for_you'))}</span>${esc(String(b.lens).trim())}</div>` : ''}
        <div class="t-belief-meta">
          <span class="t-belief-scans">${hist.length} scan${hist.length !== 1 ? 's' : ''} · ${timeAgo(b.lastUpdated)}</span>
        </div>
      </div>`;
  }).join('');
}


// PRO CONTROLS
// ─────────────────────────────────────────────────────────────────────────────

function openProPanel() {
  document.querySelector('.t-right-col')?.classList.add('drawer-open');
  document.getElementById('t-drawer-backdrop')?.classList.add('open');
  document.querySelector('.t-right-body')?.scrollTo({ top: 0, behavior: 'smooth' });
  renderDispatchTopics();
}
function closeProPanel() {
  document.querySelector('.t-right-col')?.classList.remove('drawer-open');
  document.getElementById('t-drawer-backdrop')?.classList.remove('open');
}

function renderProChips(list) {
  const container = document.getElementById('t-pro-hotlist-chips');
  if (!container) return;
  container.innerHTML = '';
  list.forEach(term => {
    const chip = document.createElement('div');
    chip.className = 'pro-chip';
    chip.innerHTML = `<span class="pro-chip-label">${esc(term)}</span><span class="pro-chip-x">&#10005;</span>`;

    chip.querySelector('.pro-chip-label').onclick = () => {
      if (allTopics.includes(term)) { selectTopic(term); closeProPanel(); }
      else {
        const sid = findSetIdContainingTopic(term);
        if (sid) switchTopicSet(sid, term).then(() => closeProPanel());
        else addTrackedTopicToNewBoard(term).then(closeProPanel);
      }
    };

    chip.querySelector('.pro-chip-x').onclick = async (e) => {
      e.stopPropagation();
      await deleteTopic(term);
      const hotList = rebuildHotListFromSets(topicSets);
      renderProChips(hotList);
    };
    container.appendChild(chip);
  });
}

async function addTrackedTopic(topic) {
  topic = topic.trim();
  if (!topic || allTopics.includes(topic)) return;
  const set = getActiveSet();
  if (!set) return;
  if (WEB_RUNTIME) {
    const createdTopic = await createTopicViaApi({ boardId: set.id, query: topic });
    set.topicRecords = [...(set.topicRecords || []), normalizeTopicRecord(createdTopic)];
    syncTopicSetTopicQueries(set);
  } else {
    set.topics.push(topic);
  }
  if (!state[topic]) state[topic] = { articles: [], beliefs: [], scanning: false, lastScanned: null };
  await saveTopicSetsState();
  applyActiveSetTopics();
  renderTopicSetTabs();
  renderSidebar();
  selectTopic(topic);
  await scanTopic(topic);
  chrome.storage.local.get(['hotList'], dd => renderProChips(dd.hotList || []));
}

/** Fetch top 3 direct competitors for a brand/account. Returns array of competitor names or []. */
async function getTopCompetitors(account, industry) {
  const { openai } = await getKeys();
  if (!openai) return [];
  const prompt = `Identify the top 3 direct competitors for "${account}"${industry ? ` in ${industry}` : ''}. Consider market share, product overlap, and geographic presence. Return ONLY a JSON array of 3 company/brand names as strings, e.g. ["Competitor A", "Competitor B", "Competitor C"]. No explanation.`;
  try {
    const data = await requestOpenAIChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4
    });
    const raw = (data.choices?.[0]?.message?.content || '').replace(/```json/g,'').replace(/```/g,'').trim();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(Boolean).slice(0, 3) : [];
  } catch (e) { console.error('[ProControls] getTopCompetitors failed:', e); return []; }
}

async function generateSignalsAI(role, career, account, keywords, competitors = []) {
  const { openai } = await getKeys();
  if (!openai) return [];

  const ctxParts = [];
  if (role)     ctxParts.push(`Role: ${role}`);
  if (career)   ctxParts.push(`Industry: ${career}`);
  if (account)  ctxParts.push(`Brand / Account: ${account}`);
  if (keywords) ctxParts.push(`Priority topics: ${keywords}`);
  if (competitors.length) ctxParts.push(`Top competitors to include: ${competitors.join(', ')}`);
  const userCtx = ctxParts.join('\n');

  const bridgeLine = account
    ? `Every signal must have a direct, specific connection to ${account} — its competitive position, customers, strategy, or priorities. Do not return generic industry topics.`
    : `Every signal must be specific and actionable, not a generic industry category.`;

  const competitorDirective = competitors.length
    ? `\n\nInclude competitive intelligence: At least 2 of the 5 topics should involve ${account}'s competitors (${competitors.join(', ')}) — e.g. competitor moves, market share shifts, or head-to-head comparisons.`
    : '';

  const prompt = `You are a strategic intelligence analyst. Generate exactly 5 high-specificity monitoring topics for the following profile:

${userCtx}

${bridgeLine}
${competitorDirective}

Return one topic per signal category below — each topic must be a specific, trackable search phrase (4–10 words):
1. Competitive intelligence — a specific competitor move, partnership, or market action affecting ${account || 'this organisation'}${competitors.length ? ` or its competitors (${competitors.join(', ')})` : ''}
2. Regulatory / policy — a specific law, ruling, or compliance change relevant to ${career || 'this industry'}
3. Emerging technology — a specific AI capability or tool disrupting ${career || 'this industry'}
4. Innovation opportunity — a specific use case or workflow ${account || 'this organisation'} could act on
5. Strategic threat — a specific risk or displacement signal ${account || 'this organisation'} should monitor

Return ONLY a JSON array of 5 strings, e.g. ["Topic one", "Topic two", ...]`;

  try {
    const data = await requestOpenAIChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });
    const raw = data.choices[0].message.content.replace(/```json/g,'').replace(/```/g,'').trim();
    return JSON.parse(raw).slice(0, 5);
  } catch (e) { console.error('[ProControls] generateSignalsAI failed:', e); return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH — radar brief builder
// ─────────────────────────────────────────────────────────────────────────────

const HOME_FEED_SUMMARY_MAX = 220;

function cleanSummaryForNewsletter(text, maxLen = HOME_FEED_SUMMARY_MAX) {
  if (!text || typeof text !== 'string') return '';
  const one = text.replace(/\s+/g, ' ').trim();
  if (one.length <= maxLen) return one;
  return `${one.slice(0, maxLen - 1).trim()}…`;
}

function formatNewsletterArticleDate(iso) {
  if (!iso) return 'Date unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date unknown';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFeedSavedLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Build `homeFeed` from chrome.storage `dashboardCache` (Command home scan). */
function normalizeDashboardHomeFeed(cache) {
  if (!cache || !Array.isArray(cache.items) || cache.items.length === 0) return null;
  const query = cache.query || 'Artificial Intelligence Trends';
  const savedAt = cache.savedAt || '';
  const items = cache.items.slice(0, 6).map(a => ({
    title: a.title || 'Untitled',
    link: a.link || '#',
    source: a.source || '',
    summary: cleanSummaryForNewsletter(a.summary || '', HOME_FEED_SUMMARY_MAX),
    dateLabel: formatNewsletterArticleDate(a.date),
  }));
  return { query, savedAt, items };
}

function buildHomeFeedPromptBlock(homeFeed) {
  if (!homeFeed?.items?.length) return '';
  const feedSaved = formatFeedSavedLabel(homeFeed.savedAt) || 'unknown';
  const lines = homeFeed.items.map((it, i) =>
    `${i + 1}. [${it.dateLabel}] ${it.title} — ${it.summary || '(no summary)'} (${it.source})`
  );
  return `COMMAND HOME FEED (Top AI News — query: "${homeFeed.query}"; feed saved at ${feedSaved}):\n${lines.join('\n')}`;
}

function renderDispatchTopics() {
  const container = document.getElementById('t-dispatch-topics');
  if (!container) return;
  if (!allTopics.length) {
    container.innerHTML = `<div class="t-dispatch-empty">No tracked topics yet.</div>`;
    return;
  }
  container.innerHTML = allTopics.map(topic => {
    const s = state[topic] || {};
    const avg = avgConfidence(s.beliefs || []);
    const confColor = avg >= 75 ? '#10b981' : avg >= 60 ? '#f59e0b' : avg ? '#ef4444' : 'var(--dim)';
    const confStr = avg !== null ? `${avg}%` : '—';
    return `
      <label class="t-dispatch-topic-item" data-topic="${esc(topic)}">
        <input type="checkbox" class="t-dispatch-chk" value="${esc(topic)}" checked>
        <span class="t-dispatch-topic-name" title="${esc(topic)}">${esc(topic)}</span>
        <span class="t-dispatch-topic-conf" style="color:${confColor}">${confStr}</span>
      </label>`;
  }).join('');

  container.querySelectorAll('.t-dispatch-topic-item').forEach(item => {
    item.addEventListener('change', () => {
      item.classList.toggle('selected', item.querySelector('input').checked);
    });
    item.classList.add('selected');
  });
}

async function generateDispatchPreview() {
  const { openai } = await getKeys();
  const tone = document.getElementById('t-dispatch-tone')?.value || 'executive';
  const freq = normalizeDispatchFreq(document.getElementById('t-dispatch-freq')?.value || DEFAULT_DISPATCH_FREQ);

  const checked = [...document.querySelectorAll('.t-dispatch-chk:checked')].map(c => c.value);
  if (!checked.length) {
    openModal(MORNING_BRIEF_TITLE, 'Preview', '', `<div style="padding:20px;color:var(--dim);text-align:center;">Select at least one topic to preview.</div>`, 'dispatch');
    return;
  }

  const includeHomeNews = document.getElementById('t-dispatch-include-home-news')?.checked ?? false;
  chrome.storage.local.set({ dispatchIncludeHomeNews: includeHomeNews });

  const dashCache = await new Promise(r => chrome.storage.local.get(['dashboardCache'], r));
  const homeFeed = includeHomeNews ? normalizeDashboardHomeFeed(dashCache.dashboardCache) : null;

  // Build structured email data snapshot before API call (used for live preview)
  const emailData = buildEmailData(checked, freq, { includeHomeNews, homeFeed });

  const brand = radarAccount || 'your organisation';
  const periodLabel = getDispatchCadenceLabel(freq);

  // Format style — controls density and structure of writing
  const formatStyleMap = {
    brief:     { desc: 'ultra-concise bullets — 1 line per point, no padding, maximum signal-to-noise', bulletStyle: 'tight single-line bullets, no explanation' },
    detailed:  { desc: 'detailed bullets with context — each point includes the "why it matters"', bulletStyle: 'with a one-sentence explanation of significance' },
    narrative: { desc: 'flowing prose paragraphs — no bullet lists, written as a readable briefing memo', bulletStyle: 'written as connected prose sentences, not bullets' },
    rawintel:  { desc: 'raw intelligence format — data-first, confidence scores prominent, minimal editorialising', bulletStyle: 'leading with the data point and confidence score, minimal commentary' }
  };
  const fmt = formatStyleMap[tone] || formatStyleMap.brief;

  // Role-driven persona — the most powerful shaping lever
  const roleContext = radarRole
    ? `You are writing exclusively for a ${radarRole}${radarCareer ? ` in ${radarCareer}` : ''}${radarAccount ? ` at ${radarAccount}` : ''}. Every insight must be filtered through what a ${radarRole} needs to know, act on, or decide. Surface what changes their strategy, their priorities, or their risk exposure — ignore everything else.`
    : `You are writing for a professional at ${brand}.`;

  const bulletStyle = fmt.bulletStyle;

  openModal(
    MORNING_BRIEF_TITLE,
    periodLabel,
    'background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;font-size:9px;font-weight:800;letter-spacing:1px;padding:2px 7px;border-radius:10px;',
    trackerCompactCardLoading('newsletter', {
      sub: `Compiling ${checked.length} topic${checked.length !== 1 ? 's' : ''}`,
    }),
    'dispatch'
  );

  // Build topic summaries for the prompt
  const topicBlocks = checked.map(topic => {
    const s = state[topic] || {};
    const avg = avgConfidence(s.beliefs || []);
    const delta = topicTrendDelta(s.beliefs || []);
    const topBeliefs = (s.beliefs || [])
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map(b => `  • ${b.claim} (${b.confidence}%)`)
      .join('\n');
    const topArticles = (s.articles || [])
      .slice(0, 3)
      .map(a => `  - ${a.title} (${a.source})`)
      .join('\n');
    return `TOPIC: ${topic}
Confidence: ${avg !== null ? avg + '%' : 'No data'} ${delta ? `(${delta.val})` : ''}
Top beliefs:\n${topBeliefs || '  No beliefs yet'}
Recent signals:\n${topArticles || '  No articles yet'}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `You are an intelligence editor writing a morning brief for the ${periodLabel.toLowerCase()} plan called "${MORNING_BRIEF_TITLE}". ${roleContext} Write in a ${fmt.desc} style. Structure the output clearly with topic sections. Be specific — reference the actual beliefs and articles provided. Do not invent data.`;

  const homeFeedBlock = includeHomeNews ? buildHomeFeedPromptBlock(homeFeed) : '';
  const homeInstructions = includeHomeNews && homeFeed?.items?.length
    ? `\n\n${homeFeedBlock}\n\nAfter the tracked-topic sections, add a section titled "Top AI News (Command home feed)" with dated one-line summaries from the COMMAND HOME FEED list above only. Each bullet: [date] short summary — source. Do not invent stories. Keep summaries clean and scannable.`
    : includeHomeNews && !homeFeed?.items?.length
      ? `\n\nThe user enabled home feed news but no Command home scan is saved — add one line: "Run Scan on the Command home page to include Top AI News next time." Do not fabricate articles.`
      : '';

  const userMessage = `Write the ${BRAND_NAME} Morning Brief for the ${periodLabel.toLowerCase()} plan.

Recipient: ${[radarRole, radarCareer, radarAccount].filter(Boolean).join(' · ') || 'Not set'}${radarRole ? `\nPrioritise what directly impacts a ${radarRole}'s decisions and strategy.` : ''}

TRACKED TOPICS THIS PERIOD:
${topicBlocks}
${homeInstructions}

Format:
1. Opening headline (1 sentence — the single biggest signal this period)
2. For each topic: topic name as heading, 2-3 bullets (${bulletStyle}), confidence trend note
3. What to watch this week (2-3 forward-looking bullets across all topics)
4. What to watch before the next brief
5. Closing line`;

  try {
    if (!openai) throw new Error('no_key');
    const data = await requestOpenAIChat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: 0.6
    });
    const text = data.choices?.[0]?.message?.content || '';
    const html = text
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '<div style="height:8px"></div>';
        if (/^#{1,2}\s/.test(trimmed)) return `<div style="font-size:13px;font-weight:800;color:#f4f4f5;margin:14px 0 4px;">${trimmed.replace(/^#+\s/, '')}</div>`;
        if (/^[•\-\*]\s/.test(trimmed)) return `<div style="font-size:12px;color:#d4d4d8;padding:2px 0 2px 12px;line-height:1.5;border-left:2px solid rgba(59,130,246,0.3);margin:3px 0;">${trimmed.replace(/^[•\-\*]\s/, '')}</div>`;
        if (/^\d+\./.test(trimmed)) return `<div style="font-size:13px;font-weight:700;color:#f4f4f5;margin:12px 0 4px;">${trimmed}</div>`;
        return `<div style="font-size:12px;color:#a1a1aa;line-height:1.6;margin:2px 0;">${trimmed}</div>`;
      }).join('');
    const profileStr = [radarCareer, radarAccount, radarRole, radarKeywords].filter(Boolean).join(' · ') || brand || '';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const header = `<div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:10px;padding:10px 14px;margin-bottom:16px;">
      <div style="font-size:9px;font-weight:800;color:#60a5fa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:2px;"><span style="display:inline-flex;align-items:baseline;gap:3px;font-size:7px;">Your ${COGNESION_WORDMARK_SMALL} Morning Brief</span> · ${periodLabel}</div>
      <div style="font-size:11px;color:#71717a;">${profileStr ? profileStr + ' · ' : ''}${dateStr}</div>
    </div>`;
    setDispatchContent(header + html, emailData);
  } catch (e) {
    setModalBody(`<div style="padding:20px;color:#ef4444;text-align:center;">${e.message === 'no_key' ? 'Add your OpenAI key in settings to generate your Cognesion Morning Brief.' : 'Failed to generate your Cognesion Morning Brief. Please try again.'}</div>`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL PREVIEW — Radar Brief composer helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a structured data snapshot from current tracked-topic state for email rendering. */
function buildEmailData(checked, freq, options = {}) {
  const { includeHomeNews = false, homeFeed = null } = options;
  const cadence   = getDispatchCadenceLabel(freq);
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const topics = checked.map(topic => {
    const s        = state[topic] || {};
    const beliefs  = [...(s.beliefs  || [])].sort((a, b) => b.confidence - a.confidence);
    const articles = s.articles || [];
    const avg      = avgConfidence(beliefs);
    const delta    = topicTrendDelta(beliefs);

    let trend = 'flat';
    if (delta?.cls === 'up')   trend = 'up';
    else if (delta?.cls === 'down') trend = 'down';

    const healthLabel = avg >= 75 ? 'Active' : avg >= 55 ? 'Cooling' : avg !== null ? 'Stale' : 'No Data';
    const healthColor = avg >= 75 ? '#10b981' : avg >= 55 ? '#f59e0b' : avg !== null ? '#ef4444' : '#71717a';

    return {
      name:           topic,
      confidence:     avg,
      delta:          delta?.val || null,
      trend,
      healthLabel,
      healthColor,
      bullets:        beliefs.slice(0, 3).map(b => b.claim),
      recentArticles: articles.slice(0, 2).map(a => ({
        title:  a.title  || 'Untitled',
        source: a.source || '',
        link:   a.link   || '#',
      })),
    };
  });

  const profileLine = [radarCareer, radarAccount, radarRole, radarKeywords].filter(Boolean).join(' · ') || '';

  return {
    freq: normalizeDispatchFreq(freq),
    cadence,
    dateLabel,
    brand:    radarAccount || '',
    role:     radarRole    || '',
    career:   radarCareer  || '',
    keywords: radarKeywords || '',
    profileLine,
    topics,
    includeHomeNews,
    homeFeed,
  };
}

/** Generate full email-safe HTML string for Radar Brief preview. */
function buildRadarEmailHTML(data, options = {}) {
  const {
    freq = DEFAULT_DISPATCH_FREQ, cadence = '5 Briefs / Week', dateLabel = '', brand = '', role = '', career = '', keywords = '', profileLine = '', topics = [],
    includeHomeNews = false, homeFeed = null,
  } = data;
  const maxWidth = options.mode === 'mobile' ? '375' : '620';
  const isMobile = options.mode === 'mobile';

  const topicBlocks = topics.map(t => {
    const confStr     = t.confidence !== null ? `${t.confidence}%` : '—';
    const trendSymbol = t.trend === 'up' ? '↑' : t.trend === 'down' ? '↓' : '→';
    const trendColor  = t.trend === 'up' ? '#10b981' : t.trend === 'down' ? '#ef4444' : '#71717a';
    const hBg         = t.trend === 'up' ? 'rgba(16,185,129,0.12)' : t.trend === 'down' ? 'rgba(239,68,68,0.1)' : 'rgba(113,113,122,0.15)';
    const hBorder     = t.trend === 'up' ? 'rgba(16,185,129,0.3)'  : t.trend === 'down' ? 'rgba(239,68,68,0.3)'  : 'rgba(113,113,122,0.3)';

    const bulletHTML = (t.bullets.length ? t.bullets : ['No signal data yet']).map(b =>
      `<div style="font-size:12px;color:#a1a1aa;padding:3px 0 3px 12px;border-left:2px solid rgba(59,130,246,0.35);margin:3px 0;line-height:1.5;">${esc(b)}</div>`
    ).join('');

    const articleHTML = t.recentArticles.map(a =>
      `<div style="font-size:11px;padding:2px 0;"><a href="${esc(a.link)}" style="color:#60a5fa;text-decoration:none;">${esc(a.title)}</a><span style="color:#52525b;"> · ${esc(a.source)}</span></div>`
    ).join('');

    return `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;overflow:hidden;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-size:12px;font-weight:700;color:#f4f4f5;">${esc(t.name)}</span></td>
            <td align="right" style="white-space:nowrap;">
              <span style="font-size:11px;font-weight:700;color:${trendColor};background:${hBg};border:1px solid ${hBorder};border-radius:4px;padding:2px 7px;">${t.healthLabel}</span>
              &nbsp;<span style="font-size:15px;font-weight:800;color:${trendColor};line-height:1;">${trendSymbol}</span>
              &nbsp;<span style="font-size:16px;font-weight:900;color:#f4f4f5;letter-spacing:-0.5px;">${confStr}</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:10px 14px;">${bulletHTML}</td></tr>
        ${articleHTML ? `<tr><td style="padding:4px 14px 10px;border-top:1px solid rgba(255,255,255,0.04);">
          <div style="font-size:9px;font-weight:800;color:#3f3f46;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Recent Signals</div>
          ${articleHTML}
        </td></tr>` : ''}
      </table>
    </div>`;
  }).join('');

  let homeFeedHTML = '';
  if (includeHomeNews) {
    if (homeFeed?.items?.length) {
      const feedSaved = formatFeedSavedLabel(homeFeed.savedAt) || '—';
      const rows = homeFeed.items.map(it => `
          <div style="padding:10px 0;border-top:1px solid rgba(255,255,255,0.06);">
            <div style="font-size:10px;font-weight:800;color:#60a5fa;letter-spacing:0.04em;margin-bottom:6px;">${esc(it.dateLabel)}</div>
            <div style="font-size:12px;color:#d4d4d8;line-height:1.5;margin-bottom:6px;">${esc(it.summary || it.title)}</div>
            <div style="font-size:11px;"><a href="${esc(it.link)}" style="color:#60a5fa;text-decoration:none;">${esc(it.title)}</a><span style="color:#52525b;"> · ${esc(it.source)}</span></div>
          </div>`).join('');
      homeFeedHTML = `
  <tr><td style="padding:4px 16px 12px;">
    <div style="background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.2);border-radius:10px;padding:12px 14px;">
      <div style="font-size:10px;font-weight:800;color:#60a5fa;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Top AI News — Command home feed</div>
      <div style="font-size:10px;color:#71717a;margin-bottom:10px;line-height:1.4;">${esc(homeFeed.query)} · Feed saved ${esc(feedSaved)}</div>
      ${rows}
    </div>
  </td></tr>`;
    } else {
      homeFeedHTML = `
  <tr><td style="padding:4px 16px 12px;">
    <div style="background:rgba(113,113,122,0.12);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;font-size:11px;color:#a1a1aa;line-height:1.5;">
      <strong style="color:#f4f4f5;">Top AI News</strong> — Open Command (home), run <strong>Scan</strong> on the feed to include Top AI News in your next morning brief.
    </div>
  </td></tr>`;
    }
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(MORNING_BRIEF_TITLE)} · ${esc(cadence)}</title></head>
<body style="margin:0;padding:0;background:#080d1a;font-family:-apple-system,'Inter',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080d1a;min-height:100%;"><tr>
<td align="center" style="padding:20px 12px 28px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:${maxWidth}px;background:#0c1524;border:1px solid rgba(59,130,246,0.2);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.7);">

  <!-- Header -->
  <tr><td style="padding:20px 22px 16px;background:rgba(59,130,246,0.07);border-bottom:1px solid rgba(59,130,246,0.15);">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="${isMobile ? 'bottom' : 'top'}">
        <div style="${isMobile ? 'transform:scale(0.9);transform-origin:left bottom;' : ''}">
        <table cellpadding="0" cellspacing="0"><tr>
          <td valign="top" style="padding-right:10px;"><img src="icons/logo-dark.svg" alt="Cognesion" style="height:28px;width:auto;display:block;"></td>
          <td valign="top">
            <div style="font-size:14px;font-weight:900;color:#f4f4f5;letter-spacing:-0.3px;line-height:1.15;">${esc(cadence)}</div>
            <div style="font-size:14px;font-weight:900;color:#f4f4f5;letter-spacing:-0.3px;line-height:1.15;">Morning Brief</div>
          </td>
        </tr></table>
        <div style="font-size:15px;font-weight:600;color:#60a5fa;letter-spacing:-0.2px;margin-top:8px;">${esc(dateLabel)}</div>
        </div>
      </td>
      <td align="right" valign="bottom">
        <div style="text-align:left;font-size:11px;color:#f4f4f5;">
          ${[career, brand, role, keywords].filter(Boolean).map(v => `<div style="white-space:nowrap;">${esc(v)}</div>`).join('') || (brand ? `<div style="white-space:nowrap;">${esc(brand)}</div>` : '')}
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Topic count bar -->
  <tr><td style="padding:10px 22px 4px;">
    <div style="font-size:9px;font-weight:800;color:#52525b;text-transform:uppercase;letter-spacing:1.5px;">${topics.length} Tracked Topic${topics.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${esc(getDispatchDeliveryDescriptor(freq))}</div>
  </td></tr>

  <!-- Topics -->
  <tr><td style="padding:4px 16px 12px;">
    ${topicBlocks || '<div style="font-size:12px;color:#52525b;padding:16px 6px;">No tracked topics in this brief.</div>'}
  </td></tr>

  ${homeFeedHTML}

  <!-- Footer -->
  <tr><td style="padding:14px 22px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.25);">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:9px;color:#3f3f46;line-height:1.6;">
        <a href="#" style="color:#3f3f46;text-decoration:underline;">Dashboard</a> &nbsp;·&nbsp;
        <a href="#" style="color:#3f3f46;text-decoration:underline;">Manage</a> &nbsp;·&nbsp;
        <a href="#" style="color:#3f3f46;text-decoration:underline;">Unsubscribe</a>
      </td>
      <td align="right" style="font-size:9px;color:#3f3f46;line-height:1.6;">
        <span style="display:inline-flex;align-items:baseline;gap:3px;font-size:7px;">sent by <img src="icons/logo-dark.svg" alt="Cognesion" style="height:12px;width:auto;vertical-align:baseline;" /></span>
      </td>
    </tr></table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Inject email HTML into the sandboxed preview iframe and auto-size it. */
function renderEmailPreview(htmlString) {
  const iframe = document.getElementById('t-email-frame');
  if (!iframe) return;
  iframe.srcdoc = htmlString;
  iframe.style.height = '600px';
  iframe.onload = () => {
    try {
      const h = iframe.contentDocument?.documentElement?.scrollHeight
             || iframe.contentDocument?.body?.scrollHeight;
      if (h && h > 100) iframe.style.height = Math.min(h + 24, 1400) + 'px';
    } catch {}
  };
}

/** Switch the dispatch modal from loading state to the two-pane composer view. */
function setDispatchContent(briefHtml, emailData) {
  lastEmailData = emailData;
  const composer  = document.getElementById('t-brief-composer');
  const body      = document.getElementById('t-modal-body');
  if (body)      body.style.display  = 'none';
  if (composer)  composer.style.display = '';
  renderEmailPreview(buildRadarEmailHTML(emailData, { mode: currentEmailPreviewMode }));
}

/** Open the dispatch modal with controls in the left pane (no API call yet). */
function openDispatchModalWithControls() {
  currentModalType = 'dispatch';
  const modal = document.getElementById('t-modal');
  const body = document.getElementById('t-modal-body');
  const composer = document.getElementById('t-brief-composer');
  const cadenceTgl = document.getElementById('t-cadence-toggle');
  const sendTestBtn = document.getElementById('t-modal-send-test');

  const modalTitle = document.getElementById('t-modal-title');
  if (modalTitle) modalTitle.innerHTML = newsletterModalTitleHTML();
  const badgeEl = document.getElementById('t-modal-badge');
  if (badgeEl) badgeEl.style.display = 'none';

  if (modal) modal.classList.add('t-modal--dispatch');
  if (body) { body.style.display = 'none'; body.innerHTML = ''; }
  if (composer) composer.style.display = '';

  const freq = normalizeDispatchFreq(document.getElementById('t-dispatch-freq')?.value || DEFAULT_DISPATCH_FREQ);
  if (cadenceTgl) {
    cadenceTgl.style.display = '';
    syncDispatchCadenceUI(freq);
  }
  if (sendTestBtn) sendTestBtn.style.display = '';

  ['t-modal-copy', 't-export-wrap', 't-modal-llm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const schedBtn = document.getElementById('t-modal-schedule');
  if (schedBtn) { schedBtn.style.display = ''; schedBtn.textContent = 'Set Morning Delivery'; }
  document.getElementById('t-schedule-panel')?.classList.remove('open');
  loadDispatchScheduleIntoPanel();

  renderDispatchTopics();
  chrome.storage.local.get(['radarEmail', 'dispatchIncludeHomeNews'], d => {
    const emailEl = document.getElementById('t-user-email');
    if (emailEl && d.radarEmail) emailEl.value = d.radarEmail;
    const homeChk = document.getElementById('t-dispatch-include-home-news');
    if (homeChk) homeChk.checked = d.dispatchIncludeHomeNews !== false;
  });

  renderEmailPreview(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0f1a;font-family:system-ui,sans-serif;">' +
      '<div style="padding:24px;text-align:center;color:#93c5fd;font-size:13px;font-weight:600;line-height:1.5;max-width:28rem;">Select topics and preview the Morning Brief your users would receive on the delivery rhythm you choose.</div>' +
    '</body></html>'
  );
  document.getElementById('t-modal-overlay').classList.add('open');
}

function wireProControls() {
  document.getElementById('t-collapse-right')?.addEventListener('click', closeProPanel);
  document.getElementById('t-drawer-backdrop')?.addEventListener('click', closeProPanel);

  // Pre-fill stored profile values
  chrome.storage.local.get(['hotList','radarCareer','radarAccount','radarRole','radarKeywords','radarEmail','radarLanguage','monitoringEnabled','radarIncludeCompetitors'], d => {
    renderProChips(d.hotList || []);
    if (d.radarCareer)   document.getElementById('t-user-career').value   = d.radarCareer;
    if (d.radarAccount)  document.getElementById('t-user-account').value  = d.radarAccount;
    if (d.radarRole)     document.getElementById('t-user-role').value     = d.radarRole;
    if (d.radarKeywords) document.getElementById('t-user-keywords').value = d.radarKeywords;
    if (d.radarEmail)    document.getElementById('t-user-email').value    = d.radarEmail;
    if (d.radarLanguage) {
      radarLanguage = d.radarLanguage;
      document.getElementById('t-user-language').value = d.radarLanguage;
      applyUITranslations(d.radarLanguage);
      // Start loading persisted cache immediately — translatePage() will await it
      loadTranslationCache(d.radarLanguage);
    }
    const toggle = document.getElementById('t-monitor-toggle');
    if (toggle) {
      toggle.checked = !!d.monitoringEnabled;
      const st = document.getElementById('t-monitor-status');
      if (st) st.textContent = d.monitoringEnabled ? 'Active' : 'Off';
    }
    const compToggle = document.getElementById('t-include-competitors');
    if (compToggle) compToggle.checked = !!d.radarIncludeCompetitors;
  });

  // Add topic — with similarity check
  const doAdd = async (force = false) => {
    const input = document.getElementById('t-hotlist-input');
    const val = input?.value.trim();
    if (!val) return;

    const existingSetId = findSetIdContainingTopic(val);
    if (existingSetId) {
      input.value = '';
      await switchTopicSet(existingSetId, val);
      closeProPanel();
      return;
    }

    const warn = document.getElementById('t-similarity-warn');
    const globalTopics = rebuildHotListFromSets(topicSets);
    if (!force) {
      const similar = topicSimilarityCheck(val, globalTopics);
      if (similar) {
        if (warn) {
          warn.innerHTML = `
            <span class="t-simwarn-text">Similar to <strong>"${esc(similar)}"</strong> — may pull duplicate articles.</span>
            <button class="t-simwarn-btn t-simwarn-add">Add Anyway</button>
            <button class="t-simwarn-btn t-simwarn-cancel">Cancel</button>`;
          warn.style.display = 'flex';
          warn.querySelector('.t-simwarn-add').onclick = () => {
            warn.style.display = 'none';
            doAdd(true);
          };
          warn.querySelector('.t-simwarn-cancel').onclick = () => {
            warn.style.display = 'none';
            input.value = '';
          };
        }
        return;
      }
    }

    if (warn) warn.style.display = 'none';
    input.value = '';
    await addTrackedTopicToNewBoard(val);
  };
  document.getElementById('t-btn-add-hot')?.addEventListener('click', () => doAdd());
  document.getElementById('t-hotlist-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

  // Auto-save profile fields on change
  const saveProfile = () => {
    const career   = document.getElementById('t-user-career')?.value   || '';
    const account  = document.getElementById('t-user-account')?.value  || '';
    const role     = document.getElementById('t-user-role')?.value     || '';
    const keywords = document.getElementById('t-user-keywords')?.value || '';
    const email    = document.getElementById('t-user-email')?.value    || '';
    const language = document.getElementById('t-user-language')?.value || '';
    const includeCompetitors = document.getElementById('t-include-competitors')?.checked ?? false;
    chrome.storage.local.set({ radarCareer: career, radarAccount: account, radarRole: role, radarKeywords: keywords, radarEmail: email, radarLanguage: language, radarIncludeCompetitors: includeCompetitors });
    radarCareer = career; radarAccount = account; radarRole = role; radarKeywords = keywords; radarEmail = email; radarLanguage = language;
  };
  ['t-user-career','t-user-account','t-user-role','t-user-keywords','t-user-email','t-include-competitors'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', saveProfile)
  );

  // Language change — clear cache and re-translate immediately
  document.getElementById('t-user-language')?.addEventListener('change', () => {
    translationCache.clear();
    document.querySelectorAll('[data-translated]').forEach(el => {
      if (el.dataset.originalText) el.textContent = el.dataset.originalText;
      el.removeAttribute('data-translated');
    });
    saveProfile();
    if (radarLanguage) {
      applyUITranslations(radarLanguage);
      loadTranslationCache(radarLanguage);
    }
    translatePage();
    watchAndTranslate();
  });

  // Generate monitoring signals
  document.getElementById('t-btn-run-recos')?.addEventListener('click', async () => {
    saveProfile();
    const career   = document.getElementById('t-user-career')?.value.trim()   || '';
    const account  = document.getElementById('t-user-account')?.value.trim()  || '';
    const role     = document.getElementById('t-user-role')?.value.trim()     || '';
    const keywords = document.getElementById('t-user-keywords')?.value.trim() || '';
    const includeCompetitors = document.getElementById('t-include-competitors')?.checked ?? false;

    if (!career || !account) {
      openModal(
        'Complete Your Profile',
        'Required',
        'background:#f59e0b22;border:1px solid #f59e0b44;color:#f59e0b;',
        `<div style="font-size:14px;color:#d4d4d8;line-height:1.7;padding:8px 0;">
          To generate personalised monitoring signals, please fill in both:<br><br>
          <strong style="color:#f4f4f5;">Industry</strong> — the sector or market you operate in<br>
          <strong style="color:#f4f4f5;">Brand / Account</strong> — the specific company or brand to monitor for<br><br>
          <span style="color:#71717a;font-size:12px;">These fields ensure every signal is specific to your situation, not generic AI topics.</span>
        </div>`
      );
      return;
    }

    const status = document.getElementById('t-recos-status');
    let competitors = [];
    if (includeCompetitors && account) {
      if (status) { status.style.display = 'block'; status.textContent = 'Identifying competitors…'; }
      competitors = await getTopCompetitors(account, career);
      if (competitors.length && status) status.textContent = `Adding ${competitors.join(', ')} — generating topics…`;
    }
    if (status) {
      status.style.display = 'block';
      if (!includeCompetitors || !competitors.length) status.textContent = 'AI Analyzing…';
    }
    const signals = await generateSignalsAI(role, career, account, keywords, competitors);
    if (status) status.style.display = 'none';
    if (!signals.length) {
      if (status) {
        status.style.display = 'block';
        status.textContent = 'No OpenAI key found — add one in Command to generate AI topic suggestions.';
        setTimeout(() => { status.style.display = 'none'; }, 3000);
      }
      return;
    }
    const activeSet = getActiveSet();
    if (activeSet) {
      activeSet.profile = normalizeTopicSetProfile({
        source: 'profile',
        career,
        account,
        role,
        keywords,
        includeCompetitors,
        competitors,
        generatedAt: new Date().toISOString()
      });
      if (WEB_RUNTIME && activeSet.id) {
        const updatedBoard = await updateTopicBoardViaApi(activeSet.id, {
          name: activeSet.name,
          profileSnapshot: activeSet.profile
        });
        updateLocalSetFromApiBoard(activeSet, updatedBoard);
      }
      await saveTopicSetsState();
      renderActiveSetContext();
    }
    for (const sig of signals) await addTrackedTopic(sig);
  });

  // Monitor toggle
  document.getElementById('t-monitor-toggle')?.addEventListener('change', e => {
    chrome.storage.local.set({ monitoringEnabled: e.target.checked });
    const st = document.getElementById('t-monitor-status');
    if (st) st.textContent = e.target.checked ? 'Active' : 'Off';
  });

  // Dispatch preview (button is in the modal; triggers from modal controls)
  document.getElementById('t-btn-dispatch-preview')?.addEventListener('click', () => {
    generateDispatchPreview();
  });

  document.getElementById('t-dispatch-include-home-news')?.addEventListener('change', e => {
    chrome.storage.local.set({ dispatchIncludeHomeNews: e.target.checked });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC EDITING
// ─────────────────────────────────────────────────────────────────────────────

function enterEditMode(row, topic) {
  if (row.querySelector('.t-topic-edit-wrap')) return;

  const view = row.querySelector('.t-topic-view');
  if (view) view.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 't-topic-edit-wrap';
  wrap.innerHTML = `
    <textarea class="t-topic-edit-input" rows="2">${esc(topic)}</textarea>
    <div class="t-topic-edit-btns">
      <button class="t-topic-edit-save">${tl('edit_save_rescan')}</button>
      <button class="t-topic-edit-cancel">${tl('edit_cancel')}</button>
    </div>`;
  row.appendChild(wrap);

  const textarea = wrap.querySelector('.t-topic-edit-input');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  const doSave = () => {
    const newTopic = textarea.value.trim();
    wrap.remove();
    if (view) view.style.display = '';
    if (newTopic && newTopic !== topic) renameTopic(topic, newTopic);
  };

  const doCancel = () => {
    wrap.remove();
    if (view) view.style.display = '';
  };

  wrap.querySelector('.t-topic-edit-save').addEventListener('click', e => { e.stopPropagation(); doSave(); });
  wrap.querySelector('.t-topic-edit-cancel').addEventListener('click', e => { e.stopPropagation(); doCancel(); });
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(); }
    if (e.key === 'Escape') doCancel();
  });
}

async function renameTopic(oldTopic, newTopic) {
  const idx = allTopics.indexOf(oldTopic);
  if (idx === -1) return;
  const owner = topicSets.find(set => (set.topics || []).includes(oldTopic));
  const topicRecord = owner ? (owner.topicRecords || []).find(record => record.query === oldTopic) : null;

  if (WEB_RUNTIME && topicRecord?.id && owner) {
    const updatedTopic = await updateTopicViaApi(topicRecord.id, { query: newTopic });
    owner.topicRecords = (owner.topicRecords || []).map(record => (
      record.id === updatedTopic.id ? normalizeTopicRecord(updatedTopic) : record
    ));
    syncTopicSetTopicQueries(owner);
  } else {
    allTopics[idx] = newTopic;
    topicSets.forEach(s => {
      const i = (s.topics || []).indexOf(oldTopic);
      if (i !== -1) s.topics[i] = newTopic;
    });
  }

  evolveReadyCache.delete(oldTopic);

  // Migrate in-memory state
  state[newTopic] = { articles: [], beliefs: [], scanning: false, lastScanned: null };
  delete state[oldTopic];
  if (selectedTopic === oldTopic) selectedTopic = newTopic;
  Object.keys(lastTopicBySetId).forEach(k => {
    if (lastTopicBySetId[k] === oldTopic) lastTopicBySetId[k] = newTopic;
  });
  applyActiveSetTopics();

  // Migrate all persisted storage keys
  const d = await new Promise(r => chrome.storage.local.get(
    ['trackerLastScanned', 'trackerArticles', 'tracker_hypotheses'], r
  ));
  const tsMap = d.trackerLastScanned || {};
  delete tsMap[oldTopic];
  const artsMap = d.trackerArticles || {};
  delete artsMap[oldTopic];
  // Drop beliefs for the old topic — the evolved topic generates fresh ones from its new articles.
  const hyps = (d.tracker_hypotheses || []).filter(h => h.topic !== oldTopic);
  await saveTopicSetsState();
  await new Promise(r => chrome.storage.local.set(
    { trackerLastScanned: tsMap, trackerArticles: artsMap, tracker_hypotheses: hyps }, r
  ));

  renderTopicSetTabs();
  renderSidebar();
  renderDetail(selectedTopic);
  // Kick off a fresh scan for the renamed topic
  await scanTopic(newTopic);
}

async function deleteTopic(topic) {
  if (!confirm(`Remove "${topic}" from tracked topics?`)) return;

  const set = topicSets.find(candidate => (candidate.topics || []).includes(topic)) || getActiveSet();
  const topicRecord = set ? (set.topicRecords || []).find(record => record.query === topic) : null;
  if (WEB_RUNTIME && topicRecord?.id) {
    await deleteTopicViaApi(topicRecord.id);
  }
  if (set) {
    set.topics = (set.topics || []).filter(t => t !== topic);
    set.topicRecords = (set.topicRecords || []).filter(record => record.query !== topic);
  }
  await saveTopicSetsState();
  applyActiveSetTopics();
  await purgeTopicFromStorageIfOrphan(topic);

  if (selectedTopic === topic) selectedTopic = allTopics[0] || null;
  renderTopicSetTabs();
  renderSidebar();
  renderDetail(selectedTopic);
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

function selectTopic(topic) {
  selectedTopic = topic;
  if (activeTopicSetId) lastTopicBySetId[activeTopicSetId] = topic || null;
  chrome.storage.local.set({ lastTopicBySetId });
  renderSidebar();
  renderDetail(topic);
}

async function scanTopic(topic) {
  if (!state[topic]) state[topic] = { articles: [], beliefs: [], scanning: false };
  if (state[topic].scanning) return;
  state[topic].scanning = true;
  renderSidebar();
  renderDetail(selectedTopic);

  try {
    const items = await engine.search(topic);
    state[topic].articles = items || [];
    const beliefs = await BeliefEngine.updateTopic(topic, state[topic].articles);
    state[topic].beliefs = beliefs;
    state[topic].lastScanned = new Date().toISOString();

    // Persist lastScanned + articles so both survive page reloads
    chrome.storage.local.get(['trackerLastScanned', 'trackerArticles'], d => {
      const map = d.trackerLastScanned || {};
      const arts = d.trackerArticles || {};
      map[topic] = state[topic].lastScanned;
      arts[topic] = state[topic].articles;
      chrome.storage.local.set({ trackerLastScanned: map, trackerArticles: arts });
    });
  } catch (e) {
    console.error(`[Tracker] Scan failed for "${topic}":`, e);
  }

  state[topic].scanning = false;
  deduplicateArticlesAcrossTopics();
  renderSidebar();
  if (selectedTopic === topic) renderDetail(topic);
  backgroundEvolveCheck(topic).catch(() => {});
}

async function scanAll() {
  const btn = document.querySelector('[data-action="scan-all"]');
  if (btn) { btn.disabled = true; btn.textContent = tl('btn_scanning_all'); }
  for (const topic of allTopics) {
    await scanTopic(topic);
    await new Promise(r => setTimeout(r, 1200));
  }
  if (btn) { btn.disabled = false; btn.textContent = tl('btn_scan_all'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL WIRING
// ─────────────────────────────────────────────────────────────────────────────

function getModalMarkdown() {
  const title = document.getElementById('t-modal-title').textContent.trim();
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `# ${title}\n_Generated by Cognesion · ${date}_\n\n${modalContent}`;
}

function wireModal() {
  document.getElementById('t-modal-close').addEventListener('click', closeModal);
  document.getElementById('t-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Copy to Clipboard
  document.getElementById('t-modal-copy').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    navigator.clipboard.writeText(modalContent).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      btn.style.color = '#22c55e';
      setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1800);
    }).catch(() => {});
  });

  // Export dropdown toggle
  const exportBtn = document.getElementById('t-modal-export');
  const exportMenu = document.getElementById('t-export-menu');
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
  });
  document.addEventListener('click', () => exportMenu.classList.remove('open'));

  // Copy as Markdown
  document.getElementById('t-export-md-copy').addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.remove('open');
    const md = getModalMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      const orig = exportBtn.textContent;
      exportBtn.textContent = '✓ Copied!';
      exportBtn.style.color = '#22c55e';
      setTimeout(() => { exportBtn.textContent = orig; exportBtn.style.color = ''; }, 1800);
    }).catch(() => {});
  });

  // Download .md file
  document.getElementById('t-export-md-dl').addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.remove('open');
    const md = getModalMarkdown();
    const title = document.getElementById('t-modal-title').textContent.trim()
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cognesion-${title}-${date}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Print / Save as PDF
  document.getElementById('t-export-pdf').addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.remove('open');
    const title = document.getElementById('t-modal-title').textContent.trim();
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Convert plain text to clean paragraphs — avoids all dark-theme inline styles
    const lines = modalContent.split('\n').filter(l => l.trim());
    const bodyHtml = lines.map(line => {
      const t = line.trim();
      // Section headers: ALL CAPS short lines
      if (t === t.toUpperCase() && t.length < 60 && t.length > 2 && !/^\d+$/.test(t)) {
        return `<h2>${t}</h2>`;
      }
      // Numbered list items
      if (/^\d+[\.\)]\s/.test(t)) {
        return `<li>${t.replace(/^\d+[\.\)]\s/, '')}</li>`;
      }
      // Bullet items
      if (/^[-•]\s/.test(t)) {
        return `<li>${t.replace(/^[-•]\s/, '')}</li>`;
      }
      return `<p>${t}</p>`;
    }).join('\n');

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>${title} — Cognesion</title>
      <style>
        body { font-family: Georgia, serif; color: #111; background: #fff; max-width: 720px; margin: 48px auto; padding: 0 32px; }
        h1 { font-family: system-ui, sans-serif; font-size: 22px; font-weight: 800; margin: 0 0 6px; color: #000; line-height: 1.3; }
        .meta { font-family: system-ui, sans-serif; font-size: 12px; color: #777; margin-bottom: 32px; border-bottom: 2px solid #111; padding-bottom: 12px; }
        h2 { font-family: system-ui, sans-serif; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #555; margin: 28px 0 8px; }
        p { font-size: 13px; line-height: 1.75; color: #222; margin: 0 0 10px; }
        li { font-size: 13px; line-height: 1.7; color: #222; margin-bottom: 6px; }
        ul, ol { padding-left: 20px; margin: 0 0 16px; }
        @media print {
          body { margin: 0; padding: 24px 32px; }
          h1 { font-size: 18px; }
        }
      </style>
    </head><body>
      <h1>${title}</h1>
      <div class="meta">Cognesion &nbsp;·&nbsp; ${date}</div>
      ${bodyHtml}
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  });

  // Schedule Dispatch toggle
  const schedBtn = document.getElementById('t-modal-schedule');
  const schedPanel = document.getElementById('t-schedule-panel');
  if (schedBtn && schedPanel) {
    schedBtn.addEventListener('click', () => {
      const isOpen = schedPanel.classList.toggle('open');
      schedBtn.textContent = isOpen ? 'Cancel' : 'Set Morning Delivery';
    });
  }

  // Day pill toggle
  const schedDays = document.getElementById('t-sched-days');
  if (schedDays) {
    schedDays.addEventListener('click', e => {
      const pill = e.target.closest('.t-sched-day');
      if (pill) {
        pill.classList.toggle('active');
        const freq = normalizeDispatchFreq(document.getElementById('t-dispatch-freq')?.value || DEFAULT_DISPATCH_FREQ);
        const withinLimit = enforceDispatchDayLimit(freq, pill);
        if (!withinLimit) {
          alert(`This plan allows up to ${getDispatchDayLimit(freq)} weekday${getDispatchDayLimit(freq) === 1 ? '' : 's'}.`);
        }
      }
    });
  }

  // Confirm schedule save
  const schedConfirm = document.getElementById('t-sched-confirm');
  if (schedConfirm) {
    schedConfirm.addEventListener('click', () => {
      const freq = normalizeDispatchFreq(document.getElementById('t-dispatch-freq')?.value || DEFAULT_DISPATCH_FREQ);
      const days = [...document.querySelectorAll('#t-sched-days .t-sched-day.active')].map(el => el.dataset.day);
      const normalizedDays = clampDispatchDays(days, freq);
      const hour = document.getElementById('t-sched-hour').value;
      const min  = document.getElementById('t-sched-min').value;
      const ampm = document.getElementById('t-sched-ampm').value;
      const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone;
      chrome.storage.local.set({ dispatchSchedule: { days: normalizedDays, hour, min, ampm, tz } }, () => {
        schedConfirm.textContent = '✓ Saved';
        schedConfirm.classList.add('saved');
        setTimeout(() => {
          schedConfirm.textContent = 'Confirm Schedule';
          schedConfirm.classList.remove('saved');
          if (schedPanel) schedPanel.classList.remove('open');
          if (schedBtn) schedBtn.textContent = 'Set Morning Delivery';
        }, 1800);
      });
    });
  }

  // ── Cadence toggle (1 / 3 / 5 per week) ──
  const cadenceTglEl = document.getElementById('t-cadence-toggle');
  if (cadenceTglEl) {
    cadenceTglEl.addEventListener('click', e => {
      const btn = e.target.closest('.t-ctbtn');
      if (!btn || btn.classList.contains('active')) return;
      const freqSel = document.getElementById('t-dispatch-freq');
      const nextFreq = normalizeDispatchFreq(btn.dataset.cadence);
      syncDispatchCadenceUI(nextFreq);
      if (freqSel) freqSel.value = nextFreq;
      loadDispatchScheduleIntoPanel();
      generateDispatchPreview();
    });
  }

  document.getElementById('t-dispatch-freq')?.addEventListener('change', e => {
    const nextFreq = normalizeDispatchFreq(e.target.value);
    syncDispatchCadenceUI(nextFreq);
    loadDispatchScheduleIntoPanel();
  });

  // ── Preview mode toggle (Desktop / Mobile) ──
  const previewModeTglEl = document.getElementById('t-preview-mode-toggle');
  if (previewModeTglEl) {
    previewModeTglEl.addEventListener('click', e => {
      const btn = e.target.closest('.t-pmtbtn');
      if (!btn || btn.classList.contains('active')) return;
      previewModeTglEl.querySelectorAll('.t-pmtbtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentEmailPreviewMode = btn.dataset.mode;
      const iframe = document.getElementById('t-email-frame');
      if (iframe) iframe.classList.toggle('mobile-preview', currentEmailPreviewMode === 'mobile');
      if (lastEmailData) {
        renderEmailPreview(buildRadarEmailHTML(lastEmailData, { mode: currentEmailPreviewMode }));
      }
    });
  }

  // ── Send Test (server-side delivery lands after migration) ──
  const sendTestBtnEl = document.getElementById('t-modal-send-test');
  if (sendTestBtnEl) {
    sendTestBtnEl.disabled = true;
    sendTestBtnEl.textContent = 'Send test (live soon)';
    sendTestBtnEl.title = 'Live test sends move server-side during migration.';
    sendTestBtnEl.style.opacity = '0.6';
    sendTestBtnEl.style.cursor = 'not-allowed';
  }

}

function loadDispatchScheduleIntoPanel() {
  chrome.storage.local.get('dispatchSchedule', ({ dispatchSchedule }) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzEl = document.getElementById('t-sched-tz');
    if (tzEl) tzEl.textContent = `Your timezone: ${tz}`;
    const schedule = dispatchSchedule || DEFAULT_DISPATCH_SCHEDULE;
    const freq = normalizeDispatchFreq(document.getElementById('t-dispatch-freq')?.value || DEFAULT_DISPATCH_FREQ);
    const {
      days = DEFAULT_DISPATCH_SCHEDULE.days,
      hour = DEFAULT_DISPATCH_SCHEDULE.hour,
      min = DEFAULT_DISPATCH_SCHEDULE.min,
      ampm = DEFAULT_DISPATCH_SCHEDULE.ampm
    } = schedule;
    const normalizedDays = clampDispatchDays(days, freq);
    document.querySelectorAll('#t-sched-days .t-sched-day').forEach(el => {
      el.classList.toggle('active', normalizedDays.includes(el.dataset.day));
    });
    syncDispatchCadenceUI(freq);
    const hourEl = document.getElementById('t-sched-hour');
    const minEl  = document.getElementById('t-sched-min');
    const ampmEl = document.getElementById('t-sched-ampm');
    if (hourEl) hourEl.value = hour;
    if (minEl)  minEl.value  = min;
    if (ampmEl) ampmEl.value = ampm;
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  wireModal();
  wireProControls();

  chrome.storage.local.get([
    'hotList',
    'topicSets',
    'activeTopicSetId',
    'lastTopicBySetId',
    'trackerLastScanned',
    'trackerArticles',
    'tracker_hypotheses',
    'radarAccount',
    'radarCareer',
    'radarRole',
    'radarKeywords',
    'radarLanguage'
  ], async data => {
    const webState = await loadWebTopicBoardState(data.activeTopicSetId, data.lastTopicBySetId || {});
    if (webState) {
      topicSets = webState.topicSets;
      activeTopicSetId = webState.activeTopicSetId;
      lastTopicBySetId = webState.lastTopicBySetId || {};
      await saveTopicSetsState();
    } else {
      const mig = migrateTopicSetsIfNeeded(data);
      topicSets = mig.topicSets;
      activeTopicSetId = mig.activeTopicSetId;
      lastTopicBySetId = mig.lastTopicBySetId || {};
      if (mig.migrated) {
        await new Promise(r => chrome.storage.local.set({
          topicSets,
          activeTopicSetId,
          lastTopicBySetId,
          hotList: rebuildHotListFromSets(topicSets)
        }, r));
      }
    }

    radarAccount  = data.radarAccount  || '';
    radarCareer   = data.radarCareer   || '';
    radarRole     = data.radarRole     || '';
    radarKeywords = data.radarKeywords || '';
    radarLanguage = data.radarLanguage || '';

    const hotListUnion = rebuildHotListFromSets(topicSets);
    applyActiveSetTopics();

    document.getElementById('t-set-tab-add')?.addEventListener('click', () => addTopicSet());

    const main = document.getElementById('t-main');
    renderTopicSetTabs();

    if (hotListUnion.length === 0) {
      document.getElementById('topic-list').innerHTML = '';
      main.innerHTML = `
        <div class="t-empty">
          <div class="t-empty-icon">📡</div>
          <div class="t-empty-title">Build your first tracked topic set</div>
          <div class="t-empty-desc">Track the signals that matter to your role, client, or brand, then turn them into a morning brief.</div>
        </div>`;
      return;
    }

    // Seed state with stored beliefs, articles, and lastScanned timestamps (all boards share topic state by name)
    const stored = await BeliefEngine.load();
    const tsData = await new Promise(r => chrome.storage.local.get(['trackerLastScanned', 'trackerArticles'], r));
    const lastScannedMap = tsData.trackerLastScanned || {};
    const articlesMap = tsData.trackerArticles || {};
    const today = new Date().toDateString();
    const oneDayMs = 24 * 60 * 60 * 1000;

    hotListUnion.forEach(topic => {
      const beliefs = stored.filter(h => h.topic === topic && h.status !== 'archived');
      const lastScanned = lastScannedMap[topic] || null;
      const articles = articlesMap[topic] || [];
      state[topic] = { articles, beliefs, scanning: false, lastScanned };
    });

    renderSidebar();
    const initial = lastTopicBySetId[activeTopicSetId];
    if (initial && allTopics.includes(initial)) selectTopic(initial);
    else if (allTopics.length) selectTopic(allTopics[0]);
    else renderDetail(null);

    // Translate whatever is already rendered, then watch for scan results as they arrive
    translatePage();
    watchAndTranslate();

    const sortBtn = document.getElementById('t-sidebar-sort');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        const idx = SORT_MODES.findIndex(m => m.key === sidebarSortMode);
        sidebarSortMode = SORT_MODES[(idx + 1) % SORT_MODES.length].key;
        sortBtn.textContent = SORT_MODES[(idx + 1) % SORT_MODES.length].label;
        renderSidebar();
      });
    }

    // Auto-scan if: no articles cached, never scanned, >24h since last scan, or new calendar day
    for (const topic of hotListUnion) {
      const last = lastScannedMap[topic];
      const lastDate = last ? new Date(last) : null;
      const noArticles = (articlesMap[topic] || []).length === 0;
      const needsScan = noArticles
        || !lastDate
        || (Date.now() - lastDate.getTime() > oneDayMs)
        || (lastDate.toDateString() !== today);

      if (needsScan) {
        await scanTopic(topic);
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRO GATE — entitlement check
// Reads isProUser from chrome.storage.local before running any tracker logic.
// If not entitled, renders a locked state and stops. Existing init() is untouched.
// Toggle via console/DevTools:
//   chrome.storage.local.set({ isProUser: true })   // unlock
//   chrome.storage.local.set({ isProUser: false })  // lock (default)
// ─────────────────────────────────────────────────────────────────────────────

function renderLockedState() {
  const gate = document.getElementById('t-gate');
  gate.classList.add('active');
  gate.innerHTML = `
    <div class="t-gate-box">
      <img src="icons/logo-dark.svg" alt="Cognesion" class="t-gate-logo" aria-hidden="true">
      <div class="t-gate-icon">🔒</div>
      <div class="t-gate-label">Premium Feature</div>
      <div class="t-gate-title">Topics + Morning Brief</div>
      <div class="t-gate-desc">
        Create persistent AI monitors, watch confidence shifts, evolve stale topics,
        and deliver a weekday morning brief built for your role, brand, or client work.
      </div>
      <div class="t-gate-actions">
        <a class="t-gate-btn-primary" href="dashboard.html">← Back to Command</a>
        <button class="t-gate-btn-outline" disabled>Upgrade path coming soon</button>
      </div>
    </div>`;
}

// PRE-LAUNCH: gate is bypassed — set PRO_GATE_ENABLED = true before going live
const PRO_GATE_ENABLED = false;

document.addEventListener('DOMContentLoaded', () => {
  if (!PRO_GATE_ENABLED) {
    if (WEB_RUNTIME) {
      bootWebAuth();
    } else {
      init();
    }
    return;
  }
  chrome.storage.local.get(['isProUser'], (data) => {
    if (data.isProUser) { init(); } else { renderLockedState(); }
  });
});
