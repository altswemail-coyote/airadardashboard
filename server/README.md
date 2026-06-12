# AI Radar Hydration Server

Local backend for article hydration to avoid CSP issues in extension pages.

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

## Dev (auto-reload)

```bash
npm run dev
```

## Endpoint

`POST /hydrate`

Body:
```json
{ "url": "https://example.com/article" }
```

Default port: `8787`

Health check: `GET /health`
