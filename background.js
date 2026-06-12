// background.js - Cognesion Monitor

const BRAND_NAME = "Cognesion";
const EXA_KEY = null;
// Beta builds may store keys under either openaiKey or openAiApiKey.
// Background falls back across both so dashboard, tracker, and monitor stay aligned.

// ── DEV: toggle Pro entitlement (paste into DevTools console on any extension page) ──
// chrome.storage.local.set({ isProUser: true })   // unlock Tracked Topics
// chrome.storage.local.set({ isProUser: false })  // lock Tracked Topics (default when unset)

function getNextSevenAM() {
  const now = new Date();
  const next = new Date();
  next.setHours(7, 0, 0, 0); 
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.clearAll();
  const nextRun = getNextSevenAM();
  chrome.alarms.create("hotListMonitor", { when: nextRun, periodInMinutes: 1440 });
  console.log(`${BRAND_NAME}: Scheduled for ${new Date(nextRun).toLocaleString()}`);
});

async function getStoredApiKeys() {
  const stored = await chrome.storage.local.get(["exaApiKey", "openaiKey", "openAiApiKey"]);
  return {
    exa: stored.exaApiKey || EXA_KEY || null,
    openai: stored.openaiKey || stored.openAiApiKey || null
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "EXA_SEARCH") {
    (async () => {
      try {
        const { exa: apiKey } = await getStoredApiKeys();
        if (!apiKey) {
          sendResponse({ ok: false, error: { message: "EXA_KEY_MISSING", status: 401 } });
          return;
        }
        const response = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify(msg.payload || {})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          sendResponse({ ok: false, error: { message: "EXA_REQUEST_FAILED", status: response.status, data } });
          return;
        }
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: { message: error?.message || "EXA_REQUEST_FAILED" } });
      }
    })();
    return true;
  }

  if (msg?.type === "OPENAI_CHAT") {
    (async () => {
      try {
        const { openai: apiKey } = await getStoredApiKeys();
        if (!apiKey) {
          sendResponse({ ok: false, error: { message: "OPENAI_KEY_MISSING", status: 401 } });
          return;
        }
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify(msg.payload || {})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          sendResponse({ ok: false, error: { message: "OPENAI_REQUEST_FAILED", status: response.status, data } });
          return;
        }
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: { message: error?.message || "OPENAI_REQUEST_FAILED" } });
      }
    })();
    return true;
  }
  return false;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "hotListMonitor") await runHotListScan();
});

async function runHotListScan() {
  const day = new Date().getDay();
  if (day === 0 || day === 6) return; // Weekend skip

  const data = await chrome.storage.local.get(['hotList', 'monitoringEnabled', 'seenUrls', 'historyLog']);
  
  if (!data.monitoringEnabled || !data.hotList || data.hotList.length === 0) return;

  const seenUrls = new Set(data.seenUrls || []);
  const historyLog = data.historyLog || [];
  
  const booleanQuery = data.hotList.map(term => `"${term}"`).join(" OR ");
  console.log(`Running Daily Scan for: ${booleanQuery}`);

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { exa: apiKey } = await getStoredApiKeys();
    if (!apiKey) return;
    
    // Request summary so Power Prompt works in history
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: booleanQuery,
        numResults: 5,
        type: "neural",
        startPublishedDate: oneDayAgo,
        contents: { 
          text: true,
          summary: { query: "List 3 distinct, short use cases or applications. Keep them under 10 words." }
        } 
      })
    });

    const result = await response.json();
    let foundNew = false;
    let topHit = null;

    if (result.results) {
      result.results.forEach(item => {
        if (!seenUrls.has(item.url)) {
          foundNew = true;
          seenUrls.add(item.url);
          if (!topHit) topHit = item; 

          // Save item to history log with summary
          historyLog.unshift({
            title: item.title || "Untitled",
            url: item.url,
            date: new Date().toISOString(),
            source: new URL(item.url).hostname.replace('www.', ''),
            summary: item.text || "",
            useCases: item.summary || "" 
          });
        }
      });
    }

    if (foundNew) {
      if (historyLog.length > 50) historyLog.length = 50;

      await chrome.storage.local.set({ 
        seenUrls: Array.from(seenUrls),
        historyLog: historyLog,
        highlightUrl: topHit.url
      });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png', 
        title: `${BRAND_NAME}: Morning Brief Ready`,
        message: `${topHit.title} matches your Hot List.`,
        priority: 2
      });
    }

  } catch (e) {
    console.error("Scan failed:", e);
  }
}

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: "dashboard.html" });
});
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "dashboard.html" });
});
