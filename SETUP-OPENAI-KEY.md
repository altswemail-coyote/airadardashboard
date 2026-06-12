# Beta API Key Setup

This file replaces the old `RADAR RECOS` setup notes. That system is no longer the live setup path for the current beta.

## Current beta architecture

AI Radar currently uses local keys directly inside the extension code:

- `exa-engine.js` holds the Exa key used by the Command feed search pipeline
- `dashboard.js` seeds local beta keys for OpenAI and Anthropic into `chrome.storage.local`
- `background.js` reads `exaApiKey`, `openaiKey`, and `openAiApiKey` so monitor scans and prompt paths stay aligned
- `tracker.js` reads `openaiKey` or `openAiApiKey` for tracked-topic analysis flows

This is acceptable for the current beta only. For the live product, these keys should move server-side.

## What to update

### 1. Exa

Open `exa-engine.js` and update:

```javascript
const EXA_KEY = "YOUR_EXA_KEY_HERE";
```

If you also want the background monitor to use the same fallback key, update `background.js`:

```javascript
const EXA_KEY = "YOUR_EXA_KEY_HERE";
```

### 2. OpenAI

Open `dashboard.js` and update:

```javascript
const HARDCODED_OPENAI_KEY = "YOUR_OPENAI_KEY_HERE";
```

The dashboard will seed both `openaiKey` and `openAiApiKey` in local storage so the dashboard, tracker, and background code all resolve the same key.

### 3. Anthropic

Open `dashboard.js` and update:

```javascript
const HARDCODED_ANTHROPIC_KEY = "YOUR_ANTHROPIC_KEY_HERE";
```

## Quick beta test

After updating the keys:

1. Reload the extension.
2. Open the Command dashboard.
3. Run a scan from the main search bar.
4. Open a signal and run an Intelligence Brief.
5. Open Tracked Topics and verify topic generation and analysis still work.

## Important note

If one part of the app works and another does not, check that the same key has been updated everywhere it is still hardcoded today:

- `exa-engine.js`
- `background.js`
- `dashboard.js`

That duplication is temporary beta debt, not the intended production architecture.
