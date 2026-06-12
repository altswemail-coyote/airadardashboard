# AI Radar v1 — Product & Architecture Document

> Note: Current product direction now lives in `AI-RADAR-CANONICAL-BRIEF.md`.
> This file remains useful as an implementation and architecture reference, but some sections describe historical, transitional, or partially retired product behavior.

**Type**: Chrome Extension (Manifest v3)  
**Status**: Active / In Use  
**Last Updated**: March 2026

---

## What It Is

AI Radar is a Chrome extension that functions as a personal intelligence dashboard. It surfaces relevant news and industry signals, tracks evolving beliefs about topics over time, and sends prompts to AI models — all personalised to the user's role, brand, and priorities.

---

## Two Core Pages

### 1. Home Dashboard (`dashboard.html`)

The main intelligence feed. Opens when the extension icon is clicked.

**What it does:**
- Runs a neural search via the Exa API across three time windows (2 days, 7 days, 14 days), weighted toward recency
- Scores and deduplicates results into a ranked intelligence feed
- Generates session-level beliefs (hypotheses) from the scan using OpenAI GPT-4o
- Displays results as ranked feed cards with source, type badge, relevance score, and power prompts
- Caches the last scan result so returning from the Tracker page doesn't trigger a re-scan
- Supports filter chips by content type (news, paper, code, blog, etc.)
- Bookmarks articles to a Briefing Drawer for export or LLM send
- Competitive Strike tool: generates strategic countermoves against a named competitor
- Intelligence Brief: deep in-app article analysis via Anthropic Claude

**User profile fields (Pro Controls panel):**
| Field | Storage Key | Used For |
|---|---|---|
| Career Field | `radarCareer` | Search query tuning, prompt context |
| Target Brand / Account | `radarAccount` | Prompt personalisation, belief framing |
| Job Title / Role | `radarRole` | Prompt context |
| Priority Topics | `radarKeywords` | Hot List seeding, prompt context |

---

### 2. Tracked Topics (`tracker.html`)

A longitudinal belief-tracking dashboard. Accessed via the "Tracked Topics" link.

**What it does:**
- Loads topics from the Hot List (`chrome.storage.local → hotList`)
- Scans each topic via Exa on load, then on demand (Scan Now / Scan All)
- For each topic, maintains a set of persistent, falsifiable beliefs that update with each scan
- Displays articles with Power Prompts per article
- Displays beliefs as confidence bars with delta indicators and scan history

**Belief lifecycle:**
1. **Generate** (first scan per topic): GPT-4o creates 3–5 falsifiable hypotheses. Confidence range: 25–75% based on evidence strength
2. **Score** (each subsequent scan): GPT-4o-mini evaluates new articles against each belief, returns a delta (−8 to +8). New confidence: `clamp(10, 99, confidence + delta)`
3. **Decay**: If no new articles appear after 2+ scans and confidence > 25%, confidence drops 3 points per scan cycle
4. **Persist**: All beliefs stored in `chrome.storage.local → tracker_hypotheses` with full revision history

**Known constraint**: `chrome.storage.local` has a 5MB cap shared across all stored data. Long-running belief histories with many topics will eventually approach this limit.

---

## Power Prompts

Available on every article in both pages. Each prompt is pre-populated with:

- The article title
- The article source URL
- A user context block:
  ```
  Role: [radarRole]
  Industry: [radarCareer]
  Target brand/account: [radarAccount]
  Priority topics: [radarKeywords]
  ```
- A bridging instruction: *"Even if this article does not mention [brand] directly, draw explicit connections to how this signal applies to [brand] — its strategy, competitive position, customers, or priorities."*

**Three prompt types:**
| Prompt | Framing |
|---|---|
| Strategic Analysis | Senior analyst examining strategic implications for the brand |
| Competitive Implications | Competitive strategist identifying threats/opportunities for the brand |
| What to Monitor | Intelligence analyst advising what the brand should watch or act on |

**Supported LLM targets:** Claude, ChatGPT, Perplexity, Gemini, Le Chat (Mistral)  
**Content scripts** auto-inject prompts directly into Claude, Gemini, and Le Chat UIs on navigation.

---

## Background Monitoring (`background.js`)

Runs as a service worker (Manifest v3).

- Fires a daily alarm at 7:00 AM (weekdays only)
- Searches Exa for new articles matching all Hot List topics as a boolean OR query
- Deduplicates against a `seenUrls` set
- Stores up to 50 items in `historyLog`
- Fires a Chrome notification if new articles are found, linking to the dashboard
- On notification click, opens `dashboard.html` with a `highlightUrl` that triggers a fresh scan

---

## Search Engine (`exa-engine.js`)

Wraps the Exa neural search API.

- Three-window temporal search: 2-day (1.5×), 7-day (1.0×), 14-day (0.8×)
- Requests article text (1000 chars), highlights (3 sentences), and a use-case summary
- Deduplicates by URL, normalises domains, and scores results
- Source diversity multiplier applied to scoring (penalises results all from one domain)
- Falls back to demo data if the API returns nothing

---

## AI Recommendations Engine (`ai-recos-engine.js`)

- Takes the four user profile fields as input
- Calls GPT-4o-mini to generate personalised monitoring search phrases
- Phrases are added to the Hot List to seed the Tracker

---

## Hypothesis Engine (`hypothesis-engine.js`)

Used by the Home Dashboard (session-level, not persisted).

- Generates fresh beliefs per scan from the current article set
- Distinct from the Tracker's `BeliefEngine` — these beliefs are session-only and reset on each scan
- Will migrate to PostgreSQL storage when the web platform is built

---

## Data Flow

```
User opens extension
        │
        ▼
dashboard.html loads
        │
        ├── Cache exists? → Restore last scan (no API call)
        │
        └── No cache → runSearch(query)
                │
                ├── Exa API (3 time windows) → ranked articles
                │
                └── OpenAI GPT-4o → session beliefs
                        │
                        └── Save to dashboardCache

User navigates to Tracked Topics
        │
        ▼
tracker.html loads
        │
        ├── Load hotList + radarAccount from storage
        │
        └── For each topic:
                │
                ├── Exa search → articles
                │
                ├── BeliefEngine.load() → existing beliefs
                │
                ├── New beliefs? → GPT-4o generate (confidence: 25–75%)
                │
                └── Existing beliefs? → GPT-4o-mini score each
                        │
                        └── Update confidence + revisionHistory → save

Background (7AM daily)
        │
        └── Exa boolean search → new articles → Chrome notification
```

---

## Storage Keys (`chrome.storage.local`)

| Key | Content | Set By |
|---|---|---|
| `openaiKey` | OpenAI API key | `dashboard.js` (hardcoded at startup) |
| `anthropicKey` | Anthropic API key | `dashboard.js` (hardcoded at startup) |
| `llmModel` | Selected LLM target | User via selector |
| `hotList` | Array of tracked topic strings | Pro Controls panel |
| `radarCareer` | Career field string | Pro Controls panel |
| `radarAccount` | Target brand/account string | Pro Controls panel |
| `radarRole` | Job title/role string | Pro Controls panel |
| `radarKeywords` | Priority topics string | Pro Controls panel |
| `tracker_hypotheses` | All persistent beliefs with history | `BeliefEngine.save()` |
| `dashboardCache` | Last home dashboard scan (query + items + beliefs) | `runSearch()` |
| `bookmarks` | Saved articles for briefing drawer | `toggleBookmark()` |
| `seenUrls` | Dedup set for background monitor | `background.js` |
| `historyLog` | Last 50 background-found articles | `background.js` |
| `highlightUrl` | URL to highlight on next dashboard open | `background.js` |
| `monitoringEnabled` | Background monitor on/off toggle | Pro Controls panel |

---

## Known Limitations (Extension Architecture)

| Limitation | Impact | Resolution (Web App) |
|---|---|---|
| `chrome.storage.local` 5MB cap | Belief history truncated over time | PostgreSQL / Firestore |
| Serial topic scanning (1.2s delay) | Slow Scan All on large Hot Lists | Parallel background jobs (cron) |
| Keys hardcoded in JS | Security risk; visible in source | Server-side key management |
| No cross-device sync | Settings/beliefs lost if browser changes | Cloud auth + user accounts |
| No scheduled tracker scans | Tracker only scans on page open | Server-side cron per topic |
| Beliefs reset if storage cleared | History not durable | Persistent DB |

---

## Planned: Web Application

The extension validates the core product loop. The web platform will address all the above constraints:

- **Backend**: Node.js server (`server/index.js` scaffold already exists)
- **Database**: PostgreSQL for beliefs, revision history, articles, user profiles
- **Auth**: User accounts for cross-device sync
- **Scheduling**: Cron jobs for automatic topic scanning (no manual trigger needed)
- **Parallelism**: All topic scans run concurrently server-side
- **Security**: API keys stored server-side, never exposed to the client
