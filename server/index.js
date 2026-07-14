import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { ExaEngine } from "../exa-engine.js";
import {
  checkSupabaseConnection,
  createBriefRun,
  createTopic,
  createTopicBoard,
  deleteTopic,
  deleteTopicBoard,
  getDeliveryWorkspace,
  getSupabaseBrowserConfig,
  getSupabaseConfigStatus,
  listBriefRuns,
  listTopicBoards,
  resolveAdminBypassUser,
  resolveAuthenticatedUser,
  saveDeliveryWorkspace,
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
  webMorningBriefDeliveryLive: true,
  webBillingLive: false
};

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return trimString(value).toLowerCase();
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function normalizeInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeBriefsPerWeek(value) {
  const parsed = Number(value);
  return [1, 3, 5].includes(parsed) ? parsed : 1;
}

function stripHtmlToText(html) {
  return trimString(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|table|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeDeliveryPayload(body = {}) {
  const schedule = body.schedule && typeof body.schedule === "object" ? body.schedule : body;
  const briefsPerWeek = normalizeBriefsPerWeek(schedule.briefsPerWeek || schedule.freq);
  const selectedDeliveryDays = Array.isArray(schedule.selectedDeliveryDays)
    ? schedule.selectedDeliveryDays
    : Array.isArray(schedule.days)
      ? schedule.days
      : [];

  return {
    recipientEmail: normalizeEmail(body.recipientEmail || schedule.recipientEmail || body.email),
    briefsPerWeek,
    selectedDeliveryDays,
    sendHour: normalizeInteger(schedule.sendHour, 7, 0, 23),
    sendMinute: normalizeInteger(schedule.sendMinute, 0, 0, 59),
    timezone: trimString(schedule.timezone || schedule.tz) || "America/Chicago",
    includeHomeNews: Boolean(schedule.includeHomeNews ?? body.includeHomeNews),
    enabled: schedule.enabled !== false
  };
}

function normalizeBriefPayload(body = {}) {
  const emailData = body.emailData && typeof body.emailData === "object" ? body.emailData : {};
  const delivery = normalizeDeliveryPayload(body);
  const cadence = trimString(emailData.cadence) || `${delivery.briefsPerWeek} Brief${delivery.briefsPerWeek === 1 ? "" : "s"} / Week`;
  const subjectLine = trimString(body.subjectLine || emailData.subjectLine)
    || `Your Cognesion Morning Brief · ${cadence}`;
  const htmlBody = trimString(body.htmlBody || body.html || emailData.htmlBody || emailData.html);
  const textBody = trimString(body.textBody || body.text || emailData.textBody || emailData.text)
    || stripHtmlToText(htmlBody);

  if (!htmlBody && !textBody) {
    const error = new Error("Morning Brief content is required before it can be saved or sent.");
    error.status = 400;
    throw error;
  }

  return {
    ...delivery,
    subjectLine,
    htmlBody: htmlBody || `<pre>${textBody}</pre>`,
    textBody,
    model: trimString(body.model || emailData.model || ""),
    topicIds: Array.isArray(body.topicIds) ? body.topicIds : [],
    includeHomeNews: Boolean(emailData.includeHomeNews ?? delivery.includeHomeNews)
  };
}

function configuredResendSender() {
  return trimString(process.env.RESEND_FROM_EMAIL);
}

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

async function sendResendEmail({ to, subject, html, text }) {
  const apiKey = trimString(process.env.RESEND_API_KEY);
  const from = configuredResendSender();

  if (!apiKey) {
    const error = new Error("RESEND_API_KEY is not configured on the server.");
    error.status = 503;
    throw error;
  }

  if (!from) {
    const error = new Error("RESEND_FROM_EMAIL is not configured on the server.");
    error.status = 503;
    throw error;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text
    })
  });

  const payload = await readUpstreamPayload(response);
  if (!response.ok) {
    const message = payload?.message
      || payload?.error
      || `Resend request failed with status ${response.status}.`;
    const error = new Error(message);
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
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
      webMorningBriefEmailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
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

app.get("/api/delivery-settings", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const workspace = await getDeliveryWorkspace(user);
  return res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    ...workspace
  });
}));

app.patch("/api/delivery-settings", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const deliveryPayload = normalizeDeliveryPayload(req.body || {});
  if (deliveryPayload.recipientEmail && !looksLikeEmail(deliveryPayload.recipientEmail)) {
    return res.status(400).json({ ok: false, error: "Please enter a valid delivery email address." });
  }

  const workspace = await saveDeliveryWorkspace(user, deliveryPayload);
  return res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    ...workspace
  });
}));

app.get("/api/briefs", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const result = await listBriefRuns(user, { limit: req.query?.limit });
  return res.json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    ...result
  });
}));

app.post("/api/briefs/generate", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const briefPayload = normalizeBriefPayload(req.body || {});
  if (briefPayload.recipientEmail && !looksLikeEmail(briefPayload.recipientEmail)) {
    return res.status(400).json({ ok: false, error: "Please enter a valid delivery email address." });
  }

  const delivery = await saveDeliveryWorkspace(user, briefPayload);
  const result = await createBriefRun(user, {
    ...briefPayload,
    status: "queued",
    deliveryDaysSnapshot: briefPayload.selectedDeliveryDays
  });

  return res.status(201).json({
    ok: true,
    authMode: user.authMode || "supabase-session",
    delivery,
    ...result
  });
}));

app.post("/api/briefs/send-test", asyncRoute(async (req, res) => {
  const user = await requireAuthenticatedUser(req);
  const briefPayload = normalizeBriefPayload(req.body || {});
  const recipientEmail = briefPayload.recipientEmail || normalizeEmail(user.email);
  if (!looksLikeEmail(recipientEmail)) {
    return res.status(400).json({ ok: false, error: "Please enter a valid delivery email address." });
  }

  const delivery = await saveDeliveryWorkspace(user, {
    ...briefPayload,
    recipientEmail
  });

  try {
    const providerResponse = await sendResendEmail({
      to: recipientEmail,
      subject: briefPayload.subjectLine,
      html: briefPayload.htmlBody,
      text: briefPayload.textBody
    });
    const result = await createBriefRun(user, {
      ...briefPayload,
      status: "sent",
      deliveryDaysSnapshot: briefPayload.selectedDeliveryDays,
      sentAt: new Date().toISOString()
    });

    return res.json({
      ok: true,
      authMode: user.authMode || "supabase-session",
      sent: true,
      provider: "resend",
      providerResponse,
      delivery,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send test brief.";
    const status = Number.isInteger(Number(error?.status)) ? Number(error.status) : 502;
    const result = await createBriefRun(user, {
      ...briefPayload,
      status: "failed",
      deliveryDaysSnapshot: briefPayload.selectedDeliveryDays,
      failureReason: message
    });

    return res.status(status).json({
      ok: false,
      error: message,
      delivery,
      ...result
    });
  }
}));

app.listen(PORT, () => {
  console.log(`[COGNESION WEB] listening on http://localhost:${PORT}`);
});
