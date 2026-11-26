-- Private, guest-accessible intake is mediated by the Worker, not direct client writes.
create table public.focus_quest_support_requests (
  id uuid primary key,
  category text not null check (category in ('bug', 'suggestion', 'question')),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz(3) not null default now(),
  reviewed_at timestamptz(3),
  rate_key text not null check (rate_key ~ '^[a-f0-9]{64}$'),
  notice_version text not null check (notice_version = '2026-11-26.1'),
  check ((status = 'open' and reviewed_at is null) or (status = 'closed' and reviewed_at is not null))
);
create index focus_quest_support_created_idx on public.focus_quest_support_requests(created_at desc, id desc);
create index focus_quest_support_rate_idx on public.focus_quest_support_requests(rate_key, created_at);
alter table public.focus_quest_support_requests enable row level security;
revoke all on public.focus_quest_support_requests from public, anon, authenticated, service_role;
grant select on public.focus_quest_support_requests to service_role;
grant update(status, reviewed_at) on public.focus_quest_support_requests to service_role;

create function public.submit_focus_quest_support(
  requested_id uuid, requested_category text, requested_message text,
  requested_rate_key text, requested_notice_version text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare existing public.focus_quest_support_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_required' using errcode = '42501'; end if;
  if requested_id is null or requested_category is null or requested_category not in ('bug','suggestion','question')
    or requested_message is null or char_length(btrim(requested_message)) not between 10 and 3000
    or requested_rate_key is null or requested_rate_key !~ '^[a-f0-9]{64}$'
    or requested_notice_version is distinct from '2026-11-26.1' then raise exception 'invalid_support'; end if;
  -- Serialize admission: limits remain effective across Worker isolates and concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('focus-quest-support-intake', 0));
  select * into existing from public.focus_quest_support_requests where id = requested_id;
  if found then
    if existing.rate_key = requested_rate_key and existing.category = requested_category and existing.message = btrim(requested_message) then return requested_id; end if;
    raise exception 'support_conflict';
  end if;
  if (select count(*) from public.focus_quest_support_requests where rate_key = requested_rate_key and created_at > now() - interval '1 hour') >= 3
    or (select count(*) from public.focus_quest_support_requests where rate_key = requested_rate_key and created_at > now() - interval '1 day') >= 10
    or (select count(*) from public.focus_quest_support_requests where created_at > now() - interval '1 day') >= 500 then
    raise exception 'support_rate_limited';
  end if;
  insert into public.focus_quest_support_requests(id, category, message, rate_key, notice_version)
    values (requested_id, requested_category, btrim(requested_message), requested_rate_key, requested_notice_version);
  return requested_id;
end;
$$;
revoke all on function public.submit_focus_quest_support(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_focus_quest_support(uuid,text,text,text,text) to service_role;

create function public.prune_focus_quest_support() returns integer
language plpgsql security definer set search_path = '' as $$
declare deleted_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_required' using errcode = '42501'; end if;
  delete from public.focus_quest_support_requests where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.prune_focus_quest_support() from public, anon, authenticated;
grant execute on function public.prune_focus_quest_support() to service_role;
