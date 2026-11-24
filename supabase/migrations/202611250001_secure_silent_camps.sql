create table if not exists public.focus_quest_camps (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6,8}$'),
  leader_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz
);

create table if not exists public.focus_quest_camp_members (
  camp_id uuid not null references public.focus_quest_camps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 12),
  adventure_id text not null check (adventure_id in ('hike', 'swim', 'fish')),
  focus_minutes integer not null check (focus_minutes between 1 and 120),
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz,
  primary key (camp_id, user_id)
);

create table if not exists public.focus_quest_camp_blocks (
  camp_id uuid not null references public.focus_quest_camps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (camp_id, user_id)
);

create index if not exists focus_quest_camp_members_active_idx
  on public.focus_quest_camp_members (camp_id, joined_at)
  where left_at is null;

alter table public.focus_quest_camps enable row level security;
alter table public.focus_quest_camp_members enable row level security;
alter table public.focus_quest_camp_blocks enable row level security;

revoke all on table public.focus_quest_camps from public, anon, authenticated;
revoke all on table public.focus_quest_camp_members from public, anon, authenticated;
revoke all on table public.focus_quest_camp_blocks from public, anon, authenticated;
grant select on table public.focus_quest_camps to authenticated;
grant select on table public.focus_quest_camp_members to authenticated;

create or replace function public.is_active_focus_quest_camp_member(
  requested_camp_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.focus_quest_camp_members member
    where member.camp_id = requested_camp_id
      and member.user_id = requested_user_id
      and member.left_at is null
  );
$$;

revoke all on function public.is_active_focus_quest_camp_member(uuid, uuid) from public, anon;
grant execute on function public.is_active_focus_quest_camp_member(uuid, uuid) to authenticated;

drop policy if exists "Camp members read their room" on public.focus_quest_camps;
create policy "Camp members read their room"
  on public.focus_quest_camps
  for select
  to authenticated
  using (public.is_active_focus_quest_camp_member(id));

drop policy if exists "Camp members read their party" on public.focus_quest_camp_members;
create policy "Camp members read their party"
  on public.focus_quest_camp_members
  for select
  to authenticated
  using (public.is_active_focus_quest_camp_member(camp_id));

create or replace function public.create_focus_quest_camp(
  requested_code text,
  requested_nickname text,
  requested_adventure_id text,
  requested_focus_minutes integer
)
returns table (camp_id uuid, code text, leader_user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  created_camp public.focus_quest_camps%rowtype;
  clean_nickname text := btrim(regexp_replace(requested_nickname, '\s+', ' ', 'g'));
  clean_code text := upper(btrim(requested_code));
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  if clean_code !~ '^[A-HJ-NP-Z2-9]{6,8}$' then raise exception 'invalid_camp_code'; end if;
  if char_length(clean_nickname) not between 1 and 12 then raise exception 'invalid_nickname'; end if;
  if requested_adventure_id not in ('hike', 'swim', 'fish') then raise exception 'invalid_adventure'; end if;
  if requested_focus_minutes not between 1 and 120 then raise exception 'invalid_focus_minutes'; end if;

  insert into public.focus_quest_camps (code, leader_user_id)
  values (clean_code, caller_id)
  returning * into created_camp;

  insert into public.focus_quest_camp_members (
    camp_id, user_id, nickname, adventure_id, focus_minutes
  ) values (
    created_camp.id, caller_id, clean_nickname, requested_adventure_id, requested_focus_minutes
  );

  return query select created_camp.id, created_camp.code, created_camp.leader_user_id;
end;
$$;

create or replace function public.join_focus_quest_camp(
  requested_code text,
  requested_nickname text,
  requested_adventure_id text,
  requested_focus_minutes integer
)
returns table (camp_id uuid, code text, leader_user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  target_camp public.focus_quest_camps%rowtype;
  clean_nickname text := btrim(regexp_replace(requested_nickname, '\s+', ' ', 'g'));
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  if char_length(clean_nickname) not between 1 and 12 then raise exception 'invalid_nickname'; end if;
  if requested_adventure_id not in ('hike', 'swim', 'fish') then raise exception 'invalid_adventure'; end if;
  if requested_focus_minutes not between 1 and 120 then raise exception 'invalid_focus_minutes'; end if;

  select * into target_camp
  from public.focus_quest_camps camp
  where camp.code = upper(btrim(requested_code))
    and camp.closed_at is null;

  if target_camp.id is null then raise exception 'camp_not_found'; end if;
  if exists (
    select 1 from public.focus_quest_camp_blocks block
    where block.camp_id = target_camp.id and block.user_id = caller_id
  ) then raise exception 'camp_access_blocked'; end if;

  insert into public.focus_quest_camp_members (
    camp_id, user_id, nickname, adventure_id, focus_minutes, joined_at, left_at
  ) values (
    target_camp.id, caller_id, clean_nickname, requested_adventure_id,
    requested_focus_minutes, timezone('utc', now()), null
  )
  on conflict (camp_id, user_id) do update set
    nickname = excluded.nickname,
    adventure_id = excluded.adventure_id,
    focus_minutes = excluded.focus_minutes,
    joined_at = excluded.joined_at,
    left_at = null;

  return query select target_camp.id, target_camp.code, target_camp.leader_user_id;
end;
$$;

create or replace function public.update_focus_quest_camp_member(
  requested_camp_id uuid,
  requested_nickname text,
  requested_adventure_id text,
  requested_focus_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  clean_nickname text := btrim(regexp_replace(requested_nickname, '\s+', ' ', 'g'));
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  if char_length(clean_nickname) not between 1 and 12
    or requested_adventure_id not in ('hike', 'swim', 'fish')
    or requested_focus_minutes not between 1 and 120 then
    raise exception 'invalid_member_profile';
  end if;

  update public.focus_quest_camp_members
  set nickname = clean_nickname,
      adventure_id = requested_adventure_id,
      focus_minutes = requested_focus_minutes
  where camp_id = requested_camp_id
    and user_id = caller_id
    and left_at is null;

  if not found then raise exception 'membership_not_found'; end if;
end;
$$;

create or replace function public.leave_focus_quest_camp(requested_camp_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  next_leader uuid;
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  update public.focus_quest_camp_members
  set left_at = timezone('utc', now())
  where camp_id = requested_camp_id and user_id = caller_id and left_at is null;

  if exists (
    select 1 from public.focus_quest_camps camp
    where camp.id = requested_camp_id and camp.leader_user_id = caller_id
  ) then
    select member.user_id into next_leader
    from public.focus_quest_camp_members member
    where member.camp_id = requested_camp_id and member.left_at is null
    order by member.joined_at, member.user_id
    limit 1;

    if next_leader is null then
      update public.focus_quest_camps
      set closed_at = timezone('utc', now())
      where id = requested_camp_id;
    else
      update public.focus_quest_camps
      set leader_user_id = next_leader
      where id = requested_camp_id;
    end if;
  end if;
end;
$$;

create or replace function public.remove_focus_quest_camp_member(
  requested_camp_id uuid,
  requested_user_id uuid,
  should_block boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  if requested_user_id = caller_id then raise exception 'leader_cannot_remove_self'; end if;
  if not exists (
    select 1 from public.focus_quest_camps camp
    where camp.id = requested_camp_id
      and camp.leader_user_id = caller_id
      and camp.closed_at is null
  ) then raise exception 'leader_required'; end if;

  update public.focus_quest_camp_members
  set left_at = timezone('utc', now())
  where camp_id = requested_camp_id
    and user_id = requested_user_id
    and left_at is null;
  if not found then raise exception 'membership_not_found'; end if;

  if should_block then
    insert into public.focus_quest_camp_blocks (camp_id, user_id, blocked_by)
    values (requested_camp_id, requested_user_id, caller_id)
    on conflict (camp_id, user_id) do update set
      blocked_by = excluded.blocked_by,
      created_at = timezone('utc', now());
  end if;
end;
$$;

revoke all on function public.create_focus_quest_camp(text, text, text, integer) from public, anon;
revoke all on function public.join_focus_quest_camp(text, text, text, integer) from public, anon;
revoke all on function public.update_focus_quest_camp_member(uuid, text, text, integer) from public, anon;
revoke all on function public.leave_focus_quest_camp(uuid) from public, anon;
revoke all on function public.remove_focus_quest_camp_member(uuid, uuid, boolean) from public, anon;
grant execute on function public.create_focus_quest_camp(text, text, text, integer) to authenticated;
grant execute on function public.join_focus_quest_camp(text, text, text, integer) to authenticated;
grant execute on function public.update_focus_quest_camp_member(uuid, text, text, integer) to authenticated;
grant execute on function public.leave_focus_quest_camp(uuid) to authenticated;
grant execute on function public.remove_focus_quest_camp_member(uuid, uuid, boolean) to authenticated;

drop policy if exists "Camp members receive private realtime" on realtime.messages;
create policy "Camp members receive private realtime"
  on realtime.messages
  for select
  to authenticated
  using (
    extension in ('broadcast', 'presence')
    and exists (
      select 1
      from public.focus_quest_camp_members member
      where member.user_id = (select auth.uid())
        and member.left_at is null
        and (select realtime.topic()) = 'focus-quest-camp:' || member.camp_id::text
    )
  );

drop policy if exists "Camp members send private realtime" on realtime.messages;
create policy "Camp members send private realtime"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and exists (
      select 1
      from public.focus_quest_camp_members member
      where member.user_id = (select auth.uid())
        and member.left_at is null
        and (select realtime.topic()) = 'focus-quest-camp:' || member.camp_id::text
    )
  );
