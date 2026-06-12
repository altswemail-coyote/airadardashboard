// exa-engine.js - Cognesion Exa search

async function getExaApiKey(explicitKey = null) {
  if (explicitKey) return explicitKey;
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(["exaApiKey"]);
      if (stored.exaApiKey) return stored.exaApiKey;
    } catch (error) {
      console.warn("[ExaEngine] Failed to read exaApiKey from storage:", error?.message || error);
    }
  }
  return null;
}

async function getRuntimeAuthHeaders() {
  const accessTokenReader = globalThis.COGNESION_AUTH?.getAccessToken;
  if (typeof accessTokenReader !== "function") return {};

  try {
    const token = await accessTokenReader();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (error) {
    console.warn("[ExaEngine] Failed to read runtime access token:", error?.message || error);
    return {};
  }
}

export class ExaEngine {
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.proxyBasePath = options.proxyBasePath || "/api/exa";
  }

  shouldUseProxy() {
    return !this.apiKey
      && typeof globalThis !== "undefined"
      && Boolean(globalThis.COGNESION_RUNTIME?.isHttpRuntime);
  }

  async search(userQuery) {
    if (!userQuery) return [];

    if (this.shouldUseProxy()) {
      try {
        const authHeaders = await getRuntimeAuthHeaders();
        const response = await fetch(`${this.proxyBasePath}/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders
          },
          body: JSON.stringify({ query: userQuery })
        });
        const data = await response.json();
        if (!response.ok || data?.ok === false) {
          console.warn("[ExaEngine] Server proxy search failed:", data?.error || response.status);
          return [];
        }
        return Array.isArray(data.items) ? data.items : [];
      } catch (error) {
        console.warn("[ExaEngine] Server proxy search failed:", error?.message || error);
        return [];
      }
    }

    const apiKey = await getExaApiKey(this.apiKey);
    if (!apiKey) {
      console.warn("[ExaEngine] No Exa API key available in runtime storage.");
      return [];
    }

    // Multi-window search for temporal awareness
    const windows = [
      { days: 2, weight: 1.5 },  // Breaking news
      { days: 7, weight: 1.0 },  // Recent trends
      { days: 14, weight: 0.8 }  // Context
    ];
    
    const allResults = [];
    
    for (let wi = 0; wi < windows.length; wi++) {
      const window = windows[wi];
      // Brief pause between windows to avoid triggering Exa rate limits
      // when multiple topics are scanned in sequence (5 topics × 3 windows = 15 calls)
      if (wi > 0) await new Promise(r => setTimeout(r, 400));

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - window.days);
      
      const enhancedQuery = userQuery.toLowerCase().includes("ai") 
        ? `${userQuery} news analysis`
        : `${userQuery} artificial intelligence news`;
      
      try {
        const response = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            query: enhancedQuery,
            numResults: 10,
            useAutoprompt: true,
            type: "neural",
            startPublishedDate: startDate.toISOString(),
            contents: {
              text: { maxCharacters: 1000 },
              highlights: {
                numSentences: 3,
                query: "Main topic and key details of this specific article"
              },
              summary: {
                query: "List 3 distinct, short use cases or applications. Keep them under 10 words."
              }
            }
          })
        });
        
        if (!response.ok) {
          console.warn(`Exa window ${window.days}d returned ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        if (data.results) {
          data.results.forEach(r => {
            r.temporalWeight = window.weight;
            r.windowDays = window.days;
          });
          allResults.push(...data.results);
        }
      } catch (e) {
        console.error(`Exa window ${window.days}d failed:`, e.message);
      }
    }
    
    if (allResults.length === 0) {
      console.warn("No results from any time window");
      return [];
    }
    
    // CRITICAL: Apply quality filters BEFORE deduplication
    const filtered = this.applyQualityFilters(allResults);
    
    // Deduplicate by URL, keeping highest scored version
    const deduplicated = this.deduplicateResults(filtered);
    
    // Return top 12, properly normalized
    const normalizedResults = this.normalize(deduplicated.slice(0, 12));
    
    // Final deduplication: URL-level then title-level (catches syndicated copies)
    const seenUrls = new Set();
    const seenTitles = new Set();
    const dedupedResults = normalizedResults.filter(item => {
      if (seenUrls.has(item.link)) return false;
      seenUrls.add(item.link);

      // Normalize title for similarity check: lowercase, strip punctuation, collapse spaces
      const normTitle = (item.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      // Use first 60 chars as the fingerprint — enough to catch syndicated copies
      const titleKey = normTitle.slice(0, 60);
      if (titleKey.length > 20 && seenTitles.has(titleKey)) return false;
      if (titleKey.length > 20) seenTitles.add(titleKey);

      return true;
    });
    return dedupedResults;
  }

  applyQualityFilters(results) {
    // Comprehensive blocklists
    const BLOCKED_DOMAINS = [
      // PR wires, market research, aggregators
      'gadgets360.com', 
      'ndtv.com/gadgets',
      'researchandmarkets.com', 
      'marketresearch.com',
      'bccresearch.com',
      'globenewswire.com', 
      'prnewswire.com', 
      'businesswire.com',
      'prweb.com',
      'accessnewswire.com',
      'einnews.com',
      'openpr.com',
      'reportsanddata.com',
      'gminsights.com',
      'transparencymarketresearch.com',
      'alliedmarketresearch.com',
      'toolify.ai',
      'springer.com',
      'sciencedirect.com',
      'linkedin.com',
      // Vendor blogs / CX platforms — have stake in narrative, not neutral sources
      'nice.com',
      'clearlyrated.com',
      'neuron.expert',
      'zendesk.com',
      'intercom.com',
      'hubspot.com',
      // Review platforms — marketing-adjacent, not independent research
      'g2.com',
      'trustradius.com',
      'capterra.com',
      'softwareadvice.com'
    ];

    const BAD_TITLE_KEYWORDS = [
      'latest news',
      'news headlines', 
      'news updates',
      'news roundup',
      'daily digest',
      'market size', 
      'market share', 
      'growth forecast', 
      'cagr', 
      'global report', 
      'news and analysis articles',
      'ai hub',
      'analysis 202', 
      'industry trends',
      'press release',
      'sponsored',
      'partner content',
      'advertorial',
      'revenue',
      'outlook 20',
      'archive',
      ' ai archive',
      'breaking news and latest',
      'latest headlines',
      'latest headlines, top stories',
      'news and analysis',
      'news and analysis -',
      'front page'
    ];

    return results.filter(item => {
      try {
        const domain = new URL(item.url).hostname.replace('www.', '');
        const titleLower = (item.title || "").toLowerCase();
        const urlLower = item.url.toLowerCase();
        
        // Rule 1: Domain blocklist
        if (BLOCKED_DOMAINS.some(bad => domain.includes(bad))) {
          console.log(`Filtered (domain): ${domain}`);
          return false;
        }
        
        // Rule 2: Title pattern filter
        if (BAD_TITLE_KEYWORDS.some(bad => titleLower.includes(bad))) {
          console.log(`Filtered (title): ${item.title}`);
          return false;
        }
        
        // Rule 3: Avoid category/homepage URLs
        if (urlLower.match(/\/(news|category|tag|latest)$/)) {
          console.log(`Filtered (category page): ${item.url}`);
          return false;
        }
        
        // Rule 4: Must have substantial content
        if (!item.text || item.text.length < 200) {
          console.log(`Filtered (no content): ${item.title}`);
          return false;
        }
        
        // Rule 5: Title must be reasonably specific (not just site name)
        if (item.title && item.title.length < 30) {
          console.log(`Filtered (title too short): ${item.title}`);
          return false;
        }

        // Rule 6a: Filter "Category | Publication" style titles (section pages)
        if (item.title && item.title.includes(' | ')) {
          const beforePipe = item.title.split(' | ')[0].trim();
          if (beforePipe.length < 40) {
            console.log(`Filtered (category page title): ${item.title}`);
            return false;
          }
        }

        // Rule 6: Title must not be a generic category label
        const GENERIC_TITLES = [
          'artificial intelligence',
          'generative ai',
          'machine learning',
          'deep learning',
          'ai news',
          'technology news',
          'tech news',
          'news and analysis articles',
          'news and analysis',
          'news, analysis',
          'latest articles',
          'ai hub'
        ];
        const titleNorm = (item.title || "").toLowerCase().trim();
        if (GENERIC_TITLES.some(g => titleNorm === g || titleNorm === g + 's')) {
          console.log(`Filtered (generic title): ${item.title}`);
          return false;
        }

        // Rule 7: Filter site homepage/portal pages (e.g. "Washington Post - Breaking news...")
        // These have " - " as a separator between site name and generic tagline
        if (item.title && item.title.includes(' - ')) {
          const afterDash = item.title.split(' - ').slice(1).join(' - ').toLowerCase();
          const homepagePatterns = ['breaking news', 'latest headlines', 'top stories', 'news & analysis', 'news and analysis', 'official site'];
          if (homepagePatterns.some(p => afterDash.includes(p))) {
            console.log(`Filtered (homepage): ${item.title}`);
            return false;
          }
        }
        
        return true;
      } catch (e) {
        console.error("Filter error:", e);
        return false;
      }
    });
  }

  deduplicateResults(results) {
    const seen = new Map();
    
    // Normalize URL for dedup key: strip trailing slash, lowercase protocol/domain
    const normalizeUrl = (url) => url.replace(/\/$/, '').toLowerCase().replace(/^http:/, 'https:');
    
    results.forEach(item => {
      const baseScore = item.score || 50;
      const finalScore = baseScore * (item.temporalWeight || 1.0);
      const key = normalizeUrl(item.url);
      
      // Keep the highest scored version of each URL
      if (!seen.has(key) || finalScore > seen.get(key).finalScore) {
        item.finalScore = finalScore;
        seen.set(key, item);
      }
    });
    
    return Array.from(seen.values())
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  normalize(results) {
    if (!results) return [];
    
    return results.map(item => {
      // Intelligent description selection
      let bestDescription = "No summary available.";
      
      if (item.highlights && item.highlights.length > 0) {
        // Prefer highlights (best quality)
        bestDescription = item.highlights.join(" ... ");
      } else if (item.text) {
        // Clean the raw text
        const cleaned = item.text
          .replace(/\[.*?\]/g, '')  // Remove [Menu] [Items]
          .replace(/\|+/g, ' ')     // Remove pipe separators
          .replace(/\s+/g, ' ')     // Normalize whitespace
          .trim();
        
        bestDescription = cleaned.substring(0, 300);
      }
      
      return {
        title: item.title || "Untitled",
        link: item.url,
        source: new URL(item.url).hostname.replace('www.', ''),
        date: item.publishedDate || new Date().toISOString(),
        summary: bestDescription,
        useCases: item.summary || "",
        type: this.guessType(item.url),
        image: this.guessImage(item.url),
        finalScore: Math.round(item.finalScore || 50),
        relevanceScore: Math.min(100, Math.round((item.finalScore || 0.25) * 100))
      };
    });
  }

  guessType(url) {
    const u = url.toLowerCase();
    if (u.includes("youtube") || u.includes("youtu.be")) return "video";
    if (u.includes("arxiv") || u.includes(".pdf")) return "paper";
    if (u.includes(".gov") || u.includes("policy")) return "gov";
    if (u.includes("github")) return "code";
    return "news";
  }

  async fetchContents(url) {
    try {
      if (this.shouldUseProxy()) {
        const authHeaders = await getRuntimeAuthHeaders();
        const response = await fetch(`${this.proxyBasePath}/contents`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders
          },
          body: JSON.stringify({ url })
        });
        const data = await response.json();
        if (!response.ok || data?.ok === false) return null;
        return data?.text || null;
      }

      const apiKey = await getExaApiKey(this.apiKey);
      if (!apiKey) return null;
      const response = await fetch("https://api.exa.ai/contents", {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [url], text: { maxCharacters: 8000 } })
      });
      if (!response.ok) return null;
      const data = await response.json();
      const text = data?.results?.[0]?.text?.trim();
      return (text && text.length >= 200) ? text : null;
    } catch {
      return null;
    }
  }

  guessImage(url) {
    // Helper to grab YouTube thumbnails directly from the URL
    if (url.includes("youtube") || url.includes("youtu.be")) {
      const v = url.match(/[?&]v=([^&]+)/);
      if (v && v[1]) return `https://img.youtube.com/vi/${v[1]}/hqdefault.jpg`;
      const s = url.match(/youtu\.be\/([^?]+)/);
      if (s && s[1]) return `https://img.youtube.com/vi/${s[1]}/hqdefault.jpg`;
    }
    return null; 
  }
}
