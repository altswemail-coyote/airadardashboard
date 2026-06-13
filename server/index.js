import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { ExaEngine } from "../exa-engine.js";
import {
  checkSupabaseConnection,
  createTopic,
  createTopicBoard,
  deleteTopic,
  deleteTopicBoard,
  getSupabaseBrowserConfig,
  getSupabaseConfigStatus,
  listTopicBoards,
  resolveAdminBypassUser,
  resolveAuthenticatedUser,
  updateTopic,
  updateTopicBoard
} from "./supabase/client.js";

const app = express();
const PORT = process.env.PORT || 8787;
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const COGNESION_ENV = process.env.COGNESION_ENV || "development";
const BUILD_STAMP = "2026-06-13-command-home-feed";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const SUPABASE_UMD_DIR = path.join(ROOT_DIR, "server", "node_modules", "@supabase", "supabase-js", "dist", "umd");
const exaEngine = process.env.EXA_API_KEY
  ? new ExaEngine({ apiKey: process.env.EXA_API_KEY })
  : null;

const WEB_STATIC_FILES = [
  "dashboard.css",
  "airadar-loading-screen.css",
  "dashboard.js",
  "tracker.js",
  "exa-engine.js",
  "belief-analysis.js",
  "i18n.js",
  "airadar-loading-screen.js",
  "airadar-loading-shell-init.js"
];

const PLAN_DEFINITIONS = [
  {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    briefsPerWeek: 0,
    topicLimit: 0,
    recipientLimit: 0,
    delivery: "Command only"
  },
  {
    id: "scout",
    name: "Scout",
    monthlyPriceUsd: 12,
    briefsPerWeek: 1,
    topicLimit: 3,
    recipientLimit: 1,
    delivery: "1 brief per week"
  },
  {
    id: "signal",
    name: "Signal",
    monthlyPriceUsd: 29,
    briefsPerWeek: 3,
    topicLimit: 8,
    recipientLimit: 1,
    delivery: "3 briefs per week"
  },
  {
    id: "operator",
    name: "Operator",
    monthlyPriceUsd: 59,
    briefsPerWeek: 5,
    topicLimit: 20,
    recipientLimit: 1,
    delivery: "5 briefs per week"
  },
  {
    id: "team",
    name: "Team",
    monthlyPriceUsd: 149,
    briefsPerWeek: 5,
    topicLimit: 50,
    recipientLimit: 5,
    delivery: "5 briefs per week"
  }
];

const RUNTIME_STATUS = {
  marketingSiteLive: true,
  extensionBetaAvailable: true,
  webCommandLive: true,
  webTopicsLive: true,
  webTrackingLive: true,
  webAiProxyLive: true,
  webMorningBriefDeliveryLive: false,
  webBillingLive: false
};

function sendPage(page) {
  return (_req, res) => res.sendFile(path.join(ROOT_DIR, page));
}

function requestBaseUrl(req) {
  if (APP_BASE_URL) return APP_BASE_URL;
  return `${req.protocol}://${req.get("host")}`;
}

function readBearerToken(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function readAdminBypassToken(req) {
  return String(req.get("x-cognesion-admin-bypass") || "").trim();
}

async function requireAuthenticatedUser(req) {
  const adminBypassToken = readAdminBypassToken(req);
  if (adminBypassToken) {
    return resolveAdminBypassUser(adminBypassToken);
  }
  return resolveAuthenticatedUser(readBearerToken(req));
}

function notLiveResponse(capability, nextStep) {
  return {
    error: "SERVER_ROUTE_NOT_LIVE",
    capability,
    message: `${capability} has not been migrated into the Cognesion web backend yet.`,
    nextStep
  };
}

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      const explicitStatus = Number(error?.status);
      const status = Number.isInteger(explicitStatus) && explicitStatus >= 400 && explicitStatus < 600
        ? explicitStatus
        : /required|not found|already contains/i.test(message)
          ? 400
          : 500;
      res.status(status).json({ ok: false, error: message });
    }
  };
}

async function readUpstreamPayload(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function proxyJsonRequest(url, options, label) {
  const response = await fetch(url, options);
  const payload = await readUpstreamPayload(response);

  if (!response.ok) {
    const upstreamMessage = payload?.error?.message
      || payload?.error
      || payload?.message
      || `${label} failed with status ${response.status}.`;
    const error = new Error(upstreamMessage);
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  return payload;
}

app.disable("x-powered-by");
app.use(cors());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, x-cognesion-admin-bypass");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});
app.use(express.json({ limit: "1mb" }));
app.use("/icons", express.static(path.join(ROOT_DIR, "icons")));
app.use("/media", express.static(path.join(ROOT_DIR, "media")));
app.use("/site.css", express.static(path.join(ROOT_DIR, "site.css")));
app.use("/vendor/supabase", express.static(SUPABASE_UMD_DIR));
WEB_STATIC_FILES.forEach((file) => {
  app.use(`/${file}`, express.static(path.join(ROOT_DIR, file)));
});

app.get("/", sendPage("dashboard.html"));
app.get("/index.html", sendPage("index.html"));
app.get("/marketing", sendPage("index.html"));
app.get("/marketing.html", sendPage("index.html"));
app.get("/command", sendPage("dashboard.html"));
app.get("/command.html", sendPage("dashboard.html"));
app.get("/dashboard", (_req, res) => res.redirect(302, "/command"));
app.get("/dashboard.html", (_req, res) => res.redirect(302, "/command"));
app.get("/app", sendPage("tracker.html"));
app.get("/app/topics", (_req, res) => res.redirect(302, "/app"));
app.get("/tracker", sendPage("tracker.html"));
app.get("/tracker.html", sendPage("tracker.html"));
app.get("/pricing", sendPage("pricing.html"));
app.get("/pricing.html", sendPage("pricing.html"));
app.get("/morning-brief", sendPage("morning-brief.html"));
app.get("/morning-brief.html", sendPage("morning-brief.html"));
app.get("/for-agencies", sendPage("for-agencies.html"));
app.get("/for-agencies.html", sendPage("for-agencies.html"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "cognesion-web", port: Number(PORT), env: COGNESION_ENV });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "cognesion-web", port: Number(PORT), env: COGNESION_ENV });
});

app.get("/api/health/supabase", async (_req, res) => {
  const status = await checkSupabaseConnection();
  res.status(status.ok ? 200 : 503).json(status);
});

app.get("/api/runtime-status", (req, res) => {
  res.json({
    ok: true,
    product: "Cognesion",
    buildStamp: BUILD_STAMP,
    baseUrl: requestBaseUrl(req),
    supabase: getSupabaseConfigStatus(),
    runtime: {
      ...RUNTIME_STATUS,
      webTopicsApiLive: true,
      developmentAuthBridge: false,
      webMagicLinkAuthLive: true,
      adminBypassConfigured: Boolean(process.env.ADMIN_BYPASS_TOKEN && process.env.ADMIN_BYPASS_EMAIL)
    },
    nextMilestones: [
      "Persist Command workspace state to account-level storage instead of browser-local memory",
      "Add Render cron jobs for tracked scans and Morning Brief delivery",
      "Wire Stripe entitlements for Scout, Signal, Operator, and Team",
      "Move recurring brief delivery and dispatch settings into authenticated server workflows"
    ]
  });
});

app.get("/api/auth/config", (_req, res) => {
  const supabase = getSupabaseBrowserConfig();
  if (!supabase) {
    return res.status(503).json({
      ok: false,
      error: "Supabase browser auth is not configured on the server."
    });
  }

  return res.json({
    ok: true,
    authMode: "magic-link",
    supabase
  });
});

app.get("/api/auth/session", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  return res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    user
  });
}));

app.get("/api/plans", (_req, res) => {
  res.json({
    ok: true,
    plans: PLAN_DEFINITIONS
  });
});

app.get("/api/billing/plans", (_req, res) => {
  res.json({
    ok: true,
    plans: PLAN_DEFINITIONS
  });
});

app.post("/api/articles/hydrate", (_req, res) => {
  return res.status(501).json(
    notLiveResponse(
      "Article hydration",
      "Replace extension-side article hydration with a web-safe server route that runs on Render."
    )
  );
});

app.post("/hydrate", (_req, res) => {
  return res.status(501).json(
    notLiveResponse(
      "Article hydration",
      "Replace extension-side article hydration with a web-safe server route that runs on Render."
    )
  );
});

app.post("/api/exa/search", asyncRoute(async (req, res) => {
  await requireAuthenticatedUser(req);
  if (!exaEngine) {
    return res.status(503).json({
      ok: false,
      error: "EXA_API_KEY is not configured on the server."
    });
  }

  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    return res.status(400).json({ ok: false, error: "Search query is required." });
  }

  const items = await exaEngine.search(query);
  return res.json({ ok: true, items });
}));

app.post("/exa/search", asyncRoute(async (req, res) => {
  await requireAuthenticatedUser(req);
  if (!exaEngine) {
    return res.status(503).json({
      ok: false,
      error: "EXA_API_KEY is not configured on the server."
    });
  }

  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    return res.status(400).json({ ok: false, error: "Search query is required." });
  }

  const items = await exaEngine.search(query);
  return res.json({ ok: true, items });
}));

app.post("/api/exa/contents", asyncRoute(async (req, res) => {
  await requireAuthenticatedUser(req);
  if (!exaEngine) {
    return res.status(503).json({
      ok: false,
      error: "EXA_API_KEY is not configured on the server."
    });
  }

  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) {
    return res.status(400).json({ ok: false, error: "Article URL is required." });
  }

  const text = await exaEngine.fetchContents(url);
  return res.json({ ok: true, text });
}));

app.post("/api/ai/openai/chat", asyncRoute(async (req, res) => {
  await requireAuthenticatedUser(req);
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: "OPENAI_API_KEY is not configured on the server."
    });
  }

  const payload = req.body || {};
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "OpenAI messages are required."
    });
  }

  const data = await proxyJsonRequest(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    },
    "OpenAI request"
  );

  return res.json(data);
}));

app.post("/api/ai/anthropic/messages", asyncRoute(async (req, res) => {
  await requireAuthenticatedUser(req);
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: "ANTHROPIC_API_KEY is not configured on the server."
    });
  }

  const { anthropicVersion, ...payload } = req.body || {};
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Anthropic messages are required."
    });
  }

  const data = await proxyJsonRequest(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": anthropicVersion || "2023-06-01"
      },
      body: JSON.stringify(payload)
    },
    "Anthropic request"
  );

  return res.json(data);
}));

app.get("/api/topics", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const result = await listTopicBoards(user);
  res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    user: result.user,
    boards: result.boards
  });
}));

app.post("/api/topics", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const { boardId, query } = req.body || {};
  const result = await createTopic(user, { boardId, query });
  res.status(201).json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    user: result.user,
    topic: result.topic
  });
}));

app.patch("/api/topics/:topicId", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const result = await updateTopic(req.params.topicId, user, req.body || {});
  if (!result.topic) {
    return res.status(404).json({ ok: false, error: "Tracked topic not found." });
  }

  return res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    user: result.user,
    topic: result.topic
  });
}));

app.delete("/api/topics/:topicId", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const result = await deleteTopic(req.params.topicId, user);
  if (!result.deletedTopicId) {
    return res.status(404).json({ ok: false, error: "Tracked topic not found." });
  }

  return res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    user: result.user,
    deletedTopicId: result.deletedTopicId
  });
}));

app.get("/api/topic-boards", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const result = await listTopicBoards(user);
  res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    user: result.user,
    boards: result.boards
  });
}));

app.post("/api/topic-boards", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const { name, originType, profileSnapshot } = req.body || {};
  const result = await createTopicBoard(user, { name, originType, profileSnapshot });
  res.status(201).json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    user: result.user,
    board: result.board
  });
}));

app.patch("/api/topic-boards/:boardId", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const result = await updateTopicBoard(req.params.boardId, user, req.body || {});
  if (!result.board) {
    return res.status(404).json({ ok: false, error: "Topic board not found." });
  }

  return res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    user: result.user,
    board: result.board
  });
}));

app.delete("/api/topic-boards/:boardId", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const result = await deleteTopicBoard(req.params.boardId, user);
  if (!result.deletedBoardId) {
    return res.status(404).json({ ok: false, error: "Topic board not found." });
  }

  return res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    user: result.user,
    deletedBoardId: result.deletedBoardId,
    boards: result.boards
  });
}));

app.get("/api/briefs", (_req, res) => {
  return res.status(501).json(
    notLiveResponse(
      "Morning Brief history",
      "Add server-side brief generation, persistence, and delivery before exposing brief history."
    )
  );
});

app.post("/api/briefs/generate", (_req, res) => {
  return res.status(501).json(
    notLiveResponse(
      "Morning Brief generation",
      "Generate briefs on the server so delivery settings, scheduling, and email can work outside the extension."
    )
  );
});

app.listen(PORT, () => {
  console.log(`[COGNESION WEB] listening on http://localhost:${PORT}`);
});
