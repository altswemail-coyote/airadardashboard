-- Cognesion phase-one web schema
-- This replaces extension-only state like:
-- topicSets -> topic_boards
-- trackerArticles -> topic_articles
-- tracker_hypotheses -> beliefs + belief_revisions
-- dispatchSchedule -> delivery_settings
-- isProUser -> subscriptions

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  industry text default '',
  brand_name text default '',
  role text default '',
  priority_topics text default '',
  language text default 'English',
  timezone text default 'America/Chicago',
  include_competitors boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.topic_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  origin_type text not null default 'manual' check (origin_type in ('manual', 'profile_generated')),
  profile_snapshot jsonb,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.topic_boards(id) on delete cascade,
  query text not null,
  normalized_query text not null,
  monitoring_enabled boolean not null default true,
  signal_health integer not null default 0 check (signal_health between 0 and 100),
  article_count integer not null default 0,
  belief_count integer not null default 0,
  last_scanned_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (board_id, normalized_query)
);

create table if not exists public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  scope text not null check (scope in ('command', 'topic', 'scheduler', 'brief')),
  query text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  source_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.topic_articles (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  scan_run_id uuid references public.scan_runs(id) on delete set null,
  url text not null,
  source text not null default '',
  domain text not null default '',
  title text not null default '',
  summary text not null default '',
  published_at timestamptz,
  relevance_score numeric(5,2) not null default 0,
  article_type text not null default 'article',
  use_cases jsonb not null default '[]'::jsonb,
  content_hash text,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (topic_id, url)
);

create table if not exists public.beliefs (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  claim text not null,
  stakeholder_lens text not null default '',
  confidence integer not null default 50 check (confidence between 0 and 100),
  trend text not null default 'hold' check (trend in ('increasing', 'decreasing', 'hold')),
  watch_items jsonb not null default '[]'::jsonb,
  last_analysis jsonb,
  last_analyzed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.belief_revisions (
  id uuid primary key default gen_random_uuid(),
  belief_id uuid not null references public.beliefs(id) on delete cascade,
  scan_run_id uuid references public.scan_runs(id) on delete set null,
  old_confidence integer not null check (old_confidence between 0 and 100),
  new_confidence integer not null check (new_confidence between 0 and 100),
  confidence_delta integer not null,
  verdict text not null check (verdict in ('increase', 'decrease', 'hold')),
  reasoning text not null default '',
  watch_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.command_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  model text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.command_results (
  id uuid primary key default gen_random_uuid(),
  command_run_id uuid not null references public.command_runs(id) on delete cascade,
  url text not null,
  source text not null default '',
  domain text not null default '',
  title text not null default '',
  summary text not null default '',
  published_at timestamptz,
  relevance_score numeric(5,2) not null default 0,
  article_type text not null default 'article',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.saved_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null default '',
  source text not null default '',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, url)
);

create table if not exists public.delivery_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  briefs_per_week integer not null default 1 check (briefs_per_week in (1, 3, 5)),
  selected_delivery_days text[] not null default array['mon']::text[],
  send_hour integer not null default 7 check (send_hour between 0 and 23),
  send_minute integer not null default 0 check (send_minute between 0 and 59),
  timezone text not null default 'America/Chicago',
  include_home_news boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint delivery_days_subset check (
    selected_delivery_days <@ array['mon','tue','wed','thu','fri']::text[]
  ),
  constraint delivery_days_match_frequency check (
    cardinality(selected_delivery_days) <= briefs_per_week
  )
);

create table if not exists public.brief_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, email)
);

create table if not exists public.brief_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_days_snapshot text[] not null default array[]::text[],
  model text,
  status text not null default 'queued' check (status in ('queued', 'running', 'sent', 'failed')),
  subject_line text not null default '',
  html_body text not null default '',
  text_body text not null default '',
  include_home_news boolean not null default false,
  send_scheduled_for timestamptz,
  sent_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.brief_run_topics (
  brief_run_id uuid not null references public.brief_runs(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  primary key (brief_run_id, topic_id)
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'scout', 'signal', 'operator', 'team')),
  status text not null default 'inactive' check (status in ('inactive', 'trialing', 'active', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  briefs_per_week integer not null default 0 check (briefs_per_week in (0, 1, 3, 5)),
  topic_limit integer not null default 0,
  recipient_limit integer not null default 0,
  current_period_end timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_topic_boards_user_id on public.topic_boards(user_id);
create index if not exists idx_topics_board_id on public.topics(board_id);
create index if not exists idx_topics_last_scanned_at on public.topics(last_scanned_at desc);
create index if not exists idx_scan_runs_user_id on public.scan_runs(user_id);
create index if not exists idx_scan_runs_topic_id on public.scan_runs(topic_id);
create index if not exists idx_topic_articles_topic_id on public.topic_articles(topic_id);
create index if not exists idx_topic_articles_last_seen_at on public.topic_articles(last_seen_at desc);
create index if not exists idx_beliefs_topic_id on public.beliefs(topic_id);
create index if not exists idx_belief_revisions_belief_id on public.belief_revisions(belief_id);
create index if not exists idx_command_runs_user_id on public.command_runs(user_id);
create index if not exists idx_command_results_command_run_id on public.command_results(command_run_id);
create index if not exists idx_saved_insights_user_id on public.saved_insights(user_id);
create index if not exists idx_brief_runs_user_id on public.brief_runs(user_id);
create index if not exists idx_brief_recipients_user_id on public.brief_recipients(user_id);

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_topic_boards_updated_at on public.topic_boards;
create trigger set_topic_boards_updated_at
before update on public.topic_boards
for each row execute function public.set_updated_at();

drop trigger if exists set_topics_updated_at on public.topics;
create trigger set_topics_updated_at
before update on public.topics
for each row execute function public.set_updated_at();

drop trigger if exists set_topic_articles_updated_at on public.topic_articles;
create trigger set_topic_articles_updated_at
before update on public.topic_articles
for each row execute function public.set_updated_at();

drop trigger if exists set_beliefs_updated_at on public.beliefs;
create trigger set_beliefs_updated_at
before update on public.beliefs
for each row execute function public.set_updated_at();

drop trigger if exists set_delivery_settings_updated_at on public.delivery_settings;
create trigger set_delivery_settings_updated_at
before update on public.delivery_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.topic_boards enable row level security;
alter table public.topics enable row level security;
alter table public.scan_runs enable row level security;
alter table public.topic_articles enable row level security;
alter table public.beliefs enable row level security;
alter table public.belief_revisions enable row level security;
alter table public.command_runs enable row level security;
alter table public.command_results enable row level security;
alter table public.saved_insights enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.brief_recipients enable row level security;
alter table public.brief_runs enable row level security;
alter table public.brief_run_topics enable row level security;
alter table public.subscriptions enable row level security;

create policy "profiles are owner readable"
on public.user_profiles for select
using (auth.uid() = user_id);

create policy "profiles are owner writable"
on public.user_profiles for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "boards are owner readable"
on public.topic_boards for select
using (auth.uid() = user_id);

create policy "boards are owner writable"
on public.topic_boards for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "topics are owner readable"
on public.topics for select
using (
  exists (
    select 1 from public.topic_boards b
    where b.id = topics.board_id and b.user_id = auth.uid()
  )
);

create policy "topics are owner writable"
on public.topics for all
using (
  exists (
    select 1 from public.topic_boards b
    where b.id = topics.board_id and b.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.topic_boards b
    where b.id = topics.board_id and b.user_id = auth.uid()
  )
);

create policy "scan_runs are owner readable"
on public.scan_runs for select
using (auth.uid() = user_id);

create policy "scan_runs are owner writable"
on public.scan_runs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "topic_articles are owner readable"
on public.topic_articles for select
using (
  exists (
    select 1
    from public.topics t
    join public.topic_boards b on b.id = t.board_id
    where t.id = topic_articles.topic_id and b.user_id = auth.uid()
  )
);

create policy "topic_articles are owner writable"
on public.topic_articles for all
using (
  exists (
    select 1
    from public.topics t
    join public.topic_boards b on b.id = t.board_id
    where t.id = topic_articles.topic_id and b.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.topics t
    join public.topic_boards b on b.id = t.board_id
    where t.id = topic_articles.topic_id and b.user_id = auth.uid()
  )
);

create policy "beliefs are owner readable"
on public.beliefs for select
using (
  exists (
    select 1
    from public.topics t
    join public.topic_boards b on b.id = t.board_id
    where t.id = beliefs.topic_id and b.user_id = auth.uid()
  )
);

create policy "beliefs are owner writable"
on public.beliefs for all
using (
  exists (
    select 1
    from public.topics t
    join public.topic_boards b on b.id = t.board_id
    where t.id = beliefs.topic_id and b.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.topics t
    join public.topic_boards b on b.id = t.board_id
    where t.id = beliefs.topic_id and b.user_id = auth.uid()
  )
);

create policy "belief revisions are owner readable"
on public.belief_revisions for select
using (
  exists (
    select 1
    from public.beliefs bl
    join public.topics t on t.id = bl.topic_id
    join public.topic_boards b on b.id = t.board_id
    where bl.id = belief_revisions.belief_id and b.user_id = auth.uid()
  )
);

create policy "belief revisions are owner writable"
on public.belief_revisions for all
using (
  exists (
    select 1
    from public.beliefs bl
    join public.topics t on t.id = bl.topic_id
    join public.topic_boards b on b.id = t.board_id
    where bl.id = belief_revisions.belief_id and b.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.beliefs bl
    join public.topics t on t.id = bl.topic_id
    join public.topic_boards b on b.id = t.board_id
    where bl.id = belief_revisions.belief_id and b.user_id = auth.uid()
  )
);

create policy "command runs are owner readable"
on public.command_runs for select
using (auth.uid() = user_id);

create policy "command runs are owner writable"
on public.command_runs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "command results are owner readable"
on public.command_results for select
using (
  exists (
    select 1 from public.command_runs cr
    where cr.id = command_results.command_run_id and cr.user_id = auth.uid()
  )
);

create policy "command results are owner writable"
on public.command_results for all
using (
  exists (
    select 1 from public.command_runs cr
    where cr.id = command_results.command_run_id and cr.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.command_runs cr
    where cr.id = command_results.command_run_id and cr.user_id = auth.uid()
  )
);

create policy "saved insights are owner readable"
on public.saved_insights for select
using (auth.uid() = user_id);

create policy "saved insights are owner writable"
on public.saved_insights for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "delivery settings are owner readable"
on public.delivery_settings for select
using (auth.uid() = user_id);

create policy "delivery settings are owner writable"
on public.delivery_settings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "brief recipients are owner readable"
on public.brief_recipients for select
using (auth.uid() = user_id);

create policy "brief recipients are owner writable"
on public.brief_recipients for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "brief runs are owner readable"
on public.brief_runs for select
using (auth.uid() = user_id);

create policy "brief runs are owner writable"
on public.brief_runs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "brief run topics are owner readable"
on public.brief_run_topics for select
using (
  exists (
    select 1 from public.brief_runs br
    where br.id = brief_run_topics.brief_run_id and br.user_id = auth.uid()
  )
);

create policy "brief run topics are owner writable"
on public.brief_run_topics for all
using (
  exists (
    select 1 from public.brief_runs br
    where br.id = brief_run_topics.brief_run_id and br.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.brief_runs br
    where br.id = brief_run_topics.brief_run_id and br.user_id = auth.uid()
  )
);

create policy "subscriptions are owner readable"
on public.subscriptions for select
using (auth.uid() = user_id);

create policy "subscriptions are owner writable"
on public.subscriptions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
on all tables in schema public
to anon, authenticated, service_role;

grant usage, select
on all sequences in schema public
to anon, authenticated, service_role;

grant execute
on all functions in schema public
to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
grant execute on functions to anon, authenticated, service_role;
