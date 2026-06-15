/**
 * Shared belief analysis module — evidence resolution, prompt building, structured output.
 * Used by both tracker and dashboard for reliable, consistent belief analysis.
 */

const BELIEF_BLOCKED_DOMAINS = [
  'prweb.com',
  'prnewswire.com',
  'businesswire.com',
  'globenewswire.com',
  'accessnewswire.com',
  'einnews.com',
  'openpr.com',
  'researchandmarkets.com',
  'marketresearch.com',
  'reportsanddata.com',
  'gminsights.com',
  'alliedmarketresearch.com',
  'transparencymarketresearch.com'
];

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isBlockedBeliefSource(url = '', source = '', title = '') {
  const domain = getDomainFromUrl(url) || String(source || '').trim().toLowerCase().replace(/^www\./, '');
  const titleLower = String(title || '').toLowerCase();
  if (BELIEF_BLOCKED_DOMAINS.some(blocked => domain.includes(blocked))) return true;
  return /press release|sponsored|partner content|advertorial/.test(titleLower);
}

function sanitizeEvidenceText(text) {
  if (!text) return '';
  let cleaned = String(text);
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ' ');
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  const filteredLines = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => {
      const codeLikeSignals = [
        /<\/?[a-z][^>]*>/i.test(line),
        /\b(function|const|let|var|return|import|export|class)\b/.test(line),
        /[{}`;]/.test(line) && /=|=>/.test(line),
        /(document\.|window\.|chrome\.|innerHTML|querySelector)/.test(line)
      ].filter(Boolean).length;
      return codeLikeSignals < 2;
    });

  cleaned = filteredLines.join(' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned.substring(0, 280).trim();
}

// ── EVIDENCE RESOLUTION ─────────────────────────────────────────────────────

/**
 * Resolves evidence items to full article context (title, source, summary, URL).
 * Always prefers resolved articles; falls back to evidence fields when article not found.
 *
 * @param {Object} belief - Belief with evidence array
 * @param {Object} context - { topic, articlesFromState, articlesFromStorage }
 * @returns {{ evidenceWithArticles: string, resolvedCount: number, totalCount: number }}
 */
export function resolveEvidenceArticles(belief, context) {
  const { entries, resolvedCount, totalCount, excludedCount } = resolveEvidenceEntries(belief, context);
  const lines = entries.map(entry => {
    const summaryLine = entry.summary ? `\n  ${entry.summary}` : '';
    const urlLine = entry.url ? `\n  URL: ${entry.url}` : '';
    const unavailable = !entry.summary && entry.url ? ' (article details not available)' : '';
    return `- "${entry.title}" (${entry.source})${summaryLine}${urlLine}${unavailable}`;
  });

  return {
    evidenceWithArticles: lines.join('\n\n'),
    resolvedCount,
    totalCount,
    excludedCount
  };
}

export function resolveEvidenceEntries(belief, context) {
  const evidence = (context.evidenceOverride ?? belief.evidence ?? []).slice(0, 5);
  const { articlesFromState = [], articlesFromStorage = [] } = context;

  // Merge articles: state first (fresher), then storage.
  const allArticles = [...articlesFromState];
  const seenUrls = new Set(allArticles.map(a => (a.link || a.url || '')));
  for (const a of articlesFromStorage) {
    const url = a.link || a.url || '';
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      allArticles.push(a);
    }
  }

  // Freshly created beliefs do not yet have explicit evidence attached.
  // In that case, fall back to the current topic articles so the user and
  // downstream model still get the related source URLs on first analysis.
  const baseItems = evidence.length > 0
    ? evidence
    : allArticles.slice(0, 5).map(article => ({
        link: article.link || article.url || '',
        url: article.url || article.link || '',
        source: article.source || getDomainFromUrl(article.link || article.url || '') || 'Unknown',
        title: article.title || article.source || 'Untitled',
        summary: article.summary || article.text || '',
        text: article.text || article.summary || '',
        date: article.date || article.publishedAt || '',
        publishedAt: article.publishedAt || article.date || '',
        ingestedAt: article.ingestedAt || article.date || ''
      }));

  let resolvedCount = 0;
  let excludedCount = 0;
  const entries = baseItems.map(ev => {
    const url = ev.link || ev.url || '';
    const art = url ? allArticles.find(a => (a.link || a.url) === url) : null;
    const source = art?.source || ev.source || getDomainFromUrl(url) || 'Unknown';
    const title = art?.title || ev.title || ev.source || 'Untitled';
    if (isBlockedBeliefSource(url, source, title)) {
      excludedCount++;
      return null;
    }

    const summary = sanitizeEvidenceText(art?.summary || ev.summary || ev.text || ev.claim || art?.text || '');
    const detailsAvailable = Boolean(summary);
    if (detailsAvailable) resolvedCount++;

    return {
      title,
      source,
      url,
      summary,
      ingestedAt: ev.ingestedAt || art?.ingestedAt || art?.date || ev.date || '',
      publishedAt: ev.publishedAt || art?.publishedAt || art?.date || ev.date || '',
      detailsAvailable
    };
  }).filter(Boolean);

  return {
    entries,
    resolvedCount,
    totalCount: entries.length,
    excludedCount
  };
}

/**
 * Async version that fetches articles from storage.
 * Use for tracker (trackerArticles) or dashboard (dashboardCache via getStorageArticles).
 */
export async function resolveEvidenceArticlesAsync(belief, context) {
  const { topic, articlesFromState = [], storageKey, storageTopic, getStorageArticles } = context;

  let articlesFromStorage = [];
  if (getStorageArticles) {
    articlesFromStorage = await getStorageArticles();
  } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await new Promise(r => chrome.storage.local.get([storageKey || 'trackerArticles'], d => r(d)));
    const stored = data[storageKey || 'trackerArticles'] || {};
    const key = storageTopic ?? topic;
    articlesFromStorage = stored[key] || [];
  }

  return resolveEvidenceArticles(belief, {
    ...context,
    topic,
    articlesFromState,
    articlesFromStorage
  });
}

export async function resolveEvidenceEntriesAsync(belief, context) {
  const { topic, articlesFromState = [], storageKey, storageTopic, getStorageArticles } = context;

  let articlesFromStorage = [];
  if (getStorageArticles) {
    articlesFromStorage = await getStorageArticles();
  } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await new Promise(r => chrome.storage.local.get([storageKey || 'trackerArticles'], d => r(d)));
    const stored = data[storageKey || 'trackerArticles'] || {};
    const key = storageTopic ?? topic;
    articlesFromStorage = stored[key] || [];
  }

  return resolveEvidenceEntries(belief, {
    ...context,
    topic,
    articlesFromState,
    articlesFromStorage
  });
}

// ── AUDIENCE CONTEXT (shared tracker + dashboard) ───────────────────────────

/**
 * Formats Industry / Brand / Role / Priority for prompts.
 * @param {{ career?: string, account?: string, role?: string, keywords?: string }} profile
 * @returns {string} newline-separated lines, or "" if nothing set
 */
export function formatAudienceProfileLines(profile = {}) {
  const { career, account, role, keywords } = profile;
  const lines = [
    career ? `Industry: ${career}` : '',
    account ? `Brand / Account: ${account}` : '',
    role ? `Role: ${role}` : '',
    keywords ? `Priority topics: ${keywords}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

// ── SHARED PROMPT ───────────────────────────────────────────────────────────

/** 5-part task used by both tracker and dashboard for consistent analysis. */
const TASK_LINES = [
  '1. Is this belief on track or needs revision based on the confidence trend and the supporting articles above?',
  '2. Assess source quality — are these neutral sources or do they have a stake in the narrative?',
  '3. What evidence would most change your view?',
  '4. Should confidence increase, decrease, or hold? Why?',
  '5. Name 1-2 specific falsifiable things to watch next.'
];

/**
 * Builds the shared belief analysis prompt.
 *
 * @param {Object} belief - Belief object
 * @param {string} evidenceWithArticles - Formatted supporting articles
 * @param {Object} options - { includeStructuredOutput, initialReasoning, audienceContext }
 */
export function buildBeliefAnalysisPrompt(belief, evidenceWithArticles, options = {}) {
  const { includeStructuredOutput = false, initialReasoning = null, audienceContext = '' } = options;

  const revs = belief.revisionHistory || belief.revision_history || [];
  const effectiveConfidence = revs.length > 0
    ? (revs[revs.length - 1].newConfidence ?? revs[revs.length - 1].new_confidence ?? belief.confidence)
    : belief.confidence;

  const hist = revs.slice(-5).reverse();
  const histText = hist.length
    ? hist.map(r => `  ${new Date(r.date).toLocaleDateString()}: ${r.oldConfidence}% → ${r.newConfidence}% (${r.reason || '—'})`).join('\n')
    : '  No history yet';

  const trend = hist.length >= 2
    ? (hist[0].newConfidence > hist[1]?.newConfidence ? 'increasing'
      : hist[0].newConfidence < hist[1]?.newConfidence ? 'decreasing' : 'stable')
    : 'unknown';

  let prompt = `You are analyzing a tracked belief from Cognesion.\n\n`;
  prompt += `BELIEF (core claim — score evidence against this): "${belief.claim}"\n`;
  prompt += `CONFIDENCE: ${effectiveConfidence}% (${revs.length} scans, trend: ${trend})\n\n`;

  const lensText = (belief.lens && String(belief.lens).trim()) ? String(belief.lens).trim() : '';
  if (lensText) {
    prompt += `STAKEHOLDER LENS (interpretive framing only — not independent evidence):\n"${lensText}"\n\n`;
  }

  if (audienceContext && String(audienceContext).trim()) {
    prompt += `READER CONTEXT (who is consuming this analysis — use to judge relevance and appropriate confidence, not as facts):\n${String(audienceContext).trim()}\n\n`;
  }

  prompt += `REVISION HISTORY:\n${histText}\n\n`;

  if (initialReasoning) {
    const text = (initialReasoning.text || initialReasoning.claim || '').trim();
    if (text) prompt += `BELIEF CONTEXT:\n${text}\n\n`;
  }

  if (evidenceWithArticles) {
    prompt += `SUPPORTING ARTICLES (read these to assess source quality and evidence strength):\n\n${evidenceWithArticles}\n\n`;
  }

  prompt += `TASK:\n${TASK_LINES.join('\n')}`;

  if (includeStructuredOutput) {
    prompt += `\n\nRespond with valid JSON in this exact shape (no markdown, no extra text):\n`;
    prompt += `{"verdict":"increase"|"decrease"|"hold","confidence_delta":-5,"suggested_confidence":50,"watch_items":["item 1","item 2"],"reasoning":"2-4 sentences"}`;
    prompt += `\n- verdict: your recommendation\n`;
    prompt += `- confidence_delta: integer -10 to +10 (change from current)\n`;
    prompt += `- suggested_confidence: integer 5-95 (resulting level)\n`;
    prompt += `- watch_items: 1-2 falsifiable things to watch\n`;
    prompt += `- reasoning: brief explanation`;
  }

  return prompt;
}

// ── STRUCTURED OUTPUT ───────────────────────────────────────────────────────

const MAX_DELTA = 10;
const MIN_CONF = 5;
const MAX_CONF = 95;
/** Keep full analyst reasoning in storage (was 500 — looked truncated in Belief Detail). */
const MAX_REASONING_LEN = 8000;
const MAX_WATCH_ITEMS = 6;

/**
 * Parses structured JSON from LLM response. Handles markdown code blocks.
 */
export function parseStructuredAnalysis(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  // Try to extract JSON from ```json ... ``` or raw
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, trimmed];
  let jsonStr = (jsonMatch[1] || trimmed).trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Brace slice — handles leading/trailing prose or a single JSON object in the paste
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Validates parsed analysis and applies guardrails.
 * Returns sanitized object or null if invalid.
 */
export function validateStructuredAnalysis(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  const verdict = ['increase', 'decrease', 'hold'].includes(parsed.verdict) ? parsed.verdict : 'hold';
  let delta = parseInt(parsed.confidence_delta, 10);
  let suggested = parseInt(parsed.suggested_confidence, 10);

  if (Number.isNaN(delta)) delta = 0;
  if (Number.isNaN(suggested)) suggested = null;

  delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  if (suggested !== null) {
    suggested = Math.max(MIN_CONF, Math.min(MAX_CONF, suggested));
  }

  const watchItems = Array.isArray(parsed.watch_items)
    ? parsed.watch_items.filter(w => typeof w === 'string').slice(0, MAX_WATCH_ITEMS)
    : [];

  const rawReason = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
  const reasoning = rawReason.length > MAX_REASONING_LEN
    ? rawReason.substring(0, MAX_REASONING_LEN) + '…'
    : rawReason;

  return {
    verdict,
    confidence_delta: delta,
    suggested_confidence: suggested,
    watch_items: watchItems,
    reasoning
  };
}
