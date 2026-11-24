create table if not exists public.focus_quest_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 2048),
  p256dh text not null check (char_length(p256dh) between 40 and 180),
  auth text not null check (char_length(auth) between 8 and 80),
  reminder_time text not null check (reminder_time ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text not null check (char_length(timezone) between 1 and 80),
  next_due_at timestamptz not null,
  enabled boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 20),
  last_sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists focus_quest_push_due_idx
  on public.focus_quest_push_subscriptions (next_due_at)
  where enabled = true;

alter table public.focus_quest_push_subscriptions enable row level security;
revoke all on table public.focus_quest_push_subscriptions from public, anon;
grant select, delete on table public.focus_quest_push_subscriptions to authenticated;

drop policy if exists "Users read their push subscriptions" on public.focus_quest_push_subscriptions;
create policy "Users read their push subscriptions"
  on public.focus_quest_push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their push subscriptions" on public.focus_quest_push_subscriptions;
create policy "Users delete their push subscriptions"
  on public.focus_quest_push_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
