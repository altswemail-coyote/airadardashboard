# AI Radar — Site & Product Handbook

> Note: Canonical product direction now lives in `AI-RADAR-CANONICAL-BRIEF.md`.
> This handbook remains the best descriptive guide to the current extension implementation, while the canonical brief defines what the product should emphasize going forward.

**Product**: AI Radar — personal intelligence dashboard (Chrome extension)  
**UI version label**: v3.5 (home dashboard header)  
**Extension manifest**: `manifest.json` — name **“AI Radar: Dashboard”**, version **1.0.0**  
**Document scope**: Brand/visual standards, capabilities, architecture, and operations as implemented in `ai-radar-v1-dashboard/`.  
**Last updated**: April 2026

---

## 1. What AI Radar Is

AI Radar is a **Manifest V3 Chrome extension** that acts as a **signal intelligence workspace** for people who need to monitor AI and industry news in a role- and brand-aware way. It combines:

- **Neural search** over the web (Exa) with recency-weighted scoring  
- **LLM-generated beliefs** (hypotheses) that evolve as new articles arrive  
- **Power prompts** that send structured context into external LLMs (Claude, ChatGPT, Gemini, etc.)  
- **Background monitoring** with optional daily scans and notifications  
- **Tracked Topics** (Pro) for longitudinal belief tracking per topic, organized into **boards (tabs)**

The product loop: **scan → rank → interpret → act** (bookmark, export, send to model, or track over time).

---

## 2. Brand & Positioning

### 2.1 Positioning (from product behavior)

| Pillar | Meaning in-product |
|--------|---------------------|
| **Signal over noise** | Ranked feed, relevance scoring, deduplication, type filters |
| **Personal context** | Role, industry, brand/account, priorities feed prompts and framing |
| **Actionable** | Power prompts, bookmarks, briefs, newsletter builder, competitor strike |
| **Persistence** | Cached scans, stored beliefs on tracked topics, history log |

### 2.2 Naming

- **Product name**: AI Radar  
- **Logo**: Wordmark assets `icons/logo-dark.svg`, `icons/logo-light.svg` (SVG)  
- **Extension action**: “Open AI Radar” (`manifest.json` → `action.default_title`)  
- **Tracked Topics** is labeled as **PRO** in the main dashboard nav where applicable  

### 2.3 Voice (UI copy patterns)

- Short, imperative controls: **Scan**, **Brief**, **Generate**, **Export**  
- Analyst framing: “Signal Feed”, “Intelligence Brief”, “Strategic Analysis”  
- Technical credibility without jargon walls — labels are scannable (chips, badges, stats)

---

## 3. Visual Design System

Primary stylesheet: `dashboard.css` (shared with `tracker.html` for consistency). Tracker adds inline styles for layout-specific components.

### 3.1 Color tokens (`:root` in `dashboard.css`)

| Token | Hex / role |
|-------|------------|
| `--bg` | `#050816` — page background |
| `--panel` | `#0a1022` — cards, panels |
| `--panel-hi` | `#0e1530` — elevated panels |
| `--border` | `#162040` — default borders |
| `--border-hi` | `#253060` — hover / emphasis borders |
| `--accent` | `#3b82f6` — primary actions, links, focus |
| `--accent-hi` | `#60a5fa` — lighter accent |
| `--green` | `#22c55e` — positive / success |
| `--yellow` | `#eab308` — caution |
| `--red` | `#ef4444` — risk / negative |
| `--text` | `#f0f0f2` — primary text |
| `--muted` | `#8b8b96` — secondary text |
| `--dim` | `#4a5070` — tertiary / meta |

**Interaction**: Primary buttons use `--accent` with hover toward `#2563eb` (see `.scan-btn`, `.t-action-btn.primary`). Glow variables `--btn-glow` / `--btn-glow-hi` appear on tracker action buttons.

### 3.2 Typography

- **Primary stack**: `'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (`--sans`, `--serif` aliases match for current UI)  
- **Scale**: Header/meta often **9–11px** uppercase labels; body **12–14px**; feed cards **13px** class of copy  
- **Weights**: **600–800** for labels and buttons; feed titles **600–700**

### 3.3 Layout & density

- **Dashboard**: Sticky blurred header (`backdrop-filter`), max content width **~1500px** in header cluster  
- **Tracker**: Two-column shell — **~275px** sidebar + fluid main; **rounded 14–16px** cards  
- **Dark-first**: No light theme token set in `dashboard.css` (logos may swap for marketing; in-app uses dark wordmark on dark ground)

### 3.4 Components (recurring patterns)

- **Pills / chips**: Rounded **8–10px**, border `var(--border)`, active state often accent border or fill  
- **Modals**: Overlay + `modal-window`, consistent close control  
- **Pro / premium**: Accent pill or badge next to “Tracked Topics” on dashboard  

---

## 4. Information Architecture

### 4.1 Surfaces

| Surface | File | Purpose |
|---------|------|---------|
| **Home dashboard** | `dashboard.html` + `dashboard.js` | Main feed, search, scan cache, insights, modals, Pro drawer |
| **Tracked Topics** | `tracker.html` + `tracker.js` | Per-topic articles + beliefs, boards (tabs), topic controls drawer |
| **Service worker** | `background.js` | Alarms, daily hot-list scan, notifications, message bridge for APIs |
| **Content scripts** | `content-claude.js`, `content-gemini.js`, `content-lechat.js` | Inject prompts into partner UIs |

### 4.2 Primary navigation

- Dashboard header → **Tracked Topics** (`tracker.html`) — Pro  
- Tracker → **← Home** / logo → `dashboard.html`  
- **Topic Controls** (tracker tab bar) opens the **right drawer** (add topic, profile, monitoring, newsletter-related flows)

### 4.3 Boards (tracked topic sets)

- Users manage **multiple boards** (tabs): storage keys `topicSets`, `activeTopicSetId`, `lastTopicBySetId`  
- **`hotList`** remains the **union** of all topics across boards (for dashboard chips and background monitor)  
- Implementation lives in `tracker.js` (migration from legacy flat `hotList`)

---

## 5. Capabilities

### 5.1 Home dashboard

- **Search + Scan**: User query or chip-driven queries; Exa-powered retrieval with temporal windows and scoring (`exa-engine.js`)  
- **Session beliefs**: Legacy dashboard belief code remains in `dashboard.js`, but the dashboard-facing belief surface is retired and persistent belief tracking belongs to **Tracked Topics**  
- **Feed**: Ranked cards with source, badges, scores, power prompts per article  
- **Caching**: `dashboardCache` restores last scan to avoid redundant API calls when returning from Tracker  
- **Filters**: Content-type chips (news, papers, code, blog, etc. — as implemented in UI)  
- **Bookmarks**: Saved articles → briefing drawer  
- **Tools** (as wired in `dashboard.js`): Intelligence Brief (Claude path), Competitive Strike / countermove flows, history modals  
- **Pro drawer**: Hot list chips, profile fields, monitoring toggle, AI-generated signal phrases (where enabled)  
- **Hot list chips**: Click to scan; remove updates `topicSets` + `hotList` when boards exist  

### 5.2 Tracked Topics (tracker)

- **Per-topic state**: Articles, beliefs, scan timestamps; persisted under `trackerArticles`, `trackerLastScanned`, `tracker_hypotheses`  
- **Belief engine**: Generate → score → decay lifecycle (see `AI-RADAR-V1.md` and `belief-analysis.js`)  
- **Scans**: Per-topic **Scan**, **Scan All** (serial with delay), optional auto-scan on load under staleness rules  
- **Health / evolve**: Signal health and topic evolution suggestions (UI + GPT flows in `tracker.js`)  
- **Morning Brief / dispatch**: Build morning-brief modal with topic selection, email, weekday-morning default, and schedule hooks  
- **Cross-topic deduplication**: Same URL normalized across topics globally (within union of tracked topic names)  
- **i18n**: Static strings via `i18n.js`; dynamic page translation when `radarLanguage` + OpenAI key are set  

### 5.3 Power Prompts

- Every article can expose **prompt templates** (strategic, competitive, monitoring — as implemented)  
- Context block includes **role, industry, brand, priorities** from storage  
- Targets include external LLMs; **content scripts** assist paste/navigation for Claude, Gemini, Le Chat  

### 5.4 Background monitoring

- **Alarm**: ~daily (7:00 AM logic in `background.js`; weekends skipped in scan function)  
- **Query**: Boolean **OR** across all `hotList` terms  
- **Dedup**: `seenUrls`; **history**: `historyLog` (capped)  
- **Notification**: Opens dashboard; may pass `highlightUrl` for follow-up scan  

### 5.5 Optional local server

- `server/README.md`: **POST `/hydrate`** for article hydration (CSP-friendly fetches), default port **8787**

---

## 6. Technology Stack

| Layer | Choice |
|-------|--------|
| Platform | Chrome Extension **Manifest V3** |
| UI | HTML + CSS + **ES modules** (`dashboard.js` as `type="module"`) |
| Search | **Exa** API (via `exa-engine.js` + background message proxy where used) |
| LLMs | **OpenAI** (chat completions), **Anthropic** (hosted capabilities in dashboard flows) |
| Storage | `chrome.storage.local` |
| i18n | `i18n.js` — static tables + `applyUITranslations()` |

---

## 7. Extension Permissions & Security (summary)

From `manifest.json`:

- **Permissions**: `storage`, `tabs`, `alarms`, `notifications`  
- **Host access**: `api.exa.ai`, `api.openai.com`, `api.anthropic.com` (+ CSP `connect-src` includes helpers such as `api.allorigins.win`, `corsproxy.io` where configured)  
- **CSP**: `script-src 'self'` on extension pages; controlled `img-src`, `frame-src` (e.g. YouTube)  

**Operational note**: Beta builds may seed keys into `chrome.storage.local` under `openaiKey` / `openAiApiKey`, `anthropicKey`, and `exaApiKey`; avoid committing real keys to source. For production, move key management off the client.

---

## 8. Data Model (storage keys)

Core keys (non-exhaustive; see `AI-RADAR-V1.md` for full legacy table):

| Key | Role |
|-----|------|
| `hotList` | Union of all tracked topic strings across boards |
| `topicSets` | Array of `{ id, name, topics[] }` boards |
| `activeTopicSetId` | Selected board |
| `lastTopicBySetId` | Last selected topic per board |
| `dashboardCache` | Last dashboard scan snapshot |
| `tracker_hypotheses` | Persistent beliefs |
| `trackerArticles` / `trackerLastScanned` | Cached articles and scan times per topic |
| `radarCareer`, `radarAccount`, `radarRole`, `radarKeywords`, `radarEmail`, `radarLanguage` | User profile |
| `bookmarks` | Saved articles |
| `monitoringEnabled` | Background monitor |
| `seenUrls`, `historyLog` | Background dedup + history |
| `highlightUrl` | Deep-link highlight from notification |
| `isProUser` | Entitlement gate (when `PRO_GATE_ENABLED` is true in tracker) |

**Limit**: `chrome.storage.local` ~**5MB** total — long belief histories and large caches compete for space.

---

## 9. Internationalization

- **Static UI**: `i18n.js` — `UI_TRANSLATIONS` for **en** plus: **es, fr, de, pt, it, ja, zh, ko, ar, nl, ru, hi** (`LANG_NAMES`)  
- **Tracker dynamic translation**: `translatePage()` in `tracker.js` (OpenAI-backed batch translation when language + key set)  
- **Dashboard**: `applyUITranslations(lang)` updates labeled DOM nodes when language changes  

---

## 10. Known Limitations

| Area | Limitation |
|------|------------|
| Storage | 5MB cap; beliefs/articles must stay bounded |
| Sync | No cloud account — data is local to the browser profile |
| Parallelism | Tracker “Scan All” is intentionally throttled (serial scans) |
| CSP | External fetches must align with manifest CSP; hydration server optional |
| Keys | Client-side keys are user-managed — not enterprise-grade secret handling |

**Roadmap** (from internal architecture notes): web app with PostgreSQL, auth, server-side keys, scheduled scans — see `AI-RADAR-V1.md` § Planned Web Application.

---

## 11. Current Web Launch Checklist

### Working now

- **Supabase-backed magic-link sign-in** for the Topics web app (`/app`)
- **Protected Topics API routes** backed by authenticated Supabase users
- **Protected AI and Exa proxy routes** so paid model/search keys are no longer exposed to anonymous web visitors
- **Render deployment scaffold** in `render.yaml`

### Must complete before public launch

- Add the production **Render site URL** to Supabase Auth URL Configuration
- Set all production environment variables in Render (`SUPABASE_*`, `EXA_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
- Finish **Morning Brief delivery** on the server side
- Finish **billing + entitlements** for Scout, Signal, Operator, and Team
- Add scheduled jobs for recurring scans and briefing delivery

### Later hardening

- Add optional **email + password sign-in** after the magic-link launch path is stable
- Tighten auth settings such as password complexity and secure password-change rules once password auth is enabled

---

## 12. Key Files (for authors & engineers)

| Path | Role |
|------|------|
| `manifest.json` | Extension identity, permissions, CSP, content scripts |
| `dashboard.html` / `dashboard.js` | Main dashboard |
| `dashboard.css` | Global design tokens + dashboard layout |
| `tracker.html` / `tracker.js` | Tracked topics + boards |
| `background.js` | Service worker: alarms, monitor, API proxy messages |
| `exa-engine.js` | Exa search orchestration |
| `belief-analysis.js` | Belief persistence / analysis helpers |
| `i18n.js` | Translations |
| `AI-RADAR-V1.md` | Deeper architecture & data flow |
| `server/` | Local hydration API |

---

## 13. Versioning & References

- **Dashboard UI version** is displayed as **v3.5** in `dashboard.html` (`.ver`).  
- **Extension version** follows `manifest.json` (`1.0.0` at time of writing).  
- This handbook is descriptive of the **in-repo** implementation; marketing or legal copy may differ.

---

*End of handbook.*
