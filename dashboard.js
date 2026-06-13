import { ExaEngine } from './exa-engine.js';
import { applyUITranslations, UI_TRANSLATIONS, LANG_NAMES as I18N_LANG_NAMES, showTranslationOverlay, hideTranslationOverlay } from './i18n.js';
import { resolveEvidenceArticlesAsync, buildBeliefAnalysisPrompt, formatAudienceProfileLines, parseStructuredAnalysis, validateStructuredAnalysis } from './belief-analysis.js';

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
const ADMIN_BYPASS_STORAGE_KEY = 'cognesionAdminBypassToken';

globalThis.COGNESION_AUTH = globalThis.COGNESION_AUTH || {};

function readStoredAdminBypassToken() {
  try {
    return String(globalThis.localStorage?.getItem(ADMIN_BYPASS_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function persistAdminBypassToken(token) {
  const normalized = String(token || '').trim();
  try {
    if (normalized) {
      globalThis.localStorage?.setItem(ADMIN_BYPASS_STORAGE_KEY, normalized);
    } else {
      globalThis.localStorage?.removeItem(ADMIN_BYPASS_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage failures and let normal auth continue.
  }
}

function clearStoredAdminBypassToken() {
  persistAdminBypassToken('');
}

function readAdminBypassTokenFromLocation() {
  if (typeof window === 'undefined') return '';

  try {
    const url = new URL(window.location.href);
    const searchToken = url.searchParams.get('admin_bypass');
    if (searchToken) return String(searchToken).trim();

    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (!hash || !hash.includes('admin_bypass=')) return '';

    return String(new URLSearchParams(hash).get('admin_bypass') || '').trim();
  } catch {
    return '';
  }
}

function stripAdminBypassTokenFromLocation() {
  if (typeof window === 'undefined') return;

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('admin_bypass');

    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (hash.includes('admin_bypass=')) {
      const hashParams = new URLSearchParams(hash);
      hashParams.delete('admin_bypass');
      const nextHash = hashParams.toString();
      url.hash = nextHash ? `#${nextHash}` : '';
    }

    window.history.replaceState({}, document.title, url.toString());
  } catch {
    // Ignore history replacement issues.
  }
}

function captureAdminBypassTokenFromLocation() {
  const token = readAdminBypassTokenFromLocation();
  if (!token) return readStoredAdminBypassToken();
  persistAdminBypassToken(token);
  stripAdminBypassTokenFromLocation();
  return token;
}

function getAuthGateEl() {
  return document.getElementById('command-auth-gate');
}

function renderAuthGate(message = 'Sign in with the same email magic link you use for Topics so Command can unlock live search, briefing, and AI routing on the web.') {
  if (!WEB_RUNTIME) return;
  const gate = getAuthGateEl();
  if (!gate) return;

  const noteClass = AUTH_STATE.error ? 'command-auth-note is-error' : 'command-auth-note';
  const note = AUTH_STATE.error || AUTH_STATE.note || message;

  gate.classList.add('active');
  gate.innerHTML = `
    <div class="command-auth-gate-box">
      <div class="command-auth-eyebrow">Web Access</div>
      <div class="command-auth-title">Unlock Command on the web</div>
      <div class="command-auth-desc">${esc(message)}</div>
      <form class="command-auth-form" id="command-auth-form">
        <input
          id="command-auth-email"
          class="command-auth-input"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="you@example.com"
          value="${esc(AUTH_STATE.pendingEmail)}"
          required
        />
        <button type="submit" class="command-auth-button" ${AUTH_STATE.busy ? 'disabled' : ''}>
          ${AUTH_STATE.busy ? 'Sending…' : 'Email Link'}
        </button>
      </form>
      <div class="${noteClass}">${esc(note)}</div>
      <div class="command-auth-actions">
        <a class="command-auth-link" href="/command">Home</a>
        <a class="command-auth-link" href="/app">Open Topics</a>
      </div>
    </div>`;

  gate.querySelector('#command-auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = gate.querySelector('#command-auth-email')?.value?.trim() || '';
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
  if (AUTH_STATE.session?.adminBypass) return null;
  if (AUTH_STATE.session?.access_token) return AUTH_STATE.session.access_token;
  const client = await ensureWebAuthClient();
  const { data } = await client.auth.getSession();
  AUTH_STATE.session = data?.session || null;
  return AUTH_STATE.session?.access_token || null;
}

globalThis.COGNESION_AUTH.getAccessToken = getAccessToken;

async function getAuthHeaders() {
  const adminBypassToken = readStoredAdminBypassToken();
  if (adminBypassToken) {
    return { 'x-cognesion-admin-bypass': adminBypassToken };
  }

  const accessTokenReader = globalThis.COGNESION_AUTH?.getAccessToken;
  if (typeof accessTokenReader !== 'function') return {};

  try {
    const token = await accessTokenReader();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (error) {
    console.warn('[Command] Failed to read runtime access token:', error?.message || error);
    return {};
  }
}

globalThis.COGNESION_AUTH.getAuthHeaders = getAuthHeaders;
globalThis.COGNESION_AUTH.clearAdminBypass = clearStoredAdminBypassToken;

async function sendMagicLink(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    AUTH_STATE.error = 'Enter the email you want tied to this Command workspace.';
    AUTH_STATE.note = '';
    renderAuthGate();
    return;
  }

  AUTH_STATE.pendingEmail = normalizedEmail;
  AUTH_STATE.busy = true;
  AUTH_STATE.error = '';
  AUTH_STATE.note = '';
  renderAuthGate();

  try {
    const client = await ensureWebAuthClient();
    const { error } = await client.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/command`
      }
    });

    if (error) throw error;

    AUTH_STATE.note = `Magic link sent to ${normalizedEmail}. Open it on this device and Command will unlock automatically.`;
  } catch (error) {
    AUTH_STATE.error = error?.message || 'Unable to send the sign-in email right now.';
  } finally {
    AUTH_STATE.busy = false;
    renderAuthGate('Check your inbox for the magic link, then come back here. Command will unlock as soon as Supabase confirms your session.');
  }
}

async function hydrateSessionFromBrowser() {
  const client = await ensureWebAuthClient();
  const { data } = await client.auth.getSession();
  AUTH_STATE.session = data?.session || null;
  return client;
}

async function hydrateAdminBypassSession() {
  if (!WEB_RUNTIME) return false;

  const adminBypassToken = captureAdminBypassTokenFromLocation() || readStoredAdminBypassToken();
  if (!adminBypassToken) return false;

  try {
    const response = await fetch(`${WEB_API_BASE_URL}/api/auth/session`, {
      headers: {
        'x-cognesion-admin-bypass': adminBypassToken
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.ok === false || !payload?.user?.email) {
      throw new Error(payload?.error || 'Admin pressure-test access is not available right now.');
    }

    AUTH_STATE.session = {
      user: payload.user,
      adminBypass: true
    };
    AUTH_STATE.error = '';
    AUTH_STATE.note = `Admin pressure-test access active for ${payload.user.email}.`;
    return true;
  } catch (error) {
    clearStoredAdminBypassToken();
    AUTH_STATE.session = null;
    AUTH_STATE.error = error?.message || 'Admin pressure-test access could not be validated.';
    return false;
  }
}

async function bootWebAuth() {
  AUTH_STATE.error = '';
  AUTH_STATE.note = 'Use the same email magic link from Topics so Command can use the protected live search and AI routes.';
  renderAuthGate();

  try {
    const bypassActive = await hydrateAdminBypassSession();
    if (bypassActive) {
      clearAuthGate();
      if (!AUTH_STATE.initialized) {
        AUTH_STATE.initialized = true;
        await init();
      }
      return;
    }

    const client = await hydrateSessionFromBrowser();

    client.auth.onAuthStateChange((_event, session) => {
      AUTH_STATE.session = session || null;
      AUTH_STATE.error = '';

      if (session?.user?.email) {
        AUTH_STATE.note = `Signed in as ${session.user.email}.`;
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
      clearAuthGate();
      if (!AUTH_STATE.initialized) {
        AUTH_STATE.initialized = true;
        await init();
      }
      return;
    }

    renderAuthGate();
  } catch (error) {
    AUTH_STATE.error = error?.message || 'Unable to start secure web sign-in.';
    AUTH_STATE.note = '';
    renderAuthGate(AUTH_STATE.error);
  }
}

async function getRuntimeAuthHeaders() {
  return getAuthHeaders();
}

function installWebAiProxy() {
  if (!WEB_RUNTIME || globalThis.__cognesionCommandFetchPatched) return;
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (typeof nativeFetch !== 'function') return;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;

    if (url === 'https://api.openai.com/v1/chat/completions') {
      const authHeaders = await getRuntimeAuthHeaders();
      return nativeFetch(`${WEB_API_BASE_URL}/api/ai/openai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: init?.body
      });
    }

    if (url === 'https://api.anthropic.com/v1/messages') {
      const authHeaders = await getRuntimeAuthHeaders();
      return nativeFetch(`${WEB_API_BASE_URL}/api/ai/anthropic/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: init?.body
      });
    }

    return nativeFetch(input, init);
  };

  globalThis.__cognesionCommandFetchPatched = true;
}

installWebAiProxy();

// Returns the UI translation for `key` in the current radar language, falling back to English.
// radarLanguage is a module-level let; safe to reference here since tl() is only called at runtime.
function tl(key) {
  const t = (radarLanguage && UI_TRANSLATIONS[radarLanguage]) ? UI_TRANSLATIONS[radarLanguage] : UI_TRANSLATIONS.en;
  return t[key] ?? UI_TRANSLATIONS.en[key] ?? key;
}

/** AIRadar loading UI (see AIRadarLoadingScreen.tsx → airadar-loading-screen.js). */
function briefLoadingHTML(status, sub) {
  const g = typeof globalThis !== 'undefined' && globalThis.getAiradarLoadingHTML;
  if (typeof g === 'function') {
    return `<div class="brief-loading">${g({
      hideTagline: true,
      status,
      sub,
      statusClassExtra: 'brief-status',
      subClassExtra: 'brief-sub',
    })}</div>`;
  }
  return `<div class="brief-loading"><div class="hud-bar"></div><div class="brief-status">${status}</div><div class="brief-sub">${sub}</div></div>`;
}

/** Compact card loader (Page Brief modal — same vanilla pipeline as tracker `getAiradarCompactCardHTML`). */
function analystCompactCardHTML(variant, opts) {
  const g = typeof globalThis !== 'undefined' && globalThis.getAiradarCompactCardHTML;
  if (typeof g === 'function') {
    return `<div class="brief-loading brief-loading--airadar-compact">${g(variant, opts)}</div>`;
  }
  return briefLoadingHTML('Analyzing with Claude...', 'Processing full article text');
}

const HypothesisEngine = {
  /**
   * Parses a belief claim string and returns the latest date it references,
   * or null if no recognisable date is found.
   * Handles: "Q1 2026", "Q4 2025", "end of 2025", "by 2025", "mid-2026", etc.
   */
  _extractClaimDeadline(claim) {
    const text = claim.toLowerCase();
    const now = new Date();

    // Quarter patterns: "Q1 2026", "q4 2025"
    const quarterMatch = text.match(/q([1-4])\s*(20\d{2})/);
    if (quarterMatch) {
      const quarter = parseInt(quarterMatch[1], 10);
      const year = parseInt(quarterMatch[2], 10);
      // End of the quarter: Q1→Mar 31, Q2→Jun 30, Q3→Sep 30, Q4→Dec 31
      const monthEnd = quarter * 3;
      return new Date(year, monthEnd, 0); // day 0 = last day of previous month
    }

    // "by end of YYYY" / "end of YYYY" / "by YYYY" / "in YYYY" / "mid-YYYY"
    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      return new Date(year, 11, 31); // Dec 31 of that year
    }

    return null;
  },

  /**
   * Returns true if the claim references a timeframe that has already passed.
   */
  _isExpiredClaim(claim) {
    const deadline = this._extractClaimDeadline(claim);
    if (!deadline) return false;
    return deadline < new Date();
  },

  async updateBeliefs(currentResults, topic) {
    const stored = await chrome.storage.local.get(['hypotheses']);
    let hypotheses = stored.hypotheses || [];

    // Archive any persisted beliefs whose stated timeframe has already passed
    let expiredCount = 0;
    hypotheses = hypotheses.map(h => {
      if (h.topic === topic && h.status !== 'archived' && this._isExpiredClaim(h.claim)) {
        expiredCount++;
        console.log(`[Expiry] Archiving expired belief: "${h.claim.substring(0, 70)}..."`);
        return {
          ...h,
          status: 'archived',
          lastUpdated: new Date().toISOString(),
        };
      }
      return h;
    });
    if (expiredCount > 0) {
      await chrome.storage.local.set({ hypotheses });
      console.log(`[Expiry] Archived ${expiredCount} expired belief(s) for topic "${topic}"`);
    }

    const topicHyps = hypotheses.filter(h => h.topic === topic && h.status !== 'archived');
    if (topicHyps.length === 0) {
      const generated = await this.generateHypotheses(currentResults, topic);
      hypotheses.push(...generated);
    } else {
      // Pre-extract claims from all articles ONCE (shared across all hypotheses)
      console.log(`[Pipeline] Pre-extracting claims from ${currentResults.length} articles...`);
      const articleClaimsMap = new Map();
      for (const article of currentResults) {
        const claims = await this.extractClaims(article.summary || article.text || "", article.title || "");
        articleClaimsMap.set(article.link, claims);
        console.log(`[Pipeline] Pre-extract: "${article.title?.substring(0, 40)}..." → ${claims.length} claims`);
      }
      
      for (const hyp of topicHyps) {
        // PHASE 1: Only evaluate NEW articles
        if (!Array.isArray(hyp.evidence)) hyp.evidence = [];
        if (!hyp.sourceDomains) hyp.sourceDomains = {};  // Track source frequency: { 'techcrunch.com': 3, 'wired.com': 1, ... }
        const evaluatedUrls = new Set(hyp.evidence.map(e => e.link).filter(Boolean));
        const newArticles = currentResults.filter(a => !evaluatedUrls.has(a.link));
        
        // Skip if no new evidence
        if (newArticles.length === 0) {
          console.log(`[NO NEW] No new evidence for: ${hyp.claim.substring(0, 60)}`);
          
          // Initialize counter if needed
          if (typeof hyp.scansSinceChange !== 'number') {
            hyp.scansSinceChange = 0;
          }
          
          hyp.scansSinceChange++;
          console.log(`[DECAY CHECK] scansSinceChange = ${hyp.scansSinceChange}, confidence = ${hyp.confidence}%`);
          
          // Apply decay after 2 scans with no change
          if (hyp.scansSinceChange >= 2 && hyp.confidence > 50) {
            const oldConf = hyp.confidence;
            hyp.confidence = Math.max(50, hyp.confidence - 3);
            
            if (!Array.isArray(hyp.revisionHistory)) hyp.revisionHistory = [];
            hyp.revisionHistory.push({
              date: new Date().toISOString(),
              oldConfidence: oldConf,
              newConfidence: hyp.confidence,
              reason: `[DECAY] No new articles for ${hyp.scansSinceChange} scans`,
              evidenceCount: 0
            });
            
            console.log(`[DECAY] Applied: ${hyp.claim.substring(0, 50)}: ${oldConf}% → ${hyp.confidence}% (${hyp.scansSinceChange} scans)`);
          }
          
          continue;
        }
        
        // ── PHASE 2: 4-PASS REASONING PIPELINE ──────────────────────────────
        let anyArticleUpdated = false;
        let articlesProcessedThisScan = 0;
        let totalScanConfidenceChange = 0;

        for (const article of newArticles) {
          if (articlesProcessedThisScan >= 3) {
            console.log(`[Pipeline] Article limit reached (3/scan), skipping remaining`);
            break;
          }
          
          console.log(`[Pipeline] Processing: ${article.title?.substring(0, 60)}...`);
          
          // Pass 1: Load pre-extracted claims
          const claims = articleClaimsMap.get(article.link) || [];
          if (claims.length === 0) {
            console.log(`[Pipeline] Pass 1: No claims for this article, skipping`);
            continue;
          }
          console.log(`[Pipeline] Pass 1: ${claims.length} claims loaded`);
          
          // Pass 2: Classify claims against hypothesis
          const classification = await this.classifyClaims(hyp, claims, article);
          if (classification.supporting.length === 0 && classification.contradicting.length === 0) {
            console.log(`[Pipeline] Pass 2: No relevant claims, skipping article`);
            continue;
          }
          console.log(`[Pipeline] Pass 2: ${classification.supporting.length} supporting, ${classification.contradicting.length} contradicting`);
          
          // Pass 3: Generate counter-hypothesis (only when enough supporting evidence)
          let counterHypothesis = null;
          if (classification.supporting.length >= 2) {
            counterHypothesis = await this.generateCounterHypothesis(hyp, classification.supporting);
            if (counterHypothesis) {
              console.log(`[Pipeline] Pass 3: Counter generated (strength: ${counterHypothesis.strength.toFixed(2)})`);
            }
          }
          
          // Pass 4: Multi-factor confidence scoring
          const update = await this.calculateMultiFactorConfidence(hyp, classification, article, counterHypothesis);
          console.log(`[Pipeline] Pass 4: Confidence change = ${update.confidenceChange > 0 ? '+' : ''}${update.confidenceChange}`);
          
          // Accumulate scan-level change (don't apply per-article yet)
          totalScanConfidenceChange += update.confidenceChange;
          articlesProcessedThisScan++;
          
          // Store evidence items
          if (!Array.isArray(hyp.evidence)) hyp.evidence = [];
          classification.supporting.forEach(c => {
            hyp.evidence.push({
              text: c.claim,
              impact: Math.round(c.strength * 10),
              date: new Date().toISOString(),
              source: article.source,
              link: article.link
            });
          });
          classification.contradicting.forEach(c => {
            hyp.evidence.push({
              text: c.claim,
              impact: -Math.round(c.strength * 10),
              date: new Date().toISOString(),
              source: article.source,
              link: article.link
            });
          });
          
          // Store latest counter-hypothesis for the revision log
          if (counterHypothesis) {
            hyp._lastCounterHypothesis = counterHypothesis.counterHypothesis;
          }
          
          anyArticleUpdated = true;
          console.log(`[Pipeline] Article ${articlesProcessedThisScan}/3: change contribution = ${update.confidenceChange > 0 ? '+' : ''}${update.confidenceChange}`);
        }

        // Confidence dampening — high-confidence beliefs resist further upward movement
        function getDampeningFactor(currentConfidence) {
          if (currentConfidence < 70) return 1.0;
          if (currentConfidence < 80) return 0.6;
          if (currentConfidence < 90) return 0.3;
          return 0.1;
        }
        
        // Apply TOTAL scan change (capped at ±8, then dampened)
        if (anyArticleUpdated) {
          const clampedScanChange = Math.max(-8, Math.min(8, totalScanConfidenceChange));
          
          // Dampen positive changes at high confidence; negative changes pass through
          const dampenedChange = clampedScanChange > 0
            ? Math.round(clampedScanChange * getDampeningFactor(hyp.confidence))
            : clampedScanChange;
          
          const oldConf = hyp.confidence;
          hyp.confidence = Math.max(50, Math.min(99, hyp.confidence + dampenedChange));
          
          if (!Array.isArray(hyp.revisionHistory)) hyp.revisionHistory = [];
          hyp.revisionHistory.push({
            date: new Date().toISOString(),
            oldConfidence: oldConf,
            newConfidence: hyp.confidence,
            reason: `${articlesProcessedThisScan} article(s) evaluated. Raw score: ${totalScanConfidenceChange > 0 ? '+' : ''}${totalScanConfidenceChange}, capped to: ${clampedScanChange > 0 ? '+' : ''}${clampedScanChange}, dampened to: ${dampenedChange > 0 ? '+' : ''}${dampenedChange}`,
            counterHypothesis: hyp._lastCounterHypothesis || null,
            evidenceCount: hyp.evidence.length
          });
          
          delete hyp._lastCounterHypothesis;
          hyp.scansSinceChange = 0;
          hyp.lastUpdated = new Date().toISOString();
          
          console.log(`[Pipeline] ✅ FINAL: ${hyp.claim.substring(0, 50)}: ${oldConf}% → ${hyp.confidence}% (raw: ${totalScanConfidenceChange > 0 ? '+' : ''}${totalScanConfidenceChange}, applied: ${dampenedChange > 0 ? '+' : ''}${dampenedChange})`);
        }

        // Apply decay if no articles updated this hypothesis
        if (!anyArticleUpdated) {
          if (typeof hyp.scansSinceChange !== 'number') hyp.scansSinceChange = 0;
          hyp.scansSinceChange++;
          
          console.log(`[DECAY CHECK] scansSinceChange = ${hyp.scansSinceChange}, confidence = ${hyp.confidence}%`);
          
          if (hyp.scansSinceChange >= 2 && hyp.confidence > 50) {
            const oldConf = hyp.confidence;
            hyp.confidence = Math.max(50, hyp.confidence - 3);
            
            if (!Array.isArray(hyp.revisionHistory)) hyp.revisionHistory = [];
            hyp.revisionHistory.push({
              date: new Date().toISOString(),
              oldConfidence: oldConf,
              newConfidence: hyp.confidence,
              reason: `[DECAY] No new evidence for ${hyp.scansSinceChange} scans`,
              evidenceCount: 0
            });
            
            console.log(`[DECAY] Applied: ${hyp.claim.substring(0, 50)}: ${oldConf}% → ${hyp.confidence}% (${hyp.scansSinceChange} scans)`);
          }
        }
        // ── END PHASE 2 PIPELINE ─────────────────────────────────────────────
      }
      
      console.log(`Beliefs updated. ${topicHyps.length} hypotheses processed.`);

      // Calculate cross-session metrics for all hypotheses
      topicHyps.forEach(hyp => {
        const metrics = this.calculateCrossSessionMetrics(hyp);
        hyp.velocity = metrics.velocity;
        hyp.trendDirection = metrics.trendDirection;
        hyp.momentum = metrics.momentum;
      });

      topicHyps.forEach(h => console.log(`  - ${h.claim}: ${h.confidence}% (${h.evidence?.length || 0} evidence)`));
    }
    
    await chrome.storage.local.set({ hypotheses });
    return hypotheses.filter(h => h.topic === topic && h.status !== 'archived');
  },
  
  async generateHypotheses(articles, topic) {
    if (!HARDCODED_OPENAI_KEY) return [];
    // Include summaries so the model can ground hypotheses in actual article content,
    // not just infer relationships from headline patterns
    const articleList = articles.slice(0, 10).map((a, i) => {
      const summary = (a.summary || '').substring(0, 300).trim();
      return `[${i + 1}] "${a.title}" (${a.source})${summary ? `\n    Summary: ${summary}` : ''}`;
    }).join("\n\n");
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.toLocaleString('default', { month: 'long' });
    const prompt = `Based on these articles about "${topic}", generate 3-5 testable hypotheses about future trends.

TODAY'S DATE: ${currentMonth} ${currentYear}. All timeframes MUST be in the future from today.

FACTUAL GROUNDING RULES (highest priority):
- ONLY assert relationships, partnerships, funding, or facts that are explicitly stated in the article summaries below
- Do NOT infer that two companies are working together just because they appear in separate articles
- Do NOT combine facts from different articles to create a new relationship (e.g. Company A + Company B → joint product) unless one article explicitly states that relationship
- If a claim would require connecting dots across articles, it is speculation — discard it
- Named entities matter: "OpenAI" and "Anthropic" are different companies; "Amazon" and "Microsoft" are different companies — never conflate them

REQUIREMENTS for each hypothesis:
- Must name SPECIFIC actors exactly as they appear in the source articles
- Must name a SPECIFIC outcome with a mechanism (not "will focus on" — what exactly will happen and how?)
- Must include a FUTURE timeframe: use ${currentYear} or ${currentYear + 1} — NEVER use a year or quarter that has already passed
- Must be FALSIFIABLE: a neutral observer must be able to check true/false against public evidence
- Must NOT be trivially true or so broad that any AI news could count as evidence
- Starting confidence 50-55% unless the articles contain unusually direct, specific evidence

AVOID PRECISE CLAIMS UNLESS ARTICLES DIRECTLY SUPPORT THEM:
- Do NOT use specific percentages (e.g. "20% improvement") unless an article explicitly reports that number
- Do NOT make comparative claims (e.g. "X will outperform Y") unless articles actually compare them
- Prefer directional claims ("will improve", "will grow") over numeric ones unless the number is in the articles
- If articles show correlation (e.g. "AI users have bigger baskets"), do NOT infer causation or different metrics — stick to what the evidence measures

REJECT any hypothesis whose timeframe (e.g. "Q4 2025") has already passed as of ${currentMonth} ${currentYear}.

BAD examples (reject these patterns):
- "Governments will increasingly focus on AI-driven solutions" — no named actor, unfalsifiable
- "OpenAI's partnership with the Pentagon will lead to deployments by Q4 2025" — Q4 2025 is in the past
- "OpenAI and Amazon will jointly build products" — unless one article explicitly states this relationship

GOOD example: "OpenAI's Pentagon contract will result in at least one formally documented DOD pilot program by Q3 ${currentYear}"
— Named actors from article, specific verifiable outcome, future timeframe, falsifiable

Format as JSON: {"hypotheses":[{"claim":"...", "confidence":50, "reasoning":"..."}]}

reasoning must include: (1) which specific article(s) support this hypothesis, (2) what measurement would confirm or deny it, (3) what would make it false.

Articles:\n${articleList}`;
    
    try {
      console.log("Generating hypotheses for:", topic, "with", articles.length, "articles");
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${HARDCODED_OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });
      
      const data = await response.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      console.log("Generated hypotheses:", parsed.hypotheses?.length || 0);
        return (parsed.hypotheses || []).map(h => ({
          id: crypto.randomUUID(),
          claim: h.claim,
          confidence: Math.min(65, Math.max(50, h.confidence)),
        topic: topic,
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        evidence: [{ text: h.reasoning, impact: 0, date: new Date().toISOString() }],
        revisionHistory: []
      }));
    } catch (e) {
      console.error("Hypothesis generation failed:", e.message, e);
      return [];
    }
  },

  /**
   * Generate fresh beliefs from the current scan's articles.
   * No storage read/write — purely session-scoped.
   * Returns a belief array compatible with all renderBeliefCard_* views.
   */
  async generateFreshBeliefs(articles, topic) {
    if (!HARDCODED_OPENAI_KEY || !articles || articles.length === 0) return [];

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.toLocaleString('default', { month: 'long' });

    const articleList = articles.slice(0, 12).map((a, i) => {
      const summary = (a.summary || '').substring(0, 300).trim();
      return `[${i + 1}] "${a.title}" (${a.source})${summary ? `\nSummary: ${summary}` : ''}`;
    }).join('\n\n');

    // Collect source domains from all articles for evidence scaffolding
    const sourceDomains = {};
    articles.slice(0, 12).forEach(a => {
      try {
        const domain = new URL(a.link || a.url || 'https://unknown').hostname.replace('www.', '');
        sourceDomains[domain] = (sourceDomains[domain] || 0) + 1;
      } catch {}
    });

    const prompt = `You are an intelligence analyst. Based on ONLY these articles scanned right now about "${topic}", synthesise 3-5 emerging hypotheses that represent the most important signals in the data.

TODAY: ${currentMonth} ${currentYear}

RULES:
- Ground every hypothesis in specific facts from the articles — no speculation beyond what's written
- Each hypothesis must name specific actors, specific outcomes, specific timeframes
- Timeframes must be future-dated from today (${currentYear} or ${currentYear + 1})
- Rate confidence 50-80% — fresh signals only; nothing is certain yet
- trendDirection: "increasing" if multiple articles reinforce this, "decreasing" if challenged/declining, "stable" if mixed
- momentum score: 1.0-4.0 (4 = multiple strong corroborating signals, 1 = single weak signal)
- For each hypothesis include 2-4 key evidence snippets drawn directly from the articles

AVOID PRECISE CLAIMS UNLESS ARTICLES DIRECTLY SUPPORT THEM:
- Do NOT use specific percentages (e.g. "20% improvement") unless an article explicitly reports that number
- Do NOT make comparative claims (e.g. "X will outperform Y") unless articles actually compare them
- Prefer directional claims ("will improve", "will grow") over numeric ones unless the number is in the articles
- If articles show correlation (e.g. "AI users have bigger baskets"), do NOT infer causation or different metrics — stick to what the evidence measures

Return JSON only:
{
  "beliefs": [
    {
      "claim": "specific falsifiable prediction",
      "confidence": 62,
      "trendDirection": "increasing",
      "momentum": 2.5,
      "reasoning": "1-2 sentence grounding in the articles",
      "evidence": [
        { "text": "direct quote or paraphrase from article", "source": "source name", "impact": 6 }
      ]
    }
  ]
}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HARDCODED_OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt + '\n\nArticles:\n' + articleList }],
          response_format: { type: 'json_object' }
        })
      });

      const data = await response.json();
      const parsed = JSON.parse(data.choices[0].message.content);

      return (parsed.beliefs || []).map(b => ({
        id: crypto.randomUUID(),
        claim: b.claim,
        confidence: Math.min(80, Math.max(50, b.confidence)),
        topic,
        lastUpdated: new Date().toISOString(),
        trendDirection: b.trendDirection || 'stable',
        momentum: { score: b.momentum || 1.5 },
        velocity: { perScan: 0, perDay: 0 },
        sourceDomains,
        evidence: (b.evidence || []).map(e => ({
          text: e.text,
          impact: e.impact || 5,
          source: e.source || '',
          date: new Date().toISOString()
        })),
        revisionHistory: [],
        reasoning: b.reasoning || ''
      }));
    } catch (e) {
      console.error('[FreshBeliefs] Generation failed:', e);
      return [];
    }
  },

  async evaluateEvidence(hypothesis, newArticles) {
    if (!HARDCODED_OPENAI_KEY) return { confidenceChange: 0, reason: "No API key", newEvidence: [] };
    if (!newArticles || newArticles.length === 0) return { confidenceChange: 0, reason: "No new articles", newEvidence: [] };
    
    const articleList = newArticles.slice(0,5).map(a => `${a.title}: ${a.summary}`).join("\n");
    const prompt = `You are a critical analyst evaluating a hypothesis.

HYPOTHESIS: "${hypothesis.claim}"
CURRENT CONFIDENCE: ${hypothesis.confidence}%

NEW EVIDENCE:
${articleList}

TASK: Actively look for BOTH confirming AND contradicting signals.

Evaluate the evidence:
- STRONG SUPPORT (+10 to +15): Clear, direct confirmation from credible sources
- WEAK SUPPORT (+3 to +9): Suggestive but not definitive
- NEUTRAL (0): Interesting but doesn't affect this hypothesis
- WEAK CONTRADICTION (-3 to -9): Raises questions or concerns
- STRONG CONTRADICTION (-10 to -15): Directly contradicts the hypothesis

CRITICAL: Do not just look for confirmation. Ask "What would make this hypothesis WRONG?" and search for those signals.

Respond JSON: {
  "impact": -15 to +15,
  "reason": "2-3 sentence explanation focusing on WHY this changes confidence",
  "relevantArticles": ["title1", "title2"]
}`;
    
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${HARDCODED_OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });
      
      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content);
      
      return {
        confidenceChange: result.impact || 0,
        reason: result.reason,
        newEvidence: (result.relevantArticles || []).map(title => {
          const article = newArticles.find(a => a.title.includes(title));
          return {
            text: title,
            impact: result.impact,
            date: new Date().toISOString(),
            source: article?.source || "unknown",
            link: article?.link || null
          };
        })
      };
    } catch (e) {
      console.error("Evidence evaluation failed:", e);
      return { confidenceChange: 0, reason: "Evaluation error", newEvidence: [] };
    }
  },
  
  async extractClaims(articleText, articleTitle) {
    if (!HARDCODED_OPENAI_KEY || !articleText || articleText.length < 50) {
      console.log("[ClaimExtraction] Skipped: insufficient input");
      return [];
    }
    
    const prompt = `You are an intelligence analyst extracting actionable facts from this article.

Title: ${articleTitle}
Text: ${articleText.substring(0, 1500)}

Extract 2-4 intelligence claims. Each claim must specify:
- WHO (specific actors: names, companies, governments, amounts)
- WHAT (specific actions: commitments, dates, numbers, policies)
- WHY (constraints, motivations, causality - if stated in article)

GOOD examples (specific, falsifiable, actionable):
- "India announced $90B AI infrastructure pipeline with tax holidays until 2047, but IndiaAI Mission budget is only $1.2B (equivalent to 6 months of OpenAI spending)"
- "Pentagon mandates deployment of new AI models within 30 days of public release; Anthropic refuses autonomous weapons use while OpenAI, Google, xAI accepted 'all lawful uses' clause"
- "Mrinank Sharma resigned from Anthropic stating values don't govern actions; Zoe Hitzig left OpenAI over ChatGPT ad testing; two xAI cofounders departed after Grok deepfake scandal"
- "Jefferies predicts India call centers face 50% revenue hit from AI by 2030, same country courting $90B AI investment"

BAD examples (reject all of these patterns):
- "AI capabilities are improving rapidly" — no actor, no number, not falsifiable
- "Government investment in AI is increasing worldwide" — too vague, no named government
- "Safety concerns are growing in the AI community" — opinion without attribution
- "Companies are racing to deploy new models" — no named companies, no specifics
- "Multiple articles highlight X's partnership, suggesting potential developments" — THIS IS META-COMMENTARY, not a claim. Never extract summaries of press coverage as facts.
- "Reports indicate growing interest in..." — same problem, extract the underlying fact not the meta-observation

CRITICAL RULES:
- Extract FACTS from the article, not observations about the article or its press coverage
- Never write "Multiple articles highlight...", "Reports suggest...", "Coverage indicates..." — these describe media attention, not facts
- Include specific numbers (dollars, percentages, dates, counts)
- Name specific actors (people, companies, governments, agencies)
- Identify contradictions when present (X claims Y, but evidence shows Z)
- If article is vague/generic with no specific facts, return empty array rather than vague claims
- Reject pure speculation without direct attribution to a named source

Return JSON: {"claims": ["specific claim with named actor and action", "another specific claim"]}`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${HARDCODED_OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 400,
          response_format: { type: "json_object" }
        })
      });
      
      if (!response.ok) {
        console.error("[ClaimExtraction] OpenAI API error:", response.status);
        return [];
      }
      
      const data = await response.json();
      const content = data.choices[0].message.content;
      
      let parsed;
      try {
        parsed = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (parseErr) {
        console.error("[ClaimExtraction] JSON parse failed:", parseErr.message);
        return [];
      }
      
      let claims = Array.isArray(parsed) ? parsed : (parsed.claims || parsed.statements || []);
      
      // Specificity gate: reject claims that lack at least one concrete anchor.
      // A vague claim like "competitions will solve problems using AI" has no named
      // actor, no number, and no named policy — it tells us nothing checkable.
      const hasSpecificityMarker = claim => {
        // Named org/person patterns (capitalized proper nouns 2+ words, acronyms, or "the X Agency/Act/Commission")
        const hasNamedEntity = /\b([A-Z][a-z]+ ){1,}[A-Z][a-z]+|\b[A-Z]{2,}\b/.test(claim);
        // Numbers (dollar amounts, percentages, counts, years)
        const hasNumber = /\$[\d,]+|\b\d+[\d,.]*\s*(%|billion|million|trillion|B\b|M\b|K\b|\byear\b|\bmonth\b)|\b20[2-9]\d\b|\b\d{2,}\b/.test(claim);
        // Specific policy, law, or named program
        const hasPolicy = /\bact\b|\blaw\b|\bregulat|\bpolicy|\bmandate|\bban\b|\bbill\b|\bagreement\b|\bpartnership\b|\bcommit/i.test(claim);
        return hasNamedEntity || hasNumber || hasPolicy;
      };

      // Block meta-commentary patterns — these describe press coverage, not facts
      const isMetaCommentary = claim => {
        return /^(multiple articles|reports (suggest|indicate|show)|coverage (suggests|indicates)|articles highlight|media report|press coverage|recent reports|several sources)/i.test(claim.trim());
      };

      claims = claims
        .filter(c => typeof c === 'string' && c.length > 30 && c.length < 300)
        .filter(hasSpecificityMarker)
        .filter(c => !isMetaCommentary(c))
        .slice(0, 4);
      
      console.log(`[ClaimExtraction] Extracted ${claims.length} claims from: ${articleTitle.substring(0, 50)}...`);
      if (claims.length > 0) {
        console.log(`[ClaimExtraction] Sample claim: ${claims[0].substring(0, 100)}...`);
      }
      
      return claims;
      
    } catch (e) {
      console.error("[ClaimExtraction] Failed:", e.message);
      return [];
    }
  },
  
  async classifyClaims(hypothesis, claims, article) {
    if (!HARDCODED_OPENAI_KEY || !claims || claims.length === 0) {
      console.log("[ClaimClassification] Skipped: no claims to classify");
      return { supporting: [], contradicting: [], neutral: [] };
    }
    
    const claimsList = claims.map((c, i) => `${i + 1}. ${c}`).join('\n');
    
    const prompt = `Hypothesis: "${hypothesis.claim}"
Current confidence: ${hypothesis.confidence}%

Classify each claim against this hypothesis:
${claimsList}

CLASSIFICATION RULES:

SUPPORTING: Claim provides DIRECT, SPECIFIC evidence that this exact hypothesis is happening
- Must involve the SAME specific actors as the hypothesis (e.g., if hypothesis says "governments", private companies don't count)
- Must address the SAME domain/outcome as the hypothesis (e.g., "AI-driven solutions to social issues" ≠ generic AI investment)
- Must provide concrete evidence — not ambient noise about a related topic
- Requires: named actors + specific actions/commitments + on-topic outcome
- Ask yourself: "Does this claim make the hypothesis MORE likely to be TRUE in a way that couldn't be explained by coincidence?"

CONTRADICTING: Claim provides DIRECT, SPECIFIC evidence that undermines this exact hypothesis
- Must directly challenge the CORE claim, not a tangential aspect
- Must involve the relevant actors or domain
- Concrete failures, reversals, binding constraints, or specific actors doing the OPPOSITE of what is predicted
- Generic skepticism or unrelated risks do NOT count

NEUTRAL: Everything that doesn't clearly meet supporting or contradicting criteria
- Related topics but different actors, scope, or domain
- General trends without specifics
- Adjacent industry activity that doesn't directly implicate the hypothesis
- Tangential facts, different timeframe, or different geography
- When in doubt, classify as NEUTRAL — false positives are costly

CRITICAL SPECIFICITY TEST (apply before classifying as supporting/contradicting):
- "EU passes binding AI regulation for healthcare systems" → High specificity, directly on-topic → can support/contradict
- "F/ai startup accelerator funds European AI companies" → Private sector, not government → NEUTRAL
- "Investment funds raised for AI technology" → No government actor, no social issue → NEUTRAL
- "Scientific AI panel will discuss AI issues" → Advisory discussion, not government initiative → NEUTRAL
- "Competition to solve problems using AI" → Private/unspecified → NEUTRAL unless organizer is a named government

SCORING GUIDE:

Strength (0-1): How conclusive is the specific evidence?
- 0.8-1.0: Named government actors + specific policies/amounts + binding commitments + verifiable outcomes
- 0.6-0.8: Credible governmental sources + concrete actions + directional data
- 0.4-0.6: Attributed government statements + implied policies (weaker)
- <0.4: Private actors, speculation, adjacent-domain signals — classify as NEUTRAL instead

Relevance (0-1): How precisely does this address the EXACT hypothesis claim?
- 0.8-1.0: Same actors + same domain + same predicted direction
- 0.6-0.8: Same actors OR same domain, not both
- <0.6: Different actors or different domain — classify as NEUTRAL instead

FILTER THRESHOLDS (strict):
- Only supporting/contradicting claims with relevance >= 0.6 AND strength >= 0.5
- If a claim only partially matches the hypothesis domain, classify as NEUTRAL
- Prefer false negatives (too conservative) over false positives (too generous)

Return JSON:
{
  "supporting": [{"claim": "text", "strength": 0.8, "relevance": 0.9}],
  "contradicting": [{"claim": "text", "strength": 0.6, "relevance": 0.7}],
  "neutral": [{"claim": "text", "relevance": 0.4}]
}`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${HARDCODED_OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 600,
          response_format: { type: "json_object" }
        })
      });
      
      if (!response.ok) {
        console.error("[ClaimClassification] OpenAI API error:", response.status);
        return { supporting: [], contradicting: [], neutral: [] };
      }
      
      const data = await response.json();
      const content = data.choices[0].message.content;
      
      let parsed;
      try {
        parsed = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (parseErr) {
        console.error("[ClaimClassification] JSON parse failed:", parseErr.message);
        return { supporting: [], contradicting: [], neutral: [] };
      }
      
      const result = {
        supporting: (parsed.supporting || []).filter(c => c.relevance >= 0.6 && c.strength >= 0.5),
        contradicting: (parsed.contradicting || []).filter(c => c.relevance >= 0.6 && c.strength >= 0.5),
        neutral: (parsed.neutral || []).filter(c => c.relevance >= 0.4)
      };
      
      console.log(`[ClaimClassification] Hypothesis: "${hypothesis.claim.substring(0, 50)}..."`);
      console.log(`  Supporting: ${result.supporting.length}, Contradicting: ${result.contradicting.length}, Neutral: ${result.neutral.length}`);
      if (result.supporting.length > 0) {
        console.log(`  Top supporting (${result.supporting[0].strength.toFixed(2)}): ${result.supporting[0].claim.substring(0, 80)}...`);
      }
      
      return result;
      
    } catch (e) {
      console.error("[ClaimClassification] Failed:", e.message);
      return { supporting: [], contradicting: [], neutral: [] };
    }
  },
  
  async generateCounterHypothesis(hypothesis, supportingClaims) {
    if (!HARDCODED_OPENAI_KEY || !supportingClaims || supportingClaims.length === 0) {
      console.log("[CounterHypothesis] Skipped: no supporting claims");
      return null;
    }
    
    const claimsList = supportingClaims.map((c, i) => 
      `${i + 1}. ${c.claim} (strength: ${c.strength.toFixed(2)}, relevance: ${c.relevance.toFixed(2)})`
    ).join('\n');
    
    const prompt = `Hypothesis: "${hypothesis.claim}"
Current confidence: ${hypothesis.confidence}%

Supporting evidence:
${claimsList}

Generate a strong counter-hypothesis that challenges this belief using one of these strategies:

1. ALTERNATIVE CAUSALITY
   - Same evidence, different explanation
   - Example: "India's $90B AI infrastructure bid" could be general cloud buildout, not AI leadership positioning
   - Mechanism: Evidence supports different conclusion when viewed through different lens

2. HIDDEN CONSTRAINTS
   - What prevents the hypothesis from actually happening?
   - Example: "Pentagon deployment mandate (30 days)" contradicts "safety research exodus" - can't deploy safely that fast
   - Mechanism: Identify binding constraints that block the predicted outcome

3. CONTRADICTORY FORCES
   - What opposing trends undermine this prediction?
   - Example: "India courting $90B AI investment" while "Jefferies predicts 50% call center job loss" - investing in own displacement
   - Mechanism: Show conflicting incentives or self-defeating dynamics

4. MISSING CONTEXT
   - What perspective reverses the conclusion?
   - Example: "Voluntary AI safety pledges" vs "Mandatory military deployment timelines" - power asymmetry favors deployment
   - Mechanism: Broader context shows the evidence is misleading or cherry-picked

5. EXECUTION GAP
   - What gap exists between announcement and reality?
   - Example: "India $90B pipeline announced" but "IndiaAI Mission only $1.2B" - 75x gap between rhetoric and budget
   - Mechanism: Track record or resource constraints suggest non-delivery

REQUIREMENTS for counter-hypothesis:
- Must use SPECIFIC facts from the evidence (not generic skepticism)
- Must identify a MECHANISM that undermines the claim
- Must be FALSIFIABLE (not just "maybe it won't happen")
- Must address the SAME domain as hypothesis (not tangential concern)
- Avoid weak objections like "things could change" or "we don't know enough"

STRENGTH CALIBRATION:
- 0.8-1.0: Strong contradicting evidence, binding constraints, incompatible forces with named specifics
- 0.6-0.8: Meaningful challenges with concrete examples, identified risks, plausible alternatives
- 0.4-0.6: Contextual concerns with some evidence, missing pieces explained, reasonable doubt
- 0.3-0.4: Weak objections with minimal support, theoretical problems
- <0.3: Generic skepticism, speculation without mechanism (REJECT these)

Return JSON:
{
  "counterHypothesis": "Specific alternative claim naming constraints/contradictions/mechanisms",
  "strength": 0.0 to 1.0,
  "reasoning": "Explain the specific mechanism/constraint/contradiction that undermines the hypothesis"
}`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${HARDCODED_OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.5,
          max_tokens: 400,
          response_format: { type: "json_object" }
        })
      });
      
      if (!response.ok) {
        console.error("[CounterHypothesis] OpenAI API error:", response.status);
        return null;
      }
      
      const data = await response.json();
      const content = data.choices[0].message.content;
      
      let parsed;
      try {
        parsed = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (parseErr) {
        console.error("[CounterHypothesis] JSON parse failed:", parseErr.message);
        return null;
      }
      
      if (!parsed.counterHypothesis || parsed.strength < 0.3) {
        console.log("[CounterHypothesis] Counter too weak to log (strength < 0.3)");
        return null;
      }
      
      console.log(`[CounterHypothesis] Generated (strength: ${parsed.strength.toFixed(2)}): ${parsed.counterHypothesis.substring(0, 80)}...`);
      console.log(`  Mechanism: ${parsed.reasoning.substring(0, 100)}...`);
      
      return parsed;
      
    } catch (e) {
      console.error("[CounterHypothesis] Failed:", e.message);
      return null;
    }
  },
  
  async calculateMultiFactorConfidence(hypothesis, classification, article, counterHypothesis) {
    // Factor 1: Evidence Strength
    // Sum weighted scores from supporting vs contradicting claims
    const supportingScore = classification.supporting.reduce((sum, c) => {
      return sum + (c.strength * c.relevance);
    }, 0);
    
    const contradictingScore = classification.contradicting.reduce((sum, c) => {
      return sum + (c.strength * c.relevance);
    }, 0);
    
    const rawEvidenceScore = supportingScore - contradictingScore;
    
    // Normalize to -8 to +8 range (per-article cap)
    // rawEvidenceScore typically ranges from -3 to +3 with a few claims
    const evidenceStrength = Math.max(-5, Math.min(5, Math.round(rawEvidenceScore * 4)));
    
    // Factor 2: Source Diversity (tiered bonus + overall multiplier)
    const normalizedDomain = normalizeDomain(article.source);
    let sourceDiversityBonus = 0;
    let diversityMultiplier = 1.0;

    if (normalizedDomain) {
      // Track how many times we've seen this source
      const timesSeenSource = hypothesis.sourceDomains[normalizedDomain] || 0;
      
      // Tiny diversity nudge: source novelty alone must not drive confidence —
      // only on-topic evidence should. First occurrence gets a small bonus,
      // repeat sources get nothing.
      if (timesSeenSource === 0) sourceDiversityBonus = 0.5;
      else sourceDiversityBonus = 0;
      
      // Update tracking (will persist when hypothesis is saved)
      hypothesis.sourceDomains[normalizedDomain] = timesSeenSource + 1;
      
      // Calculate overall diversity score
      const uniqueSources = Object.keys(hypothesis.sourceDomains).length;
      const totalEvidence = hypothesis.evidence.length + 1; // +1 for current article
      const diversityScore = uniqueSources / totalEvidence;
      
      // Apply diversity multiplier to evidence strength
      diversityMultiplier = calculateDiversityMultiplier(diversityScore);
      
      console.log(`[Diversity] Source: ${normalizedDomain} (occurrence #${timesSeenSource + 1}) | Diversity: ${diversityScore.toFixed(2)} → ${diversityMultiplier}× multiplier | Bonus: +${sourceDiversityBonus}`);
    }
    
    // Factor 3: Temporal Weight (refined decay curve)
    // Recent articles carry more weight; old articles decay significantly
    let temporalMultiplier = 1.0;
    let articleAgeInDays = null;

    if (article.date) {
      const articleDate = new Date(article.date);
      const ageInMilliseconds = Date.now() - articleDate.getTime();
      articleAgeInDays = ageInMilliseconds / (1000 * 60 * 60 * 24); // Convert to days
      
      // 5-tier decay curve
      if (articleAgeInDays <= 2) {
        temporalMultiplier = 1.0;      // 0-2 days: full weight (breaking news)
      } else if (articleAgeInDays <= 7) {
        temporalMultiplier = 0.8;      // 3-7 days: recent (slight discount)
      } else if (articleAgeInDays <= 14) {
        temporalMultiplier = 0.5;      // 8-14 days: aging (moderate discount)
      } else if (articleAgeInDays <= 30) {
        temporalMultiplier = 0.3;      // 15-30 days: stale (significant discount)
      } else {
        temporalMultiplier = 0.1;      // 30+ days: ancient (minimal weight)
      }
      
      console.log(`[Temporal] Article age: ${articleAgeInDays.toFixed(1)} days → ${temporalMultiplier}× multiplier`);
    }
    
    // Apply temporal multiplier to evidence strength
    const weightedEvidenceStrength = Math.round(evidenceStrength * temporalMultiplier * diversityMultiplier);
    
    // Factor 4: Adversarial Penalty
    // A strong counter-hypothesis is a real signal — apply a meaningful penalty
    // even when the current article is mostly supporting, because the counter-
    // hypothesis represents the accumulated skeptical case against the claim.
    const maxPenalty = -8;
    let adversarialPenalty = 0;
    if (counterHypothesis && counterHypothesis.strength > 0) {
      const hasContradicting = classification.contradicting.length > 0;
      const majorityContradicting = classification.contradicting.length > classification.supporting.length;
      // Stronger floor: even a "clean" supporting article gets a 0.4 adversarial weight
      // because the counter-hypothesis challenges the overall claim's validity
      const adversarialRelevance = majorityContradicting ? 0.8 : hasContradicting ? 0.6 : 0.4;
      const rawAdversarialPenalty = Math.round(counterHypothesis.strength * adversarialRelevance * maxPenalty);
      adversarialPenalty = Math.round(rawAdversarialPenalty * temporalMultiplier);
    }
    
    // Final confidence change
    const confidenceChange = weightedEvidenceStrength + sourceDiversityBonus + adversarialPenalty;
    
    // Per-article cap: ±4 max
    const clampedChange = Math.max(-4, Math.min(4, confidenceChange));
    
    // Build human-readable reasoning
    const parts = [];
    if (weightedEvidenceStrength > 0) parts.push(`${classification.supporting.length} supporting claim(s)`);
    if (weightedEvidenceStrength < 0) parts.push(`${classification.contradicting.length} contradicting claim(s)`);
    if (sourceDiversityBonus > 0) {
      const uniqueSources = Object.keys(hypothesis.sourceDomains).length;
      const diversityPct = Math.round((uniqueSources / (hypothesis.evidence.length + 1)) * 100);
      parts.push(`source diversity: ${diversityPct}% (+${sourceDiversityBonus}, ${diversityMultiplier}× mult)`);
    }
    if (temporalMultiplier !== 1.0 && articleAgeInDays !== null) {
      parts.push(`article age: ${articleAgeInDays.toFixed(1)} days (${temporalMultiplier}× temporal weight)`);
    }
    if (adversarialPenalty < 0) {
      parts.push(`counter-hypothesis penalty: ${adversarialPenalty} (temporal-adjusted)`);
    }
    
    const reasoning = parts.length > 0
      ? `Confidence ${clampedChange > 0 ? 'increased' : clampedChange < 0 ? 'decreased' : 'unchanged'} based on: ${parts.join(', ')}.`
      : "No significant evidence to update confidence.";
    
    console.log(`[MultiFactorScore] Evidence: ${weightedEvidenceStrength}, Diversity: +${sourceDiversityBonus}, Adversarial: ${adversarialPenalty} → Total: ${clampedChange}`);
    
    return {
      confidenceChange: clampedChange,
      breakdown: {
        evidenceStrength: weightedEvidenceStrength,
        sourceDiversityBonus: sourceDiversityBonus,
        diversityMultiplier: diversityMultiplier,
        temporalWeight: Math.round((temporalMultiplier - 1) * 100),
        adversarialPenalty: adversarialPenalty
      },
      reasoning: reasoning
    };
  },
  
  // Option C: receives belief_signal from a completed brief resolution pass and
  // applies it as a superseding confidence update to matching hypotheses.
  // Marks the article as brief_evaluated to prevent double-counting by the scan pipeline.
  async applyBriefSignal(articleLink, topic, beliefSignal) {
    if (!beliefSignal || typeof beliefSignal.confidence_delta !== 'number') return;

    const stored = await chrome.storage.local.get(['hypotheses']);
    let hypotheses = stored.hypotheses || [];
    const topicHyps = hypotheses.filter(h => h.topic === topic && h.status !== 'archived');
    if (topicHyps.length === 0) return;

    let updated = false;
    for (const hyp of topicHyps) {
      // Skip if already processed via brief
      if (!Array.isArray(hyp.evidence)) hyp.evidence = [];
      const alreadyBriefed = hyp.evidence.some(e => e.link === articleLink && e.brief_evaluated);
      if (alreadyBriefed) continue;

      // Mark the evidence entry as brief_evaluated to block scan-pipeline reprocessing
      const existingEvidence = hyp.evidence.find(e => e.link === articleLink);
      if (existingEvidence) {
        existingEvidence.brief_evaluated = true;
        existingEvidence.brief_delta = beliefSignal.confidence_delta;
      } else {
        hyp.evidence.push({
          text: `[Brief-resolved signal: ${beliefSignal.net_disposition}]`,
          impact: beliefSignal.confidence_delta,
          date: new Date().toISOString(),
          link: articleLink,
          brief_evaluated: true,
          brief_delta: beliefSignal.confidence_delta
        });
      }

      // Apply superseding confidence update (same damping + capping as scan pipeline)
      const delta = Math.max(-4, Math.min(4, beliefSignal.confidence_delta));
      if (delta !== 0) {
        const oldConf = hyp.confidence;
        hyp.confidence = Math.max(50, Math.min(99, hyp.confidence + delta));
        if (!Array.isArray(hyp.revisionHistory)) hyp.revisionHistory = [];
        hyp.revisionHistory.push({
          date: new Date().toISOString(),
          oldConfidence: oldConf,
          newConfidence: hyp.confidence,
          reason: `[BRIEF SIGNAL] net_disposition: ${beliefSignal.net_disposition}, delta: ${delta > 0 ? '+' : ''}${delta}. Verified: ${(beliefSignal.key_verified_claims || []).length} claims. Contradicted: ${(beliefSignal.key_contradicted_claims || []).length} claims.`,
          evidenceCount: hyp.evidence.length
        });
        hyp.lastUpdated = new Date().toISOString();
        updated = true;
        console.log(`[BriefSignal] ${hyp.claim.substring(0, 50)}: ${oldConf}% → ${hyp.confidence}% (brief delta: ${delta > 0 ? '+' : ''}${delta})`);
      }
    }

    if (updated) {
      await chrome.storage.local.set({ hypotheses });
      console.log(`[BriefSignal] Belief confidence updated for topic: "${topic}"`);
    }
  },

  calculateCrossSessionMetrics(hypothesis) {
    // Requires at least 2 revision history entries to calculate trends
    if (!hypothesis.revisionHistory || hypothesis.revisionHistory.length < 2) {
      return {
        velocity: { perScan: 0, perDay: 0, calculatedAt: new Date().toISOString() },
        trendDirection: "stable",
        momentum: { score: 0, consistency: 0, calculatedAt: new Date().toISOString() }
      };
    }
    
    const history = hypothesis.revisionHistory;
    const now = new Date();
    
    // ── VELOCITY CALCULATION ──
    // Per-scan velocity (last 5 scans or all if fewer)
    const recentScans = history.slice(-5);
    const scanConfidenceChange = recentScans[recentScans.length - 1].newConfidence - recentScans[0].oldConfidence;
    const velocityPerScan = scanConfidenceChange / recentScans.length;
    
    // Per-day velocity (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const recentChanges = history.filter(h => new Date(h.date) >= sevenDaysAgo);
    
    let velocityPerDay = 0;
    if (recentChanges.length >= 2) {
      const daySpan = (new Date(recentChanges[recentChanges.length - 1].date) - new Date(recentChanges[0].date)) / (1000 * 60 * 60 * 24);
      const dayConfidenceChange = recentChanges[recentChanges.length - 1].newConfidence - recentChanges[0].oldConfidence;
      velocityPerDay = daySpan > 0 ? dayConfidenceChange / daySpan : 0;
    }
    
    // ── TREND DIRECTION ──
    // Look at last 3 changes (or all if fewer)
    const last3 = history.slice(-3);
    const changes = last3.map(h => h.newConfidence - h.oldConfidence);
    const positiveChanges = changes.filter(c => c > 0).length;
    const negativeChanges = changes.filter(c => c < 0).length;
    
    let trendDirection = "stable";
    if (positiveChanges >= 2) trendDirection = "increasing";
    else if (negativeChanges >= 2) trendDirection = "decreasing";
    
    // ── MOMENTUM CALCULATION ──
    // Momentum = velocity × consistency
    // Consistency: how uniform are the changes?
    const consistency = Math.max(positiveChanges, negativeChanges) / changes.length;
    const momentumScore = Math.abs(velocityPerScan) * consistency;
    
    console.log(`[CrossSession] ${hypothesis.claim.substring(0, 50)}: velocity ${velocityPerScan.toFixed(2)}/scan, ${velocityPerDay.toFixed(2)}/day | trend: ${trendDirection} | momentum: ${momentumScore.toFixed(2)}`);
    
    return {
      velocity: {
        perScan: Math.round(velocityPerScan * 100) / 100,  // 2 decimal places
        perDay: Math.round(velocityPerDay * 100) / 100,
        calculatedAt: now.toISOString()
      },
      trendDirection: trendDirection,
      momentum: {
        score: Math.round(momentumScore * 100) / 100,
        consistency: Math.round(consistency * 100) / 100,
        calculatedAt: now.toISOString()
      }
    };
  }
};

let HARDCODED_OPENAI_KEY = null;
let HARDCODED_ANTHROPIC_KEY = null;

async function loadRuntimeApiKeys() {
  if (WEB_RUNTIME) {
    HARDCODED_OPENAI_KEY = '__server_proxy__';
    HARDCODED_ANTHROPIC_KEY = '__server_proxy__';
    return;
  }
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const stored = await chrome.storage.local.get(['openaiKey', 'openAiApiKey', 'anthropicKey']);
    HARDCODED_OPENAI_KEY = stored.openaiKey || stored.openAiApiKey || null;
    HARDCODED_ANTHROPIC_KEY = stored.anthropicKey || null;
  } catch (error) {
    console.warn('[Command] Failed to load runtime API keys:', error?.message || error);
  }
}

const runtimeApiKeysReady = loadRuntimeApiKeys();

// ── SOURCE DIVERSITY HELPERS ──
function normalizeDomain(sourceUrl) {
  if (!sourceUrl) return null;
  try {
    // Handle both full URLs and bare domains
    const url = sourceUrl.startsWith('http') ? new URL(sourceUrl) : new URL(`https://${sourceUrl}`);
    let domain = url.hostname.toLowerCase();
    
    // Strip www
    domain = domain.replace(/^www\./, '');
    
    // Strip common subdomains (optional, but recommended)
    domain = domain.replace(/^(blog|news|m|mobile)\./, '');
    
    return domain;
  } catch (e) {
    // If URL parsing fails, return cleaned string
    return sourceUrl.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

function calculateDiversityMultiplier(diversityScore) {
  // diversityScore ranges 0.0 (all same source) to 1.0 (all unique)
  if (diversityScore < 0.3) return 0.7;  // Low diversity: penalty
  if (diversityScore < 0.7) return 1.0;  // Medium diversity: neutral
  return 1.3;                             // High diversity: bonus
}

const engine = new ExaEngine();
const DEFAULT_QUERY = "Artificial Intelligence Innovation News";
const DEMO_FALLBACK_ENABLED = false;
const DASHBOARD_BELIEF_SURFACE_ENABLED = false;

// ── STATE ──
let currentResults = [];
let bookmarks = [];
let activeFilter = 'all';
let activeSort = 'relevant';
let currentTopic = "";
let currentSelectedInsight = null;
let activePersona = 'executive';  // legacy dashboard belief view state
let radarLanguage = '';

function normalizeLinkForMatch(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/$/, '');
    }
    return parsed.toString();
  } catch {
    return String(url).trim().replace(/#.*$/, '').replace(/\/$/, '');
  }
}

function resetSelectedInsight() {
  currentSelectedInsight = null;
  document.querySelector('.insight-panel')?.classList.remove('populated');
  const sidebarTrend = document.getElementById('sidebar-trend');
  if (sidebarTrend) {
    sidebarTrend.style.display = 'none';
    sidebarTrend.textContent = '';
  }
}

function renderFeedEmptyState() {
  const feedSlot = document.getElementById('feed-slot');
  if (!feedSlot) return;
  feedSlot.innerHTML = `
    <div class="feed-empty-state">
      <div class="feed-empty-title">No live signals found</div>
      <div class="feed-empty-desc">Try a broader query or run the scan again once new articles are available.</div>
    </div>
  `;
}

// ── TRANSLATION ENGINE ──
const translationCache = new Map();

// Promise that resolves once the persisted cache for the current language is loaded.
// translatePage() awaits this before running so it never pays for strings already stored.
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

async function translateTitles(titles, lang) {
  if (!titles.length || !lang || !HARDCODED_OPENAI_KEY) return {};
  const langName = I18N_LANG_NAMES[lang] || lang;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HARDCODED_OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Translate these text strings to ${langName}. Preserve proper nouns, brand names, numbers, and technical terms. Return ONLY a valid JSON object where each key is the original string exactly as given and the value is the ${langName} translation.\n\n${JSON.stringify(titles)}` }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    const data = await res.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  } catch { return {}; }
}

const _TR_SKIP_TAGS = new Set(['SCRIPT','STYLE','INPUT','SELECT','TEXTAREA','CODE','PRE','SVG','CANVAS','IMG','PATH','OPTION','NOSCRIPT']);
const _TR_SKIP_CLASSES = new Set([
  'feed-rank','feed-date','feed-type','feed-score-num','feed-score-lbl',
  'pro-pill','power-pill','lang-code','feed-score','dash-chip-count',
  'toolbar-label','feed-score-lbl','model-label'
]);
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
  if (!radarLanguage || !HARDCODED_OPENAI_KEY) return;

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
    const allResults = await Promise.all(chunks.map(c => translateTitles(c, radarLanguage)));
    allResults.forEach(r => Object.entries(r).forEach(([k, v]) => translationCache.set(k, v)));
    // Persist new translations so the next page load (or tracker page) gets them for free
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

// Prevent duplicate openPowerPrompt calls
let lastPowerPromptCall = 0;
const POWER_PROMPT_DEBOUNCE = 500;
let ui = {};
const DASHBOARD_LLM_BASE_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  perplexity: 'https://www.perplexity.ai/',
  gemini: 'https://gemini.google.com/app',
  lechat: 'https://chat.mistral.ai/chat'
};

function getDashboardLLMBaseUrl(model) {
  return DASHBOARD_LLM_BASE_URLS[model] || DASHBOARD_LLM_BASE_URLS.claude;
}

async function handoffDashboardPromptToLLM(model, prompt, customBaseUrl = '') {
  const target = model || 'claude';
  const baseUrl = target === 'custom'
    ? (customBaseUrl || 'https://www.google.com/')
    : getDashboardLLMBaseUrl(target);

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
    console.warn('[Dashboard] Failed to copy prompt to clipboard:', error?.message || error);
    alert('Unable to copy the prompt automatically. The target model window will still open, but you may need to paste the prompt manually.');
  }

  window.open(baseUrl, '_blank');
}

function closePowerTooltips() {
  document.querySelectorAll('.power-tooltip.open').forEach(t => {
    t.classList.remove('open');
    t.style.top = '';
    t.style.bottom = '';
    t.style.maxHeight = '';
    t.closest('.feed-card')?.classList.remove('power-tooltip-open');
  });
}

// ── TOOLTIP SMART POSITIONING ──
function positionTooltip(tooltip, triggerBtn) {
  const MARGIN = 8;
  const btnRect    = triggerBtn.getBoundingClientRect();
  const parent     = tooltip.offsetParent || tooltip.parentElement;
  const parentRect = parent.getBoundingClientRect();
  const viewportH  = window.innerHeight;

  // Measure real height if already rendered, otherwise use estimate
  tooltip.style.maxHeight = '';
  tooltip.style.top       = '0';
  tooltip.style.bottom    = 'auto';
  tooltip.style.visibility = 'hidden';
  tooltip.style.display   = 'block';
  const tooltipH = Math.min(tooltip.scrollHeight || 300, 400);
  tooltip.style.display   = '';
  tooltip.style.visibility = '';
  tooltip.style.top       = '';

  const spaceBelow = viewportH - btnRect.bottom - MARGIN;
  const spaceAbove = btnRect.top - MARGIN;

  if (spaceBelow >= Math.min(tooltipH, 180)) {
    // Enough room below — open downward from button bottom
    tooltip.style.top    = (btnRect.bottom - parentRect.top + MARGIN) + 'px';
    tooltip.style.bottom = 'auto';
    tooltip.style.maxHeight = spaceBelow + 'px';
  } else {
    // Not enough room below — open upward from button top
    tooltip.style.bottom = (parentRect.bottom - btnRect.top + MARGIN) + 'px';
    tooltip.style.top    = 'auto';
    tooltip.style.maxHeight = spaceAbove + 'px';
  }
}

// ── UTILS ──
function cleanText(text) {
  if (!text) return "No summary available.";
  return text.replace(/!\[.*?\]\(.*?\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[#*_`]/g, '').replace(/<[^>]*>?/gm, '').trim() || "No summary available.";
}

function esc(t) { return (t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g, "&quot;"); }

function timeAgo(d) {
  if (!d) return "";
  const diff = (new Date() - new Date(d)) / 1000;
  if (diff < 3600) return "Just now";
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  const date = new Date(d);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return date.getFullYear() === new Date().getFullYear() ? `${month} ${day}` : `${month} ${day}, ${date.getFullYear()}`;
}

// ── BOOKMARKS ──
function loadBookmarks() {
  chrome.storage.local.get(['bookmarks'], (data) => {
    bookmarks = data.bookmarks || [];
    updateBriefingCount();
  });
}

function saveBookmarks() {
  chrome.storage.local.set({ bookmarks }, updateBriefingCount);
}

function updateBriefingCount() {
  const el = document.getElementById('bookmark-count');
  if (el) el.textContent = bookmarks.length;
}

function toggleBookmark(item, btn) {
  const idx = bookmarks.findIndex(b => b.link === item.link);
  if (idx === -1) {
    bookmarks.push(item);
    btn.classList.add('active');
    btn.innerHTML = '&#9733;';
  } else {
    bookmarks.splice(idx, 1);
    btn.classList.remove('active');
    btn.textContent = tl('fib_track');
  }
  saveBookmarks();
}

// ── SCORE STYLING ──
function getScoreClass(score) {
  if (score >= 60) return '';
  if (score >= 40) return 'med';
  return 'low';
}

// ── TYPE BADGE CLASS ──
function getTypeClass(type) {
  const map = { news: 'type-news', paper: 'type-paper', code: 'type-code', video: 'type-video', blog: 'type-blog', gov: 'type-gov' };
  return map[type] || 'type-news';
}

// ── POWER PROMPT TOOLTIP HTML ──
function getPowerTooltipHTML(item) {
  const text = cleanText(item.useCases || "");
  const execSummaryLabel = tl('pp_exec_summary');
  const context = cleanText(item.summary || item.useCases || '').substring(0, 320);
  let rows = `<div class="pt-row" data-usecase="${esc(execSummaryLabel)}" data-title="${esc(item.title)}" data-link="${item.link}" data-type="${item.type}" data-context="${esc(context)}">
    ${execSummaryLabel}
  </div>`;

  if (text.length > 20) {
    const points = text.split(/(?:\d+\.|[-\u2022*])\s+/).filter(s => s.trim().length > 5);
    if (points.length > 0) {
      rows = points.slice(0, 3).map(p =>
        `<div class="pt-row" data-usecase="${esc(p.trim())}" data-title="${esc(item.title)}" data-link="${item.link}" data-type="${item.type || 'news'}" data-context="${esc(context)}">
          ${esc(p.trim())}
        </div>`
      ).join("");
    }
  }

  return `<div class="power-tooltip">
    <div class="pt-header">${tl('pp_header')}</div>
    ${rows}
    <div class="pt-divider"></div>
    <button class="pt-brief-btn" data-title="${esc(item.title)}" data-link="${item.link}" data-type="${item.type}" data-context="${esc(item.summary)}" data-date="${item.date || ''}" data-source="${item.source || ''}">${tl('pp_intel_brief')}</button>
  </div>`;
}

// ── FEED CARD ──
function createFeedCard(item, index) {
  const div = document.createElement('div');
  div.className = 'feed-card';
  div.dataset.articleLink = normalizeLinkForMatch(item.link);

  const isSaved = bookmarks.some(b => b.link === item.link);
  const rank = String(index + 1).padStart(2, '0');
  const score = item.relevanceScore || Math.max(30, 80 - index * 6);
  const scoreClass = getScoreClass(score);
  const typeClass = getTypeClass(item.type);

  div.innerHTML = `
    <div class="feed-rank">${rank}</div>
    <div class="feed-body">
      <div class="feed-source">
        ${esc(item.source)}
        <span class="feed-type ${typeClass}">${item.type}</span>
        <span class="feed-date">&middot; ${timeAgo(item.date)}</span>
      </div>
      <div class="feed-title">${esc(item.title)}</div>
      <div class="feed-summary">${esc(cleanText(item.summary)).substring(0, 200)}</div>
    </div>
    <div class="feed-actions">
      <div class="feed-score ${scoreClass}">
        <span class="feed-score-lbl">RELEVANCE</span>
        <span class="feed-score-num">${score}</span>
      </div>
      <div class="feed-inlinebtns">
        <button class="fib-btn fib-open">${tl('fib_open')}</button>
        <button class="fib-btn fib-track ${isSaved ? 'active' : ''}">${tl('fib_track')}</button>
        <button class="fib-btn fib-brief">${tl('fib_brief')}</button>
        <button class="power-btn fib-btn">${tl('pp_btn')}</button>
      </div>
    </div>
    ${getPowerTooltipHTML(item)}
  `;

  // Click card body -> populate Selected Insight panel
  div.addEventListener('click', (e) => {
    if (e.target.closest('.fib-btn') || e.target.closest('.power-tooltip')) return;
    document.querySelectorAll('.feed-card.selected').forEach(c => c.classList.remove('selected'));
    div.classList.add('selected');
    renderSelectedInsight(item);
    console.log('[FeedCard] Selected:', item.title?.substring(0, 50));
  });

  // Open button — navigate to article
  div.querySelector('.fib-open').addEventListener('click', (e) => {
    e.stopPropagation();
    window.open(item.link, '_blank');
  });

  // Track button — bookmark toggle
  div.querySelector('.fib-track').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBookmark(item, e.currentTarget);
  });

  // Brief button — Intelligence Brief modal
  div.querySelector('.fib-brief').addEventListener('click', (e) => {
    e.stopPropagation();
    launchInstantAnalyst(item.title, item.link, item.type || 'news', item.summary || '', item.date || '', item.source || '');
  });

  // AI Prompt button — toggle power tooltip
  div.querySelector('.power-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const tooltip = div.querySelector('.power-tooltip');
    if (!tooltip) return;
    const isOpen = tooltip.classList.contains('open');
    closePowerTooltips();
    if (!isOpen) {
      div.classList.add('power-tooltip-open');
      positionTooltip(tooltip, e.currentTarget);
      tooltip.classList.add('open');
    }
  });

  return div;
}

// ── INSIGHT CONTEXT GENERATOR — why it matters + quick actions ──
async function generateInsightContext(item, topic) {
  if (!HARDCODED_OPENAI_KEY) return { whyItMatters: null, actionItems: [] };
  const summary = cleanText(item.summary || item.useCases || '').substring(0, 400);
  const langName = radarLanguage ? (I18N_LANG_NAMES[radarLanguage] || radarLanguage) : null;
  const langDirective = langName ? `\nIMPORTANT: Write ALL text values in ${langName}.` : '';
  const prompt = `You are an intelligence analyst. Respond with valid JSON only — no markdown, no explanation.${langDirective}

Article: "${item.title}"
Summary: ${summary || 'Not available'}
Research topic: "${topic}"

Return this exact JSON shape:
{
  "whyItMatters": "2–3 sentences explaining the strategic significance of this signal for someone researching '${topic}'. Explain the mechanism and implications — do NOT restate or paraphrase the article title.",
  "actionItems": [
    "Verb-led concrete action specific to ${topic}, under 15 words",
    "Verb-led concrete action specific to ${topic}, under 15 words",
    "Verb-led concrete action specific to ${topic}, under 15 words",
    "Verb-led concrete action specific to ${topic}, under 15 words"
  ]
}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HARDCODED_OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }],
      max_tokens: 500, temperature: 0.5, response_format: { type: 'json_object' }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

// ── DISRUPTOR ENGINE ──
const DisruptorEngine = {
  async analyze(signal, topic) {
    if (!HARDCODED_OPENAI_KEY) throw new Error('OpenAI API key required');
    const summary = cleanText(signal.summary || signal.useCases || '').substring(0, 600);
    const langName = radarLanguage ? (I18N_LANG_NAMES[radarLanguage] || radarLanguage) : null;
    const langDirective = langName ? `\nIMPORTANT: Write ALL text values in ${langName}.\n` : '';
    const prompt = `You are a strategic intelligence analyst specialising in cross-industry pattern transfer and first-principles thinking.${langDirective}
SELECTED SIGNAL:
Title: "${signal.title}"
Source: ${signal.source || 'Unknown'}
Summary: ${summary || 'Not available'}

USER RESEARCH TOPIC: "${topic}"

Your task: Produce a Disruptor analysis. NOT a summary. NOT generic advice. Non-obvious, analogically derived strategic thinking.

REASONING STACK:
1. Strip brand/category specifics. What is the underlying business or customer problem this signal solves?
2. What is the core MECHANISM? What customer behavior does it shape and why does it work?
3. Find 2–3 cross-industry transfers of this exact MECHANIC (not the brand — the mechanic).
4. Generate 3 disruptive ideas adapted specifically to "${topic}" using borrowed mechanics.
5. Identify the single best bet.

RULES:
- Transfer the mechanic, never copy the surface example
- No buzzwords ("leverage synergies", "disruption")
- Every idea must be tied specifically to "${topic}"
- Include a real risk and a cheap testable first step
- Be sharp, specific, slightly contrarian, and practical

Return ONLY valid JSON matching this schema exactly:
{
  "coreShift": "2–3 sentences. What strategic shift does this signal reveal? Focus on mechanism not brand.",
  "borrowedMechanic": {
    "mechanism": "One sentence — the portable core mechanism.",
    "targetBehavior": "One sentence — what customer behavior does it shape?",
    "whyItWorks": "One sentence — why is this effective regardless of category?"
  },
  "crossIndustryLeap": [
    { "industry": "Industry name", "rationale": "One line applying the mechanic here", "transferabilityScore": 8 },
    { "industry": "Industry name", "rationale": "One line applying the mechanic here", "transferabilityScore": 7 },
    { "industry": "Industry name", "rationale": "One line applying the mechanic here", "transferabilityScore": 6 }
  ],
  "disruptiveIdeas": [
    {
      "title": "Short punchy title",
      "summary": "2 sentences. What is this idea specifically for ${topic}?",
      "borrowedMechanic": "One sentence — what mechanic from the signal does this borrow?",
      "fitRationale": "One sentence — why does this fit ${topic} specifically?",
      "risk": "One sentence — the main risk or assumption.",
      "quickTest": "One sentence — the cheapest fastest way to test this.",
      "priority": "high"
    },
    {
      "title": "Short punchy title",
      "summary": "2 sentences.",
      "borrowedMechanic": "One sentence.",
      "fitRationale": "One sentence.",
      "risk": "One sentence.",
      "quickTest": "One sentence.",
      "priority": "medium"
    },
    {
      "title": "Short punchy title",
      "summary": "2 sentences.",
      "borrowedMechanic": "One sentence.",
      "fitRationale": "One sentence.",
      "risk": "One sentence.",
      "quickTest": "One sentence.",
      "priority": "medium"
    }
  ],
  "bestBet": {
    "recommendation": "2–3 sentences — the strongest practical idea or boldest worthwhile experiment.",
    "rationale": "1–2 sentences — why this one above the others."
  }
}`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HARDCODED_OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', messages: [{ role: 'user', content: prompt }],
        max_tokens: 2200, temperature: 0.72, response_format: { type: 'json_object' }
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  }
};

// ── DISRUPTOR RENDERER ──
function renderDisruptorContent(d) {
  const scoreColor = s => s >= 8 ? 'var(--green)' : s >= 6 ? 'var(--yellow)' : 'var(--muted)';
  const priorityBadge = p => {
    if (p === 'high')   return '<span class="disruptor-priority high">HIGH</span>';
    if (p === 'medium') return '<span class="disruptor-priority med">MED</span>';
    return '';
  };

  const leapHTML = (d.crossIndustryLeap || []).map(l => `
    <div class="disruptor-leap-card">
      <div class="disruptor-leap-top">
        <span class="disruptor-leap-industry">${l.industry}</span>
        ${l.transferabilityScore != null ? `<span class="disruptor-leap-score" style="color:${scoreColor(l.transferabilityScore)}">${l.transferabilityScore}/10</span>` : ''}
      </div>
      <div class="disruptor-leap-rationale">${l.rationale}</div>
    </div>`).join('');

  const ideasHTML = (d.disruptiveIdeas || []).map(idea => `
    <div class="disruptor-idea-card">
      <div class="disruptor-idea-head">
        <span class="disruptor-idea-title">${idea.title}</span>
        ${priorityBadge(idea.priority)}
      </div>
      <div class="disruptor-idea-summary">${idea.summary}</div>
      <div class="disruptor-idea-rows">
        <div class="disruptor-idea-row"><span class="disruptor-row-lbl">MECHANIC</span><span>${idea.borrowedMechanic}</span></div>
        <div class="disruptor-idea-row"><span class="disruptor-row-lbl">FIT</span><span>${idea.fitRationale}</span></div>
        <div class="disruptor-idea-row disruptor-risk"><span class="disruptor-row-lbl">RISK</span><span>${idea.risk}</span></div>
        <div class="disruptor-idea-row"><span class="disruptor-row-lbl">TEST</span><span>${idea.quickTest}</span></div>
      </div>
    </div>`).join('');

  const m = d.borrowedMechanic || {};
  return `
    <div class="disruptor-section">
      <div class="disruptor-slabel">CORE SHIFT</div>
      <p class="disruptor-sbody">${d.coreShift || ''}</p>
    </div>
    <div class="disruptor-section">
      <div class="disruptor-slabel">BORROWED MECHANIC</div>
      <div class="disruptor-mech-block">
        <div class="disruptor-mech-row"><span class="disruptor-mech-lbl">WHAT</span><span>${m.mechanism || ''}</span></div>
        <div class="disruptor-mech-row"><span class="disruptor-mech-lbl">TARGETS</span><span>${m.targetBehavior || ''}</span></div>
        <div class="disruptor-mech-row"><span class="disruptor-mech-lbl">WHY</span><span>${m.whyItWorks || ''}</span></div>
      </div>
    </div>
    <div class="disruptor-section">
      <div class="disruptor-slabel">CROSS-INDUSTRY LEAP</div>
      <div class="disruptor-leap-grid">${leapHTML}</div>
    </div>
    <div class="disruptor-section">
      <div class="disruptor-slabel">DISRUPTIVE IDEAS</div>
      ${ideasHTML}
    </div>
    <div class="disruptor-best-bet">
      <div class="disruptor-bb-label">⚡ BEST BET</div>
      <div class="disruptor-bb-rec">${d.bestBet?.recommendation || ''}</div>
      <div class="disruptor-bb-why">${d.bestBet?.rationale || ''}</div>
    </div>`;
}

// ── SELECTED INSIGHT PANEL ──
function renderSelectedInsight(item) {
  try {
  currentSelectedInsight = item;
  const panel     = document.querySelector('.insight-panel');
  const emptyEl   = document.getElementById('insight-empty');
  const contentEl = document.getElementById('insight-content');
  if (!panel || !emptyEl || !contentEl) {
    console.error('[Insight] Missing panel elements — panel:', !!panel, 'empty:', !!emptyEl, 'content:', !!contentEl);
    return;
  }

  panel.classList.add('populated');

  const score = item.relevanceScore || Math.max(30, 80 - (currentResults.indexOf(item) * 6));
  const trend = score >= 70 ? 'Upward ↑' : score >= 50 ? 'Stable →' : 'Declining ↓';
  const trendClass = score >= 70 ? 'trend-up' : score >= 50 ? 'trend-flat' : 'trend-down';

  const typeTimeline = { paper: '4–8 weeks', code: '3–6 weeks', video: '2–4 weeks', gov: '4–12 weeks' };
  const timeline = typeTimeline[item.type] || '1–2 weeks';


  const sidebarTrend = document.getElementById('sidebar-trend');
  if (sidebarTrend) {
    sidebarTrend.textContent = trend;
    sidebarTrend.className = `insight-trend ${trendClass}`;
    sidebarTrend.style.display = '';
  }

  document.getElementById('insight-title').textContent = item.title;
  document.getElementById('insight-confidence').textContent = `${score}%`;
  document.getElementById('insight-timeline').textContent = timeline;

  // Show loading states for async-generated content
  const whyEl = document.getElementById('insight-why');
  const actEl = document.getElementById('insight-response');
  if (whyEl) whyEl.innerHTML = '<span class="insight-generating">Analyzing signal…</span>';
  if (actEl) actEl.innerHTML = '<span class="insight-generating">Building actions…</span>';

  // Async: generate Why It Matters + Quick Actions from LLM
  const topic = currentTopic || (ui.search && ui.search.value.trim()) || 'the monitored topic';
  generateInsightContext(item, topic).then(ctx => {
    const fallbackWhy = cleanText(item.summary || 'No summary available.').substring(0, 280);
    if (whyEl) whyEl.textContent = ctx.whyItMatters || fallbackWhy;
    if (actEl) {
      const items = Array.isArray(ctx.actionItems) ? ctx.actionItems : [];
      actEl.innerHTML = items.length
        ? `<ul class="insight-action-list">${items.map(a => `<li>${a}</li>`).join('')}</ul>`
        : `<span>${fallbackWhy.substring(0, 160)}</span>`;
    }
  }).catch(() => {
    const fallback = cleanText(item.summary || 'No summary available.').substring(0, 280);
    if (whyEl) whyEl.textContent = fallback;
    const useCaseLines = cleanText(item.useCases || '').split(/\n|(?<=\.)\s/).map(s => s.trim()).filter(Boolean);
    if (actEl) actEl.textContent = useCaseLines[0] || 'Monitor this development and assess strategic implications for your sector.';
  });

  // Top actions row
  const actionsData = [
    { icon: '↗', text: tl('action_open_article') },
    { icon: '☆', text: tl('action_track_signal') },
    { icon: '⚡', text: tl('action_gen_brief') },
  ];
  const actionsEl = document.getElementById('insight-actions');
  actionsEl.innerHTML = actionsData.map((a, i) =>
    `<div class="insight-action" data-action="${i}">
       <span class="insight-action-icon">${a.icon}</span>${a.text}
     </div>`
  ).join('');
  actionsEl.querySelectorAll('.insight-action').forEach(el => {
    const idx = parseInt(el.dataset.action, 10);
    el.addEventListener('click', () => {
      if (idx === 0) window.open(item.link, '_blank');
      else if (idx === 1) {
        const trackBtn = document.querySelector('.feed-card.selected .fib-track');
        if (trackBtn) trackBtn.click();
      }
      else if (idx === 2) launchInstantAnalyst(item.title, item.link, item.type || 'news', item.summary || '', item.date || '', item.source || '');
    });
  });

  // Briefing toggle → Page Brief modal
  document.getElementById('insight-btn-briefing').onclick = () => {
    document.getElementById('btn-page-brief')?.click();
  };

  // Disruptor toggle → open Disruptor modal and generate analysis
  document.getElementById('insight-btn-response').onclick = async () => {
    const modal = document.getElementById('disruptor-modal');
    const loadingEl = document.getElementById('disruptor-loading');
    const contentEl = document.getElementById('disruptor-content');
    const subtitle = document.getElementById('disruptor-modal-subtitle');
    if (!modal) return;

    // Set subtitle to signal title + topic context
    if (subtitle) subtitle.textContent = `${item.title.substring(0, 60)}${item.title.length > 60 ? '…' : ''} · ${topic}`;

    modal.classList.add('active');

    // Use per-item cache — no need to regenerate on re-open
    if (item._disruptor) {
      loadingEl.style.display = 'none';
      contentEl.innerHTML = renderDisruptorContent(item._disruptor);
      contentEl.style.display = 'block';
      return;
    }

    loadingEl.style.display = 'flex';
    contentEl.style.display = 'none';

    try {
      const result = await DisruptorEngine.analyze(item, topic);
      item._disruptor = result;
      loadingEl.style.display = 'none';
      contentEl.innerHTML = renderDisruptorContent(result);
      contentEl.style.display = 'block';
    } catch (err) {
      console.error('[Disruptor] Analysis failed:', err);
      loadingEl.innerHTML = `<div class="disruptor-error">⚠ Analysis failed — ${err.message || 'check API key and retry'}</div>`;
    }
  };

  // Toggle button active state
  ['insight-btn-briefing', 'insight-btn-response'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function() {
      document.querySelectorAll('.insight-toggle').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });

  } catch (err) {
    console.error('[Insight] Error in renderSelectedInsight:', err);
  }
}

// Dashboard beliefs are intentionally retired from the Command surface.
// Keep a no-op so older call sites stay harmless while tracked beliefs live in Tracked Topics.
function renderBeliefs() {
  if (!DASHBOARD_BELIEF_SURFACE_ENABLED) return;
}

function renderBeliefCard(belief) {
  // Determine rendering based on active persona
  switch(activePersona) {
    case 'analyst':
      return renderBeliefCard_Analyst(belief);
    case 'strategist':
      return renderBeliefCard_Strategist(belief);
    case 'full':
      return renderBeliefCard_FullContext(belief);
    case 'executive':
    default:
      return renderBeliefCard_Executive(belief);
  }
}

// ── EXECUTIVE VIEW: Decision-focused ──
function renderBeliefCard_Executive(belief) {
  const confidenceColor = belief.confidence >= 75 ? '#10b981' : belief.confidence >= 60 ? '#f59e0b' : '#ef4444';
  const confidenceLabel = belief.confidence >= 75 ? 'High Confidence' : belief.confidence >= 60 ? 'Moderate Confidence' : 'Low Confidence';
  
  const trendLabel = belief.trendDirection === 'increasing' ? 'Strong Upward Trend' :
                     belief.trendDirection === 'decreasing' ? 'Declining' : 'Stable';
  const trendIcon = belief.trendDirection === 'increasing' ? '🔥' :
                    belief.trendDirection === 'decreasing' ? '📉' : '⚖️';
  
  // Determine action based on confidence and momentum
  let action = 'Monitor developments';
  let timeline = 'Ongoing';
  
  if (belief.confidence >= 75 && belief.momentum && belief.momentum.score > 3) {
    action = 'Act on this trend';
    timeline = '2-4 weeks';
  } else if (belief.confidence >= 60 && belief.momentum && belief.momentum.score > 2) {
    action = 'Monitor for opportunities';
    timeline = '4-8 weeks';
  } else if (belief.trendDirection === 'decreasing') {
    action = 'De-prioritize';
    timeline = 'N/A';
  }
  
  return `
    <div class="belief-card" data-belief-id="${belief.id}" style="cursor:pointer; background:#18181b; border:1px solid #27272a; border-radius:12px; padding:20px; margin-bottom:16px; transition:all 0.2s;">
      
      <div style="font-size:15px; font-weight:700; color:#f4f4f5; line-height:1.4; margin-bottom:16px;">
        ${belief.claim}
      </div>
      
      <div style="display:flex; align-items:center; gap:24px; margin-bottom:16px;">
        <div>
          <div style="font-size:48px; font-weight:900; color:${confidenceColor}; line-height:1;">
            ${belief.confidence}%
          </div>
          <div style="font-size:11px; color:#71717a; font-weight:600; text-transform:uppercase; margin-top:4px;">
            ${confidenceLabel}
          </div>
        </div>
        
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <div style="font-size:20px;">${trendIcon}</div>
            <div style="font-size:13px; color:#d4d4d8; font-weight:700;">${trendLabel}</div>
          </div>
          
          <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:6px; padding:8px 12px;">
            <div style="font-size:10px; color:#71717a; margin-bottom:2px;">RECOMMENDED ACTION</div>
            <div style="font-size:12px; color:#10b981; font-weight:700;">${action}</div>
            <div style="font-size:10px; color:#71717a; margin-top:2px;">Timeline: ${timeline}</div>
          </div>
        </div>
      </div>
      
      <div style="font-size:10px; color:#52525b; text-align:right;">
        Last updated: ${timeAgo(belief.lastUpdated)}
      </div>
    </div>
  `;
}

// ── ANALYST VIEW: Data-focused ──
function renderBeliefCard_Analyst(belief) {
  const confidenceColor = belief.confidence >= 75 ? '#10b981' : belief.confidence >= 60 ? '#f59e0b' : '#ef4444';
  
  // Calculate diversity percentage
  const uniqueSources = belief.sourceDomains ? Object.keys(belief.sourceDomains).length : 0;
  const totalEvidence = belief.evidence ? belief.evidence.length : 0;
  const diversityPct = totalEvidence > 0 ? Math.round((uniqueSources / totalEvidence) * 100) : 0;
  
  // Get latest counter-hypothesis
  const latestRevision = belief.revisionHistory && belief.revisionHistory.length > 0 
    ? belief.revisionHistory[belief.revisionHistory.length - 1] 
    : null;
  const counterHyp = latestRevision ? latestRevision.counterHypothesis : null;
  
  return `
    <div class="belief-card" data-belief-id="${belief.id}" style="cursor:pointer; background:#18181b; border:1px solid #27272a; border-radius:12px; padding:20px; margin-bottom:16px; transition:all 0.2s;">
      
      <div style="font-size:15px; font-weight:700; color:#f4f4f5; line-height:1.4; margin-bottom:16px;">
        ${belief.claim}
      </div>
      
      <div style="display:grid; grid-template-columns: auto 1fr; gap:16px; margin-bottom:16px;">
        <div>
          <div style="font-size:48px; font-weight:900; color:${confidenceColor}; line-height:1;">
            ${belief.confidence}%
          </div>
          <div style="font-size:10px; color:#71717a; margin-top:4px;">±5% margin</div>
        </div>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:11px;">
          <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:6px; padding:8px;">
            <div style="color:#71717a; margin-bottom:4px;">Evidence Points</div>
            <div style="font-size:18px; font-weight:700; color:#d4d4d8;">${totalEvidence}</div>
            <div style="color:#71717a; font-size:9px;">${uniqueSources} unique sources</div>
          </div>
          
          <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:6px; padding:8px;">
            <div style="color:#71717a; margin-bottom:4px;">Source Diversity</div>
            <div style="font-size:18px; font-weight:700; color:#d4d4d8;">${diversityPct}%</div>
            <div style="color:#71717a; font-size:9px;">${diversityPct >= 70 ? 'High' : diversityPct >= 40 ? 'Medium' : 'Low'} diversity</div>
          </div>
          
          <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:6px; padding:8px;">
            <div style="color:#71717a; margin-bottom:4px;">Velocity</div>
            <div style="font-size:18px; font-weight:700; color:#d4d4d8;">
              ${belief.velocity ? (belief.velocity.perScan > 0 ? '+' : '') + belief.velocity.perScan.toFixed(1) : '0.0'}
            </div>
            <div style="color:#71717a; font-size:9px;">% per scan</div>
          </div>
          
          <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:6px; padding:8px;">
            <div style="color:#71717a; margin-bottom:4px;">Counter-Hypothesis</div>
            <div style="font-size:18px; font-weight:700; color:#d4d4d8;">
              ${counterHyp ? '0.' + Math.round(parseFloat(counterHyp.split('strength: ')[1]) * 100) : 'N/A'}
            </div>
            <div style="color:#71717a; font-size:9px;">${counterHyp ? 'strength' : 'none found'}</div>
          </div>
        </div>
      </div>
      
      ${counterHyp ? `
        <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:6px; padding:10px; margin-top:12px;">
          <div style="font-size:9px; color:#71717a; text-transform:uppercase; margin-bottom:4px;">Alternative Hypothesis</div>
          <div style="font-size:11px; color:#a1a1aa; line-height:1.4;">
            ${counterHyp.substring(0, 150)}${counterHyp.length > 150 ? '...' : ''}
          </div>
        </div>
      ` : ''}
      
      <div style="font-size:10px; color:#52525b; text-align:right; margin-top:8px;">
        Methodology: 4-pass reasoning pipeline • Last updated: ${timeAgo(belief.lastUpdated)}
      </div>
    </div>
  `;
}

// ── STRATEGIST VIEW: Opportunity-focused ──
function renderBeliefCard_Strategist(belief) {
  const confidenceColor = belief.confidence >= 75 ? '#10b981' : belief.confidence >= 60 ? '#f59e0b' : '#ef4444';
  
  // Determine signal strength based on momentum
  const momentum = belief.momentum ? belief.momentum.score : 0;
  let signalStrength = 'Weak';
  let signalColor = '#71717a';
  
  if (momentum > 3) {
    signalStrength = 'Very Strong';
    signalColor = '#10b981';
  } else if (momentum > 2) {
    signalStrength = 'Strong';
    signalColor = '#10b981';
  } else if (momentum > 1) {
    signalStrength = 'Moderate';
    signalColor = '#f59e0b';
  }
  
  // Determine opportunity window
  let opportunityWindow = 'Long-term (8+ weeks)';
  if (momentum > 3 && belief.confidence >= 75) {
    opportunityWindow = 'Immediate (2-4 weeks)';
  } else if (momentum > 2 && belief.confidence >= 60) {
    opportunityWindow = 'Near-term (4-8 weeks)';
  }
  
  // Identify key risks
  const risks = [];
  const diversityPct = belief.sourceDomains && belief.evidence 
    ? Math.round((Object.keys(belief.sourceDomains).length / belief.evidence.length) * 100)
    : 0;
  
  if (diversityPct < 40) risks.push('Low source diversity');
  if (belief.confidence < 70) risks.push('Moderate confidence level');
  if (momentum < 2) risks.push('Weak momentum');
  if (belief.trendDirection === 'decreasing') risks.push('Declining trend');
  
  return `
    <div class="belief-card" data-belief-id="${belief.id}" style="cursor:pointer; background:#18181b; border:1px solid #27272a; border-radius:12px; padding:20px; margin-bottom:16px; transition:all 0.2s;">
      
      <div style="font-size:15px; font-weight:700; color:#f4f4f5; line-height:1.4; margin-bottom:16px;">
        ${belief.claim}
      </div>
      
      <div style="display:flex; gap:16px; margin-bottom:16px;">
        <div style="flex:1; background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:12px;">
          <div style="font-size:10px; color:#71717a; text-transform:uppercase; margin-bottom:6px;">Signal Strength</div>
          <div style="font-size:24px; font-weight:900; color:${signalColor}; margin-bottom:4px;">
            ${signalStrength}
          </div>
          <div style="font-size:11px; color:#71717a;">
            Momentum: ${momentum.toFixed(1)} • Confidence: ${belief.confidence}%
          </div>
        </div>
        
        <div style="flex:1; background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:12px;">
          <div style="font-size:10px; color:#71717a; text-transform:uppercase; margin-bottom:6px;">Opportunity Window</div>
          <div style="font-size:16px; font-weight:700; color:#d4d4d8; margin-bottom:4px;">
            ${opportunityWindow}
          </div>
          <div style="font-size:11px; color:#71717a;">
            Velocity: ${belief.velocity ? (belief.velocity.perDay > 0 ? '+' : '') + belief.velocity.perDay.toFixed(1) : '0.0'}%/day
          </div>
        </div>
      </div>
      
      ${risks.length > 0 ? `
        <div style="background:#0a0a0a; border:1px solid #3f3f46; border-radius:8px; padding:12px; margin-bottom:12px;">
          <div style="font-size:10px; color:#71717a; text-transform:uppercase; margin-bottom:8px;">Key Risks</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${risks.map(risk => `
              <div style="background:#27272a; border:1px solid #3f3f46; border-radius:4px; padding:4px 8px; font-size:10px; color:#ef4444;">
                ${risk}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:12px;">
        <div style="font-size:10px; color:#71717a; text-transform:uppercase; margin-bottom:8px;">Strategic Actions</div>
        <div style="font-size:11px; color:#d4d4d8; line-height:1.6;">
          ${momentum > 3 ? '• Position for immediate opportunity<br>• Allocate resources now<br>• Monitor competitive landscape' :
            momentum > 2 ? '• Prepare contingency plans<br>• Monitor developments closely<br>• Identify partnership opportunities' :
            '• Continue passive monitoring<br>• Assess long-term implications<br>• Re-evaluate in 4-8 weeks'}
        </div>
      </div>
      
      <div style="font-size:10px; color:#52525b; text-align:right; margin-top:8px;">
        Last updated: ${timeAgo(belief.lastUpdated)}
      </div>
    </div>
  `;
}

// ── FULL CONTEXT VIEW: Comprehensive intelligence ──
function renderBeliefCard_FullContext(belief) {
  const confidenceColor = belief.confidence >= 75 ? '#10b981' : belief.confidence >= 60 ? '#f59e0b' : '#ef4444';
  const confidenceLabel = belief.confidence >= 75 ? 'High Confidence' : belief.confidence >= 60 ? 'Moderate Confidence' : 'Low Confidence';
  
  const trendLabel = belief.trendDirection === 'increasing' ? 'Strong Upward Trend' :
                     belief.trendDirection === 'decreasing' ? 'Declining' : 'Stable';
  const trendIcon = belief.trendDirection === 'increasing' ? '🔥' :
                    belief.trendDirection === 'decreasing' ? '📉' : '⚖️';
  
  const uniqueSources = belief.sourceDomains ? Object.keys(belief.sourceDomains).length : 0;
  const totalEvidence = belief.evidence ? belief.evidence.length : 0;
  const diversityPct = totalEvidence > 0 ? Math.round((uniqueSources / totalEvidence) * 100) : 0;
  
  const momentum = belief.momentum ? belief.momentum.score : 0;
  const signalStrength = momentum > 3 ? 'Very Strong' : momentum > 2 ? 'Strong' : momentum > 1 ? 'Moderate' : 'Weak';
  
  const latestRevision = belief.revisionHistory && belief.revisionHistory.length > 0 
    ? belief.revisionHistory[belief.revisionHistory.length - 1] 
    : null;
  const counterHyp = latestRevision ? latestRevision.counterHypothesis : null;
  
  // Get latest confidence factors from revision history
  const latestReason = latestRevision ? latestRevision.reason : '';
  
  return `
    <div class="belief-card" data-belief-id="${belief.id}" style="cursor:pointer; background:#18181b; border:1px solid #27272a; border-radius:12px; padding:20px; margin-bottom:16px;">
      
      <div style="font-size:15px; font-weight:700; color:#f4f4f5; line-height:1.4; margin-bottom:16px;">
        ${belief.claim}
      </div>
      
      <!-- Confidence + Trend Header -->
      <div style="display:grid; grid-template-columns: auto 1fr; gap:16px; margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid #27272a;">
        <div>
          <div style="font-size:48px; font-weight:900; color:${confidenceColor}; line-height:1;">
            ${belief.confidence}%
          </div>
          <div style="font-size:11px; color:#71717a; font-weight:600; text-transform:uppercase; margin-top:4px;">
            ${confidenceLabel}
          </div>
        </div>
        
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <div style="font-size:20px;">${trendIcon}</div>
            <div style="font-size:13px; color:#d4d4d8; font-weight:700;">${trendLabel}</div>
          </div>
          <div style="font-size:11px; color:#a1a1aa; line-height:1.4;">
            Momentum: ${momentum.toFixed(1)} (${signalStrength})<br>
            Velocity: ${belief.velocity ? (belief.velocity.perScan > 0 ? '+' : '') + belief.velocity.perScan.toFixed(1) : '0.0'}%/scan, ${belief.velocity ? (belief.velocity.perDay > 0 ? '+' : '') + belief.velocity.perDay.toFixed(1) : '0.0'}%/day
          </div>
        </div>
      </div>
      
      <!-- Evidence Quality -->
      <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:12px; margin-bottom:12px;">
        <div style="font-size:10px; color:#71717a; text-transform:uppercase; margin-bottom:8px; font-weight:700;">Evidence Quality</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; font-size:11px; color:#d4d4d8;">
          <div>
            <div style="color:#71717a; font-size:9px; margin-bottom:2px;">Evidence Points</div>
            <div style="font-size:16px; font-weight:700;">${totalEvidence}</div>
          </div>
          <div>
            <div style="color:#71717a; font-size:9px; margin-bottom:2px;">Unique Sources</div>
            <div style="font-size:16px; font-weight:700;">${uniqueSources}</div>
          </div>
          <div>
            <div style="color:#71717a; font-size:9px; margin-bottom:2px;">Diversity</div>
            <div style="font-size:16px; font-weight:700;">${diversityPct}%</div>
            <div style="color:#71717a; font-size:9px;">${diversityPct >= 70 ? 'High' : diversityPct >= 40 ? 'Medium' : 'Low'}</div>
          </div>
        </div>
      </div>
      
      <!-- Strategic Assessment -->
      <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:12px; margin-bottom:12px;">
        <div style="font-size:10px; color:#71717a; text-transform:uppercase; margin-bottom:8px; font-weight:700;">Strategic Assessment</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:11px; color:#d4d4d8;">
          <div>
            <div style="color:#71717a; font-size:9px; margin-bottom:2px;">Signal Strength</div>
            <div style="font-size:14px; font-weight:700; color:${momentum > 3 ? '#10b981' : momentum > 2 ? '#10b981' : momentum > 1 ? '#f59e0b' : '#71717a'};">
              ${signalStrength}
            </div>
          </div>
          <div>
            <div style="color:#71717a; font-size:9px; margin-bottom:2px;">Opportunity Window</div>
            <div style="font-size:14px; font-weight:700;">
              ${momentum > 3 ? 'Immediate' : momentum > 2 ? 'Near-term' : 'Long-term'}
            </div>
            <div style="color:#71717a; font-size:9px;">
              ${momentum > 3 ? '2-4 weeks' : momentum > 2 ? '4-8 weeks' : '8+ weeks'}
            </div>
          </div>
        </div>
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #27272a;">
          <div style="color:#71717a; font-size:9px; margin-bottom:4px;">Recommended Action</div>
          <div style="font-size:12px; color:#10b981; font-weight:700;">
            ${momentum > 3 ? 'Act on this trend - Position for immediate opportunity' : 
              momentum > 2 ? 'Monitor for opportunities - Prepare contingency plans' : 
              'Continue passive monitoring - Re-evaluate in 4-8 weeks'}
          </div>
        </div>
      </div>
      
      <!-- Counter-Hypothesis -->
      ${counterHyp ? `
        <div style="background:#0a0a0a; border:1px solid #3f3f46; border-radius:8px; padding:12px; margin-bottom:12px;">
          <div style="font-size:10px; color:#71717a; text-transform:uppercase; margin-bottom:6px; font-weight:700;">
            Counter-Hypothesis 
            <span style="color:#ef4444; margin-left:8px;">Strength: ${counterHyp.includes('strength:') ? counterHyp.split('strength: ')[1].substring(0, 4) : 'N/A'}</span>
          </div>
          <div style="font-size:11px; color:#a1a1aa; line-height:1.5;">
            ${counterHyp.length > 250 ? counterHyp.substring(0, 250) + '...' : counterHyp}
          </div>
        </div>
      ` : ''}
      
      <!-- Latest Update Reason -->
      ${latestReason ? `
        <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:10px; margin-bottom:12px;">
          <div style="font-size:9px; color:#71717a; text-transform:uppercase; margin-bottom:4px;">Latest Update</div>
          <div style="font-size:10px; color:#a1a1aa; line-height:1.4;">
            ${latestReason}
          </div>
        </div>
      ` : ''}
      
      <div style="font-size:10px; color:#52525b; text-align:right;">
        Last updated: ${timeAgo(belief.lastUpdated)} • 4-pass reasoning pipeline
      </div>
    </div>
  `;
}

function showBeliefDetail(belief) {
  ui.analystModal.classList.add('active');
  const revisions = (belief.revisionHistory || belief.revision_history || []).map(rev => ({
    date: rev.date,
    oldConf: rev.oldConfidence ?? rev.old_confidence ?? 0,
    newConf: rev.newConfidence ?? rev.new_confidence ?? 0,
    reason: rev.reason || ''
  }));
  const effectiveConfidence = revisions.length > 0 ? revisions[revisions.length - 1].newConf : belief.confidence;
  const confColor = effectiveConfidence >= 70 ? '#22c55e' : effectiveConfidence >= 50 ? '#fbbf24' : '#ef4444';

  // Derive supporting/contradicting from flat evidence array (pipeline format),
  // falling back to legacy separate arrays
  const allEvidence = belief.evidence || [];
  const supporting = allEvidence.filter(e => (e.impact || 0) >= 0 && e.text);
  const contradicting = allEvidence.filter(e => (e.impact || 0) < 0 && e.text);
  // Merge any legacy snake_case arrays
  if (belief.supporting_evidence) {
    belief.supporting_evidence.forEach(e => {
      if (!supporting.find(s => s.text === (e.text || e.claim))) supporting.push(e);
    });
  }
  if (belief.contradicting_evidence) {
    belief.contradicting_evidence.forEach(e => {
      if (!contradicting.find(c => c.text === (e.text || e.claim))) contradicting.push(e);
    });
  }
  const totalEvidence = supporting.length + contradicting.length;

  ui.analystContent.innerHTML = `
    <div style="padding:32px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:24px;">
        <div style="flex:1;">
          <div style="font-size:10px; font-weight:800; color:${confColor}; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">${effectiveConfidence >= 70 ? 'High' : effectiveConfidence >= 50 ? 'Moderate' : 'Low'} Confidence</div>
          <h3 style="font-size:20px; margin:0; color:#fff;">${belief.claim}</h3>
        </div>
        <div style="width:80px; height:80px; border-radius:50%; border:8px solid #27272a; border-top-color:${confColor}; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; color:${confColor}; flex-shrink:0; margin-left:20px;">${effectiveConfidence}%</div>
      </div>
      ${belief.trendDirection ? `
        <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
          ${belief.trendDirection === 'increasing' ? 
            `<div style="font-size:20px;">🔥</div><div style="font-size:11px; color:#10b981; font-weight:700; text-transform:uppercase;">Trending Up</div>` :
            belief.trendDirection === 'decreasing' ?
            `<div style="font-size:20px;">📉</div><div style="font-size:11px; color:#ef4444; font-weight:700; text-transform:uppercase;">Declining</div>` :
            `<div style="font-size:20px;">⚖️</div><div style="font-size:11px; color:#6b7280; font-weight:700; text-transform:uppercase;">Stable</div>`
          }
          ${belief.momentum && belief.momentum.score > 0 ? 
            `<div style="font-size:9px; color:#666; margin-left:auto;">momentum: ${belief.momentum.score.toFixed(1)}</div>` : ''
          }
        </div>
      ` : ''}

      <div style="display:flex; gap:24px; margin-bottom:32px; padding-bottom:24px; border-bottom:1px solid #27272a;">
        <div><div style="font-size:10px; color:#666; text-transform:uppercase;">Created</div><div style="font-size:13px; color:#a1a1aa; margin-top:2px;">${belief.created ? new Date(belief.created).toLocaleDateString() : 'Unknown'}</div></div>
        <div><div style="font-size:10px; color:#666; text-transform:uppercase;">Last Updated</div><div style="font-size:13px; color:#a1a1aa; margin-top:2px;">${timeAgo(belief.lastUpdated)}</div></div>
        <div><div style="font-size:10px; color:#666; text-transform:uppercase;">Evidence</div><div style="font-size:13px; color:#a1a1aa; margin-top:2px;">${totalEvidence} signals</div></div>
      </div>

      ${belief.velocity ? `
        <div style="margin-top:24px; padding:16px; background:#0a0a0a; border:1px solid #27272a; border-radius:8px;">
          <h4 style="font-size:11px; font-weight:800; color:#a1a1aa; text-transform:uppercase; margin-bottom:12px;">Trend Analysis</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:16px;">
            <div>
              <div style="font-size:10px; color:#666; margin-bottom:4px;">Velocity</div>
              <div style="font-size:16px; font-weight:700; color:#d4d4d8;">
                ${belief.velocity.perScan > 0 ? '+' : ''}${belief.velocity.perScan.toFixed(2)}% <span style="font-size:11px; color:#666;">/scan</span>
              </div>
              <div style="font-size:11px; color:#666; margin-top:2px;">
                ${belief.velocity.perDay > 0 ? '+' : ''}${belief.velocity.perDay.toFixed(2)}% <span style="font-size:9px;">/day</span>
              </div>
            </div>
            <div>
              <div style="font-size:10px; color:#666; margin-bottom:4px;">Trend</div>
              <div style="font-size:14px; font-weight:700; color:${
                belief.trendDirection === 'increasing' ? '#10b981' : 
                belief.trendDirection === 'decreasing' ? '#ef4444' : '#6b7280'
              }; text-transform:capitalize;">
                ${belief.trendDirection}
              </div>
            </div>
            <div>
              <div style="font-size:10px; color:#666; margin-bottom:4px;">Momentum</div>
              <div style="font-size:16px; font-weight:700; color:#d4d4d8;">
                ${belief.momentum ? belief.momentum.score.toFixed(2) : '0.00'}
              </div>
              <div style="font-size:9px; color:#666; margin-top:2px;">
                ${belief.momentum ? `${(belief.momentum.consistency * 100).toFixed(0)}% consistent` : ''}
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <div style="margin-bottom:32px;">
        <h4 style="font-size:11px; font-weight:800; color:#60a5fa; text-transform:uppercase; margin-bottom:16px;">Revision History</h4>
        ${revisions.length > 0 ? revisions.slice(-10).reverse().map(rev => {
          const delta = rev.newConf - rev.oldConf;
          const deltaColor = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#a1a1aa';
          const arrow = delta > 0 ? '\u2191' : delta < 0 ? '\u2193' : '\u2192';
          return `<div style="background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:12px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <div style="font-size:12px; font-weight:700; color:#fff;">${rev.date ? new Date(rev.date).toLocaleDateString() + ' ' + new Date(rev.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</div>
              <div style="font-size:13px; font-weight:800; color:${deltaColor};">${rev.oldConf || '?'}% ${arrow} ${rev.newConf || '?'}% <span style="font-size:11px;">(${delta > 0 ? '+' : ''}${delta})</span></div>
            </div>
            <div style="font-size:12px; color:#a1a1aa;">${rev.reason}</div>
          </div>`;
        }).join('') : '<div style="text-align:center; padding:20px; color:#666; font-size:12px;">No revisions yet</div>'}
      </div>

      <div style="margin-bottom:32px;">
        <h4 style="font-size:11px; font-weight:800; color:#22c55e; text-transform:uppercase; margin-bottom:16px;">Supporting Evidence</h4>
        ${supporting.length > 0 ? supporting.map(e => {
          const evText = typeof e === 'string' ? e : (e.text || e.claim || '');
          return `<div style="background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:12px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; gap:12px;">
              <div style="flex:1;">
                <div style="font-size:12px; color:#d4d4d8; margin-bottom:4px;">${e.link ? `<a href="${e.link}" target="_blank" style="color:#60a5fa; text-decoration:none;">${evText}</a>` : evText}</div>
                ${e.source ? `<div style="font-size:10px; color:#666;">${e.source} \u2022 ${timeAgo(e.date)}</div>` : ''}
              </div>
              <div style="font-size:13px; font-weight:800; color:#22c55e;">+${e.impact || 0}</div>
            </div>
          </div>`;
        }).join('') : '<div style="text-align:center; padding:20px; color:#666; font-size:12px;">No supporting evidence yet</div>'}
      </div>

      ${contradicting.length > 0 ? `
        <div>
          <h4 style="font-size:11px; font-weight:800; color:#ef4444; text-transform:uppercase; margin-bottom:16px;">Contradicting Evidence</h4>
          ${contradicting.map(e => {
            const evText = typeof e === 'string' ? e : (e.text || e.claim || '');
            return `<div style="background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:12px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; gap:12px;">
                <div style="flex:1;">
                  <div style="font-size:12px; color:#d4d4d8; margin-bottom:4px;">${e.link ? `<a href="${e.link}" target="_blank" style="color:#60a5fa; text-decoration:none;">${evText}</a>` : evText}</div>
                  ${e.source ? `<div style="font-size:10px; color:#666;">${e.source} \u2022 ${timeAgo(e.date)}</div>` : ''}
                </div>
                <div style="font-size:13px; font-weight:800; color:#ef4444;">${e.impact || 0}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      ` : ''}

      ${(belief.watchItems?.length || belief.lastAnalysis) ? `
        <div style="margin-top:24px; padding-top:24px; border-top:1px solid #27272a;">
          ${belief.watchItems?.length ? `
            <h4 style="font-size:11px; font-weight:800; color:#60a5fa; text-transform:uppercase; margin-bottom:8px;">Watch next</h4>
            <ul style="margin:0 0 16px; padding-left:18px; font-size:12px; color:#94a3b8; line-height:1.6;">${belief.watchItems.map(w => `<li>${String(w).replace(/</g,'&lt;')}</li>`).join('')}</ul>
          ` : ''}
          ${belief.lastAnalysis ? `
            <div style="font-size:10px; color:#71717a;">Last analysis: ${belief.lastAnalysis.llm || 'LLM'} · ${belief.lastAnalysis.date ? new Date(belief.lastAnalysis.date).toLocaleDateString() : ''}</div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
  
  // Store active belief on the modal so the global send-to-model handler can access it
  ui.analystModal.dataset.activeBelief = JSON.stringify(belief);
}

// ── INLINE BELIEF ANALYSIS ──

// Calls Claude or OpenAI directly and returns the response text.
// Returns null for LLMs without a direct API (Perplexity, Gemini, etc.) — caller uses clipboard fallback.
async function analyzeBeliefWithAPI(prompt, llm) {
  if (llm === 'claude') {
    if (!HARDCODED_ANTHROPIC_KEY) throw new Error('Anthropic API key missing in runtime storage');
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": HARDCODED_ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.content?.[0]?.text || '';
  }

  if (llm === 'chatgpt') {
    if (!HARDCODED_OPENAI_KEY) throw new Error('OpenAI API key missing in runtime storage');
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HARDCODED_OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.2
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.choices?.[0]?.message?.content || '';
  }

  return null; // No direct API for this LLM — use clipboard fallback
}

// Detects the recommended confidence direction from the model's response text.
function detectConfidenceDirection(text) {
  const lower = text.toLowerCase();
  const decreaseScore = (lower.match(/\b(decrease|lower|drop|reduce|decline|wrong|miscalibrated|too high|overconfident|fall)\b/g) || []).length;
  const increaseScore = (lower.match(/\b(increase|raise|higher|grow|strengthen|confirmed|supports|boost)\b/g) || []).length;
  if (decreaseScore > increaseScore + 1) return 'decrease';
  if (increaseScore > decreaseScore + 1) return 'increase';
  return 'hold';
}

// Basic markdown-to-HTML for LLM responses (handles headers, bold, lists, paragraphs)
function markdownToHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f4f4f5;">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^#### (.+)$/gm, '<h4 style="font-size:12px; font-weight:800; color:#a1a1aa; text-transform:uppercase; letter-spacing:0.5px; margin:20px 0 8px;">$1</h4>')
    .replace(/^### (.+)$/gm, '<h4 style="font-size:13px; font-weight:800; color:#d4d4d8; margin:20px 0 8px;">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:15px; font-weight:800; color:#f4f4f5; margin:24px 0 10px;">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="font-size:17px; font-weight:800; color:#f4f4f5; margin:0 0 16px;">$1</h2>')
    .replace(/^\d+\.\s+\*\*(.+?)\*\*(.*)$/gm, '<li style="margin-bottom:10px;"><strong style="color:#f4f4f5;">$1</strong>$2</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin-bottom:8px; color:#d4d4d8;">$1</li>')
    .replace(/^[-•]\s+(.+)$/gm, '<li style="margin-bottom:6px; color:#d4d4d8;">$1</li>')
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul style="padding-left:20px; margin:8px 0 16px;">${m}</ul>`)
    .replace(/\n\n+/g, '</p><p style="margin:0 0 14px; color:#d4d4d8; font-size:13px; line-height:1.7;">')
    .replace(/^/, '<p style="margin:0 0 14px; color:#d4d4d8; font-size:13px; line-height:1.7;">')
    .replace(/$/, '</p>');
}

// Renders the inline belief analysis result with a confidence update widget.
// opts.structured: validated structured output { verdict, confidence_delta, watch_items, ... }
function renderBeliefAnalysisResult(belief, analysisText, llmLabel, opts = {}) {
  const { structured } = opts;
  const revs = belief.revisionHistory || belief.revision_history || [];
  const effectiveConfidence = revs.length > 0
    ? (revs[revs.length - 1].newConfidence ?? revs[revs.length - 1].new_confidence ?? belief.confidence)
    : belief.confidence;

  const direction = structured?.verdict === 'increase' ? 'increase'
    : structured?.verdict === 'decrease' ? 'decrease'
    : detectConfidenceDirection(analysisText);
  const btnBase = 'padding:8px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid; transition:all 0.15s;';
  const btnNeutral = `${btnBase} background:#18181b; color:#a1a1aa; border-color:#3f3f46;`;
  const btnDecrease = `${btnBase} background:#450a0a; color:#fca5a5; border-color:#7f1d1d;`;
  const btnIncrease = `${btnBase} background:#052e16; color:#86efac; border-color:#14532d;`;
  const btnHold = `${btnBase} background:#1c1917; color:#fde68a; border-color:#78350f;`;

  const confColor = effectiveConfidence >= 70 ? '#22c55e' : effectiveConfidence >= 50 ? '#fbbf24' : '#ef4444';

  ui.analystContent.innerHTML = `
    <div style="padding:28px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #27272a;">
        <button id="belief-analysis-back" style="padding:6px 12px; background:#27272a; border:none; border-radius:6px; color:#a1a1aa; font-size:12px; cursor:pointer; font-weight:600;">← Back</button>
        <div>
          <div style="font-size:10px; color:#71717a; text-transform:uppercase; font-weight:700; letter-spacing:1px;">${llmLabel} · Belief Analysis</div>
          <div style="font-size:12px; color:#a1a1aa; margin-top:2px;">${belief.claim.length > 80 ? belief.claim.substring(0, 80) + '…' : belief.claim}</div>
        </div>
        <div style="margin-left:auto; font-size:20px; font-weight:800; color:${confColor};">${effectiveConfidence}%</div>
      </div>

      <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:20px; margin-bottom:20px; max-height:420px; overflow-y:auto;">
        ${markdownToHtml(analysisText)}
      </div>
      ${structured?.watch_items?.length ? `
      <div style="background:#0f172a; border:1px solid #1e3a5f; border-radius:8px; padding:14px; margin-bottom:16px;">
        <div style="font-size:10px; font-weight:800; color:#60a5fa; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Watch next</div>
        <ul style="margin:0; padding-left:18px; font-size:12px; color:#94a3b8; line-height:1.6;">${structured.watch_items.map(w => `<li>${String(w).replace(/</g,'&lt;')}</li>`).join('')}</ul>
      </div>` : ''}

      <div style="background:#18181b; border:1px solid #3f3f46; border-radius:8px; padding:16px;">
        <div style="font-size:10px; font-weight:800; color:#a1a1aa; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">
          Apply Confidence Update · Current: ${effectiveConfidence}%
          ${direction !== 'hold' ? `<span style="color:${direction === 'decrease' ? '#fca5a5' : '#86efac'}; margin-left:8px;">${llmLabel} suggests: ${direction.toUpperCase()}</span>` : `<span style="color:#fde68a; margin-left:8px;">${llmLabel} suggests: HOLD</span>`}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;" id="confidence-update-btns">
          <button class="conf-delta-btn" data-delta="-10" style="${direction === 'decrease' ? btnDecrease : btnNeutral}">−10%</button>
          <button class="conf-delta-btn" data-delta="-5" style="${direction === 'decrease' ? btnDecrease : btnNeutral}">−5%</button>
          <button class="conf-delta-btn" data-delta="0" style="${direction === 'hold' ? btnHold : btnNeutral}">Hold</button>
          <button class="conf-delta-btn" data-delta="5" style="${direction === 'increase' ? btnIncrease : btnNeutral}">+5%</button>
          <button class="conf-delta-btn" data-delta="10" style="${direction === 'increase' ? btnIncrease : btnNeutral}">+10%</button>
        </div>
        <div id="conf-update-status" style="font-size:11px; color:#71717a; margin-top:8px;"></div>
      </div>
    </div>
  `;

  // Back button
  document.getElementById('belief-analysis-back').addEventListener('click', () => {
    showBeliefDetail(belief);
  });

  // Confidence update buttons — guardrails: max ±10 per click, store analysis + watch items
  document.querySelectorAll('.conf-delta-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let delta = parseInt(btn.dataset.delta, 10);
      delta = Math.max(-10, Math.min(10, delta));
      const newConf = Math.min(95, Math.max(5, effectiveConfidence + delta));
      const reason = `${llmLabel} analysis: confidence ${delta > 0 ? '+' : ''}${delta}% (from ${effectiveConfidence}% to ${newConf}%)`;

      chrome.storage.local.get(['hypotheses'], (data) => {
        const hypotheses = data.hypotheses || [];
        const idx = hypotheses.findIndex(h => h.id === belief.id);
        if (idx === -1) {
          document.getElementById('conf-update-status').textContent = '⚠ Belief not found in storage';
          return;
        }
        const now = new Date().toISOString();
        hypotheses[idx].confidence = newConf;
        hypotheses[idx].lastUpdated = now;
        hypotheses[idx].revisionHistory = [
          ...(hypotheses[idx].revisionHistory || []),
          { date: now, oldConfidence: effectiveConfidence, newConfidence: newConf, reason }
        ];
        chrome.storage.local.set({ hypotheses }, () => {
          document.getElementById('conf-update-status').textContent = `✓ Confidence updated to ${newConf}%`;
        });
      });
    });
  });
}

// ── HOT LIST CHIPS (Pro Controls) ──
function renderHotChips(list) {
  const container = document.getElementById('hotlist-chips');
  if (!container) return;
  container.innerHTML = "";
  list.forEach(term => {
    const chip = document.createElement('div');
    chip.className = 'pro-chip';
    chip.title = 'Click to scan this topic';
    chip.innerHTML = `<span class="pro-chip-label">${esc(term)}</span> <span class="pro-chip-x">&#10005;</span>`;

    // Clicking the label text → populate search + trigger scan
    chip.querySelector('.pro-chip-label').onclick = () => {
      activateTopicScan(term);
    };

    // Clicking X → remove from all boards (topicSets) or legacy hotList only
    chip.querySelector('.pro-chip-x').onclick = (e) => {
      e.stopPropagation();
      chrome.storage.local.get(['topicSets', 'hotList'], (data) => {
        const sets = data.topicSets;
        if (sets && Array.isArray(sets) && sets.length) {
          const next = sets.map(s => ({
            ...s,
            topics: (s.topics || []).filter(t => t !== term)
          }));
          const u = new Set();
          next.forEach(s => (s.topics || []).forEach(t => u.add(t)));
          chrome.storage.local.set({ topicSets: next, hotList: [...u] }, () => renderHotChips([...u]));
        } else {
          const updated = (data.hotList || []).filter(t => t !== term);
          chrome.storage.local.set({ hotList: updated }, () => renderHotChips(updated));
        }
      });
    };
    container.appendChild(chip);
  });
}

/**
 * Copy a tracked topic into the search bar and fire a scan.
 * Called whenever a topic is added manually, generated by AI, or clicked.
 */
function activateTopicScan(term) {
  if (!term) return;
  if (ui.search) ui.search.value = term;
  runSearch(term);
}

// ── EXPORT ──
function copyResults(format) {
  if (!currentResults.length) return;

  const toMarkdown = () => `# Cognesion Signal Brief
**Generated:** ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
**Topic:** ${currentTopic || 'General AI Trends'}
**Signal Strength:** ${currentResults.length} sources analyzed

## Key Signals

${currentResults.slice(0, 10).map((item, i) => `
### ${i + 1}. ${item.title}
**Source:** ${item.source} | **Published:** ${timeAgo(item.date)}
**Link:** ${item.link}
${cleanText(item.summary)}
---`).join('\n')}

*Generated by Cognesion Command*`;

  const toSlack = () => `*Cognesion Signal Brief*
_${new Date().toLocaleDateString()} \u2022 ${currentResults.length} signals_

${currentResults.slice(0, 5).map(item => `*<${item.link}|${item.title}>*
${item.source} \u2022 ${timeAgo(item.date)}
${cleanText(item.summary).substring(0, 150)}...`).join('\n\n')}
${currentResults.length > 5 ? `\n_+${currentResults.length - 5} more signals available_` : ''}`;

  let text = format === 'slack' || format === 'teams' ? toSlack() : toMarkdown();

  navigator.clipboard.writeText(text).then(() => {
    const select = document.getElementById('export-selector');
    if (select) {
      select.options[0].text = "COPIED!";
      setTimeout(() => { select.options[0].text = "EXPORT"; select.value = ""; }, 2000);
    }
  });
}

// ── POWER PROMPT ROUTING ──
function openPowerPrompt(useCase, title, link, query, type = 'news', context = '') {
  // Debounce duplicate calls
  const now = Date.now();
  if (now - lastPowerPromptCall < POWER_PROMPT_DEBOUNCE) {
    console.warn('⛔ DUPLICATE openPowerPrompt call blocked (called twice within 500ms)');
    console.trace('Stack trace of blocked call:');
    return;
  }
  lastPowerPromptCall = now;
  console.log('✅ openPowerPrompt executing for:', useCase.substring(0, 50));

  const llm = ui.llmSelector ? ui.llmSelector.value : 'claude';
  const cleanedContext = cleanText(context || '').substring(0, 500);
  let prompt;
  if (title && link) {
    const contextBlock = cleanedContext ? `\nSource context: ${cleanedContext}` : '';
    if (query) {
      prompt = type === 'video'
        ? `You are helping with AI signal intelligence.

Research focus: "${query}"
Source type: video
Source title: "${title}"
Source URL: ${link}${contextBlock}

Task:
${useCase}

Respond in clean bullet points:
1. What this signal actually means for "${query}"
2. Why it matters now
3. What to watch next
4. One concrete action to take

Be specific. Avoid repeating the headline or generic filler.`
        : `You are helping with AI signal intelligence.

Research focus: "${query}"
Source type: article
Source title: "${title}"
Source URL: ${link}${contextBlock}

Task:
${useCase}

Respond in clean bullet points:
1. What this signal actually means for "${query}"
2. Why it matters now
3. What to watch next
4. One concrete action to take

Be specific. Avoid repeating the headline or generic filler.`;
    } else {
      prompt = type === 'video'
        ? `You are helping with AI signal intelligence.

Source type: video
Source title: "${title}"
Source URL: ${link}${contextBlock}

Task:
${useCase}

Respond in clean bullet points:
1. What the source actually says
2. What it implies strategically
3. What to watch next
4. One concrete action to take

Be specific. Avoid repeating the headline or generic filler.`
        : `You are helping with AI signal intelligence.

Source type: article
Source title: "${title}"
Source URL: ${link}${contextBlock}

Task:
${useCase}

Respond in clean bullet points:
1. What the source actually says
2. What it implies strategically
3. What to watch next
4. One concrete action to take

Be specific. Avoid repeating the headline or generic filler.`;
    }
  } else {
    prompt = useCase;
  }
  const customBase = document.getElementById('custom-llm-input')?.value || 'https://www.google.com/';
  handoffDashboardPromptToLLM(llm, prompt, customBase);
}

// ── INTELLIGENCE ENGINE ──
const IntelligenceEngine = {
  async generateSignalsAI(role, career, contextStr, keywords) {
    if (!HARDCODED_OPENAI_KEY) return this.generateSignalsLogic();
    const systemPrompt = `Goal: Generate 5 high-impact monitoring signals. Context: ${role}, ${contextStr || "general market"}, ${keywords}. Output: JSON array of strings.`;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${HARDCODED_OPENAI_KEY}` }, body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }], temperature: 0.7 }) });
      const data = await response.json();
      return JSON.parse(data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim()).slice(0, 5);
    } catch (e) { return this.generateSignalsLogic(); }
  },

  async analyzeContent(title, link, type, role, focus, context, sourceType = 'unknown', articleDate = null, isFallback = false, scanContext = '') {
    if (!HARDCODED_ANTHROPIC_KEY || HARDCODED_ANTHROPIC_KEY === "YOUR_ANTHROPIC_API_KEY_HERE") return `<p style="color:orange">Anthropic key missing in runtime storage for this beta build.</p>`;

    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const partialSourceNote = isFallback ? '\n\n⚠ PARTIAL SOURCE — Full article text unavailable. Analysis is based on summary only. Scope ALL claims strictly to confirmed content. Prepend the brief title with [PARTIAL SOURCE]. Do NOT infer or speculate beyond what the summary explicitly states.' : '';

    const systemPrompt = `You are a senior intelligence analyst. Your job is to produce deep, original analysis — not summarize. You must think critically about what the article actually says vs. what it implies, fact-check claims against your knowledge, identify what's missing, and surface the strategic dynamics the article doesn't spell out.

Today's date is ${todayStr}.
Article published: ${articleDate ? new Date(articleDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'date unknown'}.${partialSourceNote}

YOUR ANALYSIS MUST:

1. FACT-CHECK THE ARTICLE. If a claim is misleading, incomplete, or wrong based on what you know, say so. Lead with corrections if they matter. Example: "The article frames X as a future goal, but X already happened — [specific evidence]. The actual news is Y."

2. GO DEEPER THAN THE ARTICLE. The article is your starting point, not your boundary. Use your knowledge to add:
   - Context the article omits (competitive dynamics, prior history, related developments)
   - Strategic subtext (why this was published now, who benefits from this framing, what's the messaging strategy)
   - Competitive landscape (who else is doing this, who can't, what's the moat)
   - The real access/distribution model vs. the PR narrative

3. IDENTIFY THE GAP BETWEEN NARRATIVE AND REALITY. Every article has a frame. Name it. Then show where reality diverges. What does the article want you to believe vs. what the evidence actually supports?

4. BE FORWARD-LOOKING with DIAGNOSTIC watch items. For each item: state the observable signal, then what it confirms if it happens AND what it disconfirms if it does not. If only one outcome is informative, it is not a watch item.

5. EPISTEMIC INVENTORY. After your main analysis, classify the 4-6 most important claims in the brief using exactly these labels:
   - FACT: directly confirmed by the cited source or independently verifiable
   - INFERENCE: logical conclusion from confirmed facts (state the facts it rests on)
   - SPECULATION: plausible but unverified — requires independent confirmation before acting on
   - UNVERIFIED: claim exists in source but could not be independently confirmed

BAD ANALYSIS (what you must NOT produce):
- "[Actor] is working on developing advanced AI tools aimed at supporting scientific research"
- "There is a focus on expanding access"
- "The development could significantly accelerate discovery and innovation"
- "Without clear strategies, the impact may be limited"
These are summaries, not intelligence. They add nothing the reader couldn't get from skimming the headline.

GOOD ANALYSIS (what you MUST produce):
- "The '3 million researchers' figure is not a target — it's already happened. AlphaFold serves 3M+ researchers across 190 countries, with 33%+ in LMICs. The actual news is the expansion beyond AlphaFold into a platform play."
- "The UK deal reveals the real access model: tiered, not democratic. British scientists get priority access to AlphaGenome, AlphaEvolve, WeatherNext. That's not open science — it's government partnership with public database as PR."
- "Manyika (policy) + Hassabis (science credibility) co-authoring signals Google is contesting the 'AI for global good' narrative ahead of India's AI summit, where $200B in data center investment is in play."
- "OpenAI has no AlphaFold equivalent. Microsoft has tools but no Nobel-anchored credibility. DeepMind's moat in science AI is real — question is platform coherence before competitors close the gap with general-purpose models."

OUTPUT FORMAT (HTML) — output ALL seven sections in this exact order:

<div style="font-family: system-ui; max-width: 750px; line-height: 1.7; color: #e4e4e7;">

<h2 style="font-size: 20px; font-weight: 700; color: #f4f4f5; margin-bottom: 20px;">Intelligence Brief: [Specific Topic]</h2>

<div style="background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
<h3 style="font-size: 12px; color: #f59e0b; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; letter-spacing: 0.5px;">Corrections & Context</h3>
<p style="margin: 0; font-size: 14px; color: #d4d4d8;">[If the article contains misleading claims, errors, or missing context — correct them here. If accurate, note what critical context it omits. Be specific: "Article says X, but actually Y because Z."]</p>
</div>

<div style="background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
<h3 style="font-size: 12px; color: #71717a; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; letter-spacing: 0.5px;">What's Actually Happening</h3>
<p style="margin: 0; font-size: 14px; color: #d4d4d8;">[Go beyond the article. What's the real story? Include actors, numbers, dates, mechanisms. Explain what the article doesn't say. Multiple paragraphs are fine — depth matters more than brevity.]</p>
</div>

<div style="background: #18181b; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
<h3 style="font-size: 12px; color: #a78bfa; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; letter-spacing: 0.5px;">Epistemic Inventory</h3>
<p style="font-size: 11px; color: #52525b; margin: 0 0 12px; font-style: italic;">FACT = confirmed by source | INFERENCE = logical conclusion from confirmed facts | SPECULATION = plausible, unverified | UNVERIFIED = in source but not independently confirmable</p>
<table style="width:100%; font-size:12px; border-collapse:collapse; color:#d4d4d8;">
  <thead><tr style="color:#52525b; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #27272a;">
    <th style="text-align:left; padding-bottom:8px; padding-right:12px;">Claim</th>
    <th style="text-align:left; padding-bottom:8px; padding-right:12px; white-space:nowrap;">Label</th>
    <th style="text-align:left; padding-bottom:8px;">Basis</th>
  </tr></thead>
  <tbody>
  [4-6 rows — one per key claim from the brief. Use color #22c55e for FACT, #60a5fa for INFERENCE, #f59e0b for SPECULATION, #ef4444 for UNVERIFIED in the label cell. Example row:
  <tr style="border-bottom:1px solid #1f1f1f;">
    <td style="padding:6px 12px 6px 0; vertical-align:top;">[claim text]</td>
    <td style="padding:6px 12px 6px 0; vertical-align:top; white-space:nowrap;"><span style="color:#22c55e; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:0.5px;">FACT</span></td>
    <td style="padding:6px 0; color:#71717a; vertical-align:top; font-size:11px;">[source or basis]</td>
  </tr>]
  </tbody>
</table>
</div>

<div style="background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
<h3 style="font-size: 12px; color: #71717a; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; letter-spacing: 0.5px;">Strategic Subtext</h3>
<p style="margin: 0; font-size: 14px; color: #d4d4d8;">[Why was this published now? Who benefits from this framing? What's the competitive dynamic? What are the real incentive structures vs. the stated ones? Name the narrative strategy.]</p>
</div>

<div style="background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
<h3 style="font-size: 12px; color: #71717a; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; letter-spacing: 0.5px;">Narrative vs. Reality</h3>
<p style="margin: 0; font-size: 14px; color: #d4d4d8;">[What does the article/actor want you to believe? Where does evidence diverge? Name the gap between rhetoric and action, between announcement and execution, between PR and mechanism.]</p>
</div>

<div style="background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
<h3 style="font-size: 12px; color: #71717a; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; letter-spacing: 0.5px;">Open Questions</h3>
[2-3 items using this repeating block:]
<div style="margin-bottom:12px; padding:10px 12px; background:#0a0a0a; border-radius:6px; font-size:13px;">
  <div style="color:#f59e0b; font-weight:600; margin-bottom:4px;">GAP: [what is unknown or unverifiable]</div>
  <div style="color:#a1a1aa; margin-bottom:4px;"><span style="color:#d4d4d8; font-weight:600;">MATERIALITY:</span> [how it would change the analysis if known]</div>
  <div style="color:#a1a1aa;"><span style="color:#d4d4d8; font-weight:600;">HOW TO RESOLVE:</span> [specific source or evidence that would close it]</div>
</div>
</div>

<div style="background: #18181b; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px;">
<h3 style="font-size: 12px; color: #60a5fa; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; letter-spacing: 0.5px;">What to Watch</h3>
[3-5 items using this repeating block — each must be diagnostic in BOTH directions:]
<div style="margin-bottom:14px; padding:10px 12px; background:#0a0a0a; border-radius:6px; font-size:13px;">
  <div style="color:#d4d4d8; font-weight:600; margin-bottom:6px;">SIGNAL: [observable event — specific entity + action + timeframe]</div>
  <div style="color:#a1a1aa; margin-bottom:3px;"><span style="color:#22c55e; font-weight:700;">IF TRUE:</span> [what it confirms about the thesis]</div>
  <div style="color:#a1a1aa;"><span style="color:#ef4444; font-weight:700;">IF FALSE/ABSENT:</span> [what it disconfirms]</div>
</div>
</div>

</div>

CRITICAL RULES:
- Your analysis must contain information and insight NOT present in the original article
- Fact-check claims against your training knowledge — flag errors or misleading framing
- Every paragraph must contain specific actors, numbers, dates, or mechanisms
- Name competitive dynamics: who wins, who loses, what's the moat, who's absent
- If the article is PR/fluff, say so explicitly and explain the messaging strategy
- Never use: "opportunities include", "stakeholders should", "challenges exist", "could potentially", "remains to be seen"
- If article provides limited substance, state that clearly and explain what real intelligence would look like on this topic
- Write at the level of a senior analyst briefing a decision-maker, not a student summarizing an article
- SCAN CONTEXT: If scan context articles are provided, use them only for corroboration — to confirm or contradict claims in the primary article. Do not treat them as primary sources.

ARITHMETIC AND NUMBERS (highest priority — errors here destroy credibility):
- Before stating ANY arithmetic claim (sums, differences, percentages, ratios), compute it explicitly in your head and verify it
- NEVER claim a discrepancy in numbers without first confirming your own arithmetic is correct
- If the article's stated total matches the sum of its parts, do NOT flag it as an inconsistency
- Distinguish clearly between: (a) what the article explicitly states, (b) what is confirmed by other sources, (c) what is your informed inference — use language like "per the article", "confirmed separately by X", "likely represents" accordingly`;
    try {
      console.log('[AnalyzeContent] Calling Claude API...');

      const sourceLabel = sourceType === 'primary'
        ? 'PRIMARY SOURCE (official company blog, press release, or SEC filing — high credibility)'
        : sourceType === 'secondary'
          ? 'SECONDARY SOURCE (press/journalism — verify key claims against primary sources where possible)'
          : 'SOURCE TYPE UNKNOWN';

      const scanContextBlock = scanContext
        ? `\n\nSCAN CONTEXT — other articles from the same search session (use for corroboration only, not as primary sources):\n${scanContext}`
        : '';

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": HARDCODED_ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 6000,
          system: systemPrompt,
          messages: [{ role: "user", content: `Analyze this article and produce a deep intelligence brief.\n\nSOURCE TYPE: ${sourceLabel}\nCONTENT: ${isFallback ? 'PARTIAL (summary only — full text unavailable)' : 'FULL TEXT'}\n\nArticle: "${title}"\n\nFull article text:\n${context}${scanContextBlock}` }]
        })
      });
      console.log('[AnalyzeContent] Response status:', response.status);
      const data = await response.json();
      if (data.error) {
        console.error('[AnalyzeContent] Claude API error:', data.error);
        return `<p style="color:red">Analysis Failed: ${data.error.message || JSON.stringify(data.error)}</p>`;
      }
      if (!data.content || !data.content[0]) {
        console.error('[AnalyzeContent] Unexpected response:', JSON.stringify(data).substring(0, 500));
        return `<p style="color:red">Analysis Failed: Unexpected API response</p>`;
      }
      return data.content[0].text.replace(/```html/g, '').replace(/```/g, '');
    } catch (e) {
      console.error('[AnalyzeContent] Fetch error:', e.message, e);
      return `<p style="color:red">Analysis Failed: ${e.message}</p>`;
    }
  },

  async generateMarketBriefData(articles, account, topic) {
    if (!HARDCODED_OPENAI_KEY) return null;
    let safeAccount = account || "General Strategic Leadership";
    let topicDirective = "";
    if (topic && topic !== DEFAULT_QUERY) {
      safeAccount = "Strategic Market Researcher";
      topicDirective = `CRITICAL INSTRUCTION: IGNORE ALL PREVIOUS COMPANIES/ACCOUNTS. Focus ONLY on the topic: "${topic}".`;
    }
    const langName = radarLanguage ? (I18N_LANG_NAMES[radarLanguage] || radarLanguage) : null;
    const langDirective = langName ? ` Write ALL text values in ${langName}.` : '';
    const articleList = articles.slice(0, 30).map((a, i) => `ID_${i}: ${a.title} (${a.source})`).join("\n");
    const systemPrompt = `You are a ${safeAccount}. ${topicDirective}${langDirective} Analyze these articles. Return JSON: { executive_summary, recommended_actions: [], article_analysis: [{id, urgency, impact, analysis}] }. MUST ANALYZE ALL ITEMS. Articles: ${articleList}`;
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${HARDCODED_OPENAI_KEY}` }, body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }], temperature: 0.7, response_format: { type: "json_object" } }) });
      const data = await response.json();
      return JSON.parse(data.choices[0].message.content);
    } catch (e) { return null; }
  },

  generateSignalsLogic() { return ["Market Trends", "Competitor Activity", "Tech Innovation", "Consumer Shift", "Regulatory News"]; }
};

// ── BRIEF RENDERING ──
function renderInteractiveBrief(briefData, sourceList) {
  const container = document.getElementById('analyst-content');
  if (!briefData) { container.innerHTML = `<div style="padding:20px; color:red;">Failed to generate brief.</div>`; return; }

  let html = `<div><h3>Market Intelligence Brief - ${new Date().toLocaleDateString()}</h3>
    <div style="margin-bottom:20px;"><strong>Executive Summary</strong><p style="margin-top:4px; color:#d4d4d8;">${briefData.executive_summary}</p></div>
    <div style="margin-bottom:20px;"><strong>Recommended Actions</strong><ul style="margin-top:4px; padding-left:20px; color:#d4d4d8;">${briefData.recommended_actions.map(a => `<li>${a}</li>`).join('')}</ul></div>
  </div>
  <div style="margin-bottom:12px;"><strong style="color:#60a5fa;">Select Articles to Send</strong>
    <button id="btn-toggle-all" style="background:transparent; border:1px solid #333; color:#a1a1aa; font-size:10px; padding:2px 8px; border-radius:4px; cursor:pointer; margin-left:8px;">Select All</button>
  </div>
  <div id="brief-article-list" style="display:flex; flex-direction:column; gap:12px;"></div>`;

  container.innerHTML = html;
  const listContainer = document.getElementById('brief-article-list');
  const analysisMap = {};
  if (briefData.article_analysis) briefData.article_analysis.forEach(item => analysisMap[item.id] = item);

  sourceList.forEach((item, index) => {
    const analysis = analysisMap[`ID_${index}`];
    const isImportant = analysis && analysis.urgency >= 5;
    const row = document.createElement('div');
    row.className = 'brief-article-row';
    row.innerHTML = `<div style="padding-top:4px;"><input type="checkbox" class="brief-check" data-idx="${index}" ${isImportant ? 'checked' : ''}></div>
      <div style="flex:1;">
        <div style="font-size:13px; font-weight:600; color:#f4f4f5; margin-bottom:4px;"><a href="${item.link}" target="_blank" style="color:inherit; text-decoration:none;">${item.title}</a></div>
        ${analysis ? `<div style="font-size:10px; color:#fbbf24; margin-bottom:4px; font-weight:700;">Urgency: ${analysis.urgency}/10 | Impact: ${analysis.impact}/10</div><div style="font-size:12px; color:#a1a1aa; line-height:1.4;">${analysis.analysis}</div>` : `<div style="font-size:11px; color:#52525b;">(Pending analysis)</div>`}
      </div>`;
    listContainer.appendChild(row);
  });

  document.getElementById('btn-toggle-all').onclick = () => {
    const checks = document.querySelectorAll('.brief-check');
    const allChecked = Array.from(checks).every(c => c.checked);
    checks.forEach(c => c.checked = !allChecked);
  };

  if (ui.btnSendToModel) ui.btnSendToModel.dataset.activeSource = JSON.stringify(sourceList);
}

// ── SIDEBAR METRICS ──
function updateSidebarMetrics(signalCount, beliefCount) {
  // Update feed header with active topic + count
  const feedCount = document.getElementById('feed-count');
  if (feedCount && currentTopic) {
    feedCount.textContent = `Active topic: ${currentTopic} · ${signalCount} signals found`;
  }
}

// ── MAIN SEARCH ──
async function runSearch(query, highlightUrl = null) {
  if(!query) return;
  currentResults = [];
  currentTopic = query;
  
  if(ui.slots.hero) ui.slots.hero.innerHTML = ""; 
  if(ui.slots.sidebar) ui.slots.sidebar.innerHTML = ""; 
  if(ui.slots.feed) ui.slots.feed.innerHTML = "";

  // Reset insight panel to empty state for fresh scan
  resetSelectedInsight();
  
  ui.scanBtn.innerText = tl('btn_scanning');
  
  let items = [];
  try {
    items = await engine.search(query);
  } catch (error) {
    console.error('[Command] Search failed:', error);
  }
  if ((!items || items.length === 0) && DEMO_FALLBACK_ENABLED) items = getDemoData();
  if (!Array.isArray(items)) items = [];
  if (query === DEFAULT_QUERY) items = items.filter(i => i.type !== 'video');
  
  currentResults = items;
  applyLocalFilter(highlightUrl);
  ui.scanBtn.innerText = tl('btn_scan');

  updateSidebarMetrics(items.length, 0);

  // Persist results so returning from tracker skips re-scan
  chrome.storage.local.set({ dashboardCache: { query, items, savedAt: new Date().toISOString() } });
}

function restoreFromCache(cache, highlightUrl = null) {
  currentResults = cache.items || [];
  currentTopic = cache.query || DEFAULT_QUERY;
  if (ui.search) ui.search.value = currentTopic === DEFAULT_QUERY ? '' : currentTopic;

  applyLocalFilter(highlightUrl);

  updateSidebarMetrics(currentResults.length, 0);
}

function applyLocalFilter(highlightUrl = null) {
  let filtered = activeFilter === 'all'
    ? [...currentResults]
    : currentResults.filter(item => item.type === activeFilter);

  // Apply sort
  if (activeSort === 'newest') {
    filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  } else if (activeSort === 'confidence') {
    filtered.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }
  // 'relevant' keeps the original API order

  const highlightKey = normalizeLinkForMatch(highlightUrl);
  if (highlightKey) {
    const matchIndex = filtered.findIndex(item => normalizeLinkForMatch(item.link) === highlightKey);
    if (matchIndex > 0) {
      const [matched] = filtered.splice(matchIndex, 1);
      filtered.unshift(matched);
    }
  }

  const feedSlot = document.getElementById('feed-slot');
  if (!feedSlot) return;
  feedSlot.innerHTML = "";

  const feedCount = document.getElementById('feed-count');
  if (feedCount) {
    feedCount.textContent = currentTopic
      ? `Active topic: ${currentTopic} · ${filtered.length} signals found`
      : `Signal Feed · ${filtered.length} signals found`;
  }

  if (filtered.length === 0) {
    renderFeedEmptyState();
    resetSelectedInsight();
    translatePage();
    return;
  }

  filtered.forEach((item, i) => {
    const card = createFeedCard(item, i);
    if (highlightKey && normalizeLinkForMatch(item.link) === highlightKey) {
      card.classList.add('feed-card-highlight');
    }
    feedSlot.appendChild(card);
  });

  // Auto-select the first article so the insight panel is never empty
  if (filtered.length > 0) {
    const firstCard = feedSlot.querySelector('.feed-card');
    if (firstCard) {
      firstCard.classList.add('selected');
      renderSelectedInsight(filtered[0]);
    }
  }

  translatePage();
}

// ── ARTICLE FETCHING ──

const CORS_PROXIES = [
  { name: 'corsproxy', url: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`, parse: (r) => r.text() },
  { name: 'allorigins', url: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, parse: async (r) => { const d = await r.json(); return d.contents; } },
  { name: 'codetabs', url: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, parse: (r) => r.text() },
];

async function fetchArticleContent(url, fallbackSummary = '') {
  console.log(`[ArticleFetch] Attempting to fetch: ${url}`);

  // Exa /contents API — most reliable; uses existing key, no CORS restrictions
  try {
    console.log('[ArticleFetch] Trying Exa contents...');
    const exaText = await engine.fetchContents(url);
    if (exaText) {
      console.log(`[ArticleFetch] Success via Exa contents: ${exaText.length} characters`);
      return exaText;
    }
    console.log('[ArticleFetch] Exa contents returned nothing, trying proxies...');
  } catch (e) {
    console.log(`[ArticleFetch] Exa contents error: ${e.message}, trying proxies...`);
  }

  for (const proxy of CORS_PROXIES) {
    try {
      console.log(`[ArticleFetch] Trying ${proxy.name}...`);
      const proxyUrl = proxy.url(url);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/html, */*' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[ArticleFetch] ${proxy.name} failed (${response.status}), trying next...`);
        continue;
      }

      const html = await proxy.parse(response);

      if (!html || html.length < 100) {
        console.warn(`[ArticleFetch] ${proxy.name} response too short, trying next...`);
        continue;
      }

      const text = extractTextFromHTML(html);

      if (text.length < 200) {
        console.warn(`[ArticleFetch] ${proxy.name} extracted text too short, trying next...`);
        continue;
      }

      if (text.toLowerCase().includes('subscribe to continue') ||
          text.toLowerCase().includes('sign in to read')) {
        console.warn(`[ArticleFetch] Paywall detected via ${proxy.name}, trying next...`);
        continue;
      }

      console.log(`[ArticleFetch] Success via ${proxy.name}: extracted ${text.length} characters`);
      return text.substring(0, 8000);

    } catch (error) {
      console.warn(`[ArticleFetch] ${proxy.name} error: ${error.message}, trying next...`);
      continue;
    }
  }

  console.warn(`[ArticleFetch] All proxies failed, using fallback summary`);
  return fallbackSummary;
}

function extractTextFromHTML(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const unwanted = temp.querySelectorAll('script, style, nav, footer, aside, header, iframe, .ad, .advertisement, .social-share, .comments');
  unwanted.forEach(el => el.remove());

  let text = temp.textContent || temp.innerText || '';

  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  return text;
}

// ── BRIEF CALIBRATION PIPELINE ──

const PRIMARY_SOURCE_DOMAINS = [
  'aboutamazon.com', 'openai.com', 'anthropic.com', 'blog.google', 'deepmind.com',
  'ai.google', 'research.google', 'microsoft.com/en-us/blog', 'blogs.microsoft.com',
  'meta.ai', 'ai.meta.com', 'nvidia.com/en-us/about-nvidia/press-releases',
  'apple.com/newsroom', 'sec.gov', 'ir.', 'newsroom.', 'press.', 'investor.'
];

function isPrimarySource(url) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const full = url.toLowerCase();
    return PRIMARY_SOURCE_DOMAINS.some(d => hostname.includes(d) || full.includes(d));
  } catch { return false; }
}

// Second LLM call: adversarial reviewer applies the full Claim Resolution Protocol —
// assigns dispositions (Verify/Rewrite/Quarantine/Remove), scores source tiers,
// runs temporal currency check, completion gate, and builds the audit trail.
async function adversarialReviewPass(draftHtml, title, articleText, sourceType = 'secondary', articleDate = null, articleSource = '', scanContext = '') {
  if (!HARDCODED_ANTHROPIC_KEY) return null;

  const strippedBrief = draftHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 4000);
  const sourceExcerpt = (articleText || '').substring(0, 4000);
  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const pubDateStr = articleDate ? new Date(articleDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'unknown';

  const prompt = `You are a skeptical senior analyst applying the Claim Resolution Protocol to an intelligence brief.

TODAY: ${todayStr}
ARTICLE PUBLISHED: ${pubDateStr}
SOURCE DOMAIN: ${articleSource || 'unknown'}
SOURCE TYPE: ${sourceType}

BRIEF TO REVIEW:
${strippedBrief}

SOURCE ARTICLE:
${sourceExcerpt}
${scanContext ? `\nSCAN CONTEXT (other articles from same session — use for corroboration):\n${scanContext}` : ''}

TASK: Apply the four-step Claim Resolution Protocol to this brief.

STEP 1 — SOURCE TIER ASSESSMENT
Score the primary source using these tiers:
- TIER_1: official press release, SEC filing, peer-reviewed paper, verified direct executive quote, company blog by named executive
- TIER_2: news article corroborated by 2+ independent outlets, analyst report citing primary data
- TIER_3: single secondary source, aggregator, unverified report, paywalled/truncated content
- TIER_4: analyst background knowledge only, unnamed sources, incomplete fetch — cannot support any claim

STEP 2 — TEMPORAL CURRENCY CHECK
For each claim about competitor status, product releases, or market position:
- Fast-moving topics (AI model releases, funding, regulatory status, executive roles): source must be within 60 days of today
- Slow-moving topics (foundational research, established market share, historical facts): source must be within 12 months
- Article published: ${pubDateStr}. Flag any stale claims.

STEP 3 — CLAIM RESOLUTION (3-5 most important claims)
For each flagged claim, assign exactly one disposition:
- VERIFY_RETAIN: you found corroboration in your knowledge or scan context — claim may stay, label it
- REWRITE_DOWNGRADE: directional merit but overstated — provide exact rewrite with appropriate hedging
- QUARANTINE: cannot verify but may be material — remove from narrative, document for reader
- REMOVE: fabricated, contradicted, or no evidentiary basis — delete and trace dependents

STEP 4 — CASCADE DEPENDENCIES
For any QUARANTINE or REMOVE disposition: identify any other claims or conclusions in the brief that depend on the disposed claim. Those dependents inherit the same or stricter disposition.

Return ONLY a valid JSON object — no commentary, no markdown fences:
{
  "resolved_claims": [
    {
      "claim": "short exact quote from the brief",
      "disposition": "VERIFY_RETAIN",
      "problem": "what was flagged and why",
      "basis": "evidence for this disposition",
      "rewrite": null,
      "epistemic_label": "FACT",
      "cascade": []
    }
  ],
  "source_tier": "TIER_2",
  "source_tier_reason": "one sentence explaining the tier",
  "temporal_check": "PASSED",
  "temporal_failures": [],
  "quarantined_claims": [
    {
      "claim": "exact claim text",
      "reason": "why it cannot be verified",
      "required_to_resolve": "specific source or evidence needed",
      "materiality": "how analysis changes if true"
    }
  ],
  "removed_claims": [
    {
      "claim": "exact claim text",
      "reason": "fabricated | contradicted | no basis"
    }
  ],
  "completion_gate": {
    "resolution_gate": true,
    "source_gate": true,
    "temporal_gate": true,
    "structural_gate": true,
    "failures": []
  },
  "audit_trail": {
    "sources_retrieved": 1,
    "tier_1": 0,
    "tier_2": 1,
    "tier_3": 0,
    "tier_4": 0,
    "claims_reviewed": 3,
    "verified_retained": 1,
    "rewritten_downgraded": 1,
    "quarantined": 1,
    "removed": 0,
    "cascading_dependencies_resolved": 0,
    "temporal_check": "PASSED",
    "brief_confidence": "MEDIUM"
  },
  "belief_signal": {
    "net_disposition": "positive",
    "confidence_delta": 2,
    "key_verified_claims": [],
    "key_contradicted_claims": []
  },
  "overall_calibration": "WELL_CALIBRATED",
  "missing_context": "what important context is absent from this brief"
}

RULES:
- disposition must be exactly one of: VERIFY_RETAIN | REWRITE_DOWNGRADE | QUARANTINE | REMOVE
- epistemic_label must be exactly one of: FACT | INFERENCE | SPECULATION | UNVERIFIED
- source_tier must be exactly one of: TIER_1 | TIER_2 | TIER_3 | TIER_4
- temporal_check must be exactly one of: PASSED | FAILED
- overall_calibration must be exactly one of: WELL_CALIBRATED | OVERCONFIDENT | UNDERSPECIFIED
- brief_confidence must be exactly one of: HIGH | MEDIUM | LOW | INSUFFICIENT
- net_disposition must be exactly one of: positive | negative | neutral | mixed
- confidence_delta: integer -4 to +4 (net effect on belief confidence if this article is evidence)
- rewrite: null unless disposition is REWRITE_DOWNGRADE
- Be specific. Generic skepticism is not useful. Only flag genuine errors or overstatements.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": HARDCODED_ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    const text = (data.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    console.warn('[AdversarialPass] Failed:', e.message);
    return null;
  }
}

// Builds the full resolution panel shown above every brief.
// Renders: calibration badge, source tier, temporal check, resolved claims with
// disposition badges, quarantined claims, completion gate, and audit trail.
function buildCalibrationHeader(adversarialResult, sourceType) {
  const calibration = adversarialResult?.overall_calibration || 'UNKNOWN';
  const resolvedClaims = adversarialResult?.resolved_claims || [];
  const missingContext = adversarialResult?.missing_context || '';
  const beliefSignal = adversarialResult?.belief_signal || null;
  const isPrimary = sourceType === 'primary';
  const tier = adversarialResult?.source_tier || (isPrimary ? 'TIER_1' : 'TIER_2');
  const tierReason = adversarialResult?.source_tier_reason || '';
  const temporalCheck = adversarialResult?.temporal_check || 'PASSED';
  const temporalFailures = adversarialResult?.temporal_failures || [];
  const quarantined = adversarialResult?.quarantined_claims || [];
  const removed = adversarialResult?.removed_claims || [];
  const gate = adversarialResult?.completion_gate || {};
  const audit = adversarialResult?.audit_trail || {};
  const gateFailures = gate.failures || [];
  const allGatesPassed = gate.resolution_gate && gate.source_gate && gate.temporal_gate && gate.structural_gate;

  const calibColor = calibration === 'WELL_CALIBRATED' ? '#22c55e'
    : calibration === 'OVERCONFIDENT' ? '#ef4444' : '#f59e0b';
  const calibLabel = calibration === 'WELL_CALIBRATED' ? 'Well Calibrated'
    : calibration === 'OVERCONFIDENT' ? 'Overconfident' : 'Underspecified';

  const tierColors = { TIER_1: '#22c55e', TIER_2: '#60a5fa', TIER_3: '#f59e0b', TIER_4: '#ef4444' };
  const tierColor = tierColors[tier] || '#71717a';

  const confColor = { HIGH: '#22c55e', MEDIUM: '#60a5fa', LOW: '#f59e0b', INSUFFICIENT: '#ef4444' };
  const briefConf = audit.brief_confidence || 'MEDIUM';
  const confLabelColor = confColor[briefConf] || '#71717a';
  const beliefSignalColor = beliefSignal?.net_disposition === 'positive' ? '#22c55e'
    : beliefSignal?.net_disposition === 'negative' ? '#ef4444'
    : beliefSignal?.net_disposition === 'mixed' ? '#f59e0b'
    : '#60a5fa';
  const beliefSignalLabel = beliefSignal?.net_disposition === 'positive' ? 'Positive article signal'
    : beliefSignal?.net_disposition === 'negative' ? 'Negative article signal'
    : beliefSignal?.net_disposition === 'mixed' ? 'Mixed article signal'
    : 'Neutral article signal';

  const dispColors = {
    VERIFY_RETAIN:     { bg: '#052e16', border: '#166534', badge: '#22c55e', label: '✓ VERIFIED' },
    REWRITE_DOWNGRADE: { bg: '#1c1917', border: '#92400e', badge: '#f59e0b', label: '↺ REWRITTEN' },
    QUARANTINE:        { bg: '#1c0a00', border: '#7c2d12', badge: '#fb923c', label: '⚠ QUARANTINED' },
    REMOVE:            { bg: '#450a0a', border: '#7f1d1d', badge: '#ef4444', label: '✗ REMOVED' },
  };

  const overconfidentBanner = calibration === 'OVERCONFIDENT' ? `
    <div style="background:#450a0a; border:1px solid #7f1d1d; border-radius:6px; padding:10px 14px; margin-bottom:8px; font-size:12px; color:#fca5a5; line-height:1.5;">
      ⚠ <strong>OVERCONFIDENT</strong> — Claim resolution flagged ${resolvedClaims.length} claim(s). Key assertions may need independent verification.
    </div>` : '';

  const secondaryBanner = !isPrimary ? `
    <div style="background:#1c1917; border:1px solid #78350f; border-radius:6px; padding:10px 14px; margin-bottom:8px; font-size:12px; color:#fde68a; line-height:1.5;">
      ⚠ <strong>SECONDARY SOURCE ONLY</strong> — No official press release, company blog, or SEC filing confirmed. Claims may reflect press interpretation rather than primary statements.
    </div>` : '';

  const temporalBanner = temporalCheck === 'FAILED' ? `
    <div style="background:#1c1917; border:1px solid #92400e; border-radius:6px; padding:10px 14px; margin-bottom:8px; font-size:12px; color:#fde68a; line-height:1.5;">
      ⚠ <strong>TEMPORAL CHECK FAILED</strong> — ${temporalFailures.length > 0 ? temporalFailures.join('; ') : 'Some competitive claims may be stale. Verify before acting.'}
    </div>` : '';

  const resolvedBlock = resolvedClaims.length > 0 ? `
    <details style="margin-top:10px;">
      <summary style="font-size:11px; color:#71717a; cursor:pointer; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; user-select:none;">
        ▸ ${resolvedClaims.length} Claim${resolvedClaims.length > 1 ? 's' : ''} Resolved
      </summary>
      <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
        ${resolvedClaims.map(rc => {
          const d = dispColors[rc.disposition] || dispColors.VERIFY_RETAIN;
          return `
          <div style="background:${d.bg}; border:1px solid ${d.border}; border-radius:6px; padding:10px 12px; font-size:12px;">
            <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:6px;">
              <span style="color:${d.badge}; font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; padding-top:1px;">${d.label}</span>
              <span style="color:#fbbf24; font-style:italic; flex:1;">"${rc.claim}"</span>
            </div>
            ${rc.epistemic_label ? `<div style="margin-bottom:4px;"><span style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:${rc.epistemic_label === 'FACT' ? '#22c55e' : rc.epistemic_label === 'INFERENCE' ? '#60a5fa' : rc.epistemic_label === 'SPECULATION' ? '#f59e0b' : '#ef4444'};">${rc.epistemic_label}</span></div>` : ''}
            <div style="color:#a1a1aa; margin-bottom:${rc.rewrite ? '4px' : '0'};"><strong style="color:#d4d4d8;">Basis:</strong> ${rc.basis}</div>
            ${rc.rewrite ? `<div style="color:#a1a1aa; background:#0a0a0a; border-radius:4px; padding:6px 8px; margin-top:4px; font-style:italic;"><strong style="color:#f59e0b; font-style:normal;">Rewritten as:</strong> ${rc.rewrite}</div>` : ''}
            ${rc.cascade && rc.cascade.length > 0 ? `<div style="color:#71717a; margin-top:4px; font-size:11px;">↳ Cascade: ${rc.cascade.join(' → ')}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </details>` : '';

  const quarantineBlock = quarantined.length > 0 ? `
    <details style="margin-top:6px;">
      <summary style="font-size:11px; color:#fb923c; cursor:pointer; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; user-select:none;">
        ▸ ${quarantined.length} Quarantined Claim${quarantined.length > 1 ? 's' : ''}
      </summary>
      <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
        ${quarantined.map(q => `
          <div style="background:#1c0a00; border:1px solid #7c2d12; border-radius:6px; padding:10px 12px; font-size:12px;">
            <div style="color:#fb923c; font-style:italic; margin-bottom:6px;">"${q.claim}"</div>
            <div style="color:#a1a1aa; margin-bottom:3px;"><strong style="color:#d4d4d8;">Why quarantined:</strong> ${q.reason}</div>
            <div style="color:#a1a1aa; margin-bottom:3px;"><strong style="color:#d4d4d8;">To resolve:</strong> ${q.required_to_resolve}</div>
            <div style="color:#a1a1aa;"><strong style="color:#d4d4d8;">Materiality:</strong> ${q.materiality}</div>
          </div>`).join('')}
      </div>
    </details>` : '';

  const removedBlock = removed.length > 0 ? `
    <details style="margin-top:6px;">
      <summary style="font-size:11px; color:#ef4444; cursor:pointer; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; user-select:none;">
        ▸ ${removed.length} Removed Claim${removed.length > 1 ? 's' : ''}
      </summary>
      <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
        ${removed.map(r => `
          <div style="background:#450a0a; border:1px solid #7f1d1d; border-radius:6px; padding:8px 12px; font-size:12px;">
            <div style="color:#fca5a5; font-style:italic; margin-bottom:4px;">"${r.claim}"</div>
            <div style="color:#a1a1aa;"><strong style="color:#d4d4d8;">Reason:</strong> ${r.reason}</div>
          </div>`).join('')}
      </div>
    </details>` : '';

  const missingBlock = missingContext ? `
    <details style="margin-top:6px;">
      <summary style="font-size:11px; color:#71717a; cursor:pointer; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; user-select:none;">
        ▸ Missing Context
      </summary>
      <p style="font-size:12px; color:#a1a1aa; margin:8px 0 0; line-height:1.6;">${missingContext}</p>
    </details>` : '';

  const gateBlock = `
    <details style="margin-top:6px;">
      <summary style="font-size:11px; color:${allGatesPassed ? '#22c55e' : '#ef4444'}; cursor:pointer; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; user-select:none;">
        ▸ Completion Gate — ${allGatesPassed ? 'ALL PASSED' : 'FAILURES DETECTED'}
      </summary>
      <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px; font-size:11px;">
        ${[
          ['Resolution Gate', gate.resolution_gate],
          ['Source Gate', gate.source_gate],
          ['Temporal Gate', gate.temporal_gate],
          ['Structural Gate', gate.structural_gate],
        ].map(([label, passed]) => `
          <div style="display:flex; align-items:center; gap:8px; color:${passed ? '#71717a' : '#ef4444'};">
            <span style="font-size:10px;">${passed ? '☑' : '☐'}</span>
            <span>${label}${passed ? '' : ' — FAILED'}</span>
          </div>`).join('')}
        ${gateFailures.length > 0 ? `<div style="color:#ef4444; margin-top:4px;">${gateFailures.join('; ')}</div>` : ''}
      </div>
    </details>`;

  const auditBlock = Object.keys(audit).length > 0 ? `
    <details style="margin-top:6px;">
      <summary style="font-size:11px; color:#52525b; cursor:pointer; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; user-select:none;">
        ▸ Audit Trail
      </summary>
      <div style="margin-top:8px; font-size:11px; color:#71717a; line-height:1.8;">
        <div><strong style="color:#52525b;">Sources:</strong> ${audit.sources_retrieved || 1} retrieved — Tier 1: ${audit.tier_1 || 0} · Tier 2: ${audit.tier_2 || 0} · Tier 3: ${audit.tier_3 || 0} · Tier 4 (excluded): ${audit.tier_4 || 0}</div>
        <div><strong style="color:#52525b;">Claims reviewed:</strong> ${audit.claims_reviewed || resolvedClaims.length} — Verified: ${audit.verified_retained || 0} · Rewritten: ${audit.rewritten_downgraded || 0} · Quarantined: ${audit.quarantined || quarantined.length} · Removed: ${audit.removed || removed.length}</div>
        <div><strong style="color:#52525b;">Cascade dependencies resolved:</strong> ${audit.cascading_dependencies_resolved || 0}</div>
        <div><strong style="color:#52525b;">Temporal check:</strong> ${audit.temporal_check || temporalCheck}</div>
        <div style="margin-top:4px;"><strong style="color:#52525b;">Brief confidence:</strong> <span style="color:${confLabelColor}; font-weight:700;">${briefConf}</span></div>
      </div>
    </details>` : '';
  const beliefSignalBlock = beliefSignal ? `
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:10px; padding:10px 12px; background:#0f172a; border:1px solid #1e293b; border-radius:8px; font-size:11px; line-height:1.5;">
      <span style="font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.8px;">Article-level belief signal</span>
      <span style="font-size:10px; font-weight:800; color:${beliefSignalColor}; text-transform:uppercase; letter-spacing:0.8px;">${beliefSignalLabel}</span>
      <span style="color:${beliefSignalColor}; font-weight:700;">Delta: ${beliefSignal.confidence_delta > 0 ? '+' : ''}${beliefSignal.confidence_delta}</span>
      <span style="color:#94a3b8;">Verified claims: ${(beliefSignal.key_verified_claims || []).length}</span>
      <span style="color:#94a3b8;">Contradicted claims: ${(beliefSignal.key_contradicted_claims || []).length}</span>
    </div>` : '';

  return `
    <div style="background:#0a0a0a; border:1px solid #27272a; border-radius:8px; padding:14px 16px; margin-bottom:16px; font-family:system-ui;">
      ${overconfidentBanner}
      ${secondaryBanner}
      ${temporalBanner}
      <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="width:7px; height:7px; border-radius:50%; background:${calibColor}; flex-shrink:0;"></div>
          <span style="font-size:10px; font-weight:800; color:${calibColor}; text-transform:uppercase; letter-spacing:1px;">${calibLabel}</span>
        </div>
        <span style="font-size:10px; font-weight:700; color:${tierColor}; text-transform:uppercase; letter-spacing:0.5px;">${tier.replace('_', ' ')}</span>
        <span style="font-size:10px; color:#52525b; text-transform:uppercase; letter-spacing:0.5px;">Source: ${isPrimary ? '✓ Primary' : '⚠ Secondary'}</span>
        <span style="font-size:10px; color:${temporalCheck === 'PASSED' ? '#52525b' : '#f59e0b'}; text-transform:uppercase; letter-spacing:0.5px;">Temporal: ${temporalCheck === 'PASSED' ? '✓' : '⚠'} ${temporalCheck}</span>
        <span style="font-size:10px; color:${confLabelColor}; font-weight:700; margin-left:auto; text-transform:uppercase; letter-spacing:0.5px;">Confidence: ${briefConf}</span>
      </div>
      ${beliefSignalBlock}
      ${resolvedBlock}
      ${quarantineBlock}
      ${removedBlock}
      ${missingBlock}
      ${gateBlock}
      ${auditBlock}
    </div>`;
}

// ── INSTANT ANALYST ──
async function launchInstantAnalyst(title, link, type, context = "", articleDate = '', articleSource = '') {
  const modal = document.getElementById('analyst-modal');
  const content = document.getElementById('analyst-content');
  modal.classList.add('active');
  content.innerHTML = analystCompactCardHTML('pageBrief', {
    sub: 'Fetching full article…',
  });

  // Build condensed scan context from current feed results (free corroboration)
  const scanContext = currentResults
    .filter(r => r.link !== link)
    .slice(0, 8)
    .map((r, i) => `${i + 1}. "${r.title}" — ${r.source || ''} (${r.date ? new Date(r.date).toLocaleDateString() : 'date unknown'}) — ${(r.summary || '').substring(0, 120)}`)
    .join('\n');

  try {
    const fullText = await fetchArticleContent(link, context);
    const isFallback = fullText === context;
    const sourceType = isPrimarySource(link) ? 'primary' : 'secondary';

    console.log(`[InstantAnalyst] Processing article: ${title}`);
    console.log(`[InstantAnalyst] Content length: ${fullText.length} chars (${isFallback ? 'FALLBACK summary' : 'FULL article'}) | Source: ${sourceType} | Scan context: ${scanContext ? 'yes' : 'none'}`);

    content.innerHTML = analystCompactCardHTML('pageBrief');

    chrome.storage.local.get(['radarRole'], async (data) => {
      // Stage 1: generate the initial brief
      const draftHtml = await IntelligenceEngine.analyzeContent(
        title, link, type,
        data.radarRole || "Strategic Intelligence Analyst",
        null, fullText, sourceType,
        articleDate || null, isFallback, scanContext
      );

      // Show the brief immediately so the user isn't waiting for stage 2
      content.innerHTML = `
        <div id="calibration-header-slot">
          <div style="display:flex; align-items:center; gap:10px; padding:12px 16px; background:#0a0a0a; border:1px solid #27272a; border-radius:8px; margin-bottom:16px; font-size:12px; color:#71717a;">
            <div style="width:14px; height:14px; border:2px solid #27272a; border-top-color:#60a5fa; border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0;"></div>
            Running claim resolution…
          </div>
        </div>
        ${draftHtml}`;

      // Stage 2: claim resolution pass — runs after brief is visible
      const adversarialResult = await adversarialReviewPass(
        draftHtml, title, fullText,
        sourceType, articleDate || null, articleSource, scanContext
      );
      const calibHeader = buildCalibrationHeader(adversarialResult, sourceType);

      const slot = document.getElementById('calibration-header-slot');
      if (slot) slot.outerHTML = calibHeader;

      // Stage 3 (Option C): push belief_signal back into HypothesisEngine
      if (adversarialResult?.belief_signal && currentTopic) {
        HypothesisEngine.applyBriefSignal(link, currentTopic, adversarialResult.belief_signal)
          .catch(e => console.warn('[BriefSignal] Could not update beliefs:', e.message));
      }
    });

  } catch (error) {
    console.error('[InstantAnalyst] Failed:', error);
    content.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444;">
      <div style="font-size:14px; margin-bottom:8px;">Analysis Failed</div>
      <div style="font-size:12px;">Could not fetch article content</div>
    </div>`;
  }
}

// ── DEMO DATA ──
function getDemoData() {
  return [];
}

// ── INIT ──
async function init() {
  await runtimeApiKeysReady;
  ui = {
    search: document.getElementById('smart-search'),
    scanBtn: document.getElementById('btn-scan'),
    llmSelector: document.getElementById('llm-selector'),
    customLlmInput: document.getElementById('custom-llm-input'),
    btnSendToModel: document.getElementById('btn-send-to-model'),
    analystModal: document.getElementById('analyst-modal'),
    analystContent: document.getElementById('analyst-content'),
    slots: {
      hero: null,
      sidebar: null,
      feed: document.getElementById('feed-slot')
    }
  };

  if (!ui.search) return;
  loadBookmarks();

  // Language selector change
  document.getElementById('dash-language-selector')?.addEventListener('change', (e) => {
    radarLanguage = e.target.value;
    chrome.storage.local.set({ radarLanguage });
    translationCache.clear();
    document.querySelectorAll('[data-translated]').forEach(el => {
      if (el.dataset.originalText) el.textContent = el.dataset.originalText;
      el.removeAttribute('data-translated');
    });
    if (radarLanguage) {
      applyUITranslations(radarLanguage);
      loadTranslationCache(radarLanguage);
    }
    translatePage();
    watchAndTranslate();
  });

  chrome.storage.local.get(['hotList', 'highlightUrl', 'dashboardCache', 'radarLanguage'], (data) => {
    // Set language FIRST so translatePage() works immediately when feed renders
    if (data.radarLanguage) {
      radarLanguage = data.radarLanguage;
      const sel = document.getElementById('dash-language-selector');
      if (sel) sel.value = data.radarLanguage;
      applyUITranslations(data.radarLanguage);
      // Start loading persisted cache immediately — translatePage() will await it
      loadTranslationCache(data.radarLanguage);
    }
    renderHotChips(data.hotList || []);

    // Re-scan if cache is missing, stale (>24h), or it's a new calendar day
    const cache = data.dashboardCache;
    const cacheDate = cache?.savedAt ? new Date(cache.savedAt) : null;
    const today = new Date().toDateString();
    const cacheStale = !cacheDate
      || (Date.now() - cacheDate.getTime() > 24 * 60 * 60 * 1000)
      || (cacheDate.toDateString() !== today);

    if (cache && !data.highlightUrl && !cacheStale) {
      restoreFromCache(cache);
    } else {
      runSearch(DEFAULT_QUERY, data.highlightUrl);
      if (data.highlightUrl) chrome.storage.local.remove('highlightUrl');
    }

    // Start watching for dynamic content after initial render kicks off
    watchAndTranslate();
  });

  // ── SEARCH ──
  ui.scanBtn.addEventListener('click', () => runSearch(ui.search.value || DEFAULT_QUERY));
  ui.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(ui.search.value || DEFAULT_QUERY); });

  // ── CHIPS ──
  document.querySelectorAll('.chip[data-q]').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    ui.search.value = c.dataset.q;
    runSearch(c.dataset.q);
  }));


  // ── FEED SORT TABS ──
  document.querySelectorAll('.feed-sort-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeSort = tab.dataset.sort;
      document.querySelectorAll('.feed-sort-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      applyLocalFilter();
    });
  });

  // ── EXPORT ──
  const exportSelect = document.getElementById('export-selector');
  if (exportSelect) exportSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      copyResults(e.target.value);
      setTimeout(() => { exportSelect.selectedIndex = 0; }, 300);
    }
  });

  // Dashboard-level belief cards are retired from the Command surface.
  // Persistent belief work now lives in Tracked Topics.

  // ── LLM SELECTOR ──
  ui.llmSelector.addEventListener('change', (e) => {
    const customInput = document.getElementById('custom-llm-input');
    customInput.style.display = e.target.value === 'custom' ? 'block' : 'none';
    if (ui.btnSendToModel) ui.btnSendToModel.innerText = `Send to ${e.target.options[e.target.selectedIndex].text}`;
  });

  // ── SAVED ARTICLES (btn-toggle-panel repurposed from Pro Controls) ──
  document.getElementById('btn-toggle-panel')?.addEventListener('click', () => {
    document.getElementById('btn-briefing')?.click();
  });

  // ── SELECTED INSIGHT BRIEF ──
  document.getElementById('btn-page-brief').addEventListener('click', async () => {
    const activeItem = currentSelectedInsight || currentResults[0] || null;
    if (!activeItem) {
      alert('Select a signal first to generate an article brief.');
      return;
    }
    launchInstantAnalyst(
      activeItem.title,
      activeItem.link,
      activeItem.type || 'news',
      activeItem.summary || '',
      activeItem.date || '',
      activeItem.source || ''
    );
  });

  // ── DISRUPTOR MODAL ──
  document.getElementById('close-disruptor')?.addEventListener('click', () => {
    document.getElementById('disruptor-modal').classList.remove('active');
  });
  document.getElementById('disruptor-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
  });
  document.getElementById('btn-copy-disruptor')?.addEventListener('click', () => {
    const text = document.getElementById('disruptor-content')?.innerText || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy-disruptor');
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      btn.style.color = '#22c55e';
      setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1800);
    });
  });

  // ── COUNTERMOVE ──
  const rageModal = document.getElementById('rage-modal');
  document.getElementById('btn-countermove').addEventListener('click', () => rageModal.classList.add('active'));
  document.getElementById('close-rage').addEventListener('click', () => rageModal.classList.remove('active'));
  document.getElementById('btn-activate-rage').addEventListener('click', () => {
    const attacker = document.getElementById('rage-attacker').value;
    const target = document.getElementById('rage-target').value;
    if (!attacker || !target) { alert("Enter both your entity and the competitor."); return; }
    const feedContext = currentResults.slice(0, 10).map(i => `- ${i.title} (${i.source}): ${i.link}`).join("\n");
    openPowerPrompt(`MARKET INTEL CONTEXT:\n${feedContext}\n\nTASK: I represent "${attacker}". I need to outmaneuver competitor: "${target}".\nOUTPUT: Provide 5 unconventional strategic steps to dismantle their advantage using the trends identified above.`, "Competitive Strike", "", "");
    rageModal.classList.remove('active');
  });

  // ── ANALYST MODAL ──
  document.getElementById('close-analyst').addEventListener('click', () => {
    document.getElementById('analyst-modal').classList.remove('active');
    delete ui.analystModal.dataset.activeBelief;
  });
  document.getElementById('btn-copy-analysis').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    navigator.clipboard.writeText(document.getElementById('analyst-content').innerText).then(() => {
      const original = btn.innerText;
      btn.innerText = '✓ Copied!';
      btn.style.color = '#22c55e';
      setTimeout(() => { btn.innerText = original; btn.style.color = ''; }, 1800);
    });
  });
  // Send to Model button - SINGLE handler with guard
  let lastSendToModelClick = 0;
  ui.btnSendToModel.addEventListener('click', async (e) => {
    e.stopPropagation();

    const now = Date.now();
    if (now - lastSendToModelClick < 500) return;
    lastSendToModelClick = now;

    // Path 1: Belief detail view — shared prompt + evidence resolution
    const activeBelief = ui.analystModal.dataset.activeBelief;
    if (activeBelief) {
      try {
        const belief = JSON.parse(activeBelief);
        const topic = belief.topic || currentTopic;

        // Extract initial reasoning (full belief context) from evidence
        const mergedEvidence = [...(belief.evidence || []), ...(belief.supporting_evidence || []), ...(belief.contradicting_evidence || [])];
        const initialReasoning = mergedEvidence.find(ev => (ev.impact === 0 || ev.impact == null) && !ev.source && !ev.link && (ev.text || ev.claim));
        const supportingEvidence = mergedEvidence.filter(ev => ev !== initialReasoning && (ev.impact || 0) >= 0 && (ev.link || ev.url));

        // Always resolve articles before analysis — from state + dashboardCache
        const getStorageArticles = async () => {
          const d = await new Promise(r => chrome.storage.local.get(['dashboardCache'], r));
          const c = d.dashboardCache || {};
          return (c.query === topic) ? (c.items || []) : [];
        };
        const { evidenceWithArticles, resolvedCount, totalCount, excludedCount } = await resolveEvidenceArticlesAsync(belief, {
          topic,
          articlesFromState: currentResults,
          getStorageArticles,
          evidenceOverride: supportingEvidence.slice(0, 5)
        });

        const radarProf = await new Promise(r =>
          chrome.storage.local.get(['radarCareer', 'radarAccount', 'radarRole', 'radarKeywords'], r)
        );
        const audienceContext = formatAudienceProfileLines({
          career: radarProf.radarCareer || '',
          account: radarProf.radarAccount || '',
          role: radarProf.radarRole || '',
          keywords: radarProf.radarKeywords || '',
        });

        const prompt = buildBeliefAnalysisPrompt(belief, evidenceWithArticles, {
          includeStructuredOutput: true,
          initialReasoning,
          audienceContext,
        });
        const noteParts = [];
        if (totalCount > 0 && resolvedCount < totalCount) {
          noteParts.push(`${resolvedCount}/${totalCount} supporting articles had full details`);
        }
        if (excludedCount > 0) {
          noteParts.push(`${excludedCount} supporting article(s) were excluded for low-trust or promotional sourcing`);
        }
        const completenessNote = noteParts.length > 0
          ? `\n\nNOTE: ${noteParts.join(' · ')}.`
          : '';
        const fullPrompt = prompt + completenessNote;

        const llm = ui.llmSelector ? ui.llmSelector.value : 'claude';
        const llmLabels = { claude: 'Claude', chatgpt: 'ChatGPT', perplexity: 'Perplexity', gemini: 'Gemini', lechat: 'Le Chat' };
        const llmLabel = llmLabels[llm] || llm;
        const urls = { claude: 'https://claude.ai/new', chatgpt: 'https://chatgpt.com/', perplexity: 'https://www.perplexity.ai/', gemini: 'https://gemini.google.com/app', lechat: 'https://chat.mistral.ai/chat' };

        // For Claude and ChatGPT: call API directly and render inline — no tab switching needed.
        // For other LLMs: copy to clipboard and open their web UI.
        if (llm === 'claude' || llm === 'chatgpt') {
          // Show loading state inline — keep modal open
          ui.analystContent.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 32px; gap:16px;">
              <div style="width:40px; height:40px; border:3px solid #27272a; border-top-color:#60a5fa; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
              <div style="font-size:13px; color:#71717a;">Analyzing belief with ${llmLabel}…</div>
            </div>
          `;
          // Ensure spin animation exists
          if (!document.getElementById('spin-style')) {
            const s = document.createElement('style');
            s.id = 'spin-style';
            s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
            document.head.appendChild(s);
          }

          analyzeBeliefWithAPI(fullPrompt, llm).then(analysisText => {
            if (!analysisText) {
              ui.analystContent.innerHTML = `<div style="padding:32px; color:#ef4444;">No response received from ${llmLabel}.</div>`;
              return;
            }
            const structured = validateStructuredAnalysis(parseStructuredAnalysis(analysisText));
            if (structured) {
              const now = new Date().toISOString();
              chrome.storage.local.get(['hypotheses'], (data) => {
                const hypotheses = data.hypotheses || [];
                const idx = hypotheses.findIndex(h => h.id === belief.id);
                if (idx >= 0) {
                  hypotheses[idx].lastAnalysis = { date: now, llm: llmLabel, text: analysisText, structured };
                  if (structured.watch_items?.length) hypotheses[idx].watchItems = structured.watch_items;
                  chrome.storage.local.set({ hypotheses });
                }
              });
            }
            renderBeliefAnalysisResult(belief, analysisText, llmLabel, { structured });
          }).catch(err => {
            ui.analystContent.innerHTML = `
              <div style="padding:32px;">
                <div style="color:#ef4444; margin-bottom:16px;">⚠ ${llmLabel} API error: ${err.message}</div>
                <button id="belief-err-clipboard" style="padding:8px 16px; background:#27272a; border:none; border-radius:6px; color:#a1a1aa; font-size:12px; cursor:pointer;">Copy prompt to clipboard instead</button>
              </div>`;
            document.getElementById('belief-err-clipboard')?.addEventListener('click', () => {
              navigator.clipboard.writeText(fullPrompt).then(() => {
                window.open(urls[llm] || urls.claude, '_blank');
                ui.analystModal.classList.remove('active');
                delete ui.analystModal.dataset.activeBelief;
              });
            });
          });
          // Don't close modal — analysis renders inside it
          return;
        }

        // Clipboard fallback for Perplexity, Gemini, Le Chat, Custom
        navigator.clipboard.writeText(fullPrompt).then(() => {
          alert(`Full belief analysis copied to clipboard — paste it when the window opens (Cmd+V / Ctrl+V).`);
        });
        window.open(urls[llm] || urls.claude, '_blank');
        ui.analystModal.classList.remove('active');
        delete ui.analystModal.dataset.activeBelief;
        return;
      } catch (err) {
        console.warn('[SendToModel] Failed to parse active belief:', err);
      }
    }

    // Path 2: Interactive brief with checked articles
    const checks = document.querySelectorAll('.brief-check:checked');
    if (checks.length > 0) {
      let sourceList = currentResults;
      if (ui.btnSendToModel.dataset.activeSource) try { sourceList = JSON.parse(ui.btnSendToModel.dataset.activeSource); } catch(e) {}
      let selectedText = "";
      checks.forEach(chk => {
        const item = sourceList[chk.dataset.idx];
        if (item) selectedText += `- ${item.title}: ${item.link}\n`;
      });
      openPowerPrompt(`Context: ${document.querySelector('#analyst-content')?.innerText?.substring(0, 500) || ''}\nAnalyze:\n${selectedText}`, "Brief Analysis", "", "");
      return;
    }

    // Path 3: Full analyst modal content (Intelligence Brief / Page Brief)
    const text = document.getElementById('analyst-content').innerText;
    if (text && text.length > 20) {
      const sourceLinks = currentResults.slice(0, 10).map(i => `- ${i.title}: ${i.link}`).join('\n');
      openPowerPrompt(`Please analyze and expand on this intelligence brief:\n\n${text}\n\nSource Articles:\n${sourceLinks}`, "Deep Dive", "", "");
    } else {
      alert("No analysis or articles selected to send.");
    }
  });

  // ── HISTORY MODAL ──
  document.getElementById('close-history')?.addEventListener('click', () => document.getElementById('history-modal').classList.remove('active'));

  // ── BRIEFING MODAL ──
  document.getElementById('btn-briefing').addEventListener('click', () => {
    const list = document.getElementById('briefing-list');
    list.innerHTML = "";
    if (bookmarks.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--dim);">No items saved yet. Click the star on any card to add it here.</div>';
    } else {
      bookmarks.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:start;"><a href="${item.link}" target="_blank" class="history-title" style="flex:1;">${esc(item.title)}</a><span style="cursor:pointer; color:var(--yellow); margin-left:8px;">&#10005;</span></div><div class="history-meta">${esc(item.source)}</div>`;
        div.querySelector('span').onclick = () => {
          bookmarks.splice(bookmarks.findIndex(b => b.link === item.link), 1);
          saveBookmarks();
          document.getElementById('btn-briefing').click();
        };
        list.appendChild(div);
      });
      const genBtn = document.createElement('button');
      genBtn.textContent = "Generate Brief from Saved";
      genBtn.style.cssText = "width:100%; margin-top:20px; background:var(--accent); border:none; color:white; padding:10px; border-radius:6px; cursor:pointer; font-weight:700;";
      genBtn.onclick = async () => {
        document.getElementById('briefing-modal').classList.remove('active');
        document.getElementById('analyst-modal').classList.add('active');
        document.getElementById('analyst-content').innerHTML = analystCompactCardHTML('pageBrief', {
          sub: `Reading ${bookmarks.length} saved items`,
        });
        chrome.storage.local.get(['radarAccount'], async (data) => {
          const briefData = await IntelligenceEngine.generateMarketBriefData(bookmarks, data.radarAccount || "", "Briefing Drawer Selection");
          renderInteractiveBrief(briefData, bookmarks);
        });
      };
      list.appendChild(genBtn);
    }
    document.getElementById('briefing-modal').classList.add('active');
  });
  document.getElementById('close-briefing').addEventListener('click', () => document.getElementById('briefing-modal').classList.remove('active'));

  // ── GLOBAL: Power prompt row clicks + Brief button clicks ──
  document.addEventListener('click', (e) => {
    // Power prompt row click
    if (e.target.closest('.pt-row')) {
      const row = e.target.closest('.pt-row');
      closePowerTooltips();
      openPowerPrompt(row.dataset.usecase, row.dataset.title, row.dataset.link, ui.search.value, row.dataset.type, row.dataset.context || '');
    }
    // Intelligence Brief button click
    if (e.target.closest('.pt-brief-btn')) {
      const btn = e.target.closest('.pt-brief-btn');
      closePowerTooltips();
      launchInstantAnalyst(btn.dataset.title, btn.dataset.link, btn.dataset.type || 'news', btn.dataset.context || '', btn.dataset.date || '', btn.dataset.source || '');
    }
  });

  // ── GLOBAL: Close power tooltips on outside click ──
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.power-tooltip') && !e.target.closest('.power-btn')) {
      closePowerTooltips();
    }
  });

  // ── GLOBAL: Click outside modal closes it ──
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
      e.target.classList.remove('active');
      if (e.target === ui.analystModal) delete ui.analystModal.dataset.activeBelief;
    }
  });

  // ── GLOBAL: Escape closes everything ──
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      delete ui.analystModal.dataset.activeBelief;
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (WEB_RUNTIME) {
    await bootWebAuth();
    return;
  }

  await init();
});
