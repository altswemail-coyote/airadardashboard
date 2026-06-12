import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let cachedAdminClient = null;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTopicQuery(query) {
  return trimString(query).replace(/\s+/g, " ").toLowerCase();
}

function normalizeBoardProfileSnapshot(profileSnapshot) {
  if (!profileSnapshot || typeof profileSnapshot !== "object") return null;

  const competitors = Array.isArray(profileSnapshot.competitors)
    ? profileSnapshot.competitors.map(trimString).filter(Boolean).slice(0, 3)
    : [];

  const normalized = {
    source: profileSnapshot.source === "profile" ? "profile" : "manual",
    career: trimString(profileSnapshot.career),
    account: trimString(profileSnapshot.account),
    role: trimString(profileSnapshot.role),
    keywords: trimString(profileSnapshot.keywords),
    includeCompetitors: Boolean(profileSnapshot.includeCompetitors),
    competitors,
    generatedAt: profileSnapshot.generatedAt || null
  };

  return normalized;
}

function mapTopicRow(row) {
  return {
    id: row.id,
    boardId: row.board_id,
    query: row.query,
    normalizedQuery: row.normalized_query,
    monitoringEnabled: row.monitoring_enabled,
    signalHealth: row.signal_health,
    articleCount: row.article_count,
    beliefCount: row.belief_count,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapBoardRow(row, topics = []) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    originType: row.origin_type,
    profileSnapshot: row.profile_snapshot,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    topics
  };
}

export function getSupabaseConfigStatus() {
  return {
    urlConfigured: Boolean(SUPABASE_URL),
    publishableKeyConfigured: Boolean(SUPABASE_ANON_KEY),
    serviceRoleKeyConfigured: Boolean(SUPABASE_SERVICE_ROLE_KEY)
  };
}

export function getSupabaseBrowserConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return {
    url: SUPABASE_URL,
    publishableKey: SUPABASE_ANON_KEY
  };
}

export function createSupabaseAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  if (!cachedAdminClient) {
    cachedAdminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return cachedAdminClient;
}

function authRequiredError(message = "Authentication required.") {
  const error = new Error(message);
  error.status = 401;
  return error;
}

async function ensureUserProvisioned(user) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  if (!user) {
    throw authRequiredError();
  }

  const profileUpsert = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id
    },
    { onConflict: "user_id" }
  );

  if (profileUpsert.error) {
    throw new Error(`Unable to upsert user profile: ${profileUpsert.error.message}`);
  }

  const subscriptionUpsert = await supabase.from("subscriptions").upsert(
    {
      user_id: user.id,
      plan_tier: "free",
      status: "inactive",
      briefs_per_week: 0,
      topic_limit: 0,
      recipient_limit: 0
    },
    { onConflict: "user_id" }
  );

  if (subscriptionUpsert.error) {
    throw new Error(`Unable to upsert user subscription: ${subscriptionUpsert.error.message}`);
  }

  return {
    id: user.id,
    email: user.email
  };
}

export async function resolveAuthenticatedUser(accessToken) {
  const token = trimString(accessToken);
  if (!token) {
    throw authRequiredError("Sign in required. Please use the email link to continue.");
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  const userQuery = await supabase.auth.getUser(token);
  if (userQuery.error || !userQuery.data?.user) {
    throw authRequiredError("Your session is missing or expired. Please sign in again.");
  }

  return ensureUserProvisioned(userQuery.data.user);
}

async function ensureDefaultBoard(userId) {
  const supabase = createSupabaseAdminClient();
  const existingBoards = await supabase
    .from("topic_boards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (existingBoards.error) {
    throw new Error(`Unable to inspect topic boards: ${existingBoards.error.message}`);
  }

  if ((existingBoards.count || 0) > 0) return;

  const inserted = await supabase.from("topic_boards").insert({
    user_id: userId,
    name: "Board 1",
    origin_type: "manual",
    profile_snapshot: null,
    sort_order: 0,
    is_default: true
  });

  if (inserted.error) {
    throw new Error(`Unable to create default topic board: ${inserted.error.message}`);
  }
}

async function getBoardForUser(boardId, userId) {
  const supabase = createSupabaseAdminClient();
  const boardQuery = await supabase
    .from("topic_boards")
    .select("*")
    .eq("id", boardId)
    .eq("user_id", userId)
    .maybeSingle();

  if (boardQuery.error) {
    throw new Error(`Unable to load topic board: ${boardQuery.error.message}`);
  }

  return boardQuery.data || null;
}

async function loadBoardsWithTopics(userId) {
  const supabase = createSupabaseAdminClient();
  await ensureDefaultBoard(userId);

  const boardsQuery = await supabase
    .from("topic_boards")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (boardsQuery.error) {
    throw new Error(`Unable to load topic boards: ${boardsQuery.error.message}`);
  }

  const boards = boardsQuery.data || [];
  const boardIds = boards.map((board) => board.id);

  let topics = [];
  if (boardIds.length > 0) {
    const topicsQuery = await supabase
      .from("topics")
      .select("*")
      .in("board_id", boardIds)
      .order("created_at", { ascending: true });

    if (topicsQuery.error) {
      throw new Error(`Unable to load topics: ${topicsQuery.error.message}`);
    }

    topics = topicsQuery.data || [];
  }

  const topicsByBoardId = new Map();
  topics.forEach((topic) => {
    const current = topicsByBoardId.get(topic.board_id) || [];
    current.push(mapTopicRow(topic));
    topicsByBoardId.set(topic.board_id, current);
  });

  return boards.map((board) => mapBoardRow(board, topicsByBoardId.get(board.id) || []));
}

export async function listTopicBoards(user) {
  const boards = await loadBoardsWithTopics(user.id);
  return { user, boards };
}

export async function createTopicBoard(user, { name, originType = "manual", profileSnapshot = null } = {}) {
  const supabase = createSupabaseAdminClient();

  const existingBoardsQuery = await supabase
    .from("topic_boards")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (existingBoardsQuery.error) {
    throw new Error(`Unable to calculate next board order: ${existingBoardsQuery.error.message}`);
  }

  const nextSortOrder = existingBoardsQuery.data?.[0]?.sort_order != null
    ? existingBoardsQuery.data[0].sort_order + 1
    : 0;

  const insertQuery = await supabase
    .from("topic_boards")
    .insert({
      user_id: user.id,
      name: trimString(name) || `Board ${nextSortOrder + 1}`,
      origin_type: originType === "profile_generated" ? "profile_generated" : "manual",
      profile_snapshot: normalizeBoardProfileSnapshot(profileSnapshot),
      sort_order: nextSortOrder,
      is_default: nextSortOrder === 0
    })
    .select("*")
    .single();

  if (insertQuery.error) {
    throw new Error(`Unable to create topic board: ${insertQuery.error.message}`);
  }

  return {
    user,
    board: mapBoardRow(insertQuery.data, [])
  };
}

export async function updateTopicBoard(boardId, user, updates = {}) {
  const supabase = createSupabaseAdminClient();

  const payload = {};
  if (typeof updates.name === "string") payload.name = trimString(updates.name) || "Untitled board";
  if (Object.prototype.hasOwnProperty.call(updates, "profileSnapshot")) {
    payload.profile_snapshot = normalizeBoardProfileSnapshot(updates.profileSnapshot);
  }

  const updatedQuery = await supabase
    .from("topic_boards")
    .update(payload)
    .eq("id", boardId)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (updatedQuery.error) {
    throw new Error(`Unable to update topic board: ${updatedQuery.error.message}`);
  }

  if (!updatedQuery.data) {
    return { user, board: null };
  }

  const boardWithTopics = await loadBoardsWithTopics(user.id);
  const board = boardWithTopics.find((candidate) => candidate.id === boardId) || null;
  return { user, board };
}

export async function deleteTopicBoard(boardId, user) {
  const supabase = createSupabaseAdminClient();
  const board = await getBoardForUser(boardId, user.id);

  if (!board) {
    return { user, deletedBoardId: null, boards: await loadBoardsWithTopics(user.id) };
  }

  const deleteQuery = await supabase
    .from("topic_boards")
    .delete()
    .eq("id", boardId)
    .eq("user_id", user.id);

  if (deleteQuery.error) {
    throw new Error(`Unable to delete topic board: ${deleteQuery.error.message}`);
  }

  const boards = await loadBoardsWithTopics(user.id);
  return { user, deletedBoardId: boardId, boards };
}

export async function createTopic(user, { boardId, query } = {}) {
  const supabase = createSupabaseAdminClient();
  const board = await getBoardForUser(boardId, user.id);

  if (!board) {
    throw new Error("Topic board not found for this user.");
  }

  const cleanedQuery = trimString(query);
  if (!cleanedQuery) {
    throw new Error("Tracked topic query is required.");
  }

  const insertQuery = await supabase
    .from("topics")
    .insert({
      board_id: board.id,
      query: cleanedQuery,
      normalized_query: normalizeTopicQuery(cleanedQuery)
    })
    .select("*")
    .single();

  if (insertQuery.error) {
    if (insertQuery.error.code === "23505") {
      throw new Error("This board already contains that tracked topic.");
    }

    throw new Error(`Unable to create topic: ${insertQuery.error.message}`);
  }

  return {
    user,
    topic: mapTopicRow(insertQuery.data)
  };
}

export async function updateTopic(topicId, user, updates = {}) {
  const supabase = createSupabaseAdminClient();
  const payload = {};

  if (typeof updates.query === "string") {
    const cleanedQuery = trimString(updates.query);
    if (!cleanedQuery) throw new Error("Tracked topic query is required.");
    payload.query = cleanedQuery;
    payload.normalized_query = normalizeTopicQuery(cleanedQuery);
  }

  if (typeof updates.monitoringEnabled === "boolean") {
    payload.monitoring_enabled = updates.monitoringEnabled;
  }

  const topicQuery = await supabase
    .from("topics")
    .select("id, board_id")
    .eq("id", topicId)
    .maybeSingle();

  if (topicQuery.error) {
    throw new Error(`Unable to locate topic: ${topicQuery.error.message}`);
  }

  if (!topicQuery.data) {
    return { user, topic: null };
  }

  const board = await getBoardForUser(topicQuery.data.board_id, user.id);
  if (!board) {
    throw new Error("Tracked topic does not belong to the current user.");
  }

  const updatedQuery = await supabase
    .from("topics")
    .update(payload)
    .eq("id", topicId)
    .select("*")
    .maybeSingle();

  if (updatedQuery.error) {
    if (updatedQuery.error.code === "23505") {
      throw new Error("This board already contains that tracked topic.");
    }

    throw new Error(`Unable to update topic: ${updatedQuery.error.message}`);
  }

  return {
    user,
    topic: updatedQuery.data ? mapTopicRow(updatedQuery.data) : null
  };
}

export async function deleteTopic(topicId, user) {
  const supabase = createSupabaseAdminClient();

  const topicQuery = await supabase
    .from("topics")
    .select("id, board_id")
    .eq("id", topicId)
    .maybeSingle();

  if (topicQuery.error) {
    throw new Error(`Unable to locate topic: ${topicQuery.error.message}`);
  }

  if (!topicQuery.data) {
    return { user, deletedTopicId: null };
  }

  const board = await getBoardForUser(topicQuery.data.board_id, user.id);
  if (!board) {
    throw new Error("Tracked topic does not belong to the current user.");
  }

  const deleteQuery = await supabase.from("topics").delete().eq("id", topicId);
  if (deleteQuery.error) {
    throw new Error(`Unable to delete topic: ${deleteQuery.error.message}`);
  }

  return { user, deletedTopicId: topicId };
}

export async function checkSupabaseConnection() {
  const config = getSupabaseConfigStatus();
  if (!config.urlConfigured || !config.serviceRoleKeyConfigured) {
    return {
      ok: false,
      config,
      reason: "missing_env"
    };
  }

  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("subscriptions")
    .select("user_id", { count: "exact", head: true });

  if (error) {
    return {
      ok: false,
      config,
      reason: "query_failed",
      message: error.message
    };
  }

  return {
    ok: true,
    config,
    subscriptionsCount: count ?? 0
  };
}
